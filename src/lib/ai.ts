import { api, parseJson } from './api';
import { applyRules, catOf, computeMonth, merchantKey, ownerFor, who } from './compute';
import { ARRANGEMENTS, METHODS } from './defaults';
import { monthLabel, uid } from './format';
import { billPayment, incomeOf, netWorth, planOf, splitText } from './plan';
import type { Checkup, Doc, Payer, Tx } from './types';

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

function extractPrompt(doc: Doc, payer: Payer, month: string) {
  const cats = doc.categories.map(c => `- ${c.name} (${c.kind === 'expense' ? (c.scope === 'shared' ? 'shared' : 'personal') : c.kind})`).join('\n');
  const rules = doc.rules.length ? `\nThe couple has set these rules; follow them:\n${doc.rules.map(r => `- description contains "${r.match}" -> ${r.category}, ${r.owner}`).join('\n')}` : '';
  return `Extract every transaction from this Canadian bank or credit card statement. The account belongs to: ${who(doc, payer)}. The budget month is ${month}; use it to infer the year of dates.

Categories (name, then whether it is normally shared by the couple or personal):
${cats}
${rules}

Rules:
- "a" is the amount in dollars: positive when money leaves the account (purchases, debits, withdrawals, fees, interest charged), negative when money comes in (deposits, refunds, payments received on a credit card).
- Use "Transfer" for credit card payments, moves between the couple's own accounts and e-transfers between the two partners. Use "Joint savings" for contributions to a joint savings account. Use "Income" for payroll and other deposits.
- "o" is "shared" when the cost belongs to the household, otherwise "personal".
- Skip opening and closing balances and summary lines. Do not invent transactions.

Reply with JSON only, no prose and no code fence:
{"transactions":[{"d":"YYYY-MM-DD","t":"description as printed","a":12.34,"c":"category name","o":"shared"}]}`;
}

export async function extractStatement(passcode: string, doc: Doc, file: File, payer: Payer, month: string): Promise<Tx[]> {
  const prompt = extractPrompt(doc, payer, month);
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  const content = isPdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await readBase64(file) } }, { type: 'text', text: prompt }]
    : [{ type: 'text', text: `${prompt}\n\nStatement contents:\n${await file.text()}` }];
  const out = await api.claude(passcode, content, 'You are a meticulous bookkeeper. You output strict JSON.', 16000);
  let data: { transactions?: any[] };
  try {
    data = parseJson(out.text);
  } catch {
    throw new Error(out.truncated ? 'This statement is too long for one pass. Split the PDF and try again.' : 'Could not read the result for this statement.');
  }
  return (data.transactions ?? [])
    .filter(t => t && Number.isFinite(+t.a))
    .map(t => {
      const cat = catOf(doc, String(t.c));
      const tx: Tx = {
        id: uid(), date: String(t.d || ''), desc: String(t.t || ''), amount: +t.a, category: cat.name, paidBy: payer, source: file.name, exclude: false,
        owner: cat.scope === 'p1' || cat.scope === 'p2' ? cat.scope : t.o === 'shared' ? 'shared' : ownerFor({ ...cat, scope: 'personal' }, payer),
      };
      return applyRules(doc, tx);
    });
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
${doc.accounts.length ? `Net worth: assets ${nw.assets.toFixed(0)}, debts ${nw.debts.toFixed(0)}.` : 'No accounts recorded for net worth.'}

Tailor the advice to how they manage money and to each partner's income. Use real numbers. Be specific and plain, no jargon.
Reply with JSON only:
{"headline":"one sentence on their overall position","wins":["up to 3 things going well"],"watch":["up to 3 things to keep an eye on"],"actions":["up to 3 concrete next steps"]}`;
  const out = await api.claude(passcode, [{ type: 'text', text: prompt }], 'You are a plain-spoken household finance coach. You output strict JSON.', 1500);
  const data = parseJson<Partial<Checkup>>(out.text);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 3) : []);
  return { headline: String(data.headline ?? ''), wins: list(data.wins), watch: list(data.watch), actions: list(data.actions), at: new Date().toISOString() };
}
