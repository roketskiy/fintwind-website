import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const environment = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC', 'PROCESSOR_ARCHITECTURE']) {
  const match = Object.keys(process.env).find(name => name.toLowerCase() === key.toLowerCase());
  if (match) environment[match] = process.env[match];
}
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, environment, { NODE_ENV: 'test', WRANGLER_SEND_METRICS: 'false' });
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = await import('miniflare');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'fintwind-activity-'));
const migration = await readFile(join(root, 'migrations/0001_daily_activity.sql'), 'utf8');
const bundle = await build({ entryPoints: [join(root, 'worker/index.ts')], bundle: true, write: false,
  format: 'esm', platform: 'browser', target: 'es2022' });
const script = bundle.outputFiles[0].text;
const password = 'TestOnly-random-p4ssword-8fjL29xc';
const runtimeOptions = {
  modules: true, script, compatibilityDate: '2026-09-01',
  host: '127.0.0.1', port: 0, inspectorPort: 0,
  d1Databases: { ACTIVITY_DB: 'activity-test' }, resourcePersistencePath: join(temporary, 'd1'),
  bindings: { ADMIN_PASSWORD: password },
  ratelimits: { ADMIN_LOGIN_LIMITER: { namespace_id: '538121', simple: { limit: 5, period: 60 } } },
  assets: { directory: join(root, 'dist'), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true } },
  log: new Log(LogLevel.ERROR),
};
const options = convertV4MiniflareOptions(runtimeOptions);
let runtime;
let browser;
try {
  runtime = new Miniflare(options);
  await runtime.ready;
  let db = await runtime.getD1Database('ACTIVITY_DB');
  await db.exec(migration.replaceAll('\n', ' '));
  await db.exec((await readFile(join(root, 'migrations/0002_admin_sessions.sql'), 'utf8')).replaceAll('\n', ' '));
  const post = (body, headers = { 'Content-Type': 'application/json' }) => runtime.dispatchFetch('http://localhost/api/activity', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const first = randomUUID();
  const repeated = await Promise.all(Array.from({ length: 20 }, () => post({ installation_id: first })));
  assert(repeated.every(response => response.status === 204), `all concurrent duplicate reports accepted, received ${repeated.map(response => response.status).join(',')}`);
  assert.equal((await post({ installation_id: first.toUpperCase() })).status, 204, 'UUID case normalized');
  assert.equal((await post({ installation_id: randomUUID() })).status, 204);
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  assert.deepEqual(await db.prepare('SELECT day, dau FROM daily_active_users').all().then(result => result.results),
    [{ day: today, dau: 2 }], 'concurrent duplicates count once on the Beijing day');
  const rows = await db.prepare('SELECT installation_hash FROM daily_activity').all();
  const expectedHash = createHash('sha256').update(first).digest('hex');
  assert(rows.results.some(row => row.installation_hash === expectedHash), 'server stores SHA-256, not raw UUID');
  assert(rows.results.every(row => /^[a-f0-9]{64}$/.test(row.installation_hash)));
  for (const invalid of [null, [], {}, { installation_id: 1 }, { installation_id: 'invalid' },
    { installation_id: '00000000-0000-1000-8000-000000000000' }, { installation_id: first, extra: true }]) {
    assert.equal((await post(invalid)).status, 400, 'invalid payload rejected');
  }
  assert.equal((await post('{')).status, 400, 'bad JSON rejected');
  assert.equal((await post('x'.repeat(257))).status, 413, 'bounded payload');
  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(128));
      controller.enqueue(new Uint8Array(129));
      controller.close();
    },
  });
  assert.equal((await runtime.dispatchFetch('http://localhost/api/activity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversizedStream, duplex: 'half',
  })).status, 413, 'chunked body bounded without content length');
  assert.equal((await runtime.dispatchFetch('http://localhost/api/activity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new Uint8Array([0xff]),
  })).status, 400, 'invalid UTF-8 rejected');
  assert.equal((await post({ installation_id: first }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await runtime.dispatchFetch('http://localhost/api/activity')).status, 405);
  assert.equal((await runtime.dispatchFetch('http://localhost/api/admin/dau')).status, 401, 'old statistics API also protected');
  const homepage = await runtime.dispatchFetch('http://localhost/');
  assert.equal(homepage.status, 200, 'static homepage preserved');
  assert.match(await homepage.text(), /Fintwind/);
  await db.exec(migration.replaceAll('\n', ' '));
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM daily_activity').first()).count, 2,
    'reapplying migration preserves stored activity');
  const probeIndex = process.argv.indexOf('--app-probe');
  if (probeIndex !== -1) {
    assert(process.argv[probeIndex + 1], 'app probe path required');
    const executable = resolve(process.argv[probeIndex + 1]);
    const endpoint = new URL('/api/activity', await runtime.ready).href;
    for (const filename of ['app-first.db', 'app-first.db', 'app-second.db']) {
      await promisify(execFile)(executable, ['--report-to', endpoint, join(temporary, filename)], {
        env: environment, windowsHide: true,
      });
    }
    assert.equal((await db.prepare('SELECT dau FROM daily_active_users WHERE day = ?').bind(today).first()).dau, 4,
      'real Rust reporting module deduplicates persisted installation UUID');
  }
  const expectedCount = probeIndex === -1 ? 2 : 4;
  await runtime.dispose();
  runtime = new Miniflare(options);
  await runtime.ready;
  db = await runtime.getD1Database('ACTIVITY_DB');
  assert.equal((await db.prepare('SELECT dau FROM daily_active_users WHERE day = ?').bind(today).first()).dau,
    expectedCount, 'D1 persists across Worker restart');
  const privatePaths = ['//admin/', '/admin//index.html', '/admin', '/admin/', '/admin/index.html', '/admin.html', '/ADMIN',
    '/%61dmin', '/admin%2Findex.html', '/admin%5cindex.html', '/%2561dmin', '/api/admin/dau', '/admin/api/dau'];
  for (const host of ['localhost', 'fintwind-website.example.workers.dev']) {
    for (const path of privatePaths) {
      const denied = await runtime.dispatchFetch('http://' + host + path, { redirect: 'manual' });
      assert.equal(denied.status, path.includes('/api/') ? 401 : 302, host + path + ' rejects unauthenticated access');
      assert.equal(denied.headers.get('cache-control'), 'no-store');
      assert.match(denied.headers.get('x-robots-tag'), /noindex/);
    }
  }
  const login = (value, ip = '192.0.2.1', origin = 'http://localhost') => runtime.dispatchFetch('http://localhost/admin/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  });
  const stats = (cookie = '', query = '') => runtime.dispatchFetch('http://localhost/admin/api/dau' + query, { headers: { Cookie: cookie } });
  assert.equal((await login({ password }, '192.0.2.1', 'https://evil.example')).status, 403, 'cross-origin login rejected');
  assert.equal((await login({ password }, '192.0.2.1', '')).status, 403, 'missing origin rejected');
  assert.equal((await login({ password: 'wrong' }, '192.0.2.2')).status, 401, 'wrong password rejected');
  assert.equal((await login('{', '192.0.2.3')).status, 400, 'invalid login JSON rejected');
  assert.equal((await login({ password, extra: true }, '192.0.2.3')).status, 400, 'extra fields rejected');
  assert.equal((await login({ password: 'x'.repeat(257) }, '192.0.2.3')).status, 400, 'password length bounded');
  assert.equal((await login('x'.repeat(1025), '192.0.2.3')).status, 413, 'login body bounded');
  for (let index = 0; index < 5; index++) assert.equal((await login({ password: 'wrong' }, '192.0.2.4')).status, 401);
  const limited = await login({ password }, '192.0.2.4');
  assert.equal(limited.status, 429, 'real rate limiter prevents sixth attempt');
  assert.equal(limited.headers.get('retry-after'), '60');
  const loggedIn = await login({ password });
  assert.equal(loggedIn.status, 204);
  const setCookie = loggedIn.headers.get('set-cookie');
  assert.match(setCookie, /__Host-fintwind_admin=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
  const cookie = setCookie.split(';')[0];
  const token = cookie.split('=')[1];
  const storedSession = await db.prepare('SELECT token_hash, expires_at FROM admin_sessions').first();
  assert.match(storedSession.token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(storedSession.token_hash, token, 'raw session token never persisted');
  assert(storedSession.expires_at > Date.now() / 1000 + 43_190);
  assert.equal((await stats(cookie + 'x')).status, 401, 'tampered token rejected');
  assert.equal((await runtime.dispatchFetch('http://localhost/admin/api/dau', {
    headers: { 'Cf-Access-Jwt-Assertion': 'forged', 'Cf-Access-Authenticated-User-Email': 'admin@example.com' },
  })).status, 401, 'Access headers cannot authenticate');
  const yesterday = new Date(Date.now() + 8 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  await db.prepare('INSERT INTO daily_activity VALUES (?, ?)').bind(yesterday, 'yesterday-test').run();
  for (const count of [7, 30, 90]) {
    const response = await stats(cookie, '?days=' + count);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload).sort(), ['days', 'generatedAt', 'timezone', 'today']);
    assert.equal(payload.timezone, 'Asia/Shanghai');
    assert.equal(payload.today, today);
    assert.deepEqual(payload.days, Array.from({ length: count }, (_, index) => ({
      day: new Date(Date.now() + 8 * 3_600_000 - (count - index - 1) * 86_400_000).toISOString().slice(0, 10),
      dau: index === count - 1 ? expectedCount : index === count - 2 ? 1 : 0,
    })), 'zero-filled Beijing dates');
    assert(!JSON.stringify(payload).includes('installation'), 'no installation identifiers exposed');
  }
  assert.equal((await stats(cookie, '?days=1000')).status, 400);
  assert.equal((await runtime.dispatchFetch('http://localhost/admin/api/dau', { method: 'POST', headers: { Cookie: cookie } })).status, 405);
  const adminPage = await runtime.dispatchFetch('http://localhost/admin/', { headers: { Cookie: cookie } });
  assert.equal(adminPage.status, 200);
  assert.equal(adminPage.headers.get('cache-control'), 'no-store');
  assert.match(await adminPage.text(), /DAU|日活/);
  const logout = (value, origin = 'http://localhost') => runtime.dispatchFetch('http://localhost/admin/api/logout', {
    method: 'POST', headers: { Cookie: value, Origin: origin },
  });
  assert.equal((await logout(cookie, 'https://evil.example')).status, 403);
  assert.equal((await stats(cookie)).status, 200, 'cross-origin logout cannot revoke session');
  const loggedOut = await logout(cookie);
  assert.equal(loggedOut.status, 204);
  assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await stats(cookie)).status, 401, 'old token revoked after logout');
  assert.equal((await logout(cookie)).status, 204, 'logout idempotent');
  const expiring = await login({ password }, '192.0.2.5');
  const expiredCookie = expiring.headers.get('set-cookie').split(';')[0];
  await db.exec('UPDATE admin_sessions SET expires_at = 1');
  assert.equal((await stats(expiredCookie)).status, 401, 'expired persisted session rejected');
  assert.equal((await runtime.dispatchFetch('http://localhost/admin/', { headers: { Cookie: expiredCookie }, redirect: 'manual' })).status, 302);
  browser = await chromium.launch({ headless: true, env: environment });
  const context = await browser.newContext();
  const origin = (await runtime.ready).origin.replace('127.0.0.1', 'localhost');
  const pageErrors = [];
  const browserPage = await context.newPage();
  browserPage.on('pageerror', error => pageErrors.push(error.message));
  await browserPage.goto(origin + '/admin/');
  await expect(browserPage).toHaveURL(origin + '/admin/login/');
  await browserPage.getByLabel('管理员密码').fill('wrong');
  await browserPage.getByRole('button', { name: '登录', exact: true }).click();
  await expect(browserPage.locator('#login-status')).toHaveText('密码错误');
  await browserPage.getByLabel('管理员密码').fill(password);
  await browserPage.getByRole('button', { name: '登录', exact: true }).click();
  await expect(browserPage).toHaveURL(origin + '/admin/');
  await expect(browserPage.locator('#today-dau')).toHaveText(String(expectedCount));
  await expect(browserPage.locator('#yesterday-dau')).toHaveText('1');
  for (const days of ['7', '90']) {
    await browserPage.locator('#days').selectOption(days);
    await expect(browserPage.locator('#daily-rows tr')).toHaveCount(Number(days));
    await expect(browserPage.locator('#chart rect')).toHaveCount(Number(days));
  }
  await db.prepare('INSERT INTO daily_activity VALUES (?, ?)').bind(today, 'browser-refresh-test').run();
  await browserPage.locator('#refresh').click();
  await expect(browserPage.locator('#today-dau')).toHaveText(String(expectedCount + 1));
  await db.exec('DELETE FROM daily_activity');
  await browserPage.locator('#refresh').click();
  await expect(browserPage.locator('#today-dau')).toHaveText('0');
  await expect(browserPage.locator('#zero-state')).toBeVisible();
  await browserPage.getByRole('button', { name: '退出登录' }).click();
  await expect(browserPage).toHaveURL(origin + '/admin/login/');
  await browserPage.goto(origin + '/admin/');
  await expect(browserPage).toHaveURL(origin + '/admin/login/');
  await browserPage.getByLabel('管理员密码').fill(password);
  await browserPage.getByRole('button', { name: '登录', exact: true }).click();
  await expect(browserPage.locator('#today-dau')).toHaveText('0');
  await db.exec('UPDATE admin_sessions SET expires_at = 1');
  await browserPage.locator('#refresh').click();
  await expect(browserPage).toHaveURL(origin + '/admin/login/');
  await browserPage.getByLabel('管理员密码').fill(password);
  await browserPage.getByRole('button', { name: '登录', exact: true }).click();
  await expect(browserPage.locator('#today-dau')).toHaveText('0');
  const browserCookie = (await context.cookies()).map(entry => entry.name + '=' + entry.value).join('; ');
  await db.exec('DROP TABLE daily_activity');
  assert.equal((await post({ installation_id: first })).status, 503);
  assert.equal((await stats(browserCookie)).status, 503);
  await browserPage.locator('#refresh').click();
  await expect(browserPage.locator('#status')).toHaveText('统计服务暂不可用，请稍后重试。');
  await expect(browserPage.locator('#retry')).toHaveText('重试');
  assert.deepEqual(pageErrors, [], 'no browser runtime errors');
  await browser.close(); browser = undefined;
  assert.equal((await stats('invalid')).status, 401, 'authentication precedes business data access');
  await runtime.dispose();
  runtime = new Miniflare(convertV4MiniflareOptions({ ...runtimeOptions, bindings: { ADMIN_PASSWORD: 'RotatedPassword-Over16Chars' } }));
  await runtime.ready;
  assert.equal((await stats(browserCookie)).status, 401, 'password rotation revokes old persisted session');
  await runtime.dispose();
  runtime = new Miniflare(options);
  await runtime.ready;
  db = await runtime.getD1Database('ACTIVITY_DB');
  assert.equal((await stats(browserCookie)).status, 503, 'original password resolves persisted session before business query fails');
  await db.exec('DROP TABLE admin_sessions');
  assert.equal((await stats(browserCookie)).status, 503, 'session database failures fail closed');
  const unavailableLogin = await login({ password }, '192.0.2.22');
  assert.equal(unavailableLogin.status, 503, 'session persistence failure cannot log in');
  assert.equal(unavailableLogin.headers.get('set-cookie'), null, 'failed login never sets cookie');
  await runtime.dispose();
  runtime = new Miniflare(convertV4MiniflareOptions({ ...runtimeOptions, ratelimits: {} }));
  await runtime.ready;
  assert.equal((await login({ password })).status, 503, 'missing limiter fails closed');
  await runtime.dispose();
  runtime = new Miniflare(convertV4MiniflareOptions({ ...runtimeOptions, bindings: {} }));
  await runtime.ready;
  assert.equal((await login({ password })).status, 503, 'missing password fails closed');
  assert.equal((await stats(browserCookie)).status, 503, 'missing configuration fails closed');
  console.log('Activity and password admin blackbox passed. Real D1 sessions, login, revocation, expiry, rate limiting, origin checks, browser login/logout, ranges, refresh, zero state and failures verified.');

} finally {
  if (browser) await browser.close();
  if (runtime) await runtime.dispose();
  assert(temporary.startsWith(join(tmpdir(), 'fintwind-activity-')), 'cleanup confined to this run');
  await rm(temporary, { recursive: true, force: true });
}
