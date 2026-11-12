import { useAtom, useAtomValue } from 'jotai';
import { useMemo, useState } from 'react';
import { LuCircleCheck, LuFileText, LuLoaderCircle, LuSearch, LuSheet, LuTrash2, LuTriangleAlert, LuUpload, LuX } from 'react-icons/lu';
import type { Go } from '@/App';
import { IconTile } from '@/components/icons';
import { CategoryPicker, MonthSwitcher } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Card, Empty, Field } from '@/components/ui/card';
import { Segmented, Switch, TextInput } from '@/components/ui/controls';
import { Avatar, useOwnerOptions } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { extractStatement } from '@/lib/ai';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { catOf, merchantKey, ownerFor, spendByDay, who } from '@/lib/compute';
import { dayLabel, dayOf, money, money0, monthLabel, parseMonth } from '@/lib/format';
import { sheetRows } from '@/lib/export';
import { docAtom, monthAtom, sessionAtom, toast, updateDoc } from '@/lib/store';
import type { Owner, Payer, Tx } from '@/lib/types';

export function Month(_: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const { passcode, demo } = useAtomValue(sessionAtom);
  const [day, setDay] = useState<number | null>(null);
  const [owner, setOwner] = useState<'all' | Owner>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Tx | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tx = doc.months[month]?.tx ?? [];
  const days = spendByDay(doc, tx, month);
  const max = Math.max(1, ...days);
  const offset = parseMonth(month).getDay();
  const ownerOptions = [{ value: 'all' as const, label: 'All' }, ...useOwnerOptions<Owner>(['shared', 'p1', 'p2'])];

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tx.filter(t => (day === null || dayOf(t.date) === day) && (owner === 'all' || t.owner === owner) && (!q || t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)));
    const by = new Map<string, Tx[]>();
    for (const t of list) by.set(t.date, [...(by.get(t.date) ?? []), t]);
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [tx, day, owner, query]);

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

      {!tx.length ? (
        <Empty title={`Nothing in ${monthLabel(month)} yet`} text="Upload PDF statements for each of you. Every transaction is read, categorized and marked shared or personal." />
      ) : (
        <>
          <Card className="p-3 md:p-4">
            <div className="grid grid-cols-7 gap-1 md:gap-1.5">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="pb-1 text-center text-[11px] font-semibold text-muted">{d}</span>)}
              {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
              {days.map((v, i) => {
                const ratio = v / max;
                const on = day === i + 1;
                return (
                  <button
                    key={i}
                    onClick={() => setDay(on ? null : i + 1)}
                    aria-pressed={on}
                    aria-label={`${monthLabel(month, 'short')} ${i + 1}: ${money(v)} spent`}
                    className={cn('flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition active:scale-95 md:aspect-[4/3]', on && 'ring-2 ring-ink ring-offset-2', ratio > 0.5 ? 'text-white' : 'text-ink')}
                    style={{ backgroundColor: v > 0 ? `rgb(75 63 228 / ${0.1 + ratio * 0.8})` : 'rgb(15 23 42 / 0.04)' }}
                  >
                    {i + 1}
                    {v > 0 && <span className="num hidden text-[10px] font-medium opacity-80 sm:block">{money0(v)}</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <TextInput className="pl-10" placeholder="Search merchants or categories" aria-label="Search transactions" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <Segmented value={owner} onChange={setOwner} options={ownerOptions} size="sm" className="md:w-96" />
          </div>
          {day !== null && <button onClick={() => setDay(null)} className="flex items-center gap-1.5 justify-self-start rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-white">{dayLabel(`${month}-${String(day).padStart(2, '0')}`)}<LuX /></button>}

          <div className="grid gap-4">
            {groups.map(([date, items]) => (
              <section key={date}>
                <h2 className="mb-1.5 px-1 text-[13px] font-semibold text-muted">{dayLabel(date)}</h2>
                <Card className="divide-y divide-line p-0">
                  {items.map(t => {
                    const c = catOf(doc, t.category);
                    const muted = t.exclude || c.kind === 'transfer';
                    return (
                      <button key={t.id} onClick={() => setEditing(t)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition first:rounded-t-3xl last:rounded-b-3xl hover:bg-canvas', muted && 'opacity-55')}>
                        <IconTile icon={c.icon} color={c.color} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate font-semibold', t.exclude && 'line-through')}>{t.desc}</span>
                          <span className="block truncate text-[13px] text-muted">{c.name}</span>
                        </span>
                        <span className={cn('num font-semibold', t.amount < 0 && 'text-good')}>{t.amount < 0 ? `+${money(-t.amount)}` : money(t.amount)}</span>
                        <Avatar id={t.owner} />
                      </button>
                    );
                  })}
                </Card>
              </section>
            ))}
            {!groups.length && <p className="py-6 text-center text-muted">No transactions match.</p>}
          </div>
        </>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Transaction">
        {editing && <TxEditor key={editing.id} tx={editing} month={month} onDone={() => setEditing(null)} />}
      </Sheet>
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function TxEditor({ tx, month, onDone }: { tx: Tx; month: string; onDone: () => void }) {
  const doc = useAtomValue(docAtom);
  const [category, setCategory] = useState(tx.category);
  const [owner, setOwner] = useState<Owner>(tx.owner);
  const [counted, setCounted] = useState(!tx.exclude);
  const [remember, setRemember] = useState(doc.settings.remember);
  const owners = useOwnerOptions<Owner>(['shared', 'p1', 'p2']);
  const key = merchantKey(tx.desc);

  function pick(name: string) {
    setCategory(name);
    setOwner(ownerFor(catOf(doc, name), tx.paidBy));
  }

  function save() {
    let also = 0;
    updateDoc(d => {
      const list = d.months[month].tx;
      const t = list.find(x => x.id === tx.id);
      if (!t) return;
      Object.assign(t, { category, owner, exclude: !counted });
      d.settings.remember = remember;
      if (remember && key.length >= 3 && (category !== tx.category || owner !== tx.owner)) {
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

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-lg font-bold">{tx.desc}</p><p className="text-sm text-muted">{dayLabel(tx.date)} · paid from {who(doc, tx.paidBy)}</p></div>
        <p className={cn('display text-2xl font-bold', tx.amount < 0 && 'text-good')}>{tx.amount < 0 ? `+${money(-tx.amount)}` : money(tx.amount)}</p>
      </div>
      <Field label="Category"><CategoryPicker value={category} onChange={pick} /></Field>
      <Field label="Belongs to"><Segmented value={owner} onChange={setOwner} options={owners} /></Field>
      <label className="flex items-center justify-between gap-3"><span><span className="block font-semibold">Count it in the budget</span><span className="block text-[13px] text-muted">Turn off for refunds you were repaid or one-offs.</span></span><Switch checked={counted} onChange={setCounted} label="Count it in the budget" /></label>
      <label className="flex items-center justify-between gap-3"><span><span className="block font-semibold">Remember for {key || 'this merchant'}</span><span className="block text-[13px] text-muted">Future statements use the same category and owner.</span></span><Switch checked={remember} onChange={setRemember} label="Remember this correction" /></label>
      <div className="flex gap-3">
        <Button variant="danger" size="lg" aria-label="Delete transaction" onClick={() => { updateDoc(d => { d.months[month].tx = d.months[month].tx.filter(x => x.id !== tx.id); }); toast('Transaction removed'); onDone(); }}><LuTrash2 /></Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={save}>Save</Button>
      </div>
    </>
  );
}

interface Job { name: string; payer: Payer; status: 'waiting' | 'reading' | 'done' | 'error'; note?: string }

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

  async function analyze() {
    const list = zones.flatMap(payer => files[payer].map(file => ({ file, payer })));
    const state: Job[] = list.map(x => ({ name: x.file.name, payer: x.payer, status: 'waiting' }));
    setJobs(state);
    setBusy(true);
    const found: Tx[] = [];
    for (let i = 0; i < list.length; i++) {
      state[i] = { ...state[i], status: 'reading' };
      setJobs([...state]);
      try {
        const tx = await extractStatement(passcode, doc, list[i].file, list[i].payer, target);
        found.push(...tx);
        state[i] = { ...state[i], status: 'done', note: `${tx.length} transactions` };
      } catch (e) {
        state[i] = { ...state[i], status: 'error', note: (e as Error).message };
      }
      setJobs([...state]);
    }
    setBusy(false);
    if (!found.length) return;
    const sources = new Set(found.map(t => t.source));
    updateDoc(d => {
      const prior = (d.months[target]?.tx ?? []).filter(t => !sources.has(t.source));
      d.months[target] = { ...d.months[target], tx: [...prior, ...found].sort((a, b) => a.date.localeCompare(b.date)) };
    });
    setMonth(target);
    toast(`${found.length} transactions added to ${monthLabel(target)}`);
    if (state.every(j => j.status === 'done')) { setFiles({ p1: [], p2: [], joint: [] }); setJobs([]); onClose(); }
  }

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="Add statements" footer={<Button variant="primary" size="lg" className="flex-1" busy={busy} disabled={!count || demo} onClick={analyze}>{busy ? 'Reading statements' : count ? `Read ${count} statement${count > 1 ? 's' : ''}` : 'Choose statements first'}</Button>}>
      {demo && <p className="rounded-2xl bg-brand-soft p-3 text-sm font-medium text-brand">Reading statements uses Claude, which is off in the sample household.</p>}
      <Field label="Budget month"><TextInput type="month" value={target} onChange={e => e.target.value && setTarget(e.target.value)} /></Field>
      <div className="grid gap-3">
        {zones.map(payer => (
          <div key={payer} className="rounded-2xl border border-line p-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[#b4bccd] p-3 transition hover:border-brand hover:bg-brand-soft/50">
              <Avatar id={payer} size={36} />
              <span className="flex-1"><span className="block font-semibold">{who(doc, payer)}</span><span className="block text-[13px] text-muted">Choose PDF statements</span></span>
              <LuUpload className="text-xl text-muted" aria-hidden />
              <input type="file" multiple accept=".pdf,.csv,.txt" className="sr-only" onChange={e => { const add = [...(e.target.files ?? [])]; setFiles(f => ({ ...f, [payer]: [...f[payer], ...add] })); e.target.value = ''; }} />
            </label>
            {files[payer].map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-2 pt-2 text-sm">
                <LuFileText className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => setFiles(s => ({ ...s, [payer]: s[payer].filter((_, j) => j !== i) }))} className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5"><LuX /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
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
