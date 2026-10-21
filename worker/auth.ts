const COOKIE = '__Host-fintwind_admin';
const SESSION_SECONDS = 43_200;

export function adminJson(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  } });
}

function sessionToken(request: Request): string | null {
  const entries = (request.headers.get('Cookie') ?? '').split(';').map(entry => entry.trim());
  const value = entries.find(entry => entry.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

async function hash(value: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('fintwind-admin-session\0' + value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function configured(env: Env): boolean {
  return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 16
    && !!env.ADMIN_LOGIN_LIMITER;
}

export async function authorizeAdmin(request: Request, env: Env): Promise<401 | 503 | null> {
  if (!configured(env)) return 503;
  const token = sessionToken(request);
  if (!token) return 401;
  const found = await env.ACTIVITY_DB.prepare(
    'SELECT 1 AS valid FROM admin_sessions WHERE token_hash = ? AND expires_at > ?'
  ).bind(await hash(token, env.ADMIN_PASSWORD), Math.floor(Date.now() / 1000)).first();
  return found ? null : 401;
}

function cookie(value: string, seconds: number): string {
  return COOKIE + '=' + value + '; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + seconds;
}

async function passwordPayload(request: Request): Promise<string | Response> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return adminJson({ error: 'Expected application/json' }, 415);
  }
  if (!request.body) return adminJson({ error: 'Invalid login' }, 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return adminJson({ error: 'Payload too large' }, 413);
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { return adminJson({ error: 'Invalid JSON' }, 400); }
  if (typeof data !== 'object' || data === null || Array.isArray(data)
    || Object.keys(data).length !== 1 || !('password' in data)
    || typeof data.password !== 'string' || data.password.length > 256) {
    return adminJson({ error: 'Invalid login' }, 400);
  }
  return data.password;
}

export async function login(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return adminJson({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return adminJson({ error: 'Invalid origin' }, 403);
  if (!configured(env)) return adminJson({ error: 'Service unavailable' }, 503);
  const limited = await env.ADMIN_LOGIN_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown-client' });
  if (!limited.success) {
    const response = adminJson({ error: 'Too many attempts' }, 429);
    response.headers.set('Retry-After', '60');
    return response;
  }
  const password = await passwordPayload(request);
  if (password instanceof Response) return password;
  const supplied = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const expected = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.ADMIN_PASSWORD));
  if (!crypto.subtle.timingSafeEqual(supplied, expected)) return adminJson({ error: 'Invalid password' }, 401);
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const now = Math.floor(Date.now() / 1000);
  await env.ACTIVITY_DB.batch([
    env.ACTIVITY_DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
    env.ACTIVITY_DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)')
      .bind(await hash(token, env.ADMIN_PASSWORD), now + SESSION_SECONDS),
  ]);
  return new Response(null, { status: 204, headers: {
    'Set-Cookie': cookie(token, SESSION_SECONDS), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  } });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return adminJson({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return adminJson({ error: 'Invalid origin' }, 403);
  const token = sessionToken(request);
  if (token) await env.ACTIVITY_DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await hash(token, env.ADMIN_PASSWORD)).run();
  return new Response(null, { status: 204, headers: {
    'Set-Cookie': cookie('', 0), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  } });
}
