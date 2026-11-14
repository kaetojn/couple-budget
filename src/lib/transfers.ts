/**
 * Transfers: money moving between the couple's own accounts (card payments, moves to savings,
 * top-ups to the joint account). Matching both sides keeps them out of spending even when one
 * side was labelled as a purchase, and flags e-transfers that may really be spending.
 */
import { catOf, merchantKey } from './compute';
import { JOINT_TOPUP } from './defaults';
import type { Doc, Tx } from './types';

const LOOKS_LIKE_TRANSFER = /payment|pymt|thank you|transfer|tfr|xfer|e-?transfer|interac|online banking|internet banking|mb-|from chq|to chq|to sav|from sav|wealthsimple|questrade|deposit/i;
const CARD = /visa|mastercard|master card|amex|american express|credit card|card payment|payment.*thank|pymt/i;
const E_TRANSFER = /e-?transfer|interac|send money|request money|etfr|e-tfr/i;
const DAY = 86400000;

type Located = Tx & { month: string };

const all = (doc: Doc): Located[] => Object.entries(doc.months).flatMap(([month, m]) => (m?.tx ?? []).map(t => ({ ...t, month })));
/** Which account a transaction belongs to: the statement's account, or else its payer and file. */
const accountOf = (t: Tx) => t.account ?? `${t.paidBy}|${t.source}`;
const isTransferish = (doc: Doc, t: Tx) => catOf(doc, t.category).kind === 'transfer' || LOOKS_LIKE_TRANSFER.test(t.desc);

export interface Pair { out: Located; in: Located }

/**
 * Pairs money leaving one account with the same amount arriving in another of the couple's
 * accounts within four days. Closest dates pair first.
 */
export function matchTransfers(doc: Doc): Pair[] {
  const tx = all(doc).filter(t => !t.exclude && t.amount !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && catOf(doc, t.category).kind !== 'savings');
  const outs = tx.filter(t => t.amount > 0 && isTransferish(doc, t));
  const ins = tx.filter(t => t.amount < 0);
  const candidates: { o: Located; i: Located; gap: number }[] = [];
  for (const o of outs) {
    for (const i of ins) {
      if (Math.abs(o.amount + i.amount) > 0.01 || accountOf(o) === accountOf(i)) continue;
      const gap = Math.abs(new Date(`${o.date}T12:00`).getTime() - new Date(`${i.date}T12:00`).getTime()) / DAY;
      if (gap > 4) continue;
      // A deposit only counts as the other side if it looks like a transfer too, or is labelled as one.
      if (!isTransferish(doc, i) && catOf(doc, i.category).kind === 'income' && !CARD.test(o.desc)) continue;
      candidates.push({ o, i, gap });
    }
  }
  candidates.sort((a, b) => a.gap - b.gap);
  const used = new Set<string>();
  const pairs: Pair[] = [];
  for (const c of candidates) {
    if (used.has(c.o.id) || used.has(c.i.id)) continue;
    used.add(c.o.id);
    used.add(c.i.id);
    pairs.push({ out: c.o, in: c.i });
  }
  return pairs;
}

/** The category both sides of a pair should have. */
function pairCategory(doc: Doc, p: Pair) {
  if (p.in.paidBy === 'joint' && p.out.paidBy !== 'joint') return JOINT_TOPUP;
  return 'Transfer';
}

/**
 * Relabels matched pairs whose sides were labelled as spending or income, so they leave the totals.
 * Returns how many transactions changed. Mutates the draft document.
 */
export function reconcileTransfers(d: Doc): number {
  let changed = 0;
  for (const p of matchTransfers(d)) {
    const cat = pairCategory(d, p);
    for (const side of [p.out, p.in]) {
      const t = d.months[side.month]?.tx.find(x => x.id === side.id);
      if (!t || t.ok) continue;
      const kind = catOf(d, t.category).kind;
      if (kind === 'transfer' && !(cat === JOINT_TOPUP && t.category === 'Transfer')) continue;
      t.category = cat;
      t.owner = cat === JOINT_TOPUP ? 'shared' : t.paidBy === 'joint' ? 'shared' : t.paidBy;
      changed++;
    }
  }
  return changed;
}

/** True when an unmatched transfer still deserves a look: e-transfers and ones that do not read like a card payment. */
const needsLook = (doc: Doc, t: Tx) =>
  !t.ok && catOf(doc, t.category).kind === 'transfer' && !t.exclude &&
  (E_TRANSFER.test(t.desc) || !(CARD.test(t.desc) || /transfer|tfr|xfer|to sav|from sav|to chq|from chq/i.test(t.desc))) &&
  !(t.category === JOINT_TOPUP && !doc.months[t.date.slice(0, 7)]?.tx.some(x => x.paidBy === 'joint'));

export interface TransferSummary {
  pairs: Pair[];
  toCheck: Tx[];
  /** Total of transfers left out of spending this month (money leaving accounts). */
  excluded: number;
  count: number;
}

export function transferSummary(doc: Doc, month: string): TransferSummary {
  const pairs = matchTransfers(doc).filter(p => p.out.month === month || p.in.month === month);
  const paired = new Set(pairs.flatMap(p => [p.out.id, p.in.id]));
  const tx = doc.months[month]?.tx ?? [];
  const transfers = tx.filter(t => !t.exclude && catOf(doc, t.category).kind === 'transfer');
  return {
    pairs,
    toCheck: transfers.filter(t => !paired.has(t.id) && needsLook(doc, t)),
    excluded: transfers.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    count: transfers.length,
  };
}

/** Remembers an answer for a payee, so future statements are labelled the same way. */
export function rememberPayee(d: Doc, t: Tx, category: string) {
  // E-transfers all start the same way, so the payee's name has to be part of the match.
  const words = t.desc.toUpperCase().replace(/[^A-Z& ]/g, ' ').replace(/\s+/g, ' ').trim();
  const match = E_TRANSFER.test(t.desc) ? words.split(' ').slice(0, 8).join(' ') : merchantKey(t.desc);
  if (!match || match.length < 4) return;
  d.rules = [...d.rules.filter(r => r.match !== match), { match, category, owner: catOf(d, category).scope === 'shared' ? 'shared' : 'personal' }];
}
