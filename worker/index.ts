const MAX_BODY_BYTES = 256;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  } });
}

function dayAt(time: number): string {
  return new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
}

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

async function activity(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Expected application/json' }, 415);
  }
  if (!request.body) return json({ error: 'Invalid activity' }, 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return json({ error: 'Payload too large' }, 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body)); }
  catch { return json({ error: 'Invalid JSON' }, 400); }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)
    || Object.keys(payload).length !== 1 || !('installation_id' in payload)
    || typeof payload.installation_id !== 'string' || !UUID_V4.test(payload.installation_id)) {
    return json({ error: 'Invalid activity' }, 400);
  }
  const hash = Array.from(new Uint8Array(await digest(payload.installation_id.toLowerCase())),
    byte => byte.toString(16).padStart(2, '0')).join('');
  await env.ACTIVITY_DB.prepare(
    'INSERT OR IGNORE INTO daily_activity (day, installation_hash) VALUES (?, ?)'
  ).bind(dayAt(Date.now()), hash).run();
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/activity') return await activity(request, env);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      return await env.ASSETS.fetch(request);
    } catch {
      console.error(JSON.stringify({ event: 'activity_service_unavailable' }));
      return json({ error: 'Service unavailable' }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
