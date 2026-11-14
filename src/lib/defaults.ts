import { emptyInvestments } from './invest';
import type { AccountType, Arrangement, Bill, Category, Doc, PayFreq, Scope, SplitMethod } from './types';
import { uid } from './format';

export const COLORS = ['#4B3FE4', '#E8508B', '#0FA3A3', '#F59E0B', '#12A150', '#E5484D', '#3B82F6', '#8B5CF6', '#EC8A2F', '#14B8A6', '#64748B', '#D946EF'];

export const ARRANGEMENTS: Record<Arrangement, { label: string; hint: string }> = {
  joint: { label: 'One joint account', hint: 'Everything is paid from one shared account, so there is nothing to balance between you.' },
  hybrid: { label: 'Separate accounts, shared expenses', hint: 'Shared bills come from a joint account or your own. Each month the app checks that each of you put in your share.' },
  separate: { label: 'Fully separate, we split the bills', hint: 'You keep finances apart and each look after certain bills. The app flags anything paid by the wrong person.' },
};

export const METHODS: Record<SplitMethod, string> = {
  income: 'In proportion to income',
  even: '50/50',
  custom: 'A split we choose',
};

export const FREQS: Record<PayFreq, string> = {
  biweekly: 'Every two weeks',
  semimonthly: 'Twice a month',
  monthly: 'Once a month',
  weekly: 'Every week',
};

/** Cheques a year for each pay frequency. */
export const PER_YEAR: Record<PayFreq, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

/** Common semi-monthly pay dates. 31 stands for the last day of the month. */
export const SEMI_DAYS: { value: string; label: string; days: [number, number] }[] = [
  { value: '15-31', label: '15th and last day', days: [15, 31] },
  { value: '15-30', label: '15th and 30th', days: [15, 30] },
  { value: '1-15', label: '1st and 15th', days: [1, 15] },
  { value: '10-25', label: '10th and 25th', days: [10, 25] },
];

export const ACCOUNT_TYPES: Record<AccountType, { label: string; icon: string; debt: boolean }> = {
  chequing: { label: 'Chequing', icon: 'wallet', debt: false },
  savings: { label: 'Savings', icon: 'piggy', debt: false },
  investment: { label: 'Investments', icon: 'trending', debt: false },
  property: { label: 'Property', icon: 'home', debt: false },
  vehicle: { label: 'Vehicle', icon: 'car', debt: false },
  credit: { label: 'Credit card', icon: 'card', debt: true },
  loan: { label: 'Loan', icon: 'coins', debt: true },
  mortgage: { label: 'Mortgage', icon: 'key', debt: true },
};

const expense = (name: string, budget: number, scope: Scope, icon: string, color: string): Category => ({ name, budget, scope, kind: 'expense', icon, color });

export const defaultCategories = (): Category[] => [
  expense('Rent payment', 3400, 'shared', 'home', '#4B3FE4'),
  expense('Mortgage payment', 200, 'shared', 'key', '#8B5CF6'),
  expense('Condo fees', 600, 'shared', 'building', '#3B82F6'),
  expense('Property taxes', 350, 'shared', 'landmark', '#64748B'),
  expense('Utilities', 150, 'shared', 'zap', '#F59E0B'),
  expense('Car payment', 365, 'shared', 'car', '#0FA3A3'),
  expense('Car insurance', 280, 'shared', 'shield', '#14B8A6'),
  expense('Fuel', 100, 'shared', 'fuel', '#EC8A2F'),
  expense('Groceries', 1000, 'shared', 'cart', '#12A150'),
  expense('Food delivery', 400, 'shared', 'bike', '#E5484D'),
  expense('Household supplies', 150, 'shared', 'spray', '#D946EF'),
  expense('Subscriptions', 100, 'shared', 'repeat', '#E8508B'),
  expense('Dining out', 0, 'personal', 'utensils', '#EC8A2F'),
  expense('Shopping', 0, 'personal', 'bag', '#E8508B'),
  expense('Transit & rides', 0, 'personal', 'bus', '#3B82F6'),
  expense('Health', 0, 'personal', 'heart', '#E5484D'),
  expense('Entertainment', 0, 'personal', 'film', '#8B5CF6'),
  expense('Travel', 0, 'personal', 'plane', '#0FA3A3'),
  expense('Personal care', 0, 'personal', 'sparkles', '#D946EF'),
  expense('Gifts', 0, 'personal', 'gift', '#F59E0B'),
  expense('Fees & interest', 0, 'personal', 'percent', '#64748B'),
  expense('Other', 0, 'personal', 'dots', '#64748B'),
  { name: 'Joint savings', budget: 0, scope: 'shared', kind: 'savings', icon: 'piggy', color: '#12A150', locked: true },
  { name: 'Income', budget: 0, scope: 'personal', kind: 'income', icon: 'banknote', color: '#12A150', locked: true },
  { name: RENTAL, budget: 0, scope: 'shared', kind: 'income', icon: 'key', color: '#0B8A5E', locked: true },
  { name: 'Transfer', budget: 0, scope: 'personal', kind: 'transfer', icon: 'swap', color: '#64748B', locked: true },
  { name: JOINT_TOPUP, budget: 0, scope: 'shared', kind: 'transfer', icon: 'swap', color: '#0FA3A3', locked: true },
];

/** Category for money a partner moves into the couple's joint account. */
export const JOINT_TOPUP = 'Joint account top-up';
/** Category for rent received from a tenant. */
export const RENTAL = 'Rental income';

const bill = (name: string, amount: number, dueDay: number, icon: string): Bill => ({ id: uid(), name, amount, dueDay, kind: 'bill', payer: 'shared', icon, paid: {} });

export const defaultBills = (): Bill[] => [
  bill('Rent', 3400, 1, 'home'),
  bill('Condo fees', 600, 1, 'building'),
  bill('Property taxes', 350, 1, 'landmark'),
  bill('Mortgage', 200, 1, 'key'),
  bill('Car payment', 365, 15, 'car'),
  bill('Car insurance', 280, 15, 'shield'),
  bill('Utilities', 150, 20, 'zap'),
];

function recentFriday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 2) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function defaultDoc(): Doc {
  const anchor = recentFriday();
  return {
    version: 2,
    settings: {
      p1: '', p2: '', arrangement: 'hybrid', inc1: 0, inc2: 0, splitMethod: 'income', split: 67,
      sav1: 637.35, sav2: 303.75, onboarded: false, remember: true,
      pay: { p1: { freq: 'biweekly', anchor }, p2: { freq: 'biweekly', anchor } },
      region: 'ON',
    },
    categories: defaultCategories(),
    rules: [],
    months: {},
    bills: defaultBills(),
    accounts: [],
    snapshots: {},
  };
}

const ICON_GUESSES: [RegExp, string][] = [
  [/rent/i, 'home'], [/mortgage/i, 'key'], [/condo|strata|hoa/i, 'building'], [/tax/i, 'landmark'], [/util|hydro|electric|gas bill/i, 'zap'],
  [/insur/i, 'shield'], [/car|auto/i, 'car'], [/fuel|gas/i, 'fuel'], [/grocer/i, 'cart'], [/deliver/i, 'bike'], [/house/i, 'spray'],
  [/subscri/i, 'repeat'], [/dining|restaurant/i, 'utensils'], [/shop/i, 'bag'], [/transit|ride/i, 'bus'], [/health|medical/i, 'heart'],
  [/entertain/i, 'film'], [/travel/i, 'plane'], [/gift/i, 'gift'], [/fee|interest/i, 'percent'], [/saving/i, 'piggy'], [/income/i, 'banknote'], [/transfer/i, 'swap'],
];
export const guessIcon = (name: string) => ICON_GUESSES.find(([re]) => re.test(name))?.[1] ?? 'dots';

/** Accepts whatever was stored (including the first version of the app) and returns a current document. */
export function migrate(raw: any): Doc {
  const base = defaultDoc();
  if (!raw || typeof raw !== 'object') return base;
  // Start from everything saved, so a section this function does not know about is never dropped.
  const doc: Doc = {
    ...base,
    ...raw,
    version: 2,
    settings: { ...base.settings, ...(raw.settings ?? {}), pay: { ...base.settings.pay, ...(raw.settings?.pay ?? {}) }, region: raw.settings?.region ?? 'ON' },
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    months: raw.months ?? {},
    bills: Array.isArray(raw.bills) ? raw.bills : base.bills,
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    snapshots: raw.snapshots ?? {},
    ...(raw.investments && typeof raw.investments === 'object'
      ? { investments: { ...emptyInvestments(), ...raw.investments, accounts: Array.isArray(raw.investments.accounts) ? raw.investments.accounts : [] } }
      : {}),
    updatedAt: raw.updatedAt,
  };
  // Fields from the first version, folded into months below.
  delete (doc as any).history;
  delete (doc as any).cur;
  if (Array.isArray(raw.categories) && raw.categories.length) {
    doc.categories = raw.categories.map((c: any, i: number) => ({ ...c, icon: c.icon ?? guessIcon(c.name), color: c.color ?? COLORS[i % COLORS.length] }));
  }
  for (const name of [JOINT_TOPUP, RENTAL]) if (!doc.categories.some(c => c.name === name)) doc.categories.push(defaultCategories().find(c => c.name === name)!);
  if (!Array.isArray(raw.categories) || !raw.categories.length) doc.categories = base.categories;
  if (raw.version !== 2) {
    for (const [m, h] of Object.entries<any>(raw.history ?? {})) doc.months[m] = { tx: h.tx ?? [] };
    if (raw.cur?.tx?.length) doc.months[raw.cur.month] = { tx: raw.cur.tx };
    if (/^Partner [12]$/.test(doc.settings.p1)) doc.settings.p1 = '';
    if (/^Partner [12]$/.test(doc.settings.p2)) doc.settings.p2 = '';
  }
  delete (doc.settings as any).passcode;
  delete (doc.settings as any).model;
  return doc;
}
