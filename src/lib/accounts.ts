/** Accounts read from statements: keeping balances current, card payments, and where pay lands. */
import type { StatementAccount } from './ai';
import { catOf, who } from './compute';
import { detectPay, paidByStatement } from './detect';
import { money0, ordinal, uid } from './format';
import type { Account, AccountType, Doc, Payer, PersonId, Tx } from './types';

const TYPES: Record<string, AccountType> = { chequing: 'chequing', checking: 'chequing', savings: 'savings', credit: 'credit', loan: 'loan', mortgage: 'mortgage' };

/** Finds the account a statement belongs to, or adds it, and brings its balance up to date. Returns its id. */
export function upsertAccount(d: Doc, sa: StatementAccount | null, payer: Payer): string | undefined {
  if (!sa || (!sa.last4 && !sa.name)) return undefined;
  const type = TYPES[(sa.type ?? '').toLowerCase()] ?? 'chequing';
  const owner = payer === 'joint' ? 'shared' : payer;
  const same = (a: Account) =>
    sa.last4 ? a.last4 === sa.last4 && (!sa.institution || !a.institution || a.institution.toLowerCase() === sa.institution.toLowerCase())
      : !a.last4 && a.name.toLowerCase() === (sa.name ?? '').toLowerCase();
  let acc = d.accounts.find(same);
  if (!acc) {
    acc = { id: uid(), name: sa.name || `${sa.institution ?? 'Account'} ••${sa.last4}`, type, owner, balance: 0, institution: sa.institution, last4: sa.last4 };
    d.accounts.push(acc);
  }
  // Only a newer statement moves the balance, so reading an old one does not undo a newer figure.
  const newer = !acc.asOf || !sa.end || sa.end >= acc.asOf;
  if (sa.balance !== undefined && newer) {
    acc.balance = sa.balance;
    acc.asOf = sa.end ?? new Date().toLocaleDateString('en-CA');
    if (acc.type === 'credit' && sa.end) acc.due = { balance: sa.balance, min: sa.min, date: sa.due, end: sa.end };
  }
  return acc.id;
}

export const accountLabel = (a: Account) => (a.last4 && !a.name.includes(a.last4) ? `${a.name} ••${a.last4}` : a.name);

const allTx = (doc: Doc) => Object.values(doc.months).flatMap(m => m.tx);

export interface CardCheck {
  account: Account;
  balance: number;
  min?: number;
  due?: string;
  paid: number;
  status: 'paid' | 'min' | 'due' | 'late';
  text: string;
}

/** For each card with a statement balance, whether a payment covering it shows up after the statement closed. */
export function cardChecks(doc: Doc, today = new Date().toLocaleDateString('en-CA')): CardCheck[] {
  const tx = allTx(doc);
  return doc.accounts.filter(a => a.type === 'credit' && a.due && a.due.balance > 0).map(a => {
    const due = a.due!;
    const words = [a.last4, a.institution, /visa/i.test(a.name) ? 'visa' : '', /master/i.test(a.name) ? 'mastercard' : '', /amex|american/i.test(a.name) ? 'amex' : ''].filter(Boolean).map(w => w!.toLowerCase());
    // Payments received on the card's own statement, or transfers out of another account that name the card.
    const onCard = tx.filter(t => t.account === a.id && t.amount < 0 && t.date > due.end).reduce((s, t) => s - t.amount, 0);
    const fromElsewhere = tx.filter(t => t.account !== a.id && t.amount > 0 && t.date > due.end && catOf(doc, t.category).kind === 'transfer' && words.some(w => t.desc.toLowerCase().includes(w))).reduce((s, t) => s + t.amount, 0);
    const paid = Math.max(onCard, fromElsewhere);
    const status: CardCheck['status'] = paid >= due.balance - 1 ? 'paid' : due.min && paid >= due.min ? 'min' : due.date && due.date < today ? 'late' : 'due';
    const when = due.date ? ` due on the ${ordinal(+due.date.slice(8, 10))}` : '';
    const text = {
      paid: `The ${money0(due.balance)} statement balance is paid.`,
      min: `${money0(paid)} paid of the ${money0(due.balance)} balance. Paying it in full avoids interest.`,
      due: `${money0(due.balance)}${when}${due.min ? `, minimum ${money0(due.min)}` : ''}. No payment seen yet.`,
      late: `${money0(due.balance)} was due on ${due.date} and no payment shows in your statements. Check it was paid.`,
    }[status];
    return { account: a, balance: due.balance, min: due.min, due: due.date, paid, status, text };
  });
}

/** The account each partner's paycheque lands in, from the statements it was found in. */
export function payAccounts(doc: Doc): Partial<Record<PersonId, Account>> {
  const out: Partial<Record<PersonId, Account>> = {};
  const tx = allTx(doc);
  for (const f of detectPay(doc)) {
    const t = tx.find(x => x.paidBy === f.person && x.account && x.desc === f.label);
    const acc = t && doc.accounts.find(a => a.id === t.account);
    if (acc) out[f.person] = acc;
  }
  return out;
}

export interface FundingCheck {
  account: Account;
  bills: { name: string; amount: number; day: number }[];
  total: number;
  text: string;
}

/**
 * Bank accounts that pay bills but receive no paycheque or top-up this month,
 * so money has to be moved in before the bills come out.
 */
export function fundingChecks(doc: Doc, month: string): FundingCheck[] {
  const tx = doc.months[month]?.tx ?? [];
  const byAccount = new Map<string, FundingCheck['bills']>();
  for (const b of doc.bills) {
    const t = paidByStatement(doc, b, month);
    if (!t?.account) continue;
    byAccount.set(t.account, [...(byAccount.get(t.account) ?? []), { name: b.name, amount: t.amount, day: +t.date.slice(8, 10) }]);
  }
  const out: FundingCheck[] = [];
  for (const [id, bills] of byAccount) {
    const acc = doc.accounts.find(a => a.id === id);
    if (!acc || acc.type === 'credit' || acc.type === 'loan') continue;
    const inflow = tx.filter((t: Tx) => t.account === id && t.amount < 0).reduce((s, t) => s - t.amount, 0);
    const total = bills.reduce((s, b) => s + b.amount, 0);
    if (inflow >= total * 0.5) continue;
    const pay = payAccounts(doc);
    const lands = (['p1', 'p2'] as PersonId[]).filter(p => pay[p] && pay[p]!.id !== id && (acc.owner === 'shared' || acc.owner === p)).map(p => `${who(doc, p)}'s pay lands in ${accountLabel(pay[p]!)}`);
    const names = bills.map(b => b.name);
    out.push({
      account: acc, bills, total,
      text: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and more' : ''} (${money0(total)}) come out of ${accountLabel(acc)}, but no pay arrives there${lands.length ? `; ${lands.join(' and ')}` : ''}. Move money over before the ${ordinal(Math.min(...bills.map(b => b.day)))}.`,
    });
  }
  return out;
}
