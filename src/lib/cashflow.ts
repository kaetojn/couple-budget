/** Money in against money out for a month, and what a rented property nets after its own costs. */
import { catOf, computeMonth } from './compute';
import { RENTAL } from './defaults';
import { billPayment, planOf } from './plan';
import type { Doc } from './types';

const PROPERTY = /mortgage|condo|strata|property tax|hoa|landlord insurance|rental insurance/i;

export interface Cashflow {
  pay: number;
  rental: number;
  other: number;
  earned: number;
  spent: number;
  saved: number;
  left: number;
  /** What the plan expects to come in, for months whose deposits are not uploaded. */
  expected: number;
  /** True when no income shows in this month's statements. */
  fromPlan: boolean;
  property: null | { rent: number; costs: number; net: number; costNames: string[]; fromPlan: boolean };
}

export function cashflow(doc: Doc, month: string): Cashflow {
  const tx = (doc.months[month]?.tx ?? []).filter(t => !t.exclude);
  let pay = 0, rental = 0, other = 0, saved = 0, propertyCosts = 0;
  const costNames = new Set<string>();
  for (const t of tx) {
    const cat = catOf(doc, t.category);
    if (cat.kind === 'income' && t.amount < 0) {
      if (cat.name === RENTAL) rental -= t.amount;
      else if (cat.name === 'Income') pay -= t.amount;
      else other -= t.amount;
    }
    if (cat.kind === 'savings' && t.amount > 0) saved += t.amount;
    if (cat.kind === 'expense' && t.amount > 0 && PROPERTY.test(cat.name)) { propertyCosts += t.amount; costNames.add(cat.name); }
  }
  const spent = computeMonth(doc, doc.months[month]?.tx ?? []).total;
  const expected = planOf(doc, month).income;
  const earned = pay + rental + other;
  const fromPlan = earned <= 0;
  const income = fromPlan ? expected : earned;

  const rentalPlanned = (doc.settings.otherIncome ?? []).filter(x => x.kind === 'rental').reduce((a, x) => a + (+x.amount || 0), 0);
  let property: Cashflow['property'] = null;
  if (rental > 0 || rentalPlanned > 0) {
    const plannedCosts = doc.bills.filter(b => b.kind !== 'debt' && PROPERTY.test(b.name));
    const useActual = rental > 0;
    const costs = useActual && propertyCosts > 0 ? propertyCosts : plannedCosts.reduce((a, b) => a + billPayment(b, month), 0);
    const names = useActual && propertyCosts > 0 ? [...costNames] : plannedCosts.map(b => b.name);
    const rent = useActual ? rental : rentalPlanned;
    property = { rent, costs, net: rent - costs, costNames: names, fromPlan: !useActual };
  }
  return { pay, rental, other, earned, spent, saved, left: income - spent - saved, expected, fromPlan, property };
}
