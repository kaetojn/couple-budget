// Couple Budget backend: one Cloudflare Worker, no dependencies, paste-and-deploy.
//
// It does four jobs:
//   1. Keeps the Claude key and the Google Sheet connection out of the browser (/claude, /sheet).
//   2. Stores each household's budget in Workers KV (/load, /save).
//   3. Accounts: email and password sign-in, households, partner invites (/auth/*, /account/*).
//   4. A Claude connector (MCP) with OAuth sign-in, so Claude can read and update the budget (/mcp).
//
// Secrets to set on the Worker:
//   ANTHROPIC_API_KEY  your Claude API key
//   APP_PASSCODE       the passcode you two share; it opens the original household
//   AUTH_SECRET        a long random string that signs sign-in tokens (accounts and the connector need it)
//   SHEET_URL          the Apps Script web app URL, ending in /exec (Google Sheets export, original household only)
//   SHEET_TOKEN        the TOKEN value on the first line of the Apps Script
//   SIGNUP_CODE        optional. New households can only be created with this code. Leave it unset to keep sign-ups closed.
// Binding to add: a KV namespace with the variable name DB.

const ALLOWED_ORIGINS = ['https://kaetojn.github.io'];
const MODEL = 'claude-sonnet-5-5';
/** The household opened by APP_PASSCODE. Its data stays under the original key so nothing moves. */
const LEGACY = 'legacy';
const dataKey = hh => (hh === LEGACY ? 'household' : `hh:${hh}`);
const DAY = 86400;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/.well-known/') || ['/authorize', '/token', '/register', '/mcp'].includes(url.pathname)) {
        return await connector(request, env, url);
      }
      return await app(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return e.response;
      return jsonResponse(500, { error: { message: e.message || 'Something went wrong' } });
    }
  },
};

/* ───────────────────────── Helpers ───────────────────────── */

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.response = jsonResponse(status, { error: { message } }, headers);
  }
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const sha256 = async s => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const randomId = (bytes = 16) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const now = () => Math.floor(Date.now() / 1000);

/** Compares by hash so the check takes the same time whatever was sent. */
async function same(a, b) {
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', enc.encode(v))));
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

async function hmacKey(env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 16) throw new HttpError(500, 'Add an AUTH_SECRET secret (any long random string) to the Worker to use accounts and the Claude connector.');
  return crypto.subtle.importKey('raw', enc.encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * Signed tokens: "cb1.<payload>.<signature>". They carry their own expiry, so sign-in works
 * without waiting for KV to copy a new token around the world.
 */
async function sign(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return `cb1.${body}.${b64url(sig)}`;
}

async function verify(env, token, typ) {
  if (typeof token !== 'string' || !token.startsWith('cb1.')) return null;
  const [, body, sig] = token.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(sig), enc.encode(body));
  if (!ok) return null;
  const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  if (p.typ !== typ || (p.exp && p.exp < now())) return null;
  return p;
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return b64url(bits);
}

/** A short fingerprint of the passcode, so changing APP_PASSCODE signs out everything that used it. */
const passFingerprint = async env => (await sha256(`pass:${env.APP_PASSCODE || ''}`)).slice(0, 12);

/** Slows guessing: ten wrong sign-ins from one address locks it out for 15 minutes. */
async function guard(env, request, ok) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const key = `fail:${ip}`;
  const count = +(await env.DB.get(key)) || 0;
  if (count >= 10) throw new HttpError(429, 'Too many tries. Wait 15 minutes and try again.');
  if (!ok) await env.DB.put(key, String(count + 1), { expirationTtl: 900 });
  return ok;
}

const emailKey = email => `user:${String(email || '').trim().toLowerCase()}`;
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

async function getUser(env, email) {
  return env.DB.get(emailKey(email), 'json');
}

async function getMeta(env, hh) {
  return (await env.DB.get(`meta:${hh}`, 'json')) || { id: hh, members: [], invite: null };
}

async function createUser(env, { email, password, name }, household) {
  if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (String(password || '').length < 8) throw new HttpError(400, 'Use a password of at least 8 characters.');
  if (await getUser(env, email)) throw new HttpError(409, 'An account with that email already exists. Sign in instead.');
  const salt = randomId(12);
  const user = { id: randomId(9), email: email.trim().toLowerCase(), name: String(name || '').trim().slice(0, 40), salt, hash: await hashPassword(password, salt), household, v: 1, created: new Date().toISOString() };
  await env.DB.put(emailKey(email), JSON.stringify(user));
  const meta = await getMeta(env, household);
  meta.members = [...meta.members.filter(m => m.email !== user.email), { id: user.id, email: user.email, name: user.name }];
  await env.DB.put(`meta:${household}`, JSON.stringify(meta));
  return user;
}

async function checkPassword(env, request, email, password) {
  const user = validEmail(email) ? await getUser(env, email) : null;
  const ok = !!user && (await same(await hashPassword(String(password || ''), user.salt), user.hash));
  await guard(env, request, ok);
  if (!ok) throw new HttpError(401, 'That email and password do not match.');
  return user;
}

async function sessionFor(env, user) {
  return sign(env, { typ: 'session', uid: user.id, em: user.email, hh: user.household, v: user.v, exp: now() + 90 * DAY });
}

/**
 * Who is calling: a signed-in account (Authorization: Bearer) or the shared passcode
 * (x-app-passcode, which opens the original household). Returns { hh, user }.
 */
async function identify(request, env) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (bearer) {
    const p = await verify(env, bearer, 'session');
    if (!p) throw new HttpError(401, 'Your sign-in has expired. Sign in again.');
    const user = await getUser(env, p.em);
    if (!user || user.v !== p.v || user.household !== p.hh) throw new HttpError(401, 'Your sign-in has expired. Sign in again.');
    return { hh: user.household, user };
  }
  const pass = request.headers.get('x-app-passcode') || '';
  if (!env.APP_PASSCODE) throw new HttpError(500, 'The APP_PASSCODE secret is not set on the Worker');
  if (!(await guard(env, request, pass && (await same(pass, env.APP_PASSCODE))))) throw new HttpError(401, 'Wrong passcode');
  return { hh: LEGACY, user: null };
}

async function readJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'The request was not valid JSON'); }
}

const publicUser = u => u && { email: u.email, name: u.name };

/* ───────────────────────── The app's API ───────────────────────── */

async function app(request, env, url) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin);
  const cors = {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type, x-app-passcode, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (!allowed) throw new HttpError(403, 'This site is not allowed to use the Worker');
    if (request.method !== 'POST') throw new HttpError(405, 'POST only');
    if (!env.DB) throw new HttpError(500, 'The KV binding named DB is not set on the Worker');
    const res = await route(request, env, url.pathname);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (e) {
    const res = e instanceof HttpError ? e.response : jsonResponse(500, { error: { message: e.message } });
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }
}

async function route(request, env, path) {
  const ok = body => jsonResponse(200, { ok: true, ...body });

  // Signing up and in need no existing credentials.
  if (path === '/auth/login') {
    const { email, password } = await readJson(request);
    const user = await checkPassword(env, request, email, password);
    return ok({ token: await sessionFor(env, user), user: publicUser(user) });
  }
  if (path === '/auth/signup') {
    const body = await readJson(request);
    let household;
    if (body.invite) {
      household = await env.DB.get(`invite:${String(body.invite).trim().toUpperCase()}`);
      if (!(await guard(env, request, !!household))) throw new HttpError(400, 'That invite code is not valid. Ask your partner for a new one.');
    } else {
      if (!env.SIGNUP_CODE) throw new HttpError(403, 'New sign-ups are closed. Ask for an invite code.');
      if (!(await guard(env, request, await same(String(body.signupCode || ''), env.SIGNUP_CODE)))) throw new HttpError(403, 'That sign-up code is not right.');
      household = randomId(9);
    }
    const user = await createUser(env, body, household);
    return ok({ token: await sessionFor(env, user), user: publicUser(user), joined: !!body.invite });
  }

  const who = await identify(request, env);

  if (path === '/check') {
    const meta = await getMeta(env, who.hh);
    return ok({ household: who.hh, mode: who.user ? 'account' : 'passcode', user: publicUser(who.user), members: meta.members.map(m => ({ email: m.email, name: m.name })), sheets: who.hh === LEGACY && !!env.SHEET_URL, signup: !!env.SIGNUP_CODE });
  }

  if (path === '/load') return ok({ data: await env.DB.get(dataKey(who.hh), 'json') });

  if (path === '/save') {
    const body = await readJson(request);
    if (!body || typeof body.data !== 'object' || body.data === null) throw new HttpError(400, 'Nothing to save');
    await env.DB.put(dataKey(who.hh), JSON.stringify(body.data));
    return ok({});
  }

  if (path === '/account/claim') {
    // Turns the passcode household into one with real logins, without moving any data.
    if (who.user) throw new HttpError(400, 'You are already signed in with an account.');
    const user = await createUser(env, await readJson(request), LEGACY);
    return ok({ token: await sessionFor(env, user), user: publicUser(user) });
  }

  if (path === '/account/invite') {
    const meta = await getMeta(env, who.hh);
    if (meta.invite) await env.DB.delete(`invite:${meta.invite}`);
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    meta.invite = code;
    await env.DB.put(`invite:${code}`, who.hh, { expirationTtl: 7 * DAY });
    await env.DB.put(`meta:${who.hh}`, JSON.stringify(meta));
    return ok({ code, expires: '7 days' });
  }

  if (path === '/account/signout-everywhere') {
    if (!who.user) throw new HttpError(400, 'Sign in with an account first.');
    who.user.v += 1;
    await env.DB.put(emailKey(who.user.email), JSON.stringify(who.user));
    return ok({});
  }

  if (path === '/account/password') {
    if (!who.user) throw new HttpError(400, 'Sign in with an account first.');
    const { current, next } = await readJson(request);
    await checkPassword(env, request, who.user.email, current);
    if (String(next || '').length < 8) throw new HttpError(400, 'Use a password of at least 8 characters.');
    who.user.salt = randomId(12);
    who.user.hash = await hashPassword(next, who.user.salt);
    who.user.v += 1;
    await env.DB.put(emailKey(who.user.email), JSON.stringify(who.user));
    return ok({ token: await sessionFor(env, who.user) });
  }

  if (path === '/sheet') {
    if (who.hh !== LEGACY) throw new HttpError(403, 'Google Sheets export is not set up for this household.');
    if (!env.SHEET_URL || !env.SHEET_TOKEN) throw new HttpError(500, 'SHEET_URL and SHEET_TOKEN are not set on the Worker');
    const data = await readJson(request);
    data.token = env.SHEET_TOKEN;
    const res = await fetch(env.SHEET_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
    const text = await res.text();
    try { return jsonResponse(200, JSON.parse(text)); }
    catch { throw new HttpError(502, 'Google Sheets did not return a result. Check SHEET_URL ends in /exec and the web app access is set to Anyone.'); }
  }

  if (path === '/claude' || path === '/') {
    if (!env.ANTHROPIC_API_KEY) throw new HttpError(500, 'The ANTHROPIC_API_KEY secret is not set on the Worker');
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: request.body,
    });
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json' } });
  }

  throw new HttpError(404, 'Unknown path');
}

/* ───────────────────────── Claude connector: OAuth ───────────────────────── */

const openCors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version, mcp-session-id', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

async function connector(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: openCors });
  const base = url.origin;
  const path = url.pathname;

  if (path.startsWith('/.well-known/oauth-protected-resource')) {
    return jsonResponse(200, { resource: `${base}/mcp`, authorization_servers: [base], bearer_methods_supported: ['header'], resource_name: 'Couple Budget' }, openCors);
  }
  if (path.startsWith('/.well-known/oauth-authorization-server') || path.startsWith('/.well-known/openid-configuration')) {
    return jsonResponse(200, {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['budget'],
    }, openCors);
  }
  if (path === '/register') return register(request, env);
  if (path === '/authorize') return authorize(request, env, url);
  if (path === '/token') return token(request, env);
  if (path === '/mcp') return mcp(request, env, base);
  return jsonResponse(404, { error: 'not_found' });
}

const allowedRedirect = u => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.hostname === 'localhost' || x.hostname === '127.0.0.1';
  } catch { return false; }
};

/** Dynamic client registration. The client id is signed and carries its own redirect addresses, so nothing is stored. */
async function register(request, env) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'invalid_request' }, openCors);
  const body = await request.json().catch(() => ({}));
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter(u => typeof u === 'string') : [];
  if (!uris.length || !uris.every(allowedRedirect)) return jsonResponse(400, { error: 'invalid_redirect_uri', error_description: 'Redirect addresses must use https.' }, openCors);
  const name = String(body.client_name || 'Claude').slice(0, 60);
  const client_id = await sign(env, { typ: 'client', ru: uris, n: name });
  return jsonResponse(201, {
    client_id, client_name: name, redirect_uris: uris, client_id_issued_at: now(),
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  }, openCors);
}

async function readClient(env, clientId) {
  // Clients that publish a metadata document (Claude's published identity) use an https URL as their id.
  if (/^https:\/\//.test(clientId || '')) {
    try {
      const res = await fetch(clientId, { headers: { accept: 'application/json' } });
      const doc = await res.json();
      if (doc.client_id === clientId && Array.isArray(doc.redirect_uris)) return { ru: doc.redirect_uris, n: doc.client_name || 'Claude' };
    } catch { /* fall through */ }
    return null;
  }
  return verify(env, clientId, 'client');
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function signInPage({ params, client, error, mode }) {
  const hidden = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']
    .map(k => `<input type="hidden" name="${k}" value="${esc(params.get(k))}">`).join('');
  const usePass = mode === 'passcode';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect ${esc(client.n)} to Couple Budget</title>
<style>
  *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f5fa;color:#0f172a;font:16px/1.45 ui-rounded,"SF Pro Rounded",system-ui,-apple-system,sans-serif;padding:20px}
  main{width:100%;max-width:400px;background:#fff;border:1px solid #e2e6ef;border-radius:24px;padding:28px;display:grid;gap:16px;box-shadow:0 10px 40px -20px rgba(15,23,42,.25)}
  .logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px} .logo b{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#4b3fe4;color:#fff;letter-spacing:-1px}
  h1{margin:0;font-size:22px} p{margin:0;color:#566074} label{display:grid;gap:6px;font-weight:600;font-size:14px}
  input[type=email],input[type=password]{height:48px;border:1px solid #e2e6ef;border-radius:14px;padding:0 14px;font:inherit;background:#f3f5fa}
  input:focus{outline:2px solid #4b3fe4;outline-offset:1px} button{height:50px;border:0;border-radius:14px;background:#4b3fe4;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  .err{color:#d13438;font-weight:600;font-size:14px} .alt{text-align:center;font-size:14px} a{color:#4b3fe4;font-weight:600}
  ul{margin:0;padding-left:18px;color:#566074;font-size:14px}
</style></head><body><main>
<div class="logo"><b>BK</b>Couple Budget</div>
<div><h1>Connect ${esc(client.n)}</h1><p>${esc(client.n)} will be able to read your budget and add or change transactions, budgets and balances.</p></div>
<form method="post" style="display:grid;gap:14px">${hidden}
${usePass
    ? `<input type="hidden" name="mode" value="passcode"><label>Household passcode<input type="password" name="passcode" autocomplete="current-password" required autofocus></label>`
    : `<label>Email<input type="email" name="email" autocomplete="username" required autofocus></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label>`}
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<button type="submit">Allow access</button></form>
<p class="alt">${usePass ? `<a href="?${esc(withMode(params, 'account'))}">Sign in with email instead</a>` : `<a href="?${esc(withMode(params, 'passcode'))}">Use the household passcode instead</a>`}</p>
<ul><li>You can disconnect at any time in Claude's connector settings.</li><li>Your password is never shared with ${esc(client.n)}.</li></ul>
</main></body></html>`, { status: error ? 401 : 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'" } });
}

function withMode(params, mode) {
  const p = new URLSearchParams(params);
  p.set('mode', mode);
  return p.toString();
}

async function authorize(request, env, url) {
  const params = request.method === 'POST' ? new URLSearchParams(await request.text()) : url.searchParams;
  const clientId = params.get('client_id');
  const redirect = params.get('redirect_uri');
  const client = await readClient(env, clientId);
  if (!client) return new Response('This connection request is not valid. Remove the connector in Claude and add it again.', { status: 400 });
  if (!redirect || !client.ru.includes(redirect)) return new Response('The redirect address does not match this connector.', { status: 400 });
  const back = (q) => {
    const to = new URL(redirect);
    for (const [k, v] of Object.entries(q)) to.searchParams.set(k, v);
    if (params.get('state')) to.searchParams.set('state', params.get('state'));
    return Response.redirect(to.toString(), 302);
  };
  if (params.get('response_type') !== 'code') return back({ error: 'unsupported_response_type' });
  if (!params.get('code_challenge') || params.get('code_challenge_method') !== 'S256') return back({ error: 'invalid_request', error_description: 'PKCE with S256 is required' });

  const mode = params.get('mode') === 'passcode' ? 'passcode' : 'account';
  if (request.method !== 'POST') return signInPage({ params, client, mode });

  let grant;
  try {
    if (mode === 'passcode') {
      if (!env.APP_PASSCODE || !(await guard(env, request, await same(params.get('passcode') || '', env.APP_PASSCODE)))) throw new HttpError(401, 'That passcode is not right.');
      grant = { hh: LEGACY, pf: await passFingerprint(env) };
    } else {
      const user = await checkPassword(env, request, params.get('email'), params.get('password'));
      grant = { hh: user.household, em: user.email, v: user.v };
    }
  } catch (e) {
    return signInPage({ params, client, mode, error: e.message });
  }
  const code = await sign(env, { typ: 'code', ...grant, cid: await sha256(clientId), ru: redirect, cc: params.get('code_challenge'), exp: now() + 600 });
  return back({ code });
}

/** Checks the grant inside a token is still good: the account still exists, or the passcode has not changed. */
async function grantValid(env, g) {
  if (g.hh === LEGACY && g.pf) return g.pf === (await passFingerprint(env));
  if (!g.em) return false;
  const user = await getUser(env, g.em);
  return !!user && user.v === g.v && user.household === g.hh;
}

async function issueTokens(env, g) {
  const grant = { hh: g.hh, ...(g.pf ? { pf: g.pf } : { em: g.em, v: g.v }) };
  return {
    access_token: await sign(env, { typ: 'access', ...grant, exp: now() + 3600 }),
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: await sign(env, { typ: 'refresh', ...grant, jti: randomId(6), exp: now() + 60 * DAY }),
    scope: 'budget',
  };
}

async function token(request, env) {
  const fail = (error, error_description) => jsonResponse(400, { error, error_description }, openCors);
  if (request.method !== 'POST') return fail('invalid_request', 'POST only');
  const type = request.headers.get('content-type') || '';
  const p = type.includes('application/json') ? new URLSearchParams(await request.json()) : new URLSearchParams(await request.text());

  if (p.get('grant_type') === 'authorization_code') {
    const code = await verify(env, p.get('code'), 'code');
    if (!code) return fail('invalid_grant', 'The code is not valid or has expired');
    if (code.cid !== (await sha256(p.get('client_id') || ''))) return fail('invalid_grant', 'The code was issued to another client');
    if (code.ru !== p.get('redirect_uri')) return fail('invalid_grant', 'The redirect address does not match');
    if ((await sha256(p.get('code_verifier') || '')) !== code.cc) return fail('invalid_grant', 'The code verifier does not match');
    if (!(await grantValid(env, code))) return fail('invalid_grant', 'Sign in again');
    return jsonResponse(200, await issueTokens(env, code), openCors);
  }
  if (p.get('grant_type') === 'refresh_token') {
    const r = await verify(env, p.get('refresh_token'), 'refresh');
    if (!r || !(await grantValid(env, r))) return fail('invalid_grant', 'Sign in again');
    return jsonResponse(200, await issueTokens(env, r), openCors);
  }
  return fail('unsupported_grant_type', 'Use authorization_code or refresh_token');
}

/* ───────────────────────── Claude connector: MCP ───────────────────────── */

const INSTRUCTIONS = `Couple Budget is a household budget shared by two partners (p1 and p2, see get_overview for their names).
Amounts are in dollars. Positive amounts are money going out (spending); negative amounts are money coming in (pay, refunds).
When the user shares bank statements or banking-app screenshots, read every transaction, call list_categories, and
call add_transactions with the month, whose account it is (p1, p2 or joint) and each transaction's category.
Ask whose statement it is if that is unclear. Card payments and moves between their own accounts are "Transfer".
Money moved into the couple's joint chequing account is "Joint account top-up". Payroll is "Income".
Never describe shared costs as one partner owing the other; gaps are closed by topping up the joint account.`;

const monthArg = { type: 'string', description: 'Budget month as YYYY-MM. Defaults to the current month.', pattern: '^\\d{4}-\\d{2}$' };
const payerArg = { type: 'string', enum: ['p1', 'p2', 'joint'], description: 'Whose account: p1 or p2 (the partners) or joint (the joint account).' };

const TOOLS = [
  {
    name: 'get_overview',
    description: 'Partners, incomes, split and arrangement, plus the month\'s spending by category against budgets, and each partner\'s share of shared costs. Start here.',
    inputSchema: { type: 'object', properties: { month: monthArg } },
    annotations: { title: 'Budget overview', readOnlyHint: true },
  },
  {
    name: 'list_categories',
    description: 'All categories with budgets, who each belongs to (shared, p1, p2 or personal) and kind. Use these exact names when adding transactions.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'List categories', readOnlyHint: true },
  },
  {
    name: 'list_transactions',
    description: 'Transactions in a month, newest first, optionally filtered.',
    inputSchema: {
      type: 'object',
      properties: {
        month: monthArg,
        category: { type: 'string', description: 'Only this category' },
        paid_by: payerArg,
        search: { type: 'string', description: 'Text to look for in descriptions' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
      },
    },
    annotations: { title: 'List transactions', readOnlyHint: true },
  },
  {
    name: 'add_transactions',
    description: 'Adds transactions read from a statement or screenshots to a month. Transactions already saved (same date, amount, payer and merchant) are skipped, so overlapping screenshots are safe.',
    inputSchema: {
      type: 'object',
      required: ['month', 'paid_by', 'transactions'],
      properties: {
        month: monthArg,
        paid_by: payerArg,
        source: { type: 'string', description: 'Where these came from, e.g. "TD Visa statement, Oct 2026"' },
        transactions: {
          type: 'array',
          minItems: 1,
          maxItems: 400,
          items: {
            type: 'object',
            required: ['date', 'description', 'amount', 'category'],
            properties: {
              date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              description: { type: 'string' },
              amount: { type: 'number', description: 'Positive for money out, negative for money in' },
              category: { type: 'string', description: 'A category name from list_categories' },
              shared: { type: 'boolean', description: 'For categories that belong to whoever pays: true if this purchase was for both partners' },
            },
          },
        },
      },
    },
    annotations: { title: 'Add transactions', readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'update_transaction',
    description: 'Changes a transaction\'s category or owner, or excludes it from totals. Get ids from list_transactions.',
    inputSchema: {
      type: 'object',
      required: ['month', 'id'],
      properties: {
        month: monthArg,
        id: { type: 'string' },
        category: { type: 'string' },
        owner: { type: 'string', enum: ['shared', 'p1', 'p2'], description: 'Whose cost it is' },
        exclude: { type: 'boolean', description: 'true to leave it out of totals' },
        remember: { type: 'boolean', description: 'Also categorize future transactions from this merchant the same way' },
      },
    },
    annotations: { title: 'Update a transaction', readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'set_budget',
    description: 'Sets a category\'s monthly budget.',
    inputSchema: { type: 'object', required: ['category', 'budget'], properties: { category: { type: 'string' }, budget: { type: 'number', minimum: 0 } } },
    annotations: { title: 'Set a budget', readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'get_bills',
    description: 'Bills and debts with amounts, due days and whether each is marked paid for the month, plus account balances and card due dates.',
    inputSchema: { type: 'object', properties: { month: monthArg } },
    annotations: { title: 'Bills and accounts', readOnlyHint: true },
  },
  {
    name: 'update_account',
    description: 'Records an account balance from a statement, adding the account if it is new. For credit cards, also records the statement balance, minimum and due date.',
    inputSchema: {
      type: 'object',
      required: ['name', 'balance', 'owner'],
      properties: {
        name: { type: 'string', description: 'e.g. "TD Chequing" or "CIBC Visa"' },
        last4: { type: 'string', description: 'Last four digits of the account or card' },
        type: { type: 'string', enum: ['chequing', 'savings', 'investment', 'credit', 'loan', 'mortgage', 'property', 'vehicle'] },
        owner: { type: 'string', enum: ['shared', 'p1', 'p2'] },
        balance: { type: 'number', description: 'Closing balance; for cards and loans, the amount owed, as a positive number' },
        as_of: { type: 'string', description: 'Statement end date, YYYY-MM-DD' },
        due_date: { type: 'string', description: 'Credit cards: payment due date, YYYY-MM-DD' },
        minimum: { type: 'number', description: 'Credit cards: minimum payment' },
      },
    },
    annotations: { title: 'Update an account', readOnlyHint: false, destructiveHint: false },
  },
];

async function mcp(request, env, base) {
  const challenge = { 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`, ...openCors };
  if (request.method === 'GET') return new Response('This connector does not stream; use POST.', { status: 405, headers: { allow: 'POST', ...openCors } });
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: openCors });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: openCors });

  const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const grant = auth && (await verify(env, auth, 'access'));
  if (!grant || !(await grantValid(env, grant))) return jsonResponse(401, { error: 'invalid_token', error_description: 'Sign in to Couple Budget' }, challenge);

  let msg;
  try { msg = await request.json(); } catch { return jsonResponse(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, openCors); }
  const batch = Array.isArray(msg);
  const results = [];
  for (const m of batch ? msg : [msg]) {
    const r = await handleRpc(m, env, grant.hh);
    if (r) results.push(r);
  }
  if (!results.length) return new Response(null, { status: 202, headers: openCors });
  return jsonResponse(200, batch ? results : results[0], openCors);
}

async function handleRpc(m, env, hh) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  if (m.id === undefined) return null; // a notification
  const reply = result => ({ jsonrpc: '2.0', id: m.id, result });
  switch (m.method) {
    case 'initialize':
      return reply({
        protocolVersion: m.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'couple-budget', title: 'Couple Budget', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = m.params?.name;
      const args = m.params?.arguments || {};
      if (!TOOLS.some(t => t.name === name)) return { jsonrpc: '2.0', id: m.id, error: { code: -32602, message: `Unknown tool: ${name}` } };
      try {
        const out = await runTool(name, args, env, hh);
        return reply({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }], ...(typeof out === 'object' ? { structuredContent: out } : {}) });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: e.message }], isError: true });
      }
    }
    default:
      return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
  }
}

/* ───────────────────────── Budget tools ───────────────────────── */

const thisMonth = () => new Date().toISOString().slice(0, 7);
const r2 = n => Math.round(n * 100) / 100;
const normalize = s => String(s).toUpperCase().replace(/[^A-Z& ]/g, ' ').replace(/\s+/g, ' ').trim();
const merchantKey = d => normalize(d).split(' ').slice(0, 2).join(' ');

async function loadDoc(env, hh) {
  const doc = await env.DB.get(dataKey(hh), 'json');
  if (!doc || !doc.settings) throw new Error('This household has no budget yet. Open the Couple Budget app and finish the setup first.');
  doc.months = doc.months || {};
  doc.categories = doc.categories || [];
  doc.bills = doc.bills || [];
  doc.accounts = doc.accounts || [];
  doc.rules = doc.rules || [];
  return doc;
}

async function saveDoc(env, hh, doc) {
  doc.updatedAt = new Date().toISOString();
  await env.DB.put(dataKey(hh), JSON.stringify(doc));
}

const person = (doc, k) => (k === 'p1' ? doc.settings.p1 || 'Partner 1' : k === 'p2' ? doc.settings.p2 || 'Partner 2' : k === 'joint' ? 'Joint account' : 'Shared');
const catOf = (doc, name) => doc.categories.find(c => c.name === name) || doc.categories.find(c => c.name === 'Other') || doc.categories[0];
const findCat = (doc, name) => doc.categories.find(c => c.name.toLowerCase() === String(name || '').trim().toLowerCase());
const ownerFor = (cat, paidBy) => (cat.scope === 'personal' ? (paidBy === 'joint' ? 'shared' : paidBy) : cat.scope);
const checkMonth = m => {
  const month = m || thisMonth();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Use a month like 2026-11.');
  return month;
};

function monthSummary(doc, month) {
  const tx = (doc.months[month]?.tx || []).filter(t => !t.exclude);
  const byCat = {};
  let spent = 0, income = 0, shared = 0;
  const direct = { p1: 0, p2: 0 }, topUps = { p1: 0, p2: 0 };
  for (const t of tx) {
    const cat = catOf(doc, t.category);
    if (cat.kind === 'income' || (t.amount < 0 && cat.kind !== 'expense')) { income -= Math.min(0, t.amount); continue; }
    if (cat.name === 'Joint account top-up' && t.paidBy !== 'joint' && t.amount > 0) topUps[t.paidBy] += t.amount;
    if (cat.kind !== 'expense') continue;
    byCat[cat.name] = (byCat[cat.name] || 0) + t.amount;
    spent += t.amount;
    if (t.owner === 'shared' && !/gift/i.test(cat.name)) {
      shared += t.amount;
      if (t.paidBy !== 'joint') direct[t.paidBy] += t.amount;
    }
  }
  const split = (doc.settings.split ?? 50) / 100;
  const jointSeen = tx.some(t => t.paidBy === 'joint');
  const base = shared + (jointSeen ? 0 : topUps.p1 + topUps.p2);
  const shares = Object.fromEntries(['p1', 'p2'].map(p => {
    const fair = base * (p === 'p1' ? split : 1 - split);
    return [person(doc, p), { share: r2(fair), paid_directly: r2(direct[p]), into_joint: r2(topUps[p]), behind_by: r2(Math.max(0, fair - direct[p] - topUps[p])) }];
  }));
  const categories = doc.categories.filter(c => c.kind === 'expense' && (c.budget > 0 || byCat[c.name]))
    .map(c => ({ category: c.name, belongs_to: c.scope === 'personal' ? 'whoever pays' : person(doc, c.scope), spent: r2(byCat[c.name] || 0), budget: c.budget || 0, left: r2((c.budget || 0) - (byCat[c.name] || 0)) }))
    .sort((a, b) => b.spent - a.spent);
  return { month, transactions: tx.length, spent: r2(spent), money_in: r2(income), shared_costs: r2(base), shares_of_shared_costs: shares, categories };
}

async function runTool(name, a, env, hh) {
  const doc = await loadDoc(env, hh);
  const s = doc.settings;

  if (name === 'get_overview') {
    const month = checkMonth(a.month);
    const months = Object.keys(doc.months).filter(m => doc.months[m]?.tx?.length).sort();
    return {
      partners: { p1: s.p1, p2: s.p2 },
      monthly_take_home: { [s.p1 || 'p1']: s.inc1, [s.p2 || 'p2']: s.inc2 },
      arrangement: s.arrangement,
      shared_cost_split: `${s.p1} ${Math.round(s.split)}% / ${s.p2} ${Math.round(100 - s.split)}%`,
      joint_savings_per_month: { [s.p1 || 'p1']: s.sav1, [s.p2 || 'p2']: s.sav2 },
      months_with_data: months,
      ...monthSummary(doc, month),
    };
  }

  if (name === 'list_categories') {
    return { categories: doc.categories.map(c => ({ name: c.name, budget: c.budget || 0, belongs_to: c.scope, kind: c.kind })) };
  }

  if (name === 'list_transactions') {
    const month = checkMonth(a.month);
    const q = String(a.search || '').toLowerCase();
    const list = (doc.months[month]?.tx || [])
      .filter(t => (!a.category || t.category.toLowerCase() === a.category.toLowerCase()) && (!a.paid_by || t.paidBy === a.paid_by) && (!q || t.desc.toLowerCase().includes(q)))
      .sort((x, y) => y.date.localeCompare(x.date))
      .slice(0, Math.min(500, a.limit || 100));
    return { month, count: list.length, transactions: list.map(t => ({ id: t.id, date: t.date, description: t.desc, amount: t.amount, category: t.category, paid_by: t.paidBy, owner: t.owner, excluded: !!t.exclude })) };
  }

  if (name === 'add_transactions') {
    const month = checkMonth(a.month);
    if (!['p1', 'p2', 'joint'].includes(a.paid_by)) throw new Error('paid_by must be p1, p2 or joint.');
    if (!Array.isArray(a.transactions) || !a.transactions.length) throw new Error('Send at least one transaction.');
    const existing = doc.months[month]?.tx || [];
    const key = t => `${t.date}|${(+t.amount).toFixed(2)}|${t.paidBy}|${merchantKey(t.desc)}`;
    const seen = new Set(existing.map(key));
    const source = String(a.source || 'Added from Claude').slice(0, 80);
    const added = [], unknown = new Set();
    let skipped = 0;
    for (const x of a.transactions) {
      const amount = +x.amount;
      if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))) { skipped++; continue; }
      let cat = findCat(doc, x.category);
      if (!cat) { unknown.add(x.category); cat = catOf(doc, 'Other'); }
      const t = {
        id: randomId(8), date: x.date, desc: String(x.description || '').slice(0, 140), amount: r2(amount), category: cat.name, paidBy: a.paid_by,
        owner: cat.scope === 'p1' || cat.scope === 'p2' ? cat.scope : x.shared ? 'shared' : ownerFor(cat, a.paid_by), source, exclude: false,
      };
      for (const rule of doc.rules) if (normalize(t.desc).includes(rule.match)) { t.category = rule.category; t.owner = rule.owner === 'shared' ? 'shared' : a.paid_by === 'joint' ? 'shared' : a.paid_by; }
      if (seen.has(key(t))) { skipped++; continue; }
      seen.add(key(t));
      added.push(t);
    }
    doc.months[month] = { ...(doc.months[month] || {}), tx: [...existing, ...added].sort((x, y) => x.date.localeCompare(y.date)) };
    await saveDoc(env, hh, doc);
    return {
      month, added: added.length, skipped_as_duplicates_or_invalid: skipped,
      ...(unknown.size ? { filed_under_other: [...unknown], note: 'These category names did not exist, so those transactions went to Other. Use list_categories and update_transaction to fix them.' } : {}),
      summary: monthSummary(doc, month),
    };
  }

  if (name === 'update_transaction') {
    const month = checkMonth(a.month);
    const t = (doc.months[month]?.tx || []).find(x => x.id === a.id);
    if (!t) throw new Error('No transaction with that id in that month. Use list_transactions to find it.');
    if (a.category !== undefined) {
      const cat = findCat(doc, a.category);
      if (!cat) throw new Error(`There is no category called "${a.category}". Use list_categories.`);
      t.category = cat.name;
      t.owner = ownerFor(cat, t.paidBy);
    }
    if (a.owner) t.owner = a.owner;
    if (a.exclude !== undefined) t.exclude = !!a.exclude;
    if (a.remember && a.category) {
      const match = normalize(t.desc).split(' ').slice(0, 3).join(' ');
      if (match) doc.rules = [...doc.rules.filter(r => r.match !== match), { match, category: t.category, owner: t.owner === 'shared' ? 'shared' : 'personal' }];
    }
    await saveDoc(env, hh, doc);
    return { updated: { id: t.id, description: t.desc, category: t.category, owner: t.owner, excluded: !!t.exclude } };
  }

  if (name === 'set_budget') {
    const cat = findCat(doc, a.category);
    if (!cat) throw new Error(`There is no category called "${a.category}". Use list_categories.`);
    if (!(+a.budget >= 0)) throw new Error('The budget must be zero or more.');
    cat.budget = r2(+a.budget);
    await saveDoc(env, hh, doc);
    return { category: cat.name, budget: cat.budget };
  }

  if (name === 'get_bills') {
    const month = checkMonth(a.month);
    return {
      month,
      bills: doc.bills.map(b => ({ name: b.name, kind: b.kind, amount: b.amount, due_day: b.dueDay, paid_by: person(doc, b.payer), marked_paid: b.paid?.[month] ?? null, ...(b.kind === 'debt' ? { balance: b.balance ?? null } : {}) })),
      accounts: doc.accounts.map(x => ({ name: x.name, type: x.type, owner: person(doc, x.owner), balance: x.balance, ...(x.last4 ? { last4: x.last4 } : {}), ...(x.asOf ? { as_of: x.asOf } : {}), ...(x.due ? { card_statement: x.due } : {}) })),
    };
  }

  if (name === 'update_account') {
    const last4 = a.last4 ? String(a.last4).replace(/\D/g, '').slice(-4) : undefined;
    let acc = doc.accounts.find(x => (last4 && x.last4 === last4) || (!last4 && x.name.toLowerCase() === String(a.name).toLowerCase()));
    if (!acc) {
      acc = { id: randomId(8), name: String(a.name).slice(0, 60), type: a.type || 'chequing', owner: a.owner || 'shared', balance: 0, ...(last4 ? { last4 } : {}) };
      doc.accounts.push(acc);
    }
    if (a.as_of && acc.asOf && a.as_of < acc.asOf) return { account: acc.name, note: `Kept the newer balance from ${acc.asOf}.` };
    acc.balance = r2(Math.abs(+a.balance));
    acc.asOf = a.as_of || new Date().toISOString().slice(0, 10);
    if (a.type) acc.type = a.type;
    if (acc.type === 'credit' && a.as_of) acc.due = { balance: acc.balance, ...(a.minimum ? { min: r2(+a.minimum) } : {}), ...(a.due_date ? { date: a.due_date } : {}), end: a.as_of };
    await saveDoc(env, hh, doc);
    return { account: acc.name, balance: acc.balance, as_of: acc.asOf };
  }

  throw new Error(`Unknown tool ${name}`);
}
