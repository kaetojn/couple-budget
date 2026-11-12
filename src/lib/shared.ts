/**
 * The shared costs check. It replaces a "who owes whom" settle-up with two questions:
 * did each partner put in their share of the shared costs, and did anyone pay for a category
 * that belongs to the other? Nothing here says one partner owes the other; gaps are closed
 * through the joint account.
 */
import { catOf, who } from './compute';
import { JOINT_TOPUP } from './defaults';
import { money0 } from './format';
import type { Doc, Payer, PersonId, Tx } from './types';

const isGift = (name: string) => /gift/i.test(name);

export interface Share {
  /** Their part of this month's shared costs, from the split. */
  fair: number;
  /** Shared costs they paid from their own account. */
  direct: number;
  /** Money they moved into the joint account. */
  toppedUp: number;
  /** Positive when they put in less than their part. */
  gap: number;
}

export interface CrossPay {
  key: string;
  category: string;
  icon: string;
  color: string;
  /** Whose category it is. */
  owner: PersonId;
  /** Whose account it came out of. */
  payer: Payer;
  amount: number;
  tx: Tx[];
}

export interface SharedCheck {
  applies: boolean;
  total: number;
  jointSeen: boolean;
  people: Record<PersonId, Share>;
  cross: CrossPay[];
  /** The partner furthest behind on their share, if anyone is. */
  short: PersonId | null;
  issues: number;
}

const PEOPLE: PersonId[] = ['p1', 'p2'];

export function sharedCheck(doc: Doc, month: string): SharedCheck {
  const tx = (doc.months[month]?.tx ?? []).filter(t => !t.exclude);
  const share = { p1: doc.settings.split / 100, p2: 1 - doc.settings.split / 100 };
  const people: Record<PersonId, Share> = { p1: { fair: 0, direct: 0, toppedUp: 0, gap: 0 }, p2: { fair: 0, direct: 0, toppedUp: 0, gap: 0 } };
  let visible = 0;
  const jointSeen = tx.some(t => t.paidBy === 'joint');
  const groups = new Map<string, CrossPay>();

  for (const t of tx) {
    const cat = catOf(doc, t.category);
    if (cat.name === JOINT_TOPUP && t.paidBy !== 'joint' && t.amount > 0) people[t.paidBy].toppedUp += t.amount;
    if (cat.kind !== 'expense' || t.amount <= 0 || isGift(cat.name)) continue;
    if (t.owner === 'shared') {
      visible += t.amount;
      if (t.paidBy !== 'joint') people[t.paidBy].direct += t.amount;
    } else if (t.paidBy !== t.owner && !t.ok) {
      const key = `${cat.name}|${t.owner}|${t.paidBy}`;
      const g = groups.get(key) ?? { key, category: cat.name, icon: cat.icon, color: cat.color, owner: t.owner, payer: t.paidBy, amount: 0, tx: [] };
      g.amount += t.amount;
      g.tx.push(t);
      groups.set(key, g);
    }
  }

  // Without the joint account's statement, what the top-ups paid for is not visible,
  // so the top-ups stand in for those shared costs.
  const toppedUp = people.p1.toppedUp + people.p2.toppedUp;
  const total = visible + (jointSeen ? 0 : toppedUp);
  for (const p of PEOPLE) {
    const s = people[p];
    s.fair = total * share[p];
    s.gap = s.fair - s.direct - s.toppedUp;
  }
  const tolerance = Math.max(5, total * 0.01);
  const behind = PEOPLE.filter(p => people[p].gap > tolerance).sort((a, b) => people[b].gap - people[a].gap);
  const cross = [...groups.values()].filter(g => g.amount >= 1).sort((a, b) => b.amount - a.amount);
  const applies = doc.settings.arrangement !== 'joint' && tx.length > 0;
  return { applies, total, jointSeen, people, cross, short: behind[0] ?? null, issues: applies ? behind.length + cross.length : 0 };
}

const from = (doc: Doc, p: Payer) => (p === 'joint' ? 'the joint account' : `${who(doc, p)}'s account`);

/** One line for the home page card. */
export function sharedSummary(doc: Doc, c: SharedCheck): string {
  if (!c.applies) return doc.settings.arrangement === 'joint' ? 'Everything comes from one joint account.' : 'Shows once statements are added.';
  if (!c.issues) return 'Each of you put in your share, and every category was paid by the right person.';
  const parts: string[] = [];
  if (c.short) parts.push(`${who(doc, c.short)}'s share is ${money0(c.people[c.short].gap)} behind`);
  if (c.cross.length) parts.push(`${c.cross.length} categor${c.cross.length > 1 ? 'ies were' : 'y was'} paid by the other person`);
  return `${parts.join(', and ')}.`;
}

/** Plain explanation of a category paid from the wrong account, and what can be done about it. */
export function crossText(doc: Doc, g: CrossPay) {
  return {
    what: `${money0(g.amount)} of ${g.category} came out of ${from(doc, g.payer)}. ${g.category} is ${who(doc, g.owner)}'s.`,
    fix: `${who(doc, g.owner)} can move ${money0(g.amount)} into the joint account to make up for it.`,
  };
}

/** Plain explanation of a partner who put in less than their share. */
export function shortText(doc: Doc, c: SharedCheck, p: PersonId) {
  const s = c.people[p];
  return `${who(doc, p)}'s part of ${money0(c.total)} in shared costs is ${money0(s.fair)}. ${who(doc, p)} paid ${money0(s.direct)} directly and moved ${money0(s.toppedUp)} into the joint account, ${money0(s.gap)} short.`;
}
