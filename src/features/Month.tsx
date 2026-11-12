import { useAtom, useAtomValue } from 'jotai';
import { memo, useDeferredValue, useMemo, useRef, useState } from 'react';
import { LuArrowRight, LuChevronDown, LuCircleCheck, LuFileText, LuImage, LuLoaderCircle, LuRepeat, LuSearch, LuSheet, LuTrash2, LuTriangleAlert, LuUpload, LuX } from 'react-icons/lu';
import type { Go } from '@/App';
import { SplitBar } from '@/components/charts/charts';
import { IconTile } from '@/components/icons';
import { CategoryPicker, MonthSwitcher } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Card, Empty, Field } from '@/components/ui/card';
import { Segmented, Switch, TextInput } from '@/components/ui/controls';
import { Avatar, Count, PERSON_COLOR, useName, useOwnerOptions } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { extractStatement, isImage } from '@/lib/ai';
import { detectRecurring, withoutDuplicates } from '@/lib/detect';
import { PayPrompts } from './Findings';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { catOf, merchantKey, ownerFor, spendByDay, who } from '@/lib/compute';
import { dayLabel, dayOf, money, money0, monthKey, monthLabel, parseMonth } from '@/lib/format';
import { sheetRows } from '@/lib/export';
import { useLast } from '@/lib/hooks';
import { docAtom, monthAtom, sessionAtom, toast, updateDoc } from '@/lib/store';
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
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  async function exportSheet() {
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
        <div className="flex gap-2">
          {tx.length > 0 && !demo && <Button onClick={exportSheet} busy={exporting}><LuSheet />Export</Button>}
          <Button variant="primary" onClick={() => setImporting(true)}><LuUpload />Add statements</Button>
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
    </Card>
  );
}

// Five quiet steps of ink, all light enough for ink text, so the calendar shows rhythm without outshouting the total.
const HEAT = [0.05, 0.1, 0.16, 0.24, 0.34];

/** Spending by day. Scaled on a square root and capped at the 90th percentile so one rent day cannot wash out the month. */
function Calendar({ doc, tx, month, day, onDay }: { doc: Doc; tx: Tx[]; month: string; day: number | null; onDay: (d: number | null) => void }) {
  const [expanded, setExpanded] = useState(false);
  const days = useMemo(() => spendByDay(doc, tx, month), [doc, tx, month]);
  const cap = useMemo(() => {
    const spent = days.filter(v => v > 0).sort((a, b) => a - b);
    return Math.sqrt(spent[Math.floor((spent.length - 1) * 0.9)] ?? 1);
  }, [days]);
  const offset = parseMonth(month).getDay();
  const today = monthKey() === month ? new Date().getDate() : null;
  const weekOf = (d: number) => Math.floor((offset + d - 1) / 7);
  const lastSpend = days.reduce((a, v, i) => (v > 0 ? i + 1 : a), 1);
  const focusWeek = weekOf(day ?? today ?? lastSpend);
  const hide = (d: number) => !expanded && weekOf(d) !== focusWeek && 'max-md:hidden';

  return (
    <Card className="grid gap-2 p-3 md:p-4">
      <div className="grid grid-cols-7 gap-1 md:gap-1.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="pb-1 text-center text-[11px] font-semibold text-muted" aria-hidden>{d}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} className={cn(!expanded && focusWeek !== 0 && 'max-md:hidden')} />)}
        {days.map((v, i) => {
          const d = i + 1;
          const level = v > 0 ? Math.min(HEAT.length - 1, Math.floor((Math.sqrt(v) / cap) * (HEAT.length - 1) + 0.0001)) : -1;
          const on = day === d;
          return (
            <button
              key={i}
              onClick={() => onDay(on ? null : d)}
              aria-pressed={on}
              aria-current={today === d ? 'date' : undefined}
              aria-label={`${monthLabel(month, 'short')} ${d}${today === d ? ', today' : ''}: ${money(v)} spent`}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] font-semibold transition-[transform,box-shadow] duration-150 active:scale-95 md:aspect-auto md:h-14',
                on && 'ring-2 ring-ink ring-offset-2',
                'text-ink',
                hide(d),
              )}
              style={{ backgroundColor: level >= 0 ? `rgb(15 23 42 / ${HEAT[level]})` : 'rgb(15 23 42 / 0.03)' }}
            >
              <span className={cn(today === d && 'underline decoration-2 underline-offset-[3px]')}>{d}</span>
              {v > 0 && <span className="num text-[11px] font-medium leading-none">{shortMoney(v)}</span>}
            </button>
          );
        })}
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
    const stamp = new Date().toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    for (let i = 0; i < state.length; i++) {
      const job = state[i];
      state[i] = { ...job, status: 'reading' };
      setJobs([...state]);
      try {
        const source = job.shots ? `Screenshots, ${stamp}` : job.files[0].name;
        const tx = await extractStatement(passcode, doc, job.files, job.payer, target, source);
        found.push(...tx);
        state[i] = { ...state[i], status: 'done', note: `${tx.length} transactions${job.shots ? ', may be part of the month' : ''}` };
      } catch (e) {
        state[i] = { ...state[i], status: 'error', note: (e as Error).message };
      }
      setJobs([...state]);
    }
    setBusy(false);
    if (!found.length) return;
    const sources = new Set(found.map(t => t.source));
    let added = 0;
    updateDoc(d => {
      // A statement read again replaces its earlier copy; anything already saved from another source is skipped.
      const prior = (d.months[target]?.tx ?? []).filter(t => !sources.has(t.source));
      const fresh = withoutDuplicates(prior, found);
      added = fresh.length;
      d.months[target] = { ...d.months[target], tx: [...prior, ...fresh].sort((a, b) => a.date.localeCompare(b.date)) };
    });
    setMonth(target);
    const skipped = found.length - added;
    toast(`${added} transactions added to ${monthLabel(target)}${skipped ? `, ${skipped} already there` : ''}`);
    if (state.every(j => j.status === 'done')) { setFiles({ p1: [], p2: [], joint: [] }); setJobs([]); onClose(); }
  }

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="Add statements" footer={<Button variant="primary" size="lg" className="flex-1" busy={busy} disabled={!count || demo} onClick={analyze}>{busy ? 'Reading' : count ? `Read ${count} file${count > 1 ? 's' : ''}` : 'Choose files first'}</Button>}>
      {demo && <p className="rounded-2xl bg-brand-soft p-3 text-sm font-medium text-brand">Reading statements uses Claude, which is off in the sample household.</p>}
      <Field label="Budget month"><TextInput type="month" value={target} onChange={e => e.target.value && setTarget(e.target.value)} /></Field>
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
