/** Client for the Cloudflare Worker, which holds the Claude key, the Google Sheet connection and the database. */
export const WORKER = 'https://couple-budget.kaetojn.workers.dev';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Signed-in accounts hold a token starting "cb1."; anything else is the shared household passcode. */
export const isAccount = (credential: string) => credential.startsWith('cb1.');

async function post(path: string, passcode: string, body?: unknown): Promise<any> {
  let res: Response;
  const auth: Record<string, string> = !passcode ? {} : isAccount(passcode) ? { authorization: `Bearer ${passcode}` } : { 'x-app-passcode': passcode };
  try {
    res = await fetch(WORKER + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      res.status === 401 && json?.error?.message ? json.error.message
      : res.status === 401 ? 'That passcode is not right.'
      : res.status === 404 || (path === '/check' && res.status === 400) ? 'The Worker is running old code. Paste the latest worker.js into Cloudflare and deploy.'
      : json?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return json;
}

export interface Member { email: string; name: string }
export interface CheckResult { household: string; mode: 'account' | 'passcode'; user: Member | null; members: Member[]; sheets: boolean; signup: boolean }
interface SignedIn { token: string; user: Member }

export const api = {
  // An older Worker answers with only { ok: true }; treat that as the original passcode household.
  check: async (passcode: string): Promise<CheckResult> => ({ household: 'legacy', mode: 'passcode', user: null, members: [], sheets: true, signup: false, ...(await post('/check', passcode)) }),
  login: (email: string, password: string) => post('/auth/login', '', { email, password }) as Promise<SignedIn>,
  signup: (body: { email: string; password: string; name: string; invite?: string; signupCode?: string; turnstile?: string }) => post('/auth/signup', '', body) as Promise<SignedIn>,
  claim: (passcode: string, body: { email: string; password: string; name: string }) => post('/account/claim', passcode, body) as Promise<SignedIn>,
  config: async (): Promise<{ turnstile: string | null; signup: boolean; email: boolean }> => {
    try {
      const r = await fetch(`${WORKER}/config`);
      return r.ok ? await r.json() : { turnstile: null, signup: false, email: false };
    } catch { return { turnstile: null, signup: false, email: false }; }
  },
  forgot: (email: string, turnstile?: string) => post('/auth/forgot', '', { email, turnstile }) as Promise<{ emailed: boolean }>,
  reset: (body: { token?: string; code?: string; email?: string; password: string }) => post('/auth/reset', '', body) as Promise<SignedIn>,
  resetCode: (credential: string, email: string) => post('/account/reset-code', credential, { email }) as Promise<{ code: string; expires: string }>,
  invite: (credential: string) => post('/account/invite', credential) as Promise<{ code: string; expires: string }>,
  changePassword: (credential: string, current: string, next: string) => post('/account/password', credential, { current, next }) as Promise<{ token: string }>,
  signOutEverywhere: (credential: string) => post('/account/signout-everywhere', credential),
  prices: (credential: string, symbols: { symbol: string; exchange?: string; mic?: string; kind?: string }[]) =>
    post('/prices', credential, { symbols }) as Promise<{ live: boolean; quotes: Record<string, { price: number; currency: string; day?: string; change?: number }>; fx: number | null; pending: number; limited: boolean }>,
  load: async (passcode: string) => (await post('/load', passcode)).data as unknown,
  save: (passcode: string, data: unknown) => post('/save', passcode, { data }),
  sheet: (passcode: string, payload: { tabName: string; rows: unknown[][]; boldRows: number[] }) => post('/sheet', passcode, payload),
  async claude(passcode: string, content: unknown[], system: string, maxTokens: number) {
    const json = await post('/claude', passcode, { model: 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] });
    const text: string = (json.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return { text, truncated: json.stop_reason === 'max_tokens' };
  },

  /**
   * Asks Claude for a JSON answer. A reply that is cut off or unreadable is tried once more with
   * twice the room and a request to be brief, before giving up with a clear message.
   */
  async claudeJson<T>(passcode: string, content: unknown[], system: string, maxTokens: number): Promise<T> {
    let out = await api.claude(passcode, content, system, maxTokens);
    try {
      if (!out.truncated) return parseJson<T>(out.text);
    } catch { /* retry below */ }
    const brief = [...content, { type: 'text', text: 'Keep every item to one short sentence. Reply with the JSON object only.' }];
    out = await api.claude(passcode, brief, system, maxTokens * 2);
    try {
      return parseJson<T>(out.text);
    } catch {
      throw new Error(out.truncated ? 'The answer was too long to finish. Try again.' : 'Claude did not return a readable result. Try again.');
    }
  },
};

/**
 * Pulls the first JSON object out of a model reply. If the reply was cut off part way, the open
 * strings, arrays and objects are closed so everything before the cut is still usable.
 */
export function parseJson<T>(text: string): T {
  const a = text.indexOf('{');
  if (a < 0) throw new Error(text.trim() ? `Claude replied without a result: "${text.trim().slice(0, 120)}"` : 'Claude sent an empty reply. Try again.');
  const b = text.lastIndexOf('}');
  if (b > a) {
    try { return JSON.parse(text.slice(a, b + 1)) as T; } catch { /* fall through to repair */ }
  }
  return JSON.parse(repairJson(text.slice(a))) as T;
}

/** Closes whatever a cut-off JSON reply left open, dropping a half-written last item. */
export function repairJson(s: string): string {
  const stack: string[] = [];
  let inString = false, escaped = false, lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stack.pop(); if (!stack.length) return s.slice(0, i + 1); }
    // A comma at array or object level marks the end of a complete item.
    if (!inString && (c === ',' || c === '[' || c === '{')) lastSafe = c === ',' ? i : i + 1;
  }
  // Cut back to the last complete item, then close everything still open.
  let out = s.slice(0, lastSafe).replace(/[,\s]+$/, '');
  const open: string[] = [];
  let str = false, esc = false;
  for (const c of out) {
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '{' || c === '[') open.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') open.pop();
  }
  out = out.replace(/:\s*$/, ': null');
  return out + open.reverse().join('');
}
