import { catOf, computeMonth, monthsWithData, totalBudget, who } from './compute';
import { dayOf, daysIn, money, money0, monthLabel, monthsBetween, parseMonth, pct } from './format';
import { PER_YEAR } from './defaults';
import type { Bill, Doc, PayFreq, PaySchedule, PersonId, Settings } from './types';

export function applySplit(s: Settings): Settings {
  const total = (+s.inc1 || 0) + (+s.inc2 || 0);
  if (s.splitMethod === 'even') return { ...s, split: 50 };
  if (s.splitMethod === 'income' && total > 0) return { ...s, split: Math.round(((+s.inc1 || 0) / total) * 1000) / 10 };
  return s;
}

export const splitText = (s: Settings) => {
  const a = +(+s.split).toFixed(1);
  return `${a}/${+(100 - a).toFixed(1)}`;
};

export const shareOf = (doc: Doc, p: PersonId) => (p === 'p1' ? doc.settings.split : 100 - doc.settings.split) / 100;
export const incomeOf = (doc: Doc, p: PersonId) => +(p === 'p1' ? doc.settings.inc1 : doc.settings.inc2) || 0;
export const savingsOf = (doc: Doc, p: PersonId) => +(p === 'p1' ? doc.settings.sav1 : doc.settings.sav2) || 0;

/** Payment needed this month. For a debt with a target month, the amount that clears it on time. */
export function billPayment(b: Bill, month: string): number {
  if (b.kind !== 'debt' || !b.balance || !b.targetMonth) return +b.amount || 0;
  const n = Math.max(1, monthsBetween(month, b.targetMonth) + 1);
  const r = (b.apr || 0) / 1200;
  return r ? (b.balance * r) / (1 - Math.pow(1 + r, -n)) : b.balance / n;
}

/** Months until a debt is cleared at its current payment, or null if the payment never clears it. */
export function monthsToClear(b: Bill): number | null {
  if (!b.balance) return 0;
  const p = +b.amount || 0;
  const r = (b.apr || 0) / 1200;
  if (p <= b.balance * r) return null;
  return Math.ceil(r ? -Math.log(1 - (r * b.balance) / p) / Math.log(1 + r) : b.balance / p);
}

export const billShare = (doc: Doc, b: Bill, p: PersonId, month: string) =>
  billPayment(b, month) * (b.payer === 'shared' ? shareOf(doc, p) : b.payer === p ? 1 : 0);

export function paydays(s: PaySchedule, month: string): number[] {
  const n = daysIn(month);
  if (s.freq === 'semimonthly') return [...new Set((s.days ?? [15, 31]).map(d => Math.min(n, d)))].sort((a, b) => a - b);
  if (s.freq === 'monthly') return [Math.min(n, dayOf(s.anchor))];
  const step = s.freq === 'weekly' ? 7 : 14;
  const first = parseMonth(month);
  const anchor = new Date(`${s.anchor}T12:00:00`);
  const out: number[] = [];
  for (let d = 1; d <= n; d++) {
    const date = new Date(first.getFullYear(), first.getMonth(), d, 12);
    const diff = Math.round((date.getTime() - anchor.getTime()) / 86400000);
    if (((diff % step) + step) % step === 0) out.push(d);
  }
  return out;
}

/** Average paycheque, from monthly take-home and how often pay arrives. */
export const perCheque = (monthly: number, freq: PayFreq) => (monthly * 12) / PER_YEAR[freq];
/** Monthly take-home from a typical paycheque. */
export const monthlyFrom = (cheque: number, freq: PayFreq) => (cheque * PER_YEAR[freq]) / 12;

export interface Allocation {
  income: number;
  bills: number;
  debt: number;
  flexible: number;
  savings: number;
  left: number;
  cheques: number;
}

/** How one person's monthly take-home is spoken for. */
export function allocation(doc: Doc, p: PersonId, month: string): Allocation {
  const income = incomeOf(doc, p);
  const joint = doc.settings.arrangement === 'joint';
  const bills = doc.bills.filter(b => b.kind === 'bill').reduce((a, b) => a + billShare(doc, b, p, month), 0);
  const debt = doc.bills.filter(b => b.kind === 'debt').reduce((a, b) => a + billShare(doc, b, p, month), 0);
  const sharedBudget = doc.categories.filter(c => c.kind === 'expense' && c.scope === 'shared').reduce((a, c) => a + (+c.budget || 0), 0);
  const sharedBills = doc.bills.filter(b => b.kind === 'bill' && b.payer === 'shared').reduce((a, b) => a + billPayment(b, month), 0);
  const flexible = Math.max(0, sharedBudget - sharedBills) * shareOf(doc, p);
  const savings = savingsOf(doc, p);
  const cheques = paydays(doc.settings.pay[p], month).length || 1;
  return { income, bills, debt, flexible, savings, left: income - bills - debt - flexible - savings, cheques: joint ? cheques : cheques };
}

export interface AgendaItem {
  day: number;
  type: 'pay' | 'bill';
  label: string;
  amount: number;
  person?: PersonId;
  bill?: Bill;
}

export function agenda(doc: Doc, month: string): AgendaItem[] {
  const n = daysIn(month);
  const items: AgendaItem[] = [];
  for (const p of ['p1', 'p2'] as PersonId[]) {
    const days = paydays(doc.settings.pay[p], month);
    const each = days.length ? incomeOf(doc, p) / days.length : 0;
    if (each > 0) for (const day of days) items.push({ day, type: 'pay', label: `${who(doc, p)}'s payday`, amount: each, person: p });
  }
  for (const b of doc.bills) items.push({ day: Math.min(n, b.dueDay), type: 'bill', label: b.name, amount: billPayment(b, month), bill: b });
  return items.sort((a, b) => a.day - b.day || (a.type === 'pay' ? -1 : 1));
}

export interface Plan {
  i1: number; i2: number; income: number; share: number; sharedBudget: number; budget: number; housing: number;
  savings: number; debt: number; planned: number; free: number; incomeShare: number;
}

export function planOf(doc: Doc, month: string): Plan {
  const i1 = incomeOf(doc, 'p1');
  const i2 = incomeOf(doc, 'p2');
  const income = i1 + i2;
  const expense = doc.categories.filter(c => c.kind === 'expense');
  const sum = (cs: typeof expense) => cs.reduce((a, c) => a + (+c.budget || 0), 0);
  const savings = savingsOf(doc, 'p1') + savingsOf(doc, 'p2');
  const debt = doc.bills.filter(b => b.kind === 'debt').reduce((a, b) => a + billPayment(b, month), 0);
  const budget = totalBudget(doc);
  const planned = budget + savings + debt;
  return {
    i1, i2, income, share: doc.settings.split / 100, sharedBudget: sum(expense.filter(c => c.scope === 'shared')), budget,
    housing: sum(expense.filter(c => /rent|mortgage|condo|property|strata|hoa/i.test(c.name))),
    savings, debt, planned, free: income - planned, incomeShare: income ? (i1 / income) * 100 : 50,
  };
}

/** Plain-language observations driven by income, setup and the latest month. */
export function suggestions(doc: Doc, month: string): string[] {
  const s = doc.settings;
  const p = planOf(doc, month);
  if (!p.income) return [];
  const out: string[] = [];
  const is = Math.round(p.incomeShare);
  const fair = `${is}/${100 - is}`;
  if (s.arrangement === 'joint') {
    out.push('With one joint account there is nothing to balance. Personal categories show whether one of you is outspending the other.');
  } else if (s.splitMethod === 'income') {
    out.push(`Your ${splitText(s)} split follows your incomes, so shared costs take the same ${pct((p.sharedBudget / p.income) * 100)} of each paycheque.`);
  } else if (Math.abs(s.split - p.incomeShare) > 5) {
    const b1 = p.i1 ? ((p.sharedBudget * p.share) / p.i1) * 100 : 0;
    const b2 = p.i2 ? ((p.sharedBudget * (1 - p.share)) / p.i2) * 100 : 0;
    const delta = Math.abs((p.sharedBudget * (s.split - p.incomeShare)) / 100);
    out.push(`Your incomes point to a ${fair} split and you use ${splitText(s)}. Shared costs take ${pct(b1)} of ${who(doc, 'p1')}'s income and ${pct(b2)} of ${who(doc, 'p2')}'s. ${who(doc, s.split > p.incomeShare ? 'p1' : 'p2')} covers about ${money(delta)} a month more than an income-based split would ask.`);
  } else {
    out.push(`Your ${splitText(s)} split is close to what your incomes suggest (${fair}).`);
  }
  if (p.housing) {
    const h = (p.housing / p.income) * 100;
    out.push(`Housing is planned at ${pct(h)} of take-home. ${h > 30 ? 'A common rule of thumb is about 30%, so other budgets have less slack.' : 'That is within the common 30% rule of thumb.'}`);
  }
  if (p.free < 0) out.push(`The plan is ${money(-p.free)} a month more than you bring in. Trim a budget, a savings target or a debt payment.`);
  else if (p.free > p.income * 0.05) out.push(`${money(p.free)} a month is not assigned to a budget, savings or debt. Personal spending comes out of this.`);
  const debts = doc.bills.filter(b => b.kind === 'debt' && b.balance);
  if (debts.length) {
    const top = [...debts].sort((a, b) => (b.apr || 0) - (a.apr || 0))[0];
    if (top.apr) out.push(`${top.name} carries your highest rate at ${top.apr}%. Extra payments do the most good there.`);
  }
  const months = monthsWithData(doc);
  const last = months[months.length - 1];
  if (last) {
    const r = computeMonth(doc, doc.months[last].tx);
    const over = doc.categories
      .filter(c => c.kind === 'expense' && c.budget && (r.byCat[c.name] || 0) > c.budget + 0.005)
      .map(c => ({ name: c.name, over: r.byCat[c.name] - c.budget }))
      .sort((a, b) => b.over - a.over)[0];
    if (over) out.push(`In ${monthLabel(last)}, ${catOf(doc, over.name).name} ran ${money(over.over)} over budget, the biggest overrun.`);
  }
  return out;
}

export function netWorth(doc: Doc) {
  const DEBT = new Set(['credit', 'loan', 'mortgage']);
  let assets = 0;
  let debts = 0;
  for (const a of doc.accounts) DEBT.has(a.type) ? (debts += Math.abs(+a.balance || 0)) : (assets += +a.balance || 0);
  return { assets, debts, net: assets - debts };
}

/** True when a category is the budget line for a fixed bill (rent, insurance and so on). */
export const coveredByBill = (doc: Doc, name: string) => {
  const c = name.toLowerCase();
  return doc.bills.some(b => {
    const n = b.name.trim().toLowerCase();
    return b.kind === 'bill' && !!n && (c.startsWith(n) || n.startsWith(c));
  });
};

export interface Advice {
  kind: 'trim' | 'save' | 'ok';
  text: string;
  /** Applies the advice to a draft document. */
  apply?: (d: Doc) => void;
  action?: string;
}

/**
 * A suggestion built from the actual bills: trim everyday budgets when someone's share does not fit
 * their pay, or move part of what is left into joint savings.
 */
export function breakdownAdvice(doc: Doc, month: string): Advice {
  const people: PersonId[] = ['p1', 'p2'];
  const alloc = people.map(p => ({ p, a: allocation(doc, p, month) }));
  if (alloc.every(x => !x.a.income)) return { kind: 'ok', text: '' };
  const flexCats = doc.categories.filter(c => c.kind === 'expense' && c.scope === 'shared' && (+c.budget || 0) > 0 && !coveredByBill(doc, c.name)).sort((a, b) => b.budget - a.budget);
  const flexTotal = flexCats.reduce((s, c) => s + c.budget, 0);
  const short = alloc.filter(x => x.a.income > 0 && x.a.left < 0);
  if (short.length) {
    // Shrink everyday budgets just enough that the person furthest behind breaks even.
    const scale = Math.min(...short.map(x => (x.a.flexible > 0 ? Math.max(0, 1 - -x.a.left / x.a.flexible) : 0)));
    const worst = short.sort((a, b) => a.a.left - b.a.left)[0];
    if (flexTotal > 0 && scale > 0.3) {
      const cut = flexTotal * (1 - scale);
      return {
        kind: 'trim',
        text: `${who(doc, worst.p)}'s share comes to ${money0(-worst.a.left)} a month more than their take-home. Trimming everyday budgets like ${flexCats.slice(0, 2).map(c => c.name.toLowerCase()).join(' and ')} by ${Math.round((1 - scale) * 100)}% (${money0(cut)} in total) makes it fit.`,
        action: `Trim everyday budgets by ${Math.round((1 - scale) * 100)}%`,
        apply: d => {
          for (const c of d.categories) if (flexCats.some(f => f.name === c.name)) c.budget = Math.floor((c.budget * scale) / 10) * 10;
        },
      };
    }
    return { kind: 'trim', text: `${who(doc, worst.p)}'s share of bills and budgets is ${money0(-worst.a.left)} a month more than their take-home. Lower a savings amount, a debt payment or the split so it fits.` };
  }
  const roomy = alloc.filter(x => x.a.income > 0 && x.a.left > x.a.income * 0.1);
  if (roomy.length) {
    const extra = roomy.map(x => ({ p: x.p, add: Math.floor(x.a.left / 2 / 25) * 25 })).filter(x => x.add > 0);
    if (extra.length) {
      const total = extra.reduce((s, x) => s + x.add, 0);
      return {
        kind: 'save',
        text: `After bills and budgets, ${extra.map(x => `${who(doc, x.p)} keeps ${money0(alloc.find(a => a.p === x.p)!.a.left)}`).join(' and ')} a month. Putting half of that into joint savings adds ${money0(total)} a month, ${money0(total * 12)} a year.`,
        action: `Save ${money0(total)} more a month`,
        apply: d => { for (const x of extra) x.p === 'p1' ? (d.settings.sav1 = +(d.settings.sav1 + x.add).toFixed(2)) : (d.settings.sav2 = +(d.settings.sav2 + x.add).toFixed(2)); },
      };
    }
  }
  return { kind: 'ok', text: 'Each of you can cover your share of the bills, budgets and savings, with a little left for personal spending.' };
}
