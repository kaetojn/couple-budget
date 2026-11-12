import { dayOf, daysIn, money } from './format';
import type { Category, Doc, Owner, Payer, PersonId, Tx } from './types';

export const who = (doc: Doc, k: Owner | Payer | 'personal') =>
  k === 'p1' ? doc.settings.p1 || 'Partner 1' : k === 'p2' ? doc.settings.p2 || 'Partner 2' : k === 'joint' ? 'Joint account' : k === 'personal' ? 'Each their own' : 'Shared';

// Every edit replaces doc.categories with a fresh copy, so the lookup table is
// rebuilt once per edit instead of searching the list for every transaction.
const catMaps = new WeakMap<Category[], Map<string, Category>>();
function catMap(cats: Category[]) {
  let map = catMaps.get(cats);
  if (!map) {
    map = new Map(cats.map(c => [c.name, c]));
    catMaps.set(cats, map);
  }
  return map;
}

export const catOf = (doc: Doc, name: string): Category => {
  const map = catMap(doc.categories);
  return map.get(name) ?? map.get('Other') ?? doc.categories[0];
};

/** The owner a transaction gets from its category, given who paid. */
export const ownerFor = (cat: Category, paidBy: Payer): Owner =>
  cat.scope === 'personal' ? (paidBy === 'joint' ? 'shared' : paidBy) : cat.scope;

const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z& ]/g, ' ').replace(/\s+/g, ' ').trim();
export const merchantKey = (desc: string) => normalize(desc).split(' ').slice(0, 2).join(' ');

export function applyRules(doc: Doc, t: Tx): Tx {
  const text = normalize(t.desc);
  for (const r of doc.rules) {
    if (text.includes(r.match)) {
      t.category = r.category;
      t.owner = r.owner === 'shared' ? 'shared' : t.paidBy === 'joint' ? 'shared' : t.paidBy;
    }
  }
  return t;
}

export interface MonthTotals {
  byCat: Record<string, number>;
  total: number;
  shared: number;
  pers: Record<PersonId, number>;
  sharedPaid: Record<Payer, number>;
  sav: Record<Payer, number>;
  inc: Record<Payer, number>;
  income: number;
  budget: number;
  count: number;
}

export const totalBudget = (doc: Doc) => doc.categories.filter(c => c.kind === 'expense').reduce((a, c) => a + (+c.budget || 0), 0);

export function computeMonth(doc: Doc, txs: Tx[]): MonthTotals {
  const r: MonthTotals = {
    byCat: {}, total: 0, shared: 0, pers: { p1: 0, p2: 0 }, sharedPaid: { p1: 0, p2: 0, joint: 0 },
    sav: { p1: 0, p2: 0, joint: 0 }, inc: { p1: 0, p2: 0, joint: 0 }, income: 0,
    budget: totalBudget(doc), count: 0,
  };
  for (const t of txs) {
    if (t.exclude) continue;
    const c = catOf(doc, t.category);
    if (c.kind === 'transfer') continue;
    if (c.kind === 'income') { r.income -= t.amount; r.inc[t.paidBy] -= t.amount; continue; }
    if (c.kind === 'savings') { r.sav[t.paidBy] += t.amount; continue; }
    r.count++;
    r.byCat[c.name] = (r.byCat[c.name] || 0) + t.amount;
    r.total += t.amount;
    if (t.owner === 'shared') {
      r.shared += t.amount;
      r.sharedPaid[t.paidBy] += t.amount;
    } else {
      r.pers[t.owner] += t.amount;
    }
  }
  return r;
}

const isSpend = (doc: Doc, t: Tx) => !t.exclude && catOf(doc, t.category).kind === 'expense';

/** Spending per day of the month, index 0 = the 1st. */
export function spendByDay(doc: Doc, txs: Tx[], month: string): number[] {
  const days = Array<number>(daysIn(month)).fill(0);
  for (const t of txs) if (isSpend(doc, t) && t.date.startsWith(month)) days[Math.min(days.length, dayOf(t.date)) - 1] += t.amount;
  return days;
}

export function cumulative(values: number[]): number[] {
  let run = 0;
  return values.map(v => (run += v));
}

export const monthsWithData = (doc: Doc) => Object.keys(doc.months).filter(m => doc.months[m].tx.length).sort();
