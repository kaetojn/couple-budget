import { defaultDoc } from './defaults';
import { addMonths, isoDay, monthKey, uid } from './format';
import { applySplit } from './plan';
import type { Doc, Payer, Tx } from './types';

type Row = [Payer, number, string, number, string, 's' | 'p'];
const ROWS: Row[] = [
  ['p1', 1, 'RENT PAYMENT - LANDLORD', 3400, 'Rent payment', 's'], ['p1', 2, 'TORONTO HYDRO', 96.4, 'Utilities', 's'], ['p1', 3, 'LOBLAWS #1021', 212.33, 'Groceries', 's'],
  ['p1', 5, 'PETRO-CANADA 4471', 68.2, 'Fuel', 's'], ['p1', 6, 'NETFLIX.COM', 20.99, 'Subscriptions', 's'], ['p1', 8, 'UBER EATS', 54.1, 'Food delivery', 's'],
  ['p1', 9, 'CONDO CORP 2214 FEES', 600, 'Condo fees', 's'], ['p1', 11, 'APPLE STORE EATON', 189, 'Shopping', 'p'], ['p1', 12, 'TD AUTO FINANCE', 365, 'Car payment', 's'],
  ['p1', 14, 'COSTCO WHOLESALE', 318.75, 'Groceries', 's'], ['p1', 15, 'TFR TO JOINT SAVINGS', 637.35, 'Joint savings', 's'], ['p1', 15, 'PAYROLL DEPOSIT', -5200, 'Income', 'p'],
  ['p1', 18, 'PAYMENT THANK YOU', -900, 'Transfer', 'p'], ['p1', 21, 'UBER EATS', 61.75, 'Food delivery', 's'], ['p1', 24, 'CITY OF TORONTO TAX', 350, 'Property taxes', 's'],
  ['p2', 2, 'METRO 311', 143.2, 'Groceries', 's'], ['p2', 4, 'SPOTIFY', 12.99, 'Subscriptions', 's'], ['p2', 5, 'AVIVA INSURANCE', 280, 'Car insurance', 's'],
  ['p2', 7, 'SHOPPERS DRUG MART', 47.6, 'Household supplies', 's'], ['p2', 9, 'DOORDASH', 38.4, 'Food delivery', 's'], ['p2', 10, 'SEPHORA', 84.5, 'Personal care', 'p'],
  ['p2', 13, 'FARM BOY', 167.9, 'Groceries', 's'], ['p2', 15, 'TFR TO JOINT SAVINGS', 303.75, 'Joint savings', 's'], ['p2', 15, 'PAYROLL DEPOSIT', -2600, 'Income', 'p'],
  ['p2', 17, 'CANADIAN TIRE', 72.15, 'Household supplies', 's'], ['p2', 19, 'CINEPLEX', 31.5, 'Entertainment', 'p'], ['p2', 22, 'DOORDASH', 44.9, 'Food delivery', 's'],
  ['p2', 23, 'ENBRIDGE GAS', 71.3, 'Utilities', 's'], ['p2', 26, 'TERRONI', 96, 'Dining out', 'p'], ['p2', 27, 'MORTGAGE PAYMENT', 200, 'Mortgage payment', 's'],
];
const FIXED = /RENT|CONDO|TAX|AUTO FINANCE|INSURANCE|MORTGAGE|SAVINGS|PAYROLL|NETFLIX|SPOTIFY|PAYMENT THANK/;

/** A made-up household used for the "look around" mode. Nothing here is saved or sent anywhere. */
export function sampleDoc(): Doc {
  const doc = defaultDoc();
  doc.settings = applySplit({ ...doc.settings, p1: 'Kaeto', p2: 'Bri', inc1: 5200, inc2: 2600, splitMethod: 'income', onboarded: true });
  const now = monthKey();
  [0.94, 1.12, 1].forEach((scale, i) => {
    const month = addMonths(now, i - 3);
    const tx: Tx[] = ROWS.map(([paidBy, day, desc, amount, category, o]) => ({
      id: uid(), date: isoDay(month, day), desc, category, paidBy, source: 'Sample data', exclude: false,
      amount: FIXED.test(desc) ? amount : Math.round(amount * scale * 100) / 100,
      owner: o === 's' ? 'shared' : (paidBy as 'p1' | 'p2'),
    }));
    doc.months[month] = { tx: tx.sort((a, b) => a.date.localeCompare(b.date)) };
  });
  doc.bills.push({ id: uid(), name: 'Visa balance', amount: 250, dueDay: 22, kind: 'debt', payer: 'p1', icon: 'card', balance: 3200, apr: 19.99, targetMonth: addMonths(now, 11), paid: {} });
  doc.accounts = [
    { id: uid(), name: 'Joint savings', type: 'savings', owner: 'shared', balance: 18400 },
    { id: uid(), name: 'TFSA', type: 'investment', owner: 'p1', balance: 31250 },
    { id: uid(), name: 'Chequing', type: 'chequing', owner: 'p2', balance: 4120 },
    { id: uid(), name: 'Car', type: 'vehicle', owner: 'shared', balance: 14500 },
    { id: uid(), name: 'Visa', type: 'credit', owner: 'p1', balance: 3200 },
    { id: uid(), name: 'Car loan', type: 'loan', owner: 'shared', balance: 9800 },
  ];
  [48200, 50100, 51900, 53400, 54600, 55270].forEach((net, i) => {
    doc.snapshots[addMonths(now, i - 5)] = { assets: net + 13000, debts: 13000 };
  });
  return doc;
}
