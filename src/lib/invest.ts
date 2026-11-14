/**
 * Investments: Wealthsimple holdings reports, asset classes, target mixes and where new money could go.
 * Everything here is arithmetic on the couple's own holdings. It never picks stocks.
 */
import { uid } from './format';
import { takeHome } from './tax';
import type { Doc, Owner, PersonId } from './types';

export type AssetClass = 'ca' | 'us' | 'intl' | 'em' | 'bond' | 'cash' | 'crypto' | 'other';
export type InvAccountType = 'TFSA' | 'RRSP' | 'FHSA' | 'RESP' | 'Non-registered' | 'Crypto' | 'Other';

export interface Holding {
  symbol: string;
  name: string;
  exchange?: string;
  /** Market identifier code, e.g. XTSE, XNYS. */
  mic?: string;
  kind?: string;
  qty: number;
  price: number;
  /** Currency of the price and market value. */
  currency: 'CAD' | 'USD' | string;
  /** Book value (what was paid), in CAD. */
  bookCad?: number;
  /** Asset class picked by hand, overriding the automatic one. */
  cls?: AssetClass;
  /** When the price last came from the market rather than the upload. */
  priced?: string;
  dayChange?: number;
}

export interface InvAccount {
  id: string;
  name: string;
  type: InvAccountType;
  owner: Owner;
  number?: string;
  holdings: Holding[];
  /** Date of the holdings report, YYYY-MM-DD. */
  asOf: string;
}

export interface Investments {
  accounts: InvAccount[];
  target: TargetKey;
  /** CAD per USD. */
  fx: number;
  fxLive?: boolean;
  /** Portfolio value in CAD by day, YYYY-MM-DD. */
  history: Record<string, number>;
  pricedAt?: string;
}

export const emptyInvestments = (): Investments => ({ accounts: [], target: 'growth80', fx: 1.38, history: {} });

export const CLASSES: Record<AssetClass, { label: string; color: string }> = {
  ca: { label: 'Canadian stocks', color: '#d23a76' },
  us: { label: 'US stocks', color: '#4b3fe4' },
  intl: { label: 'International stocks', color: '#0fa3a3' },
  em: { label: 'Emerging markets', color: '#e08a1e' },
  bond: { label: 'Bonds', color: '#0a8058' },
  cash: { label: 'Cash and savings', color: '#94a0b8' },
  crypto: { label: 'Crypto', color: '#7c5cff' },
  other: { label: 'Other', color: '#cbd2e0' },
};

/**
 * Approximate make-up of common Canadian-listed funds, in percent. All-in-one funds are split
 * across their parts so the mix reflects what is really held. Close enough for a mix check.
 */
const FUNDS: Record<string, Partial<Record<AssetClass, number>>> = {
  XEQT: { ca: 25, us: 45, intl: 25, em: 5 }, VEQT: { ca: 30, us: 44, intl: 19, em: 7 }, ZEQT: { ca: 25, us: 45, intl: 25, em: 5 }, HEQT: { ca: 25, us: 45, intl: 25, em: 5 }, TEQT: { ca: 25, us: 45, intl: 25, em: 5 },
  XGRO: { ca: 20, us: 36, intl: 20, em: 4, bond: 20 }, VGRO: { ca: 24, us: 35, intl: 15, em: 6, bond: 20 }, ZGRO: { ca: 20, us: 36, intl: 20, em: 4, bond: 20 }, HGRO: { ca: 20, us: 36, intl: 20, em: 4, bond: 20 },
  XBAL: { ca: 15, us: 27, intl: 15, em: 3, bond: 40 }, VBAL: { ca: 18, us: 26, intl: 11, em: 5, bond: 40 }, ZBAL: { ca: 15, us: 27, intl: 15, em: 3, bond: 40 },
  XCNS: { ca: 10, us: 18, intl: 10, em: 2, bond: 60 }, VCNS: { ca: 12, us: 17, intl: 8, em: 3, bond: 60 }, ZCON: { ca: 10, us: 18, intl: 10, em: 2, bond: 60 },
  XINC: { ca: 5, us: 9, intl: 5, em: 1, bond: 80 }, VCIP: { ca: 6, us: 9, intl: 4, em: 1, bond: 80 },
  XAW: { us: 60, intl: 30, em: 10 }, VXC: { us: 60, intl: 30, em: 10 }, ZGQ: { us: 65, intl: 35 }, VT: { us: 62, intl: 28, em: 10 },
  XIC: { ca: 100 }, VCN: { ca: 100 }, ZCN: { ca: 100 }, XIU: { ca: 100 }, HXT: { ca: 100 }, ZIU: { ca: 100 }, XEI: { ca: 100 }, VDY: { ca: 100 }, ZDV: { ca: 100 }, ZEB: { ca: 100 }, XEG: { ca: 100 }, XFN: { ca: 100 }, ZRE: { ca: 100 }, XRE: { ca: 100 },
  VFV: { us: 100 }, XUS: { us: 100 }, ZSP: { us: 100 }, XUU: { us: 100 }, VUN: { us: 100 }, XSP: { us: 100 }, HXS: { us: 100 }, ZQQ: { us: 100 }, QQC: { us: 100 }, XQQ: { us: 100 }, HXQ: { us: 100 }, ZNQ: { us: 100 }, VSP: { us: 100 }, ZUE: { us: 100 }, XUH: { us: 100 },
  VOO: { us: 100 }, VTI: { us: 100 }, SPY: { us: 100 }, IVV: { us: 100 }, QQQ: { us: 100 }, QQQM: { us: 100 }, ITOT: { us: 100 }, SCHB: { us: 100 }, SCHD: { us: 100 }, VUG: { us: 100 }, VIG: { us: 100 },
  XEF: { intl: 100 }, VIU: { intl: 100 }, ZEA: { intl: 100 }, VEA: { intl: 100 }, IEFA: { intl: 100 }, VI: { intl: 100 }, VXUS: { intl: 77, em: 23 },
  XEC: { em: 100 }, VEE: { em: 100 }, ZEM: { em: 100 }, IEMG: { em: 100 }, VWO: { em: 100 },
  ZAG: { bond: 100 }, VAB: { bond: 100 }, XBB: { bond: 100 }, XSB: { bond: 100 }, VSB: { bond: 100 }, ZFL: { bond: 100 }, ZST: { bond: 100 }, XSH: { bond: 100 }, BND: { bond: 100 }, AGG: { bond: 100 }, ZDB: { bond: 100 },
  CASH: { cash: 100 }, PSA: { cash: 100 }, HSAV: { cash: 100 }, ZMMK: { cash: 100 }, CSAV: { cash: 100 }, HISA: { cash: 100 }, CBIL: { cash: 100 }, MNY: { cash: 100 }, CMR: { cash: 100 },
};

const CA_MIC = /^(XTSE|XTSX|NEOE|XCNQ|CHIC|XATS|CBOE CANADA)$/i;
const CA_EXCH = /^(TSX|TSXV|TSX-V|NEO|CSE|CBOE CANADA|CBOE)$/i;
const US_EXCH = /^(NYSE|NASDAQ|ARCA|NYSEARCA|NYSE ARCA|BATS|AMEX|NYSE AMERICAN|NYSEMKT|XNYS|XNAS|ARCX|BATS|XASE)$/i;

const baseSymbol = (s: string) => s.toUpperCase().replace(/[.-](TO|U|UN|V|NE)$/, '').replace(/\s+/g, '');

/** How a holding splits across asset classes, as fractions that add to 1. */
export function mixOf(h: Holding): Partial<Record<AssetClass, number>> {
  if (h.cls) return { [h.cls]: 1 };
  const fund = FUNDS[baseSymbol(h.symbol)];
  if (fund) return Object.fromEntries(Object.entries(fund).map(([k, v]) => [k, (v as number) / 100]));
  const kind = (h.kind ?? '').toUpperCase();
  const name = h.name.toLowerCase();
  if (/CRYPTO/.test(kind) || /bitcoin|ethereum|solana|crypto/.test(name)) return { crypto: 1 };
  if (/CASH|MONEY_MARKET/.test(kind) || /money market|high interest|savings|t-bill|cash/.test(name)) return { cash: 1 };
  if (/bond|fixed income|treasury|aggregate/.test(name)) return { bond: 1 };
  if (/emerging/.test(name)) return { em: 1 };
  if (/international|eafe|developed ex|world ex/.test(name)) return { intl: 1 };
  if (/s&p 500|nasdaq|u\.s\.|us equity|united states|total market/.test(name)) return { us: 1 };
  if (/canad|tsx/.test(name)) return { ca: 1 };
  if (CA_MIC.test(h.mic ?? '') || CA_EXCH.test(h.exchange ?? '')) return /CDR|CANADIAN DEPOSITARY/.test(`${kind} ${name.toUpperCase()}`) ? { us: 1 } : { ca: 1 };
  if (US_EXCH.test(h.mic ?? '') || US_EXCH.test(h.exchange ?? '')) return { us: 1 };
  return { other: 1 };
}

/** The class a holding mostly belongs to, for labels. */
export const mainClass = (h: Holding): AssetClass => (Object.entries(mixOf(h)).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as AssetClass) ?? 'other';
/** True for all-in-one funds that hold several classes and rebalance themselves. */
export const isAllInOne = (h: Holding) => Object.keys(mixOf(h)).length >= 3;

export const valueCad = (h: Holding, fx: number) => h.qty * h.price * (String(h.currency).toUpperCase() === 'USD' ? fx : 1);
export const accountValue = (a: InvAccount, fx: number) => a.holdings.reduce((s, h) => s + valueCad(h, fx), 0);

export function portfolio(inv: Investments) {
  const holdings = inv.accounts.flatMap(a => a.holdings.map(h => ({ h, account: a, value: valueCad(h, inv.fx) })));
  const total = holdings.reduce((s, x) => s + x.value, 0);
  const book = holdings.reduce((s, x) => s + (x.h.bookCad ?? 0), 0);
  const byClass = {} as Record<AssetClass, number>;
  for (const k of Object.keys(CLASSES) as AssetClass[]) byClass[k] = 0;
  for (const x of holdings) for (const [k, w] of Object.entries(mixOf(x.h))) byClass[k as AssetClass] += x.value * (w ?? 0);
  const usd = holdings.filter(x => String(x.h.currency).toUpperCase() === 'USD').reduce((s, x) => s + x.value, 0);
  const dayMove = holdings.reduce((s, x) => s + (x.h.dayChange ? (x.value * x.h.dayChange) / (100 + x.h.dayChange) : 0), 0);
  return { holdings, total, book, gain: book > 0 ? total - book : 0, byClass, usd, dayMove };
}

/* ─────────── Targets ─────────── */

export type TargetKey = 'equity100' | 'growth80' | 'balanced60' | 'conservative40';
const EQUITY_SPLIT = { ca: 0.3, us: 0.45, intl: 0.2, em: 0.05 };
const target = (stocks: number): Partial<Record<AssetClass, number>> => ({
  ca: stocks * EQUITY_SPLIT.ca, us: stocks * EQUITY_SPLIT.us, intl: stocks * EQUITY_SPLIT.intl, em: stocks * EQUITY_SPLIT.em, bond: 1 - stocks,
});
export const TARGETS: Record<TargetKey, { label: string; hint: string; weights: Partial<Record<AssetClass, number>> }> = {
  equity100: { label: 'All stocks', hint: '100% stocks. Biggest swings; suits money you will not touch for 10+ years.', weights: target(1) },
  growth80: { label: 'Growth', hint: '80% stocks, 20% bonds. A common choice for long-term saving.', weights: target(0.8) },
  balanced60: { label: 'Balanced', hint: '60% stocks, 40% bonds. Smaller drops in bad years.', weights: target(0.6) },
  conservative40: { label: 'Conservative', hint: '40% stocks, 60% bonds. For money needed within a few years.', weights: target(0.4) },
};

/** The part of the portfolio the target applies to: everything except crypto and "other". */
const investable = (byClass: Record<AssetClass, number>) => (['ca', 'us', 'intl', 'em', 'bond', 'cash'] as AssetClass[]).reduce((s, k) => s + byClass[k], 0);

export function drift(inv: Investments) {
  const p = portfolio(inv);
  const base = investable(p.byClass);
  const w = TARGETS[inv.target].weights;
  return (['ca', 'us', 'intl', 'em', 'bond', 'cash'] as AssetClass[]).map(k => ({
    cls: k, now: base ? p.byClass[k] / base : 0, target: w[k] ?? 0, value: p.byClass[k],
  }));
}

/**
 * Splits new money across the classes furthest below target, so contributions rebalance the
 * portfolio without selling. Names a fund already held in that class when there is one.
 */
export function placeNewMoney(inv: Investments, amount: number) {
  const p = portfolio(inv);
  const base = investable(p.byClass);
  const after = base + amount;
  const w = TARGETS[inv.target].weights;
  const short = (['ca', 'us', 'intl', 'em', 'bond'] as AssetClass[]).map(k => ({ cls: k, need: Math.max(0, (w[k] ?? 0) * after - p.byClass[k]) }));
  const need = short.reduce((s, x) => s + x.need, 0);
  const allInOne = p.holdings.filter(x => isAllInOne(x.h)).sort((a, b) => b.value - a.value)[0];
  const parts: { cls: AssetClass; amount: number; fund?: string }[] = short.filter(x => x.need > 0.5).map(x => {
    const share = need > 0 ? (x.need / need) * Math.min(amount, need) : 0;
    const held = p.holdings.filter(y => !isAllInOne(y.h) && mainClass(y.h) === x.cls && (mixOf(y.h)[x.cls] ?? 0) > 0.9).sort((a, b) => b.value - a.value)[0];
    return { cls: x.cls, amount: share, fund: held?.h.symbol };
  });
  // Money beyond what is needed to reach target is spread in target proportions.
  const extra = Math.max(0, amount - need);
  if (extra > 0) for (const k of ['ca', 'us', 'intl', 'em', 'bond'] as AssetClass[]) {
    const part = parts.find(x => x.cls === k);
    const add = extra * (w[k] ?? 0);
    if (part) part.amount += add;
    else if (add > 0.5) parts.push({ cls: k, amount: add, fund: p.holdings.find(y => !isAllInOne(y.h) && mainClass(y.h) === k)?.h.symbol });
  }
  const mostlyAllInOne = !!allInOne && allInOne.value > p.total * 0.6;
  return { parts: parts.filter(x => x.amount >= 1).sort((a, b) => b.amount - a.amount), allInOne: mostlyAllInOne ? allInOne.h.symbol : undefined };
}

/* ─────────── Things worth knowing ─────────── */

export interface Flag { tone: 'good' | 'warn' | 'info'; text: string }

export function portfolioFlags(inv: Investments): Flag[] {
  const p = portfolio(inv);
  if (!p.total) return [];
  const out: Flag[] = [];
  const singles = p.holdings.filter(x => !FUNDS[baseSymbol(x.h.symbol)] && !/FUND|ETF/i.test(x.h.kind ?? '') && mainClass(x.h) !== 'cash' && mainClass(x.h) !== 'crypto');
  for (const x of singles) if (x.value / p.total > 0.1) out.push({ tone: 'warn', text: `${x.h.symbol} is ${Math.round((x.value / p.total) * 100)}% of the portfolio. A single company that large means one bad year for it is a bad year for you.` });
  const cash = p.byClass.cash / p.total;
  if (cash > 0.08) out.push({ tone: 'info', text: `${Math.round(cash * 100)}% is in cash or savings funds. Fine for money you need soon; for long-term money it tends to lag inflation.` });
  const crypto = p.byClass.crypto / p.total;
  if (crypto > 0.1) out.push({ tone: 'warn', text: `Crypto is ${Math.round(crypto * 100)}% of the portfolio. It can drop 50% or more in a year.` });
  const d = drift(inv).filter(x => Math.abs(x.now - x.target) > 0.05);
  if (d.length) out.push({ tone: 'info', text: `${d.map(x => `${CLASSES[x.cls].label} ${x.now > x.target ? 'over' : 'under'} target by ${Math.round(Math.abs(x.now - x.target) * 100)} points`).join(', ')}. New contributions below can close the gap without selling.` });
  else out.push({ tone: 'good', text: `Your mix is within 5 points of the ${TARGETS[inv.target].label.toLowerCase()} target.` });
  if (p.usd / p.total > 0.3) out.push({ tone: 'info', text: `${Math.round((p.usd / p.total) * 100)}% is held in US dollars, so the exchange rate moves your balance too. In an RRSP, US-listed funds avoid a 15% withholding tax on dividends that TFSAs cannot avoid.` });
  return out;
}

export const LIMITS_2026 = { tfsa: 7000, rrspMax: 33810, fhsa: 8000 };

/** Rough marginal tax rate from a yearly salary, by taking the estimate at $1,000 more. */
function marginal(gross: number, doc: Doc) {
  const a = takeHome(gross, doc.settings.region);
  const b = takeHome(gross + 1000, doc.settings.region);
  return a && b ? 1 - (b.net - a.net) / 1000 : null;
}

/** Plain guidance on which account suits new money for each partner, from their income. */
export function accountGuidance(doc: Doc, inv: Investments) {
  const has = (p: PersonId, t: InvAccountType) => inv.accounts.some(a => a.owner === p && a.type === t);
  return (['p1', 'p2'] as PersonId[]).map(p => {
    const gross = doc.settings.pay[p].gross ?? (p === 'p1' ? doc.settings.inc1 : doc.settings.inc2) * 12 * 1.35;
    const m = gross > 0 ? marginal(gross, doc) : null;
    const rate = m === null ? null : Math.round(m * 100);
    const rrspFirst = rate !== null && rate >= 40;
    const lines = [
      rrspFirst
        ? `At about a ${rate}% marginal rate, each $1,000 into an RRSP cuts this year's tax by roughly $${rate * 10}. That refund can then go into the TFSA.`
        : `${rate !== null ? `At about a ${rate}% marginal rate, ` : ''}the TFSA is usually the first stop: growth and withdrawals are tax-free, and room comes back after a withdrawal.`,
      `2026 room: the TFSA adds $${LIMITS_2026.tfsa.toLocaleString()} for everyone; the RRSP adds 18% of 2025 earned income, up to $${LIMITS_2026.rrspMax.toLocaleString()}. Your exact room is in your CRA account.`,
    ];
    if (has(p, 'FHSA')) lines.push(`The FHSA takes up to $${LIMITS_2026.fhsa.toLocaleString()} a year, deductible like an RRSP and tax-free for a first home.`);
    return { person: p, rate, rrspFirst, lines };
  });
}

/* ─────────── Reading Wealthsimple holdings reports ─────────── */

/** Splits CSV text into rows, handling quotes, commas inside quotes and a byte-order mark. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const num = (s: string | undefined) => {
  const n = parseFloat(String(s ?? '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : 0;
};

const ACCOUNT_TYPES: [RegExp, InvAccountType][] = [
  [/tfsa|tax.free/i, 'TFSA'], [/fhsa|first home/i, 'FHSA'], [/rrsp|rsp|retirement savings|lira|spousal/i, 'RRSP'], [/resp/i, 'RESP'],
  [/crypto/i, 'Crypto'], [/non.?reg|personal|cash|margin|individual|joint/i, 'Non-registered'],
];
export const accountType = (s: string): InvAccountType => ACCOUNT_TYPES.find(([re]) => re.test(s))?.[1] ?? 'Other';

/**
 * Reads a Wealthsimple holdings report (Profile, Documents, Holdings report CSV).
 * Columns are found by name, so small changes to the export still work. Returns null when the
 * file does not look like a holdings report, so the caller can ask Claude instead.
 */
export function parseWealthsimple(text: string, owner: Owner): { accounts: InvAccount[]; asOf: string } | null {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex(r => r.some(c => /^symbol$/i.test(c.trim())) && r.some(c => /quantity/i.test(c)));
  if (headerAt < 0) return null;
  const head = rows[headerAt].map(c => c.trim().toLowerCase());
  const col = (...names: (string | RegExp)[]) => {
    for (const n of names) {
      const i = head.findIndex(h => (typeof n === 'string' ? h === n : n.test(h)));
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    accName: col('account name'), accType: col('account type', /account classification/), accNum: col('account number'),
    symbol: col('symbol'), exchange: col('exchange'), mic: col('mic'), name: col('name', /security name|description/), kind: col('security type', /type$/),
    qty: col('quantity'), price: col('market price', /^price$/), priceCur: col('market price currency'),
    bookCad: col('book value (cad)', /book value.*cad/, /book cost/), value: col('market value'), valueCur: col('market value currency'),
  };
  if (c.symbol < 0 || c.qty < 0 || (c.price < 0 && c.value < 0)) return null;
  const asOfMatch = text.match(/as of[^0-9]*(\d{4}-\d{2}-\d{2})/i);
  const asOf = asOfMatch?.[1] ?? new Date().toLocaleDateString('en-CA');
  const byAccount = new Map<string, InvAccount>();
  for (const r of rows.slice(headerAt + 1)) {
    const symbol = (r[c.symbol] ?? '').trim();
    const qty = num(r[c.qty]);
    if (!symbol || !qty || r.length < head.length - 3) continue;
    const accName = (r[c.accName] ?? '').trim() || (r[c.accType] ?? '').trim() || 'Wealthsimple';
    const accNum = (r[c.accNum] ?? '').trim();
    const key = accNum || accName;
    let acc = byAccount.get(key);
    if (!acc) {
      const type = accountType(`${r[c.accType] ?? ''} ${accName}`);
      acc = { id: uid(), name: accName.toLowerCase().includes('wealthsimple') ? accName : `Wealthsimple ${accName}`, type, owner, ...(accNum ? { number: accNum } : {}), holdings: [], asOf };
      byAccount.set(key, acc);
    }
    const value = c.value >= 0 ? num(r[c.value]) : 0;
    const price = c.price >= 0 && num(r[c.price]) ? num(r[c.price]) : value / qty;
    acc.holdings.push({
      symbol, name: (r[c.name] ?? symbol).trim(), qty, price,
      currency: ((c.priceCur >= 0 ? r[c.priceCur] : c.valueCur >= 0 ? r[c.valueCur] : 'CAD') || 'CAD').trim().toUpperCase(),
      ...(c.exchange >= 0 && r[c.exchange] ? { exchange: r[c.exchange].trim() } : {}),
      ...(c.mic >= 0 && r[c.mic] ? { mic: r[c.mic].trim() } : {}),
      ...(c.kind >= 0 && r[c.kind] ? { kind: r[c.kind].trim() } : {}),
      ...(c.bookCad >= 0 && r[c.bookCad] ? { bookCad: num(r[c.bookCad]) } : {}),
    });
  }
  return byAccount.size ? { accounts: [...byAccount.values()], asOf } : null;
}

/**
 * Saves uploaded accounts. An account already on file (same number, or same name and owner)
 * has its holdings replaced, so the newest report is always the source of truth.
 */
export function mergeAccounts(inv: Investments, incoming: InvAccount[]) {
  for (const a of incoming) {
    const i = inv.accounts.findIndex(x => (a.number && x.number === a.number) || (!a.number && x.name === a.name && x.owner === a.owner));
    if (i >= 0) inv.accounts[i] = { ...a, id: inv.accounts[i].id, holdings: a.holdings.map(h => ({ ...h, cls: inv.accounts[i].holdings.find(o => o.symbol === h.symbol)?.cls })) };
    else inv.accounts.push(a);
  }
}

/** Mirrors each investment account into Net worth, so the balance sheet includes it. */
export function syncNetWorth(d: Doc) {
  const inv = d.investments;
  if (!inv) return;
  const ids = new Set(inv.accounts.map(a => `inv-${a.id}`));
  d.accounts = d.accounts.filter(a => !a.id.startsWith('inv-') || ids.has(a.id));
  for (const a of inv.accounts) {
    const balance = Math.round(accountValue(a, inv.fx) * 100) / 100;
    const existing = d.accounts.find(x => x.id === `inv-${a.id}`);
    if (existing) Object.assign(existing, { name: a.name, owner: a.owner, balance, asOf: a.asOf });
    else d.accounts.push({ id: `inv-${a.id}`, name: a.name, type: 'investment', owner: a.owner, balance, asOf: a.asOf });
  }
}

/** Records today's portfolio value for the trend chart. */
export function recordValue(inv: Investments) {
  const total = portfolio(inv).total;
  if (total > 0) inv.history[new Date().toLocaleDateString('en-CA')] = Math.round(total);
}
