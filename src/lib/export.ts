import { computeMonth, who } from './compute';
import { sharedCheck, sharedSummary } from './shared';
import { monthLabel } from './format';
import type { Doc } from './types';

/** Stops spreadsheet apps from treating text as a formula. */
const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

export function sheetRows(doc: Doc, month: string) {
  const tx = doc.months[month]?.tx ?? [];
  const r = computeMonth(doc, tx);
  const rows: unknown[][] = [];
  const boldRows: number[] = [];
  const head = (...cells: unknown[]) => { boldRows.push(rows.length); rows.push(cells); };
  const n = (v: number) => +v.toFixed(2);

  head('Budget summary', monthLabel(month));
  rows.push([]);
  head('Category', 'Belongs to', 'Budget', 'Actual', 'Remaining');
  for (const c of doc.categories.filter(c => c.kind === 'expense' && (c.budget || r.byCat[c.name]))) {
    rows.push([c.name, who(doc, c.scope), +c.budget || 0, n(r.byCat[c.name] || 0), n((+c.budget || 0) - (r.byCat[c.name] || 0))]);
  }
  head('Total', '', r.budget, n(r.total), n(r.budget - r.total));
  rows.push([]);
  head('Split');
  rows.push(
    ['Shared spending', n(r.shared)],
    [`${who(doc, 'p1')} personal`, n(r.pers.p1)],
    [`${who(doc, 'p2')} personal`, n(r.pers.p2)],
    ['Shared costs check', sharedSummary(doc, sharedCheck(doc, month))],
    [`${who(doc, 'p1')} joint savings`, n(r.sav.p1), 'target', +doc.settings.sav1],
    [`${who(doc, 'p2')} joint savings`, n(r.sav.p2), 'target', +doc.settings.sav2],
  );
  const c = doc.months[month]?.checkup;
  if (c) {
    rows.push([]);
    head('Check-up');
    rows.push([c.headline], ...[...c.wins, ...c.watch, ...c.actions].map(x => [x]));
  }
  rows.push([]);
  head('Transactions');
  head('Date', 'Description', 'Amount', 'Category', 'Belongs to', 'Paid from', 'Statement', 'Counted');
  for (const t of tx) rows.push([t.date, t.desc, t.amount, t.category, who(doc, t.owner), who(doc, t.paidBy), t.source, t.exclude ? 'no' : 'yes']);
  return { tabName: monthLabel(month), rows: rows.map(row => row.map(safe)), boldRows };
}

const cell = (v: unknown) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** The same summary as the Google Sheet tab, as a CSV file any spreadsheet app opens. */
export function downloadCsv(doc: Doc, month: string) {
  const { rows } = sheetRows(doc, month);
  const text = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `couple-budget-${month}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
