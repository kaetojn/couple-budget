import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuCheck, LuPlus, LuTrash2 } from 'react-icons/lu';
import type { Go } from '@/App';
import { Legend, SplitBar } from '@/components/charts/charts';
import { IconTile } from '@/components/icons';
import { IconPicker, MonthSwitcher } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Card, Field, SectionTitle } from '@/components/ui/card';
import { MoneyInput, Segmented, Select, Slider, Stepper, TextInput } from '@/components/ui/controls';
import { Avatar, Progress, useOwnerOptions } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { useLast } from '@/lib/hooks';
import { who } from '@/lib/compute';
import { FREQS } from '@/lib/defaults';
import { addMonths, daysIn, money, money0, monthKey, monthLabel, ordinal, uid } from '@/lib/format';
import { agenda, allocation, billPayment, monthsToClear, paydays } from '@/lib/plan';
import { isPaid, paidByStatement } from '@/lib/detect';
import { accountLabel, cardChecks, fundingChecks } from '@/lib/accounts';
import { PayPrompts, RecurringFoundList } from './Findings';
import { fixAnchor, PayDayField } from './PayFields';
import { docAtom, monthAtom, toast, updateDoc } from '@/lib/store';
import type { Bill, Owner, PayFreq, PersonId } from '@/lib/types';

const BILL_ICONS = ['home', 'key', 'building', 'landmark', 'zap', 'wifi', 'phone', 'car', 'shield', 'repeat', 'tv', 'gym', 'grad', 'card', 'coins', 'percent'];
const DEBT_COLOR = '#d13438';
const BILL_COLOR = '#4b3fe4';

export function Plan(_: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const [editing, setEditing] = useState<Bill | null>(null);
  const shown = useLast(editing);
  const items = agenda(doc, month);
  const bills = items.filter(i => i.type === 'bill');
  const paidNow = (b: Bill) => isPaid(doc, b, month);
  const paid = bills.filter(i => paidNow(i.bill!));
  const due = bills.reduce((a, i) => a + i.amount, 0);
  const paidSum = paid.reduce((a, i) => a + i.amount, 0);
  const n = daysIn(month);
  const today = month === monthKey() ? new Date().getDate() : null;
  const add = (kind: Bill['kind']) => setEditing({ id: '', name: '', amount: 0, dueDay: 1, kind, payer: 'shared', icon: kind === 'debt' ? 'card' : 'repeat', paid: {} });

  function toggle(b: Bill) {
    const fromStatement = !!paidByStatement(doc, b, month);
    updateDoc(d => {
      const t = d.bills.find(x => x.id === b.id);
      if (!t) return;
      const was = t.paid[month];
      const now = !(was ?? fromStatement);
      // Keep an explicit untick so a statement match does not tick it again.
      if (now && !fromStatement) t.paid[month] = true;
      else if (!now && fromStatement) t.paid[month] = false;
      else delete t.paid[month];
      // Ticking a debt by hand records the payment against its balance.
      const moved = (now && was !== true && !fromStatement) ? -1 : (!now && was === true) ? 1 : 0;
      if (moved && t.kind === 'debt' && t.balance !== undefined) t.balance = Math.max(0, Math.round((t.balance + moved * billPayment(b, month)) * 100) / 100);
    });
  }

  return (
    <div className="stagger grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-[28px]">Plan</h1>
        <MonthSwitcher />
      </div>

      <Card className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-muted">Still to pay in {monthLabel(month)}</p><p className="display text-4xl font-bold">{money(due - paidSum)}</p></div>
          <p className="num text-muted"><strong className="text-ink">{paid.length} of {bills.length}</strong> payments made</p>
        </div>
        <Progress value={paidSum} max={due} color="var(--color-good)" className="h-3" />
        <div className="relative mt-4 h-[74px]" aria-hidden>
          <div className="absolute inset-x-0 top-9 h-1 rounded-full bg-ink/8" />
          {today && <div className="absolute top-5 h-9 w-0.5 rounded bg-ink" style={{ left: `${((today - 0.5) / n) * 100}%` }} />}
          {(['p1', 'p2'] as PersonId[]).flatMap(p => paydays(doc.settings.pay[p], month).map(d => (
            <span key={p + d} className={cn('absolute -translate-x-1/2', p === 'p1' ? 'top-0' : 'top-1.5')} style={{ left: `${((d - 0.5) / n) * 100}%` }}><Avatar id={p} size={26} /></span>
          )))}
          {[...new Set(bills.map(b => b.day))].map(d => {
            const same = bills.filter(b => b.day === d);
            const done = same.every(b => paidNow(b.bill!));
            return (
              <span key={d} className="absolute top-[46px] grid -translate-x-1/2 justify-items-center" style={{ left: `${((d - 0.5) / n) * 100}%` }}>
                <span className={cn('grid size-6 place-items-center rounded-full text-[11px] font-bold text-white', done ? 'bg-good' : 'bg-ink')}>{done ? <LuCheck /> : same.length}</span>
                <span className="num text-[10px] text-muted">{d}</span>
              </span>
            );
          })}
        </div>
        <p className="text-[13px] text-muted">Circles above the line are paydays. Numbers below are how many payments fall due that day.</p>
      </Card>

      <PayPrompts />

      <section>
        <SectionTitle>How each paycheque is spoken for</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {(['p1', 'p2'] as PersonId[]).map(p => <PayCard key={p} person={p} />)}
        </div>
      </section>

      <section>
        <SectionTitle action={<div className="flex gap-2"><Button size="sm" variant="soft" onClick={() => add('bill')}><LuPlus />Bill</Button><Button size="sm" variant="soft" onClick={() => add('debt')}><LuPlus />Debt</Button></div>}>Payments this month</SectionTitle>
        <Card className="divide-y divide-line p-0">
          {items.map((a, i) => a.type === 'pay' ? (
            <div key={`pay${i}`} className="flex items-center gap-3 bg-good/5 px-4 py-3 first:rounded-t-3xl last:rounded-b-3xl">
              <span className="num w-10 shrink-0 text-center text-[13px] font-semibold text-muted">{ordinal(a.day)}</span>
              <Avatar id={a.person!} size={40} />
              <span className="min-w-0 flex-1 truncate font-semibold">{a.label}</span>
              <span className="num font-semibold text-good">+{money(a.amount)}</span>
            </div>
          ) : (
            <div key={a.bill!.id} className="flex items-center gap-3 px-4 py-3 first:rounded-t-3xl last:rounded-b-3xl">
              <span className="num w-10 shrink-0 text-center text-[13px] font-semibold text-muted">{ordinal(a.day)}</span>
              <button onClick={() => setEditing(a.bill!)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <IconTile icon={a.bill!.icon} color={a.bill!.kind === 'debt' ? DEBT_COLOR : BILL_COLOR} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate font-semibold', paidNow(a.bill!) && 'text-muted line-through')}>{a.label}</span>
                  <span className="flex items-center gap-1.5 text-[13px] text-muted"><Avatar id={a.bill!.payer} size={16} />{a.bill!.paid[month] === undefined && paidByStatement(doc, a.bill!, month) ? <span className="font-medium text-good">Found in statement</span> : a.bill!.kind === 'debt' && a.bill!.balance !== undefined ? `${money0(a.bill!.balance)} left to clear` : who(doc, a.bill!.payer)}</span>
                </span>
                <span className="num font-semibold">{money(a.amount)}</span>
              </button>
              <button onClick={() => toggle(a.bill!)} role="checkbox" aria-checked={paidNow(a.bill!)} aria-label={`Mark ${a.label} paid`} className={cn('grid size-9 shrink-0 place-items-center rounded-full border-2 text-lg transition active:scale-90', paidNow(a.bill!) ? 'border-good bg-good text-white' : 'border-line text-transparent hover:border-good')}><LuCheck /></button>
            </div>
          ))}
          {!items.length && <p className="p-4 text-muted">Add your bills and debts to see them against your paydays.</p>}
        </Card>
      </section>

      <AccountChecks />

      <RecurringFoundList />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={shown?.id ? `Edit ${shown.kind}` : `New ${shown?.kind ?? 'bill'}`}>
        {shown && <BillEditor key={shown.id || `new-${shown.kind}`} initial={shown} month={month} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function PayCard({ person }: { person: PersonId }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const a = allocation(doc, person, month);
  const pay = doc.settings.pay[person];
  const key = person === 'p1' ? 'sav1' : 'sav2';
  const spoken = a.bills + a.debt + a.flexible + a.savings;
  const parts = [
    { label: 'Bills', value: a.bills, color: BILL_COLOR },
    { label: 'Debt', value: a.debt, color: DEBT_COLOR },
    { label: 'Shared spending', value: a.flexible, color: '#0fa3a3' },
    { label: 'Joint savings', value: a.savings, color: '#0a8058' },
    { label: a.left >= 0 ? 'Left for you' : 'Short by', value: Math.abs(a.left), color: a.left >= 0 ? '#cbd2e0' : '#f59e0b' },
  ];
  const setPay = (patch: Partial<typeof pay>) => updateDoc(d => { d.settings.pay[person] = fixAnchor({ ...d.settings.pay[person], ...patch }); });

  return (
    <Card className="grid content-start gap-4">
      <div className="flex items-center gap-3">
        <Avatar id={person} size={40} />
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{who(doc, person)}</p><p className="num text-[13px] text-muted">{money0(a.pay)} a month in {a.cheques} paycheque{a.cheques > 1 ? 's' : ''}{a.other > 0 ? ` + ${money0(a.other)} other income` : ''}</p></div>
      </div>
      {a.income > 0 ? (
        <>
          <SplitBar parts={a.left >= 0 ? parts : parts.slice(0, 4)} height={16} />
          <Legend parts={parts.filter(p => p.value > 0.5)} format={money0} />
          <p className="rounded-2xl bg-canvas p-3 text-sm">{a.other > 0 && <>Other income covers <strong className="num">{money0(Math.min(a.other, spoken))}</strong> first. </>}From each <strong className="num">{money0(a.pay / a.cheques)}</strong> paycheque, set aside <strong className="num">{money0(Math.max(0, spoken - a.other) / a.cheques)}</strong>{a.left >= 0 ? <> and keep <strong className="num">{money0(a.left / a.cheques)}</strong>.</> : <>. That is <strong className="num text-bad">{money0(-a.left / a.cheques)}</strong> more than it holds.</>}</p>
        </>
      ) : (
        <p className="text-muted">Add a monthly take-home in Settings to see this paycheque divided up.</p>
      )}
      <Field label={`Joint savings, ${money0(a.savings)} a month`}>
        <Slider label="Monthly joint savings" value={Math.round(a.savings)} max={Math.max(1000, Math.round((a.income * 0.4) / 100) * 100)} step={25} color="#0a8058" onChange={v => updateDoc(d => { d.settings[key] = v; })} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Paid"><Select<PayFreq> value={pay.freq} onChange={freq => setPay({ freq })} options={(Object.keys(FREQS) as PayFreq[]).map(value => ({ value, label: FREQS[value] }))} /></Field>
        <PayDayField pay={pay} onChange={setPay} />
      </div>
    </Card>
  );
}

function BillEditor({ initial, month, onDone }: { initial: Bill; month: string; onDone: () => void }) {
  const [b, setB] = useState(initial);
  const set = (patch: Partial<Bill>) => setB(prev => ({ ...prev, ...patch }));
  const owners = useOwnerOptions<Owner>(['shared', 'p1', 'p2']);
  const debt = b.kind === 'debt';
  const needed = debt && b.balance && b.targetMonth ? billPayment({ ...b }, month) : 0;
  const clear = debt && b.balance && !b.targetMonth ? monthsToClear(b) : undefined;

  function save() {
    const name = b.name.trim() || (debt ? 'Debt' : 'Bill');
    updateDoc(d => {
      const next = { ...b, name, id: b.id || uid() };
      const i = d.bills.findIndex(o => o.id === b.id);
      if (i < 0) d.bills.push(next); else d.bills[i] = next;
    });
    toast(`${name} saved`);
    onDone();
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <IconTile icon={b.icon} color={debt ? DEBT_COLOR : BILL_COLOR} size="lg" />
        <TextInput aria-label="Name" placeholder={debt ? 'Visa, student loan…' : 'Rent, phone, internet…'} value={b.name} onChange={e => set({ name: e.target.value })} autoFocus={!b.id} />
      </div>
      <Field label="Type"><Segmented value={b.kind} onChange={kind => set({ kind })} options={[{ value: 'bill', label: 'Bill' }, { value: 'debt', label: 'Debt to pay off' }]} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={debt ? 'Monthly payment' : 'Amount'}><MoneyInput label="Amount" value={b.amount} onChange={amount => set({ amount })} /></Field>
        <Field label="Due on the"><Stepper label="Day due" value={b.dueDay} min={1} max={31} format={ordinal} onChange={dueDay => set({ dueDay })} /></Field>
      </div>
      <Field label="Who pays"><Segmented value={b.payer} onChange={payer => set({ payer })} options={owners} /></Field>
      {debt && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Balance owed"><MoneyInput label="Balance owed" value={b.balance ?? 0} onChange={balance => set({ balance })} /></Field>
            <Field label="Interest rate, % a year"><TextInput type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" value={b.apr ?? ''} onChange={e => set({ apr: +e.target.value || undefined })} /></Field>
          </div>
          <Field label="Clear it by" hint="Optional. Pick a month and the payment is worked out for you.">
            <div className="flex gap-2">
              <TextInput type="month" min={month} value={b.targetMonth ?? ''} onChange={e => set({ targetMonth: e.target.value || undefined })} />
              <Button onClick={() => set({ targetMonth: addMonths(month, 11) })}>In a year</Button>
            </div>
          </Field>
          {needed > 0 && <p className="rounded-2xl bg-brand-soft p-3 text-sm font-medium text-brand">Pay <strong className="num">{money(needed)}</strong> a month to be clear by {monthLabel(b.targetMonth!)}. The plan uses this amount.</p>}
          {clear !== undefined && b.amount > 0 && <p className="rounded-2xl bg-canvas p-3 text-sm">{clear === null ? 'This payment does not cover the interest, so the balance will not go down.' : <>At {money(b.amount)} a month this is cleared in <strong>{clear} month{clear === 1 ? '' : 's'}</strong>, around {monthLabel(addMonths(month, clear))}.</>}</p>}
        </>
      )}
      <Field label="Icon"><IconPicker value={b.icon} onChange={icon => set({ icon })} color={debt ? DEBT_COLOR : BILL_COLOR} icons={BILL_ICONS} /></Field>
      <div className="flex gap-3">
        {b.id && <Button variant="danger" size="lg" aria-label="Delete" onClick={() => { updateDoc(d => { d.bills = d.bills.filter(o => o.id !== b.id); }); toast('Removed'); onDone(); }}><LuTrash2 /></Button>}
        <Button variant="primary" size="lg" className="flex-1" onClick={save}>Save</Button>
      </div>
    </>
  );
}

/** Card balances waiting on a payment, and accounts that pay bills but get no pay. */
function AccountChecks() {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const cards = cardChecks(doc);
  const funding = fundingChecks(doc, month);
  if (!cards.length && !funding.length) return null;
  const tone = { paid: 'text-good', min: 'text-warn', due: 'text-warn', late: 'text-bad' } as const;
  return (
    <section>
      <SectionTitle>Accounts to check</SectionTitle>
      <Card className="divide-y divide-line p-0">
        {cards.map(c => (
          <div key={c.account.id} className="flex items-start gap-3 px-4 py-3">
            <IconTile icon="card" color={c.status === 'paid' ? '#0a8058' : c.status === 'late' ? DEBT_COLOR : '#b45309'} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold"><span className="truncate">{accountLabel(c.account)}</span><Avatar id={c.account.owner} size={16} /></p>
              <p className={cn('text-[13px] font-medium', tone[c.status])}>{c.text}</p>
            </div>
          </div>
        ))}
        {funding.map(f => (
          <div key={f.account.id} className="flex items-start gap-3 px-4 py-3">
            <IconTile icon="wallet" color="#b45309" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold"><span className="truncate">{accountLabel(f.account)}</span><Avatar id={f.account.owner} size={16} /></p>
              <p className="text-[13px] text-muted">{f.text}</p>
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-[13px] text-muted">Balances and due dates come from the statements you add. Edit an account in Net worth if something is off.</p>
    </section>
  );
}
