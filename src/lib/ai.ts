import { api, parseJson } from './api';
import { accountType, CLASSES, drift, portfolio, TARGETS, valueCad, type InvAccount } from './invest';
import { accountLabel, cardChecks, fundingChecks } from './accounts';
import { crossText, sharedCheck, shortText } from './shared';
import { applyRules, catOf, computeMonth, merchantKey, ownerFor, who } from './compute';
import { ARRANGEMENTS, METHODS } from './defaults';
import { monthLabel, uid } from './format';
import { billPayment, incomeOf, netWorth, planOf, splitText } from './plan';
import type { Checkup, Doc, Owner, Payer, Tx } from './types';

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif|gif)$/i.test(f.name);

/** Shrinks a photo or screenshot so its long side is at most 1600px, as JPEG. Claude reads text fine at this size. */
async function shrinkImage(file: File): Promise<{ data: string; type: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return { data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], type: 'image/jpeg' };
  } catch {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error(`${file.name} is an image format this browser cannot open. Save it as a JPEG or PNG.`);
    return { data: await readBase64(file), type: file.type };
  }
}

function extractPrompt(doc: Doc, payer: Payer, month: string) {
  const cats = doc.categories.map(c => `- ${c.name} (${c.kind === 'expense' ? (c.scope === 'shared' ? 'shared' : 'personal') : c.kind})`).join('\n');
  const rules = doc.rules.length ? `\nThe couple has set these rules; follow them:\n${doc.rules.map(r => `- description contains "${r.match}" -> ${r.category}, ${r.owner}`).join('\n')}` : '';
  return `Extract every transaction from this Canadian bank or credit card statement. The account belongs to: ${who(doc, payer)}. The budget month is ${month}; use it to infer the year of dates.

Categories (name, then whether it is normally shared by the couple or personal):
${cats}
${rules}

Rules:
- "a" is the amount in dollars: positive when money leaves the account (purchases, debits, withdrawals, fees, interest charged), negative when money comes in (deposits, refunds, payments received on a credit card).
- Use "Transfer" for credit card payments, moves between a partner's own accounts and e-transfers between the two partners (${doc.settings.p1} and ${doc.settings.p2}). An e-transfer to anyone else is spending (rent, a bill, paying someone back): give it the best spending category, not "Transfer". Use "Joint account top-up" for money a partner moves into the couple's joint chequing account (and for those deposits arriving on the joint account's own statement). Use "Joint savings" for contributions to a joint savings account. Use "Rental income" for rent received from a tenant (often an e-transfer in from a person who is not one of the partners, around the same amount each month). Use "Income" for payroll and other deposits.
- "o" is "shared" when the cost belongs to the household, otherwise "personal".
- Skip opening and closing balances and summary lines. Do not invent transactions.

Also describe the account the statement is for in "account". Use null for anything not shown:
- "name": a short name such as "TD Chequing" or "CIBC Visa"; "institution": the bank; "type": "chequing", "savings", "credit" or "loan"; "last4": the last four digits of the account or card number.
- "balance": the closing balance on the statement (or the current balance shown), as a positive number. For a credit card or loan it is the amount owed.
- "end": the statement end date as YYYY-MM-DD. For credit cards also "due" (payment due date, YYYY-MM-DD) and "min" (minimum payment).

Reply with JSON only, no prose and no code fence:
{"account":{"name":"TD Chequing","institution":"TD","type":"chequing","last4":"1234","balance":1520.11,"end":"YYYY-MM-DD","due":null,"min":null},"transactions":[{"d":"YYYY-MM-DD","t":"description as printed","a":12.34,"c":"category name","o":"shared"}]}`;
}

const screenshots = () => `
These are screenshots from a banking app, not a full statement. They may overlap or repeat the same transactions: list each transaction once. Include pending transactions. If a date shows no year, use the budget month's year, or the year before when the month is later than the budget month. Today is ${new Date().toLocaleDateString('en-CA')}; use it to turn "Today", "Yesterday" or a weekday into a date.`;

/**
 * Reads one statement, or a batch of screenshots for the same account, and returns its transactions.
 * Screenshots go in one request so overlaps between them are caught.
 */
export interface StatementAccount {
  name?: string; institution?: string; type?: string; last4?: string; balance?: number; end?: string; due?: string; min?: number;
}

export async function extractStatement(passcode: string, doc: Doc, files: File[], payer: Payer, month: string, source: string): Promise<{ tx: Tx[]; account: StatementAccount | null }> {
  const prompt = extractPrompt(doc, payer, month);
  const file = files[0];
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  const content = files.every(isImage)
    ? [...(await Promise.all(files.map(shrinkImage))).map(img => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } })), { type: 'text', text: prompt + screenshots() }]
    : isPdf
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await readBase64(file) } }, { type: 'text', text: prompt }]
      : [{ type: 'text', text: `${prompt}\n\nStatement contents:\n${await file.text()}` }];
  const out = await api.claude(passcode, content, 'You are a meticulous bookkeeper. You output strict JSON.', 16000);
  let data: { transactions?: any[]; account?: any };
  try {
    data = parseJson(out.text);
  } catch {
    throw new Error(out.truncated ? 'This is too long for one pass. Split the PDF, or add fewer screenshots at a time.' : 'Could not read the result for this statement.');
  }
  const tx = (data.transactions ?? [])
    .filter(t => t && Number.isFinite(+t.a))
    .map(t => {
      const cat = catOf(doc, String(t.c));
      const row: Tx = {
        id: uid(), date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.d)) ? String(t.d) : `${month}-01`, desc: String(t.t || ''), amount: +t.a, category: cat.name, paidBy: payer, source, exclude: false,
        owner: cat.scope === 'p1' || cat.scope === 'p2' ? cat.scope : t.o === 'shared' ? 'shared' : ownerFor({ ...cat, scope: 'personal' }, payer),
      };
      return applyRules(doc, row);
    });
  const a = data.account && typeof data.account === 'object' ? data.account : null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const num = (v: unknown) => (v !== null && v !== '' && Number.isFinite(+(v as number)) ? Math.abs(+(v as number)) : undefined);
  const account: StatementAccount | null = a ? {
    name: str(a.name), institution: str(a.institution), type: str(a.type), last4: str(a.last4)?.replace(/\D/g, '').slice(-4) || undefined,
    balance: num(a.balance), end: /^\d{4}-\d{2}-\d{2}$/.test(a.end) ? a.end : undefined, due: /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : undefined, min: num(a.min),
  } : null;
  return { tx, account };
}

/** Asks Claude for a short financial check-up built from the plan, the month and the balance sheet. */
export async function runCheckup(passcode: string, doc: Doc, month: string): Promise<Checkup> {
  const s = doc.settings;
  const p = planOf(doc, month);
  const tx = doc.months[month]?.tx ?? [];
  const r = computeMonth(doc, tx);
  const nw = netWorth(doc);
  const cats = doc.categories
    .filter(c => c.kind === 'expense' && (c.budget || r.byCat[c.name]))
    .map(c => `${c.name}: spent ${(r.byCat[c.name] || 0).toFixed(0)}, budget ${c.budget || 'none'}`)
    .join('\n');
  const merchants: Record<string, number> = {};
  for (const t of tx) if (!t.exclude && catOf(doc, t.category).kind === 'expense') merchants[merchantKey(t.desc)] = (merchants[merchantKey(t.desc)] || 0) + t.amount;
  const top = Object.entries(merchants).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join('\n');
  const debts = doc.bills.filter(b => b.kind === 'debt').map(b => `${b.name}: balance ${b.balance ?? 'unknown'}, paying ${billPayment(b, month).toFixed(0)}/month${b.apr ? `, ${b.apr}% APR` : ''}${b.targetMonth ? `, target ${b.targetMonth}` : ''}`).join('\n');
  const prompt = `Give a financial check-up for a couple, ${s.p1} and ${s.p2}. Amounts are CAD per month.

How they manage money: ${ARRANGEMENTS[s.arrangement].label}. Shared costs split ${splitText(s)} (${METHODS[s.splitMethod]}).
Take-home: ${s.p1} ${incomeOf(doc, 'p1')}, ${s.p2} ${incomeOf(doc, 'p2')}.
Plan: budgets ${p.budget.toFixed(0)}, joint savings ${p.savings.toFixed(0)}, debt payments ${p.debt.toFixed(0)}, unassigned ${p.free.toFixed(0)}.
${tx.length ? `${monthLabel(month)}: spent ${r.total.toFixed(0)} of ${r.budget.toFixed(0)} budgeted. Shared ${r.shared.toFixed(0)}, ${s.p1} personal ${r.pers.p1.toFixed(0)}, ${s.p2} personal ${r.pers.p2.toFixed(0)}.\nBy category:\n${cats}\nTop merchants:\n${top}` : 'No statements have been added for this month yet.'}
${debts ? `Debts:\n${debts}` : 'No debts recorded.'}
${(() => {
  const c = sharedCheck(doc, month);
  const lines = [
    ...(c.applies && c.short ? [shortText(doc, c, c.short)] : []),
    ...(c.applies ? c.cross.map(g => crossText(doc, g).what) : []),
    ...cardChecks(doc).filter(x => x.status !== 'paid').map(x => `${accountLabel(x.account)}: ${x.text}`),
    ...fundingChecks(doc, month).map(f => f.text),
  ];
  return lines.length ? `Things the app flagged:\n${lines.join('\n')}\n` : '';
})()}${doc.accounts.length ? `Net worth: assets ${nw.assets.toFixed(0)}, debts ${nw.debts.toFixed(0)}.` : 'No accounts recorded for net worth.'}

Tailor the advice to how they manage money and to each partner's income. Never frame shared costs as one partner owing the other; gaps are closed by topping up the joint account. Use real numbers. Be specific and plain, no jargon.
Reply with JSON only:
{"headline":"one sentence on their overall position","wins":["up to 3 things going well"],"watch":["up to 3 things to keep an eye on"],"actions":["up to 3 concrete next steps"]}`;
  const data = await api.claudeJson<Partial<Checkup>>(passcode, [{ type: 'text', text: prompt }], 'You are a plain-spoken household finance coach. You output strict JSON.', 3000);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 3) : []);
  return { headline: String(data.headline ?? ''), wins: list(data.wins), watch: list(data.watch), actions: list(data.actions), at: new Date().toISOString() };
}

/** Reads a holdings export that is not in Wealthsimple's format, with Claude. */
export async function extractHoldings(passcode: string, text: string, owner: Owner): Promise<InvAccount[]> {
  const prompt = `This is a brokerage holdings export (CSV or text). List every account and position.
Reply with JSON only, no prose:
{"accounts":[{"name":"account name","type":"TFSA|RRSP|FHSA|RESP|Non-registered|Crypto|Other","number":"account number or null","asOf":"YYYY-MM-DD or null",
"holdings":[{"symbol":"XEQT","name":"security name","exchange":"TSX|NYSE|NASDAQ|...","kind":"EXCHANGE_TRADED_FUND|EQUITY|MUTUAL_FUND|CRYPTOCURRENCY|CASH","qty":1.5,"price":33.12,"currency":"CAD|USD","bookCad":1234.5}]}]}
Use the market price per unit; if only a market value is shown, divide it by the quantity.

${text.slice(0, 60000)}`;
  const data = await api.claudeJson<{ accounts?: any[] }>(passcode, [{ type: 'text', text: prompt }], 'You are a careful data clerk. You output strict JSON.', 8000);
  const today = new Date().toLocaleDateString('en-CA');
  return (data.accounts ?? []).filter(a => a && Array.isArray(a.holdings)).map(a => ({
    id: uid(), name: String(a.name || 'Investment account'), type: accountType(String(a.type || a.name || '')), owner, ...(a.number ? { number: String(a.number) } : {}),
    asOf: /^\d{4}-\d{2}-\d{2}$/.test(a.asOf) ? a.asOf : today,
    holdings: a.holdings.filter((h: any) => h && h.symbol && +h.qty).map((h: any) => ({
      symbol: String(h.symbol), name: String(h.name || h.symbol), qty: +h.qty, price: +h.price || 0, currency: String(h.currency || 'CAD').toUpperCase(),
      ...(h.exchange ? { exchange: String(h.exchange) } : {}), ...(h.kind ? { kind: String(h.kind) } : {}), ...(+h.bookCad ? { bookCad: +h.bookCad } : {}),
    })),
  })).filter(a => a.holdings.length);
}

export interface PortfolioCheckup { summary: string; strengths: string[]; watch: string[]; next: string[] }

/**
 * An educational review of the couple's own portfolio: mix against their target, concentration,
 * fees, account types and what to do with new money. It never picks stocks or times the market.
 */
export async function runPortfolioCheckup(passcode: string, doc: Doc, monthly: number): Promise<PortfolioCheckup> {
  const inv = doc.investments!;
  const p = portfolio(inv);
  const s = doc.settings;
  const lines = inv.accounts.map(a => `${a.name} (${a.type}, ${who(doc, a.owner)}): ${a.holdings.map(h => `${h.symbol} ${h.name} ${valueCad(h, inv.fx).toFixed(0)} CAD`).join('; ')}`).join('\n');
  const mix = drift(inv).map(d => `${CLASSES[d.cls].label}: ${(d.now * 100).toFixed(0)}% (target ${(d.target * 100).toFixed(0)}%)`).join(', ');
  const prompt = `Review this Canadian couple's investment portfolio. ${s.p1} takes home ${s.inc1.toFixed(0)} a month and ${s.p2} ${s.inc2.toFixed(0)}. They can invest about ${monthly.toFixed(0)} a month.
Total ${p.total.toFixed(0)} CAD, book cost ${p.book.toFixed(0)} CAD. Target mix: ${TARGETS[inv.target].label} (${TARGETS[inv.target].hint}).
Current mix: ${mix}. Crypto ${p.byClass.crypto.toFixed(0)} CAD. Held in USD: ${p.usd.toFixed(0)} CAD.
Accounts and holdings:
${lines}

Rules: be educational and specific to these holdings. Comment on diversification, the mix against their target, single-company concentration, fund fees (name any fund you know to have a high management expense ratio and the typical cost of a broad index ETF), account types (TFSA, RRSP, FHSA), currency, and how to direct the monthly amount to rebalance without selling. Do not recommend individual stocks, do not predict markets or suggest timing, and do not suggest buying something because it recently went up. Plain language, short sentences.
Reply with JSON only: {"summary":"2 sentences","strengths":["..."],"watch":["..."],"next":["concrete step"]} with 2 to 4 items in each list.`;
  const r = await api.claudeJson<PortfolioCheckup>(passcode, [{ type: 'text', text: prompt }], 'You are a plain-spoken, fee-conscious investing educator, not an advisor. You output strict JSON.', 3000);
  return { summary: String(r.summary || ''), strengths: (r.strengths ?? []).map(String), watch: (r.watch ?? []).map(String), next: (r.next ?? []).map(String) };
}
