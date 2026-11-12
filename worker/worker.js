// Couple Budget proxy. Holds the Claude API key so it never reaches the browser.
// Secrets to set on the Worker: ANTHROPIC_API_KEY and APP_PASSCODE.
const ALLOWED_ORIGINS = ['https://kaetojn.github.io'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Headers': 'content-type, x-app-passcode',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const fail = (status, message) =>
      new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { ...cors, 'content-type': 'application/json' },
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return fail(403, 'This site is not allowed to use the Worker');
    if (request.method !== 'POST') return fail(405, 'POST only');
    if (!env.ANTHROPIC_API_KEY || !env.APP_PASSCODE) return fail(500, 'Worker secrets are not set');
    if (!(await same(request.headers.get('x-app-passcode') || '', env.APP_PASSCODE))) return fail(401, 'Wrong passcode');

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: request.body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  },
};

// Compare by hash so the check takes the same time whatever was sent.
async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', enc.encode(v))));
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}
