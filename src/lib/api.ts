/** Client for the Cloudflare Worker, which holds the Claude key, the Google Sheet connection and the database. */
export const WORKER = 'https://couple-budget.kaetojn.workers.dev';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function post(path: string, passcode: string, body?: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(WORKER + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-passcode': passcode },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      res.status === 401 ? 'That passcode is not right.'
      : res.status === 404 || (path === '/check' && res.status === 400) ? 'The Worker is running old code. Paste the latest worker.js into Cloudflare and deploy.'
      : json?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return json;
}

export const api = {
  check: (passcode: string) => post('/check', passcode),
  load: async (passcode: string) => (await post('/load', passcode)).data as unknown,
  save: (passcode: string, data: unknown) => post('/save', passcode, { data }),
  sheet: (passcode: string, payload: { tabName: string; rows: unknown[][]; boldRows: number[] }) => post('/sheet', passcode, payload),
  async claude(passcode: string, content: unknown[], system: string, maxTokens: number) {
    const json = await post('/claude', passcode, { model: 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] });
    const text: string = (json.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return { text, truncated: json.stop_reason === 'max_tokens' };
  },
};

/** Pulls the first JSON object out of a model reply. */
export function parseJson<T>(text: string): T {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('The reply did not contain a result');
  return JSON.parse(text.slice(a, b + 1)) as T;
}
