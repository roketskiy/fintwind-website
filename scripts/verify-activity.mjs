import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';

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
const source = await readFile(join(root, 'worker/index.ts'), 'utf8');
const migration = await readFile(join(root, 'migrations/0001_daily_activity.sql'), 'utf8');
const script = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText;
const options = convertV4MiniflareOptions({
  modules: true, script, compatibilityDate: '2026-09-01',
  host: '127.0.0.1', port: 0, inspectorPort: 0,
  d1Databases: { ACTIVITY_DB: 'activity-test' }, resourcePersistencePath: join(temporary, 'd1'),
  assets: { directory: join(root, 'dist'), binding: 'ASSETS', run_worker_first: ['/api/*'], routerConfig: { has_user_worker: true } },
  log: new Log(LogLevel.ERROR),
});
let runtime;
try {
  runtime = new Miniflare(options);
  await runtime.ready;
  let db = await runtime.getD1Database('ACTIVITY_DB');
  await db.exec(migration.replaceAll('\n', ' '));
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
  assert.equal((await runtime.dispatchFetch('http://localhost/api/admin/dau')).status, 404, 'no public statistics API');
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
  await db.exec('DROP TABLE daily_activity');
  assert.equal((await post({ installation_id: first })).status, 503, 'database error is not reported as success');
  console.log('Activity blackbox passed. Deduplication, validation, hashing, Beijing day, persistence, assets and database failures verified.'
    + (probeIndex === -1 ? '' : ' Real Rust reporting module verified.'));
} finally {
  if (runtime) await runtime.dispose();
  assert(temporary.startsWith(join(tmpdir(), 'fintwind-activity-')), 'cleanup confined to this run');
  await rm(temporary, { recursive: true, force: true });
}
