import { useAtom, useAtomValue } from 'jotai';
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { LuFiles, LuArrowLeftRight, LuArrowRight, LuChevronDown, LuChevronRight, LuCircleCheck, LuFileText, LuImage, LuLoaderCircle, LuRepeat, LuSearch, LuDownload, LuSheet, LuTrash2, LuTriangleAlert, LuUpload, LuX } from 'react-icons/lu';
import type { Go } from '@/App';
import { SplitBar } from '@/components/charts/charts';
import { IconTile } from '@/components/icons';
import { CategoryPicker, MonthSwitcher } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Card, Empty, Field, SectionTitle } from '@/components/ui/card';
import { Segmented, Select, Switch, TextInput } from '@/components/ui/controls';
import { Avatar, Count, PERSON_COLOR, useName, useOwnerOptions } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { extractStatement, isImage, type StatementAccount } from '@/lib/ai';
import { upsertAccount } from '@/lib/accounts';
import { coverage, detectRecurring, fileByDate } from '@/lib/detect';
import { coveredByBill } from '@/lib/plan';
import { cashflow } from '@/lib/cashflow';
import { reconcileTransfers, rememberPayee, transferSummary } from '@/lib/transfers';
import { accountLabel } from '@/lib/accounts';
import { PayPrompts } from './Findings';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { catOf, merchantKey, ownerFor, spendByDay, who } from '@/lib/compute';
import { dayLabel, dayOf, money, money0, monthKey, monthLabel, parseMonth } from '@/lib/format';
import { downloadCsv, sheetRows } from '@/lib/export';
import { useLast } from '@/lib/hooks';
import { accountAtom, docAtom, importAtom, monthAtom, sessionAtom, snapshotNetWorth, toast, updateDoc } from '@/lib/store';
import type { Category, Doc, Owner, Payer, Tx } from '@/lib/types';

type OwnerFilter = 'all' | Owner;

const isSpend = (doc: Doc, t: Tx) => !t.exclude && catOf(doc, t.category).kind === 'expense';
const shortMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : money0(n));

export function Month({ go }: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const recurring = useMemo(() => detectRecurring(doc).length, [doc]);
  const month = useAtomValue(monthAtom);
  const { passcode, demo } = useAtomValue(sessionAtom);
  // A picked day belongs to the month it was picked in, so changing month clears it.
  const [dayPick, setDayPick] = useState<{ month: string; day: number } | null>(null);
  const day = dayPick?.month === month ? dayPick.day : null;
  const setDay = (d: number | null) => setDayPick(d === null ? null : { month, day: d });
  const [owner, setOwner] = useState<OwnerFilter>('all');
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [editing, setEditing] = useState<Tx | null>(null);
  const shown = useLast(editing);
  const [importing, setImporting] = useAtom(importAtom);
  const [managing, setManaging] = useState(false);
  const gaps = useMemo(() => coverage(doc, month).filter(c => c.gap).length, [doc, month]);
  const [exporting, setExporting] = useState(false);
  const account = useAtomValue(accountAtom);
  const tx = doc.months[month]?.tx ?? [];
  const ownerOptions = [{ value: 'all' as const, label: 'All' }, ...useOwnerOptions<Owner>(['shared', 'p1', 'p2'])];

  // Slide the month's content in from the side the person is moving toward.
  const slide = useRef({ month, dir: 0 });
  if (slide.current.month !== month) slide.current = { month, dir: month > slide.current.month ? 1 : -1 };
  const { dir } = slide.current;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tx.filter(t =>
      (day === null || dayOf(t.date) === day) &&
      (owner === 'all' || t.owner === owner) &&
      (!q || t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || String(Math.abs(t.amount)).includes(q)),
    );
  }, [tx, day, owner, search]);

  const groups = useMemo(() => {
    const by = new Map<string, Tx[]>();
    for (const t of filtered) {
      const list = by.get(t.date);
      if (list) list.push(t); else by.set(t.date, [t]);
    }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => ({ date, items, spent: items.reduce((a, t) => a + (isSpend(doc, t) ? t.amount : 0), 0) }));
  }, [filtered, doc]);

  const totals = useMemo(() => {
    const split = { p1: 0, p2: 0, shared: 0 };
    let count = 0;
    for (const t of filtered) {
      if (!isSpend(doc, t)) continue;
      split[t.owner] += t.amount;
      count++;
    }
    return { spent: split.p1 + split.p2 + split.shared, split, count };
  }, [filtered, doc]);

  const narrowed = day !== null || owner !== 'all' || search.trim() !== '';
  const clearFilters = () => { setDay(null); setOwner('all'); setQuery(''); };

  const [exportOpen, setExportOpen] = useState(false);
  function exportCsv() {
    downloadCsv(doc, month);
    setExportOpen(false);
    toast(`Downloaded ${monthLabel(month)} as a CSV file`);
  }
  async function exportSheet() {
    setExportOpen(false);
    setExporting(true);
    try {
      const res = await api.sheet(passcode, sheetRows(doc, month));
      if (!res.ok) throw new Error(res.error || 'Google Sheets did not accept the data');
      toast(`Added the tab "${res.tab}" to your Google Sheet`);
    } catch (e) {
      toast(`Export failed. ${(e as Error).message}`);
    }
    setExporting(false);
  }

  return (
    <div className="stagger grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher />
        <div className="flex w-full gap-2 sm:w-auto">
          {tx.length > 0 && <Button onClick={() => (!demo && account?.sheets ? setExportOpen(true) : exportCsv())} busy={exporting} aria-label="Export this month" className="shrink-0"><LuDownload /><span className="hidden sm:inline">Export</span></Button>}
          {tx.length > 0 && !demo && (
            <Button onClick={() => setManaging(true)} className="relative flex-1 whitespace-nowrap sm:flex-none">
              <LuFiles /><span className="sm:hidden">Statements</span><span className="hidden sm:inline">Manage statements</span>
              {gaps > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-warn text-[11px] font-bold text-white" aria-label={`${gaps} gaps in coverage`}>{gaps}</span>}
            </Button>
          )}
          <Button variant="primary" onClick={() => setImporting(true)} className="flex-1 whitespace-nowrap sm:flex-none"><LuUpload /><span className="sm:hidden">Upload</span><span className="hidden sm:inline">Add statements</span></Button>
        </div>
      </div>

      <PayPrompts />
      {recurring > 0 && (
        <button onClick={() => go('plan')} className="flex animate-rise items-center gap-3 rounded-2xl bg-[#0fa3a3]/10 p-3 text-left text-sm transition hover:bg-[#0fa3a3]/15">
          <LuRepeat className="shrink-0 text-lg text-[#0b7f7f]" aria-hidden />
          <span className="flex-1"><strong>{recurring} repeating payment{recurring > 1 ? 's' : ''}</strong> found in your statements. Add them to the checklist in Plan.</span>
          <LuArrowRight className="shrink-0 text-muted" aria-hidden />
        </button>
      )}

      <div key={month} className={cn('grid gap-5', dir > 0 && 'animate-slide-in', dir < 0 && 'animate-slide-back')}>
        {!tx.length ? (
          <Empty title={`Nothing in ${monthLabel(month)} yet`} text="Upload statements for each of you. Every transaction is read, categorized and marked shared or personal." />
        ) : (
          <>
            <Summary month={month} totals={totals} day={day} owner={owner} search={search.trim()} narrowed={narrowed} onClear={clearFilters} />
            <TransfersLine month={month} />
            <Calendar doc={doc} tx={tx} month={month} day={day} onDay={setDay} />

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="relative">
                <LuSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <TextInput type="search" className="pl-10" placeholder="Search merchants, categories or amounts" aria-label="Search transactions" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <Segmented value={owner} onChange={setOwner} options={ownerOptions} size="sm" className="md:w-96" />
            </div>

            {groups.length ? (
              <Card className="overflow-hidden p-0">
                {groups.map(g => (
                  <section key={g.date} className="border-t border-line [contain-intrinsic-size:auto_240px] [content-visibility:auto] first:border-t-0">
                    <h2 className="flex items-center justify-between gap-3 bg-canvas/70 px-4 py-2 text-[13px] font-semibold text-muted">
                      <span>{dayLabel(g.date)}</span>
                      {g.spent > 0 && <span className="num">{money(g.spent)}</span>}
                    </h2>
                    <div className="divide-y divide-line">
                      {g.items.map(t => <TxRow key={t.id} t={t} cat={catOf(doc, t.category)} onOpen={setEditing} />)}
                    </div>
                  </section>
                ))}
              </Card>
            ) : (
              <div className="grid justify-items-center gap-3 py-8 text-center">
                <p className="text-muted">No transactions match.</p>
                <Button variant="soft" onClick={clearFilters}>Clear filters</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title={`Export ${monthLabel(month)}`}>
        <div className="grid gap-2">
          <Button onClick={exportSheet}><LuSheet />Add a tab to our Google Sheet</Button>
          <Button onClick={exportCsv}><LuDownload />Download a CSV file</Button>
          <p className="text-[13px] text-muted">A CSV opens in Excel, Numbers or Google Sheets.</p>
        </div>
      </Sheet>
      <Sheet open={managing} onClose={() => setManaging(false)} title={`Statements, ${monthLabel(month)}`}>
        <Statements month={month} />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Transaction">
        {shown && <TxEditor key={shown.id} tx={shown} month={month} onDone={() => setEditing(null)} />}
      </Sheet>
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

/** The month's one number: what was spent, and how it splits between the two of you and shared. It follows the filters. */
function Summary({ month, totals, day, owner, search, narrowed, onClear }: { month: string; totals: { spent: number; split: Record<Owner, number>; count: number }; day: number | null; owner: OwnerFilter; search: string; narrowed: boolean; onClear: () => void }) {
  const doc = useAtomValue(docAtom);
  const parts = [day !== null && dayLabel(`${month}-${String(day).padStart(2, '0')}`), owner !== 'all' && who(doc, owner), search && `“${search}”`].filter(Boolean);
  const order: Owner[] = ['p1', 'shared', 'p2'];
  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-muted">{parts.length ? `Spent · ${parts.join(' · ')}` : `Spent in ${monthLabel(month, 'short')}`}</p>
          <Count value={totals.spent} format={money} className="display block text-[44px] font-bold leading-none md:text-[52px]" />
        </div>
        <div className="flex items-center gap-3">
          <p className="num text-right text-sm text-muted">{totals.count} {totals.count === 1 ? 'purchase' : 'purchases'}</p>
          {narrowed && <Button size="sm" variant="soft" onClick={onClear}><LuX aria-hidden />Clear</Button>}
        </div>
      </div>
      {totals.spent > 0 && (
        <>
          <SplitBar height={10} parts={order.map(id => ({ label: who(doc, id), value: totals.split[id], color: PERSON_COLOR[id] }))} />
          <ul className="grid grid-cols-3 gap-2">
            {order.map((id, i) => (
              <li key={id} className={cn('grid gap-0.5', i === 1 && 'justify-items-center text-center', i === 2 && 'justify-items-end text-right')}>
                <span className={cn('flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-muted', i === 2 && 'flex-row-reverse')}>
                  <Avatar id={id} size={18} />
                  <span className="truncate">{who(doc, id)}</span>
                </span>
                <span className="num font-semibold">{money0(totals.split[id])}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!narrowed && <MoneyInOut month={month} />}
    </Card>
  );
}

/** Day colours, from no spending to a big day. Each pairs a soft fill with dark text for contrast. */
const DAY_TONES = [
  { key: 'none', fill: 'rgb(15 23 42 / 0.03)', label: 'Nothing' },
  { key: 'light', fill: '#dff3e8', label: 'Light' },
  { key: 'normal', fill: '#b5e3c9', label: 'About normal' },
  { key: 'over', fill: '#fbdfae', label: 'Over' },
  { key: 'big', fill: '#f7b9bd', label: 'Big day' },
] as const;

/** Everyday spending by day, coloured against the everyday budget per day, with a dot on days a bill was paid. */
function Calendar({ doc, tx, month, day, onDay }: { doc: Doc; tx: Tx[]; month: string; day: number | null; onDay: (d: number | null) => void }) {
  const [expanded, setExpanded] = useState(false);
  // Fixed bills (rent, insurance) would turn their day red every month, so the colours follow everyday spending.
  const everydayTx = useMemo(() => tx.filter(t => !coveredByBill(doc, catOf(doc, t.category).name)), [doc, tx]);
  const days = useMemo(() => spendByDay(doc, everydayTx, month), [doc, everydayTx, month]);
  const billDays = useMemo(() => new Set(tx.filter(t => t.amount > 0 && !t.exclude && coveredByBill(doc, catOf(doc, t.category).name) && t.date.startsWith(month)).map(t => dayOf(t.date))), [doc, tx, month]);
  const perDay = useMemo(() => {
    const budget = doc.categories.filter(c => c.kind === 'expense' && !coveredByBill(doc, c.name)).reduce((s, c) => s + (+c.budget || 0), 0);
    if (budget > 0) return budget / days.length;
    const spent = days.filter(v => v > 0).sort((x, y) => x - y);
    return spent[Math.floor(spent.length / 2)] ?? 50;
  }, [doc, days]);
  const tone = (v: number) => (v <= 0 ? 0 : v <= perDay * 0.5 ? 1 : v <= perDay * 1.25 ? 2 : v <= perDay * 2.5 ? 3 : 4);
  const offset = parseMonth(month).getDay();
  const today = monthKey() === month ? new Date().getDate() : null;
  const weekOf = (d: number) => Math.floor((offset + d - 1) / 7);
  const lastSpend = days.reduce((a, v, i) => (v > 0 ? i + 1 : a), 1);
  const focusWeek = weekOf(day ?? today ?? lastSpend);
  const hide = (d: number) => !expanded && weekOf(d) !== focusWeek && 'max-md:hidden';

  return (
    <Card className="grid gap-3 p-3 md:p-4">
      <div className="grid grid-cols-7 gap-1 md:gap-1.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="pb-1 text-center text-[11px] font-semibold text-muted" aria-hidden>{d}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} className={cn(!expanded && focusWeek !== 0 && 'max-md:hidden')} />)}
        {days.map((v, i) => {
          const d = i + 1;
          const t = DAY_TONES[tone(v)];
          const on = day === d;
          const bill = billDays.has(d);
          return (
            <button
              key={i}
              onClick={() => onDay(on ? null : d)}
              aria-pressed={on}
              aria-current={today === d ? 'date' : undefined}
              aria-label={`${monthLabel(month, 'short')} ${d}${today === d ? ', today' : ''}: ${money(v)} everyday spending, ${t.label.toLowerCase()}${bill ? ', a bill was paid' : ''}`}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] font-semibold text-ink transition-[transform,box-shadow] duration-150 active:scale-95 md:aspect-auto md:h-14',
                on && 'ring-2 ring-ink ring-offset-2',
                hide(d),
              )}
              style={{ backgroundColor: t.fill }}
            >
              <span className={cn(today === d && 'underline decoration-2 underline-offset-[3px]')}>{d}</span>
              {v > 0 && <span className="num text-[11px] font-medium leading-none">{shortMoney(v)}</span>}
              {bill && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="grid gap-1.5 border-t border-line pt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
          {DAY_TONES.slice(1).map(t => <span key={t.key} className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ backgroundColor: t.fill }} />{t.label}</span>)}
          {billDays.size > 0 && <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-brand" />Bill paid</span>}
        </div>
        <p className="text-[12px] text-muted">Compared with your everyday budget of about <strong className="num text-ink">{money0(perDay)}</strong> a day. Bills like rent are left out of the colours.</p>
      </div>
      <button onClick={() => setExpanded(x => !x)} aria-expanded={expanded} className="flex h-9 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-muted transition-colors active:bg-canvas md:hidden">
        {expanded ? 'Show one week' : 'Show the whole month'}
        <LuChevronDown className={cn('transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
      </button>
    </Card>
  );
}

const TxRow = memo(function TxRow({ t, cat, onOpen }: { t: Tx; cat: Category; onOpen: (t: Tx) => void }) {
  const ownerName = useName(t.owner);
  const quiet = t.exclude || cat.kind === 'transfer';
  return (
    <button onClick={() => onOpen(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand active:bg-canvas active:duration-0">
      <IconTile icon={cat.icon} color={cat.color} className={cn(quiet && 'grayscale')} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-semibold', quiet && 'text-muted')}>{t.desc}</span>
        <span className="block truncate text-[13px] text-muted">{t.exclude ? `${cat.name} · Not counted` : cat.name}</span>
      </span>
      <span className={cn('num font-semibold', quiet ? 'text-muted' : t.amount < 0 && 'text-good', t.exclude && 'line-through')}>{t.amount < 0 ? `+${money(-t.amount)}` : money(t.amount)}</span>
      <Avatar id={t.owner} />
      <span className="sr-only">, {ownerName}</span>
    </button>
  );
});

function TxEditor({ tx, month, onDone }: { tx: Tx; month: string; onDone: () => void }) {
  const doc = useAtomValue(docAtom);
  const [category, setCategory] = useState(tx.category);
  const [owner, setOwner] = useState<Owner>(tx.owner);
  const [autoOwner, setAutoOwner] = useState(0);
  const [counted, setCounted] = useState(!tx.exclude);
  const [remember, setRemember] = useState(doc.settings.remember);
  const owners = useOwnerOptions<Owner>(['shared', 'p1', 'p2']);
  const key = merchantKey(tx.desc);
  const others = useMemo(() => (doc.months[month]?.tx ?? []).filter(o => o.id !== tx.id && merchantKey(o.desc) === key).length, [doc, month, tx.id, key]);
  const changed = category !== tx.category || owner !== tx.owner;

  function pick(name: string) {
    setCategory(name);
    const next = ownerFor(catOf(doc, name), tx.paidBy);
    if (next !== owner) {
      setOwner(next);
      setAutoOwner(n => n + 1);
    }
  }

  function save() {
    let also = 0;
    updateDoc(d => {
      const list = d.months[month].tx;
      const t = list.find(x => x.id === tx.id);
      if (!t) return;
      Object.assign(t, { category, owner, exclude: !counted });
      d.settings.remember = remember;
      if (remember && key.length >= 3 && changed) {
        const rule = { match: key, category, owner: owner === 'shared' ? ('shared' as const) : ('personal' as const) };
        const i = d.rules.findIndex(r => r.match === key);
        if (i >= 0) d.rules[i] = rule; else d.rules.push(rule);
        for (const o of list) {
          if (o.id !== tx.id && merchantKey(o.desc) === key) {
            o.category = category;
            o.owner = owner === 'shared' ? 'shared' : o.paidBy === 'joint' ? 'shared' : o.paidBy;
            also++;
          }
        }
      }
    });
    toast(also ? `Saved, and applied to ${also} more from ${key}` : 'Saved');
    onDone();
  }

  function remove() {
    const list = doc.months[month]?.tx ?? [];
    const at = list.findIndex(x => x.id === tx.id);
    const removed = list[at];
    updateDoc(d => { d.months[month].tx = d.months[month].tx.filter(x => x.id !== tx.id); });
    toast(`Removed ${tx.desc}`, {
      label: 'Undo',
      run: () => updateDoc(d => {
        const now = d.months[month]?.tx;
        if (now && removed && !now.some(x => x.id === removed.id)) now.splice(Math.min(at, now.length), 0, removed);
      }),
    });
    onDone();
  }

  const rememberHint = !remember
    ? 'Only this transaction changes.'
    : changed && others > 0
      ? `Also updates ${others} other ${others === 1 ? 'transaction' : 'transactions'} from ${key} this month, and future statements.`
      : 'Future statements use the same category and owner.';

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-lg font-bold">{tx.desc}</p><p className="text-sm text-muted">{dayLabel(tx.date)} · paid from {who(doc, tx.paidBy)}</p></div>
        <p className={cn('display text-2xl font-bold', tx.amount < 0 && 'text-good')}>{tx.amount < 0 ? `+${money(-tx.amount)}` : money(tx.amount)}</p>
      </div>
      <Field label="Category"><CategoryPicker value={category} onChange={pick} /></Field>
      <Field label="Belongs to" hint={autoOwner > 0 && owner !== tx.owner ? `Changed to ${who(doc, owner)} to match ${category}.` : undefined}>
        <div key={autoOwner} className={cn('rounded-2xl', autoOwner > 0 && 'animate-flash')}>
          <Segmented value={owner} onChange={setOwner} options={owners} />
        </div>
      </Field>
      <label className="flex items-center justify-between gap-3"><span><span className="block font-semibold">Count it in the budget</span><span className="block text-[13px] text-muted">Turn off for refunds you were repaid or one-offs.</span></span><Switch checked={counted} onChange={setCounted} label="Count it in the budget" /></label>
      <label className="flex items-center justify-between gap-3"><span><span className="block font-semibold">Remember for {key || 'this merchant'}</span><span className={cn('block text-[13px]', remember && changed && others > 0 ? 'font-medium text-ink' : 'text-muted')}>{rememberHint}</span></span><Switch checked={remember} onChange={setRemember} label="Remember this correction" /></label>
      <div className="flex gap-3">
        <Button variant="danger" size="lg" aria-label="Delete transaction" onClick={remove}><LuTrash2 /></Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={save}>Save</Button>
      </div>
    </>
  );
}

interface Job { name: string; payer: Payer; files: File[]; shots: boolean; status: 'waiting' | 'reading' | 'done' | 'error'; note?: string }

/** One job per statement file, and one per batch of up to eight screenshots from the same person. */
function makeJobs(files: Record<Payer, File[]>, zones: Payer[]): Job[] {
  const jobs: Job[] = [];
  for (const payer of zones) {
    const shots = files[payer].filter(isImage);
    for (const f of files[payer].filter(f => !isImage(f))) jobs.push({ name: f.name, payer, files: [f], shots: false, status: 'waiting' });
    for (let i = 0; i < shots.length; i += 8) {
      const batch = shots.slice(i, i + 8);
      jobs.push({ name: `${batch.length} screenshot${batch.length > 1 ? 's' : ''}`, payer, files: batch, shots: true, status: 'waiting' });
    }
  }
  return jobs;
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useAtomValue(docAtom);
  const { passcode, demo } = useAtomValue(sessionAtom);
  const [month, setMonth] = useAtom(monthAtom);
  const [target, setTarget] = useState(month);
  const [files, setFiles] = useState<Record<Payer, File[]>>({ p1: [], p2: [], joint: [] });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const zones: Payer[] = doc.settings.arrangement === 'joint' ? ['joint', 'p1', 'p2'] : ['p1', 'p2', 'joint'];
  const count = files.p1.length + files.p2.length + files.joint.length;
  const reads = makeJobs(files, zones).length;

  async function analyze() {
    const state = makeJobs(files, zones);
    setJobs(state);
    setBusy(true);
    const found: Tx[] = [];
    const accounts: { account: StatementAccount | null; payer: Payer; tx: Tx[] }[] = [];
    const stamp = new Date().toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    for (let i = 0; i < state.length; i++) {
      const job = state[i];
      state[i] = { ...job, status: 'reading' };
      setJobs([...state]);
      try {
        const source = job.shots ? `Screenshots, ${stamp}` : job.files[0].name;
        const { tx, account } = await extractStatement(passcode, doc, job.files, job.payer, target, source);
        found.push(...tx);
        accounts.push({ account, payer: job.payer, tx });
        state[i] = { ...state[i], status: 'done', note: `${tx.length} transactions${job.shots ? ', may be part of the month' : ''}` };
      } catch (e) {
        state[i] = { ...state[i], status: 'error', note: (e as Error).message };
      }
      setJobs([...state]);
    }
    setBusy(false);
    if (!found.length) return;
    let filed: Record<string, { added: number; skipped: number }> = {};
    updateDoc(d => {
      for (const a of accounts) {
        const id = upsertAccount(d, a.account, a.payer);
        if (id) for (const t of a.tx) t.account = id;
      }
      if (accounts.some(a => a.account?.balance !== undefined)) snapshotNetWorth(d);
      filed = fileByDate(d, found, target);
      reconcileTransfers(d);
    });
    const months = Object.entries(filed).filter(([, v]) => v.added > 0);
    const skipped = Object.values(filed).reduce((n, v) => n + v.skipped, 0);
    // Land on the most recent month that got something.
    setMonth(months.map(([m]) => m).sort().pop() ?? target);
    const where = months.sort(([a], [b]) => b.localeCompare(a)).map(([m, v]) => `${v.added} to ${monthLabel(m)}`).join(', ');
    toast(`${where ? `Added ${where}` : 'Nothing new to add'}${skipped ? `. ${skipped} were already there` : ''}`);
    if (state.every(j => j.status === 'done')) { setFiles({ p1: [], p2: [], joint: [] }); setJobs([]); onClose(); }
  }

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="Add statements" footer={<Button variant="primary" size="lg" className="flex-1" busy={busy} disabled={!count || demo} onClick={analyze}>{busy ? 'Reading' : count ? `Read ${count} file${count > 1 ? 's' : ''}` : 'Choose files first'}</Button>}>
      {demo && <p className="rounded-2xl bg-brand-soft p-3 text-sm font-medium text-brand">Reading statements uses Claude, which is off in the sample household.</p>}
      <Field label="Mostly for" hint="Each transaction is filed under the month of its own date, so a statement that runs Sep 15 to Oct 14 lands in both. This month helps read dates printed without a year."><TextInput type="month" value={target} onChange={e => e.target.value && setTarget(e.target.value)} /></Field>
      <div className="grid gap-3">
        {zones.map(payer => (
          <div key={payer} className="rounded-2xl border border-line p-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[#b4bccd] p-3 transition-colors hover:border-brand hover:bg-brand-soft/50 active:bg-brand-soft">
              <Avatar id={payer} size={36} />
              <span className="flex-1"><span className="block font-semibold">{who(doc, payer)}</span><span className="block text-[13px] text-muted">PDF statements or banking app screenshots</span></span>
              <LuUpload className="text-xl text-muted" aria-hidden />
              <input type="file" multiple accept=".pdf,.csv,.txt,image/*" className="sr-only" onChange={e => { const add = [...(e.target.files ?? [])]; setFiles(f => ({ ...f, [payer]: [...f[payer], ...add] })); e.target.value = ''; }} />
            </label>
            {files[payer].map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-2 pt-2 text-sm">
                {isImage(f) ? <LuImage className="shrink-0 text-muted" aria-hidden /> : <LuFileText className="shrink-0 text-muted" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => setFiles(s => ({ ...s, [payer]: s[payer].filter((_, j) => j !== i) }))} className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5"><LuX /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {count > reads && <p className="text-[13px] text-muted">Screenshots from the same person are read together, so overlapping ones are only counted once. {count} files, {reads} read{reads > 1 ? 's' : ''}.</p>}
      {jobs.length > 0 && (
        <ul className="grid gap-2">
          {jobs.map((j, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              {j.status === 'reading' ? <LuLoaderCircle className="animate-spin text-brand" /> : j.status === 'done' ? <LuCircleCheck className="text-good" /> : j.status === 'error' ? <LuTriangleAlert className="text-bad" /> : <span className="size-3.5 rounded-full bg-line" />}
              <span className="min-w-0 flex-1 truncate font-medium">{j.name}</span>
              <span className={cn('text-right', j.status === 'error' ? 'font-semibold text-bad' : 'text-muted')}>{j.status === 'reading' ? 'Reading and categorizing' : j.status === 'waiting' ? 'Waiting' : j.note}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** The statements and screenshot batches uploaded for a month, with the days they cover. Each is removable, with Undo. */
function Statements({ month }: { month: string }) {
  const doc = useAtomValue(docAtom);
  const [sure, setSure] = useState(false);
  const tx = doc.months[month]?.tx ?? [];
  const short = (d: number) => `${parseMonth(month).toLocaleDateString('en-CA', { month: 'short' })} ${d}`;
  const sources = [...tx.reduce((m, t) => {
    const g = m.get(t.source) ?? { source: t.source, count: 0, out: 0, payers: new Set<Payer>(), from: 31, to: 1 };
    g.count++;
    if (t.amount > 0) g.out += t.amount;
    g.payers.add(t.paidBy);
    if (/^\d{4}-\d{2}-\d{2}$/.test(t.date)) { g.from = Math.min(g.from, dayOf(t.date)); g.to = Math.max(g.to, dayOf(t.date)); }
    return m.set(t.source, g);
  }, new Map<string, { source: string; count: number; out: number; payers: Set<Payer>; from: number; to: number }>()).values()];
  const gaps = coverage(doc, month).filter(c => c.gap);
  const elsewhere = (source: string) => Object.keys(doc.months).filter(m => m !== month && doc.months[m]?.tx?.some(t => t.source === source)).sort();

  /** Removes matching transactions from the given months and offers to put them back. */
  function remove(months: string[], which: (t: Tx) => boolean, message: string) {
    const removed = Object.fromEntries(months.map(m => [m, (doc.months[m]?.tx ?? []).filter(which)]));
    updateDoc(d => { for (const m of months) d.months[m] = { ...d.months[m], tx: (d.months[m]?.tx ?? []).filter(t => !which(t)) }; });
    setSure(false);
    toast(message, {
      label: 'Undo',
      run: () => updateDoc(d => { for (const m of months) d.months[m] = { ...d.months[m], tx: [...(d.months[m]?.tx ?? []), ...removed[m]].sort((a, b) => a.date.localeCompare(b.date)) }; }),
    });
  }

  return (
    <>
      {!sources.length && <p className="text-muted">No statements for {monthLabel(month)}.</p>}
      {gaps.length > 0 && (
        <div className="grid gap-1.5 rounded-2xl bg-warn/8 p-3 text-sm">
          {gaps.map(c => (
            <p key={c.key} className="flex gap-2"><LuTriangleAlert className="mt-0.5 shrink-0 text-warn" aria-hidden />
              <span><strong>{c.name}</strong> covers {short(c.from)}–{c.to}. Add the {c.gap!.before ? 'previous' : 'next'} statement for {short(c.gap!.from)}–{c.gap!.to}, so {monthLabel(month)} is complete.</span>
            </p>
          ))}
        </div>
      )}
      <Card className="divide-y divide-line p-0">
        {sources.map(g => {
          const other = elsewhere(g.source);
          return (
            <div key={g.source} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-lg text-muted">{/^Screenshots/.test(g.source) ? <LuImage aria-hidden /> : <LuFileText aria-hidden />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{g.source}</p>
                <p className="flex items-center gap-1.5 text-[13px] text-muted">{[...g.payers].map(p => <Avatar key={p} id={p} size={16} />)}<span className="min-w-0 truncate">{short(g.from)}{g.to !== g.from ? `–${g.to}` : ''} · {g.count} transaction{g.count > 1 ? 's' : ''} · {money0(g.out)} out</span></p>
                {other.length > 0 && <p className="text-[13px] text-muted">Also has transactions in {other.map(m => monthLabel(m)).join(' and ')}</p>}
              </div>
              <Button size="icon" variant="ghost" className="size-9" aria-label={`Remove ${g.source}`} onClick={() => remove([month, ...other], t => t.source === g.source, `Removed ${g.source}${other.length ? ` from ${other.length + 1} months` : ''}`)}><LuTrash2 /></Button>
            </div>
          );
        })}
      </Card>
      {sources.length > 0 && <p className="text-[13px] text-muted">Removing a statement deletes all of its transactions, in every month it covers. Upload it again any time.</p>}
      {sources.length > 0 && (
        <Button variant={sure ? 'danger' : 'ghost'} className="justify-self-start" onClick={() => (sure ? remove([month], () => true, `Cleared ${monthLabel(month)}`) : setSure(true))}><LuTrash2 />{sure ? `Tap again to clear ${monthLabel(month)}` : `Clear all of ${monthLabel(month)}`}</Button>
      )}
    </>
  );
}

/** One line on what was left out of spending as transfers, opening the matched pairs and anything to check. */
function TransfersLine({ month }: { month: string }) {
  const doc = useAtomValue(docAtom);
  const [open, setOpen] = useState(false);
  const s = useMemo(() => transferSummary(doc, month), [doc, month]);
  // Statements added through Claude skip the import step, so match their transfers here too.
  useEffect(() => {
    if (reconcileTransfers(structuredClone(doc)) > 0) updateDoc(d => { reconcileTransfers(d); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  if (!s.count) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className={cn('flex items-center gap-3 rounded-2xl p-3 text-left text-sm transition', s.toCheck.length ? 'bg-warn/10 hover:bg-warn/15' : 'bg-canvas hover:bg-line/60')}>
        <LuArrowLeftRight className={cn('shrink-0 text-lg', s.toCheck.length ? 'text-warn' : 'text-muted')} aria-hidden />
        <span className="flex-1"><strong className="num">{money0(s.excluded)}</strong> in transfers left out of spending · {s.pairs.length} matched{s.toCheck.length ? <> · <strong>{s.toCheck.length} to check</strong></> : ''}</span>
        <LuChevronRight className="shrink-0 text-muted" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Transfers">
        <TransfersBody month={month} />
      </Sheet>
    </>
  );
}

function TransfersBody({ month }: { month: string }) {
  const doc = useAtomValue(docAtom);
  const s = transferSummary(doc, month);
  const where = (t: Tx) => {
    const acc = t.account ? doc.accounts.find(a => a.id === t.account) : undefined;
    return acc ? accountLabel(acc) : `${who(doc, t.paidBy)}, ${t.source}`;
  };
  return (
    <>
      <p className="text-muted">Card payments and moves between your own accounts are not spending, so they are left out of totals. When both sides are uploaded, they are matched by amount and date.</p>
      {s.toCheck.length > 0 && (
        <section className="grid gap-3">
          <h3 className="font-bold">Check these</h3>
          <p className="text-[13px] text-muted">These were labelled as transfers, but there is no matching deposit in your other accounts. An e-transfer can be rent or paying someone back, which is spending.</p>
          {s.toCheck.map(t => <CheckTransfer key={t.id} t={t} month={month} />)}
        </section>
      )}
      {s.pairs.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-bold">Matched</h3>
          {s.pairs.map(p => (
            <div key={p.out.id} className="grid gap-1 rounded-2xl bg-canvas p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="num font-semibold">{money(p.out.amount)}</span><span className="text-[13px] text-muted">{dayLabel(p.out.date)}</span></div>
              <p className="flex min-w-0 items-center gap-1.5"><Avatar id={p.out.paidBy} size={16} /><span className="truncate">{where(p.out)}</span><LuArrowRight className="shrink-0 text-muted" aria-hidden /><Avatar id={p.in.paidBy} size={16} /><span className="truncate">{where(p.in)}</span></p>
              <p className="truncate text-[13px] text-muted">{p.out.desc} · {p.in.desc}{p.in.category !== 'Transfer' ? ` · ${p.in.category}` : ''}</p>
            </div>
          ))}
        </section>
      )}
      {!s.toCheck.length && !s.pairs.length && <p className="text-sm text-muted">Transfers this month have no other side uploaded, which is normal when you have not added that account's statement.</p>}
    </>
  );
}

function CheckTransfer({ t, month }: { t: Tx; month: string }) {
  const doc = useAtomValue(docAtom);
  const [spend, setSpend] = useState(false);
  const [category, setCategory] = useState(doc.categories.find(c => /rent/i.test(c.name))?.name ?? 'Other');
  const [remember, setRemember] = useState(true);
  const expense = doc.categories.filter(c => c.kind === 'expense').map(c => ({ value: c.name, label: c.name }));
  const answer = (cat: string | null) => {
    updateDoc(d => {
      const x = d.months[month]?.tx.find(y => y.id === t.id);
      if (!x) return;
      if (cat) { x.category = cat; x.owner = ownerFor(catOf(d, cat), x.paidBy); }
      x.ok = true;
      if (remember) rememberPayee(d, x, cat ?? x.category);
    });
    toast(cat ? `Counted as ${cat}` : 'Kept as a transfer');
  };
  return (
    <div className="grid gap-3 rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <Avatar id={t.paidBy} size={28} />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{t.desc}</p><p className="text-[13px] text-muted">{dayLabel(t.date)}</p></div>
        <span className="num font-semibold">{money(Math.abs(t.amount))}</span>
      </div>
      {spend ? (
        <div className="grid gap-2">
          <Field label="What was it for?"><Select value={category} onChange={setCategory} options={expense} /></Field>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" onClick={() => answer(category)}>Count as {category}</Button><Button size="sm" variant="ghost" onClick={() => setSpend(false)}>Back</Button></div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="soft" onClick={() => setSpend(true)}>It was spending</Button>
          <Button size="sm" variant="soft" onClick={() => answer(null)}>Our money moving</Button>
        </div>
      )}
      <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />Do the same for this payee next time</label>
    </div>
  );
}

/** Earned against spent for the month, and what a rented property nets after its own costs. */
function MoneyInOut({ month }: { month: string }) {
  const doc = useAtomValue(docAtom);
  const c = useMemo(() => cashflow(doc, month), [doc, month]);
  const income = c.fromPlan ? c.expected : c.earned;
  if (income <= 0 && c.spent <= 0) return null;
  const max = Math.max(income, c.spent + c.saved, 1);
  const sources = [
    { label: 'Pay', value: c.pay }, { label: 'Rental income', value: c.rental }, { label: 'Other', value: c.other },
  ].filter(x => x.value > 0.5);
  return (
    <div className="grid gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{c.left >= 0 ? 'Left after spending and saving' : 'Spent more than came in'}</p>
        <p className={cn('num text-xl font-bold', c.left < 0 ? 'text-bad' : 'text-good')}>{c.left < 0 ? '−' : '+'}{money0(Math.abs(c.left))}</p>
      </div>
      {c.fromPlan && <p className="text-[12px] text-muted">No deposits in this month's statements, so money in is your expected income.</p>}
      <div className="grid gap-2.5">
        <div className="grid gap-1">
          <div className="flex justify-between text-sm"><span className="font-semibold text-good">Money in{c.fromPlan ? ' (expected)' : ''}</span><span className="num font-semibold">{money0(income)}</span></div>
          <div className="h-3 rounded-full bg-canvas"><div className="h-3 rounded-full bg-good transition-all duration-700" style={{ width: `${(income / max) * 100}%` }} /></div>
          {sources.length > 1 && <p className="num text-[12px] text-muted">{sources.map(x => `${x.label} ${money0(x.value)}`).join(' · ')}</p>}
        </div>
        <div className="grid gap-1">
          <div className="flex justify-between text-sm"><span className="font-semibold">Money out</span><span className="num font-semibold">{money0(c.spent + c.saved)}</span></div>
          <div className="flex h-3 overflow-hidden rounded-full bg-canvas">
            <div className="h-3 bg-ink/80 transition-all duration-700" style={{ width: `${(c.spent / max) * 100}%` }} />
            <div className="h-3 bg-[#12A150]/60 transition-all duration-700" style={{ width: `${(c.saved / max) * 100}%` }} />
          </div>
          <p className="num text-[12px] text-muted">Spent {money0(c.spent)}{c.saved > 0 ? ` · Saved ${money0(c.saved)}` : ''}. Transfers between your accounts are not counted.</p>
        </div>
      </div>
      {c.property && (
        <div className="grid gap-1 rounded-2xl bg-canvas p-3 text-sm">
          <p className="flex items-center justify-between font-semibold"><span>Rental property{c.property.fromPlan ? ' (planned)' : ''}</span><span className={cn('num', c.property.net >= 0 ? 'text-good' : 'text-bad')}>{c.property.net >= 0 ? '+' : '−'}{money0(Math.abs(c.property.net))} a month</span></p>
          <p className="num text-[13px] text-muted">Rent in {money0(c.property.rent)} − {c.property.costNames.length ? c.property.costNames.join(', ').toLowerCase() : 'costs'} {money0(c.property.costs)}</p>
        </div>
      )}
    </div>
  );
}
