// Couple Budget backend. Keeps the Claude key and the Google Sheet connection out of the browser.
// Secrets to set on the Worker:
//   ANTHROPIC_API_KEY  your Claude API key
//   APP_PASSCODE       the passcode you two share
//   SHEET_URL          the Apps Script web app URL, ending in /exec
//   SHEET_TOKEN        the TOKEN value on the first line of the Apps Script
// Binding to add: a KV namespace with the variable name DB (stores the household's budget).
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
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
    const fail = (status, message) => reply(status, { error: { message } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return fail(403, 'This site is not allowed to use the Worker');
    if (request.method !== 'POST') return fail(405, 'POST only');
    if (!env.APP_PASSCODE) return fail(500, 'The APP_PASSCODE secret is not set on the Worker');
    if (!(await same(request.headers.get('x-app-passcode') || '', env.APP_PASSCODE))) return fail(401, 'Wrong passcode');

    const path = new URL(request.url).pathname;

    if (path === '/check') return reply(200, { ok: true });

    if (path === '/load' || path === '/save') {
      if (!env.DB) return fail(500, 'The KV binding named DB is not set on the Worker');
      if (path === '/load') return reply(200, { ok: true, data: await env.DB.get('household', 'json') });
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'The save was not valid JSON'); }
      if (!body || typeof body.data !== 'object' || body.data === null) return fail(400, 'Nothing to save');
      await env.DB.put('household', JSON.stringify(body.data));
      return reply(200, { ok: true });
    }

    if (path === '/sheet') {
      if (!env.SHEET_URL || !env.SHEET_TOKEN) return fail(500, 'SHEET_URL and SHEET_TOKEN are not set on the Worker');
      let data;
      try { data = await request.json(); } catch (e) { return fail(400, 'The export was not valid JSON'); }
      data.token = env.SHEET_TOKEN;
      const res = await fetch(env.SHEET_URL, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
      });
      const text = await res.text();
      try { return reply(200, JSON.parse(text)); }
      catch (e) { return fail(502, 'Google Sheets did not return a result. Check SHEET_URL ends in /exec and the web app access is set to Anyone.'); }
    }

    if (path === '/claude' || path === '/') {
      if (!env.ANTHROPIC_API_KEY) return fail(500, 'The ANTHROPIC_API_KEY secret is not set on the Worker');
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: request.body,
      });
      return new Response(upstream.body, { status: upstream.status, headers: { ...cors, 'content-type': 'application/json' } });
    }

    return fail(404, 'Unknown path');
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
