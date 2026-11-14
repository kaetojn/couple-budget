import type { Investments } from './invest';
import type { Region } from './tax';

export type PersonId = 'p1' | 'p2';
export type Owner = PersonId | 'shared';
export type Payer = PersonId | 'joint';
/** Who a category belongs to. "personal" means whoever paid for it. */
export type Scope = Owner | 'personal';
export type Kind = 'expense' | 'savings' | 'income' | 'transfer';
export type Arrangement = 'joint' | 'hybrid' | 'separate';
export type SplitMethod = 'income' | 'even' | 'custom';
export type PayFreq = 'monthly' | 'semimonthly' | 'biweekly' | 'weekly';
export type AccountType = 'chequing' | 'savings' | 'investment' | 'property' | 'vehicle' | 'credit' | 'loan' | 'mortgage';

export interface Category {
  name: string;
  budget: number;
  scope: Scope;
  kind: Kind;
  icon: string;
  color: string;
  locked?: boolean;
}

export interface Tx {
  id: string;
  date: string;
  desc: string;
  /** Positive when money leaves the account. */
  amount: number;
  category: string;
  owner: Owner;
  paidBy: Payer;
  source: string;
  exclude: boolean;
  /** Id of the account (in Net Worth) the statement belongs to. */
  account?: string;
  /** Reviewed in the shared costs check and left as is. */
  ok?: boolean;
}

export interface Rule {
  match: string;
  category: string;
  owner: 'shared' | 'personal';
}

export interface PaySchedule {
  freq: PayFreq;
  /** Any real payday, as YYYY-MM-DD. */
  anchor: string;
  /** The two days of the month for semi-monthly pay. 31 means the last day. */
  days?: [number, number];
  /** Yearly salary before tax, when take-home is estimated from it. */
  gross?: number;
  /** Signature of the paycheque the person confirmed from a statement. */
  confirmed?: string;
}

export interface Settings {
  p1: string;
  p2: string;
  arrangement: Arrangement;
  inc1: number;
  inc2: number;
  splitMethod: SplitMethod;
  /** First partner's share of shared costs, in percent. */
  split: number;
  sav1: number;
  sav2: number;
  onboarded: boolean;
  remember: boolean;
  pay: Record<PersonId, PaySchedule>;
  /** Province or territory, for take-home estimates. */
  region: Region;
  /** Statement deposits the couple said are not a paycheque. */
  notPay?: string[];
  /** Recurring payments found in statements that the couple dismissed. */
  notBills?: string[];
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  kind: 'bill' | 'debt';
  payer: Owner;
  icon: string;
  balance?: number;
  apr?: number;
  targetMonth?: string;
  /** Merchant key from statements. A matching transaction marks the bill paid. */
  match?: string;
  /** Months (YYYY-MM) marked paid (true) or explicitly not paid (false). */
  paid: Record<string, boolean>;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  owner: Owner;
  balance: number;
  institution?: string;
  last4?: string;
  /** Date of the statement the balance came from, as YYYY-MM-DD. */
  asOf?: string;
  /** For credit cards: what the latest statement asks to be paid. */
  due?: { balance: number; min?: number; date?: string; end: string };
}

export interface Checkup {
  headline: string;
  wins: string[];
  watch: string[];
  actions: string[];
  at: string;
}

export interface MonthData {
  tx: Tx[];
  checkup?: Checkup;
}

export interface Doc {
  version: 2;
  settings: Settings;
  categories: Category[];
  rules: Rule[];
  months: Record<string, MonthData>;
  bills: Bill[];
  accounts: Account[];
  snapshots: Record<string, { assets: number; debts: number }>;
  investments?: Investments;
  updatedAt?: string;
}
