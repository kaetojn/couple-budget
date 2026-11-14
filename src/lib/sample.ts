import { defaultDoc } from './defaults';
import { addMonths, isoDay, monthKey, uid } from './format';
import { applySplit, paydays } from './plan';
import { syncNetWorth } from './invest';
import type { Doc, Payer, Tx } from './types';

type Row = [Payer, number, string, number, string, 's' | 'p' | 'k'];
const ROWS: Row[] = [
  ['p1', 1, 'RENT PAYMENT - LANDLORD', 3400, 'Rent payment', 's'], ['p1', 2, 'TORONTO HYDRO', 96.4, 'Utilities', 's'], ['p1', 3, 'LOBLAWS #1021', 212.33, 'Groceries', 's'],
  ['p1', 5, 'PETRO-CANADA 4471', 68.2, 'Fuel', 's'], ['p1', 6, 'NETFLIX.COM', 20.99, 'Subscriptions', 's'], ['p1', 8, 'UBER EATS', 54.1, 'Food delivery', 's'],
  ['p1', 9, 'CONDO CORP 2214 FEES', 600, 'Condo fees', 's'], ['p1', 11, 'APPLE STORE EATON', 189, 'Shopping', 'p'], ['p1', 12, 'TD AUTO FINANCE', 365, 'Car payment', 's'],
  ['p1', 14, 'COSTCO WHOLESALE', 318.75, 'Groceries', 's'], ['p1', 15, 'TFR TO JOINT SAVINGS', 637.35, 'Joint savings', 's'],
  ['p1', 18, 'PAYMENT THANK YOU', -900, 'Transfer', 'p'], ['p1', 21, 'UBER EATS', 61.75, 'Food delivery', 's'], ['p1', 24, 'CITY OF TORONTO TAX', 350, 'Property taxes', 's'],
  ['p2', 2, 'METRO 311', 143.2, 'Groceries', 's'], ['p2', 4, 'SPOTIFY', 12.99, 'Subscriptions', 's'], ['p2', 5, 'AVIVA INSURANCE', 280, 'Car insurance', 's'],
  ['p2', 7, 'SHOPPERS DRUG MART', 47.6, 'Household supplies', 's'], ['p2', 9, 'DOORDASH', 38.4, 'Food delivery', 's'], ['p2', 10, 'SEPHORA', 84.5, 'Personal care', 'p'],
  ['p2', 13, 'FARM BOY', 167.9, 'Groceries', 's'], ['p2', 15, 'TFR TO JOINT SAVINGS', 303.75, 'Joint savings', 's'],
  ['p2', 17, 'CANADIAN TIRE', 72.15, 'Household supplies', 's'], ['p2', 19, 'CINEPLEX', 31.5, 'Entertainment', 'p'], ['p2', 22, 'DOORDASH', 44.9, 'Food delivery', 's'],
  ['p2', 23, 'ENBRIDGE GAS', 71.3, 'Utilities', 's'], ['p2', 12, 'ESSO 2231', 58.4, 'Fuel', 'k'], ['p2', 26, 'TERRONI', 96, 'Dining out', 'p'], ['p2', 27, 'MORTGAGE PAYMENT', 200, 'Mortgage payment', 's'],
];
const FIXED = /RENT|CONDO|TAX|AUTO FINANCE|INSURANCE|MORTGAGE|SAVINGS|PAYROLL|NETFLIX|SPOTIFY|PAYMENT THANK/;

const pay = (paidBy: 'p1' | 'p2', date: string, desc: string, amount: number): Tx =>
  ({ id: uid(), date, desc, amount: -amount, category: 'Income', paidBy, owner: paidBy, source: 'Sample data', exclude: false });

/** A made-up household used for the "look around" mode. Nothing here is saved or sent anywhere. */
export function sampleDoc(): Doc {
  const doc = defaultDoc();
  doc.settings = applySplit({ ...doc.settings, p1: 'Kaeto', p2: 'Bri', inc1: 5200, inc2: 2600, splitMethod: 'income', onboarded: true });
  doc.settings.pay = {
    p1: { freq: 'biweekly', anchor: '2026-01-02', gross: 78500, confirmed: 'ACME CORP|2400|biweekly' },
    p2: { freq: 'semimonthly', anchor: '2026-01-15', days: [15, 31] },
  };
  const now = monthKey();
  [0.94, 1.12, 1].forEach((scale, i) => {
    const month = addMonths(now, i - 3);
    const tx: Tx[] = ROWS.map(([paidBy, day, desc, amount, category, o]) => ({
      id: uid(), date: isoDay(month, day), desc, category, paidBy, source: 'Sample data', exclude: false,
      amount: FIXED.test(desc) ? amount : Math.round(amount * scale * 100) / 100,
      owner: o === 's' ? 'shared' : o === 'k' ? 'p1' : (paidBy as 'p1' | 'p2'),
    }));
    // Kaeto is paid every second Friday, Bri on the 15th and the last day.
    for (const day of paydays(doc.settings.pay.p1, month)) tx.push(pay('p1', isoDay(month, day), 'ACME CORP PAYROLL', 2400));
    for (const day of paydays(doc.settings.pay.p2, month)) tx.push(pay('p2', isoDay(month, day), 'NORTHWIND PAY', 1300));
    doc.months[month] = { tx: tx.sort((a, b) => a.date.localeCompare(b.date)) };
  });
  doc.bills.push({ id: uid(), name: 'Visa balance', amount: 250, dueDay: 22, kind: 'debt', payer: 'p1', icon: 'card', balance: 3200, apr: 19.99, targetMonth: addMonths(now, 11), paid: {} });
  // Fuel is Kaeto's to cover; Bri filling up once shows in the shared costs check.
  doc.categories = doc.categories.map(c => (c.name === 'Fuel' ? { ...c, scope: 'p1' } : c));
  const last = addMonths(now, -1);
  doc.accounts = [
    { id: 'visa', name: 'TD Visa', type: 'credit', owner: 'p1', balance: 1240, last4: '4417', institution: 'TD', asOf: `${last}-28`, due: { balance: 1240, min: 35, date: `${now}-22`, end: `${last}-28` } },
    { id: uid(), name: 'Joint savings', type: 'savings', owner: 'shared', balance: 18400 },
    { id: uid(), name: 'Chequing', type: 'chequing', owner: 'p2', balance: 4120 },
    { id: uid(), name: 'Car', type: 'vehicle', owner: 'shared', balance: 14500 },
    { id: uid(), name: 'Car loan', type: 'loan', owner: 'shared', balance: 9800 },
  ];
  // Investments, as a Wealthsimple holdings report would give them.
  const day = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return d.toLocaleDateString('en-CA'); };
  const ws = (symbol: string, name: string, qty: number, price: number, bookCad: number, kind = 'EXCHANGE_TRADED_FUND', currency = 'CAD', mic = 'XTSE') => ({ symbol, name, qty, price, bookCad, kind, currency, mic });
  doc.investments = {
    target: 'growth80', fx: 1.39, fxLive: false,
    accounts: [
      { id: 'ws-tfsa-k', name: 'Wealthsimple TFSA', type: 'TFSA', owner: 'p1', number: 'WK1234567CAD', asOf: day(1), holdings: [ws('XEQT', 'iShares Core Equity ETF Portfolio', 520, 34.1, 15200), ws('SHOP', 'Shopify Inc', 22, 212.4, 2900, 'EQUITY')] },
      { id: 'ws-rrsp-k', name: 'Wealthsimple RRSP', type: 'RRSP', owner: 'p1', number: 'WK7654321CAD', asOf: day(1), holdings: [ws('VFV', 'Vanguard S&P 500 Index ETF', 48, 154.2, 6100), ws('ZAG', 'BMO Aggregate Bond Index ETF', 120, 14.02, 1700)] },
      { id: 'ws-tfsa-b', name: 'Wealthsimple TFSA', type: 'TFSA', owner: 'p2', number: 'WB2222222CAD', asOf: day(1), holdings: [ws('VGRO', 'Vanguard Growth ETF Portfolio', 210, 37.8, 7200), ws('CASH', 'Global X High Interest Savings ETF', 30, 50.05, 1500)] },
    ],
    history: Object.fromEntries([41800, 42350, 41900, 42900, 43600, 43200, 44100].map((v, i) => [day((6 - i) * 14), v])),
  };
  syncNetWorth(doc);
  [48200, 50100, 51900, 53400, 54600, 55270].forEach((net, i) => {
    doc.snapshots[addMonths(now, i - 5)] = { assets: net + 13000, debts: 13000 };
  });
  return doc;
}
