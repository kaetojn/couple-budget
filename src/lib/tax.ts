/**
 * Take-home pay estimates from a yearly salary.
 *
 * Figures are for the 2026 tax year, from the CRA's payroll deductions formulas (T4127, January 2026).
 * Update the TAX table once a year. This is an estimate for planning: it leaves out pension plans,
 * benefits, union dues, RRSP deductions and other credits, so a real pay stub can differ.
 */

export type Region = 'ON' | 'BC' | 'AB' | 'QC' | 'MB' | 'SK' | 'NS' | 'NB' | 'NL' | 'PE' | 'YT' | 'NT' | 'NU';

export const TAX_YEAR = 2026;

/** Provinces and territories, and whether the estimate supports them yet. */
export const REGIONS: { value: Region; label: string; supported: boolean }[] = [
  { value: 'ON', label: 'Ontario', supported: true },
  { value: 'BC', label: 'British Columbia', supported: false },
  { value: 'AB', label: 'Alberta', supported: false },
  { value: 'QC', label: 'Quebec', supported: false },
  { value: 'MB', label: 'Manitoba', supported: false },
  { value: 'SK', label: 'Saskatchewan', supported: false },
  { value: 'NS', label: 'Nova Scotia', supported: false },
  { value: 'NB', label: 'New Brunswick', supported: false },
  { value: 'NL', label: 'Newfoundland and Labrador', supported: false },
  { value: 'PE', label: 'Prince Edward Island', supported: false },
  { value: 'YT', label: 'Yukon', supported: false },
  { value: 'NT', label: 'Northwest Territories', supported: false },
  { value: 'NU', label: 'Nunavut', supported: false },
];
export const isSupported = (r: Region) => REGIONS.some(x => x.value === r && x.supported);

type Brackets = [upTo: number, rate: number][];

const TAX = {
  federal: {
    brackets: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]] as Brackets,
    lowRate: 0.14,
    bpaMax: 16452,
    bpaMin: 14829,
    bpaPhaseFrom: 181440,
    bpaPhaseTo: 258482,
    employmentAmount: 1501,
  },
  cpp: { ympe: 74600, yampe: 85000, exemption: 3500, rate: 0.0595, baseRate: 0.0495, cpp2Rate: 0.04 },
  ei: { maxInsurable: 68900, rate: 0.0163 },
  ON: {
    brackets: [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [Infinity, 0.1316]] as Brackets,
    lowRate: 0.0505,
    bpa: 12989,
    surtax: [[5818, 0.2], [7446, 0.36]] as [number, number][],
    reductionBase: 300,
  },
};

const bracketTax = (income: number, brackets: Brackets) => {
  let tax = 0;
  let floor = 0;
  for (const [upTo, rate] of brackets) {
    if (income <= floor) break;
    tax += (Math.min(income, upTo) - floor) * rate;
    floor = upTo;
  }
  return tax;
};

/** Ontario Health Premium, a fixed scale on taxable income that is not indexed. */
function healthPremium(income: number) {
  const steps: [from: number, base: number, rate: number, cap: number][] = [
    [200000, 750, 0.25, 900],
    [72000, 600, 0.25, 750],
    [48000, 450, 0.25, 600],
    [36000, 300, 0.06, 450],
    [20000, 0, 0.06, 300],
  ];
  for (const [from, base, rate, cap] of steps) if (income > from) return Math.min(cap, base + (income - from) * rate);
  return 0;
}

export interface TakeHome {
  gross: number;
  cpp: number;
  ei: number;
  federal: number;
  provincial: number;
  health: number;
  /** Yearly take-home. */
  net: number;
  monthly: number;
}

/** Yearly take-home from a yearly salary for an employee in a supported province. */
export function takeHome(gross: number, region: Region = 'ON'): TakeHome | null {
  if (!(gross > 0) || region !== 'ON') return null;
  const { federal: F, cpp: C, ei: E, ON } = TAX;

  const cpp1 = Math.max(0, Math.min(gross, C.ympe) - C.exemption) * C.rate;
  const cpp2 = Math.max(0, Math.min(gross, C.yampe) - C.ympe) * C.cpp2Rate;
  const cppBase = (cpp1 * C.baseRate) / C.rate;
  const ei = Math.min(gross, E.maxInsurable) * E.rate;
  // The enhanced part of CPP and all of CPP2 are deducted from income; the base part is a credit.
  const taxable = gross - (cpp1 - cppBase) - cpp2;

  const bpa = taxable <= F.bpaPhaseFrom ? F.bpaMax
    : taxable >= F.bpaPhaseTo ? F.bpaMin
    : F.bpaMax - ((F.bpaMax - F.bpaMin) * (taxable - F.bpaPhaseFrom)) / (F.bpaPhaseTo - F.bpaPhaseFrom);
  const fedCredits = F.lowRate * (bpa + cppBase + ei + Math.min(gross, F.employmentAmount));
  const federal = Math.max(0, bracketTax(taxable, F.brackets) - fedCredits);

  const basic = Math.max(0, bracketTax(taxable, ON.brackets) - ON.lowRate * (ON.bpa + cppBase + ei));
  const surtax = ON.surtax.reduce((a, [over, rate]) => a + Math.max(0, basic - over) * rate, 0);
  const beforeReduction = basic + surtax;
  const reduction = Math.max(0, 2 * ON.reductionBase - beforeReduction);
  const provincial = Math.max(0, beforeReduction - reduction);
  const health = healthPremium(taxable);

  const cpp = cpp1 + cpp2;
  const net = gross - cpp - ei - federal - provincial - health;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { gross, cpp: r(cpp), ei: r(ei), federal: r(federal), provincial: r(provincial), health: r(health), net: r(net), monthly: r(net / 12) };
}
