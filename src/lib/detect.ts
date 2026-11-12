/** Finds paycheques, recurring payments and paid bills in imported statements. */
import { catOf, merchantKey } from './compute';
import { PER_YEAR } from './defaults';
import { daysIn, dayOf, monthsBetween } from './format';
import { monthlyFrom } from './plan';
import type { Bill, Doc, Owner, PayFreq, PersonId, Tx } from './types';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dayNumber = (iso: string) => Math.round(new Date(`${iso}T12:00:00`).getTime() / 86400000);
const prettify = (key: string) => key.toLowerCase().replace(/\b(com|ca|inc|ltd)\b/g, '').trim().replace(/\b\w/g, c => c.toUpperCase()) || key;

/** All transactions, newest month last. */
function allTx(doc: Doc) {
  return Object.keys(doc.months).sort().flatMap(m => (doc.months[m]?.tx ?? []).map(t => ({ ...t, month: m })));
}

export interface PayFound {
  person: PersonId;
  key: string;
  label: string;
  cheque: number;
  freq: PayFreq;
  /** Most recent deposit date. */
  last: string;
  /** Semi-monthly days, when that is the pattern. */
  days?: [number, number];
  monthly: number;
  count: number;
  sig: string;
}

/** Works out how often pay arrives from the gaps between deposits. */
function guessFreq(dates: string[]): { freq: PayFreq; days?: [number, number] } {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 2) return { freq: 'monthly' };
  const gaps = sorted.slice(1).map((d, i) => dayNumber(d) - dayNumber(sorted[i]));
  const g = median(gaps);
  const days = sorted.map(dayOf);
  const lastDay = (iso: string) => dayOf(iso) >= daysIn(iso.slice(0, 7)) - 2;
  if (g <= 9) return { freq: 'weekly' };
  if (g >= 25) return { freq: 'monthly' };
  // Semi-monthly pay lands on the same two dates each month, so the gap alternates; bi-weekly is a steady 14.
  const steady = gaps.every(x => x === 14);
  if (steady && !(sorted.length === 2 && days.includes(15) && sorted.some(lastDay))) return { freq: 'biweekly' };
  const early = Math.round(median(days.filter(d => d <= 16)));
  const late = sorted.filter(d => dayOf(d) > 16);
  const second = late.length && late.every(lastDay) ? 31 : Math.round(median(late.map(dayOf)) || 31);
  return { freq: 'semimonthly', days: [early || 15, second] };
}

/** The most likely paycheque for each partner, read from deposits marked as income. */
export function detectPay(doc: Doc): PayFound[] {
  const out: PayFound[] = [];
  const ignored = new Set(doc.settings.notPay ?? []);
  const txs = allTx(doc);
  for (const person of ['p1', 'p2'] as PersonId[]) {
    const groups = new Map<string, typeof txs>();
    for (const t of txs) {
      if (t.paidBy !== person || t.exclude || t.amount > -100 || catOf(doc, t.category).kind !== 'income') continue;
      const key = merchantKey(t.desc);
      if (!key || ignored.has(key)) continue;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    // The paycheque is the deposit that brings in the most money over the last few months.
    const best = [...groups.entries()]
      .map(([key, list]) => ({ key, list: list.filter(t => monthsBetween(t.month, txs[txs.length - 1].month) < 3) }))
      .filter(g => g.list.length)
      .sort((a, b) => b.list.reduce((s, t) => s - t.amount, 0) - a.list.reduce((s, t) => s - t.amount, 0))[0];
    if (!best) continue;
    const dates = best.list.map(t => t.date).filter(Boolean);
    const { freq, days } = guessFreq(dates);
    const cheque = Math.round(median(best.list.map(t => -t.amount)) * 100) / 100;
    const last = [...dates].sort().pop() ?? '';
    out.push({
      person, key: best.key, label: best.list[best.list.length - 1].desc, cheque, freq, days, last, count: best.list.length,
      monthly: Math.round(monthlyFrom(cheque, freq) * 100) / 100,
      sig: `${best.key}|${cheque}|${freq}`,
    });
  }
  return out;
}

/** Detections that still need a yes or no: not confirmed, and different from what is set. */
export function payToConfirm(doc: Doc): PayFound[] {
  return detectPay(doc).filter(f => {
    const [key, cheque, freq] = (doc.settings.pay[f.person].confirmed ?? '').split('|');
    // Pay that drifts by a few percent (overtime, a raise in deductions) does not need asking again.
    return !(key === f.key && freq === f.freq && Math.abs(+cheque - f.cheque) <= f.cheque * 0.05);
  });
}

export interface RecurringFound {
  key: string;
  name: string;
  amount: number;
  dueDay: number;
  payer: Owner;
  category: string;
  icon: string;
  months: number;
}

const BILL_LIKE = /rent|mortgage|condo|property|util|hydro|insur|car payment|subscri|phone|internet|gym|loan/i;

/** Payments that repeat month to month and are not on the checklist yet. */
export function detectRecurring(doc: Doc): RecurringFound[] {
  const months = Object.keys(doc.months).filter(m => doc.months[m]?.tx?.length).sort().slice(-4);
  if (!months.length) return [];
  const ignored = new Set(doc.settings.notBills ?? []);
  const groups = new Map<string, { t: Tx; month: string }[]>();
  for (const month of months) {
    for (const t of doc.months[month].tx) {
      const cat = catOf(doc, t.category);
      if (t.exclude || t.amount <= 0 || cat.kind !== 'expense') continue;
      const key = merchantKey(t.desc);
      if (!key || ignored.has(key)) continue;
      groups.set(key, [...(groups.get(key) ?? []), { t, month }]);
    }
  }
  const out: RecurringFound[] = [];
  for (const [key, list] of groups) {
    const perMonth = new Map<string, Tx>();
    for (const { t, month } of list) if (!perMonth.has(month)) perMonth.set(month, t);
    const hits = [...perMonth.values()];
    const amounts = hits.map(t => t.amount);
    const mid = median(amounts);
    const cat = catOf(doc, hits[0].category);
    // Bills can drift (a hydro bill); everyday spending only counts when the charge is the same each time (a gym, a plan).
    const billLike = BILL_LIKE.test(cat.name);
    const steady = amounts.every(a => Math.abs(a - mid) <= (billLike ? Math.max(5, mid * 0.15) : Math.max(0.5, mid * 0.03)));
    const sameDay = Math.max(...hits.map(t => dayOf(t.date))) - Math.min(...hits.map(t => dayOf(t.date))) <= 6;
    // Repeats in two or more months, or a single charge in a bill-like category.
    const recurring = hits.length >= 2 ? steady && sameDay : months.length === 1 && billLike;
    if (!recurring || mid < 5) continue;
    if (doc.bills.some(b => billMatchesKey(doc, b, key, hits[0]))) continue;
    const last = hits[hits.length - 1];
    out.push({
      key, name: prettify(key), amount: Math.round(last.amount * 100) / 100, dueDay: Math.round(median(hits.map(t => dayOf(t.date)))),
      payer: last.owner === 'shared' ? 'shared' : last.paidBy === 'joint' ? 'shared' : last.paidBy, category: cat.name, icon: cat.icon, months: hits.length,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

function billMatchesKey(doc: Doc, b: Bill, key: string, t: Tx) {
  if (b.match) return b.match === key;
  const bill = b.name.trim().toLowerCase();
  const cat = catOf(doc, t.category).name.toLowerCase();
  return !!bill && (cat.startsWith(bill) || bill.startsWith(cat));
}

/** The statement transaction that pays this bill in a month, if there is one. */
export function paidByStatement(doc: Doc, b: Bill, month: string): Tx | undefined {
  return (doc.months[month]?.tx ?? []).find(t => {
    if (t.exclude || t.amount <= 0) return false;
    if (b.payer !== 'shared' && t.paidBy !== b.payer) return false;
    return billMatchesKey(doc, b, merchantKey(t.desc), t);
  });
}

/** Paid if ticked, or if a statement shows it, unless it was explicitly unticked. */
export const isPaid = (doc: Doc, b: Bill, month: string) => b.paid[month] ?? !!paidByStatement(doc, b, month);

/**
 * Drops transactions that are already saved or came in from another file in the same import
 * (same day, amount, payer and merchant), so a statement and overlapping screenshots are safe together.
 * Repeats within one file are kept: two identical coffees on the same day are real.
 */
export function withoutDuplicates(existing: Tx[], incoming: Tx[]): Tx[] {
  const key = (t: Tx) => `${t.date}|${t.amount.toFixed(2)}|${t.paidBy}|${merchantKey(t.desc)}`;
  const seen = new Set(existing.map(key));
  const out: Tx[] = [];
  for (const source of [...new Set(incoming.map(t => t.source))]) {
    const batch = incoming.filter(t => t.source === source && !seen.has(key(t)));
    out.push(...batch);
    for (const t of batch) seen.add(key(t));
  }
  return out;
}

export const freqWord = (f: PayFreq) => ({ weekly: 'every week', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'once a month' })[f];
export const chequesPerYear = PER_YEAR;
