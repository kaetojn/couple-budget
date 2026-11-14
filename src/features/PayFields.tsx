import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuChevronDown, LuPlus, LuTrash2 } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { useOwnerOptions } from '@/components/ui/misc';
import { Field } from '@/components/ui/card';
import { MoneyInput, Segmented, Select, Stepper, TextInput } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { who } from '@/lib/compute';
import { FREQS, SEMI_DAYS } from '@/lib/defaults';
import { dayOf, money, money0, monthKey, ordinal, uid } from '@/lib/format';
import { applySplit, payOf, perCheque } from '@/lib/plan';
import { docAtom, updateDoc } from '@/lib/store';
import { isSupported, REGIONS, takeHome, TAX_YEAR } from '@/lib/tax';
import type { OtherIncome, Owner, PayFreq, PaySchedule, PersonId } from '@/lib/types';

export const freqOptions = (Object.keys(FREQS) as PayFreq[]).map(value => ({ value, label: FREQS[value] }));

/** The question that follows "how often": which dates, or a recent payday. */
export function PayDayField({ pay, onChange }: { pay: PaySchedule; onChange: (patch: Partial<PaySchedule>) => void }) {
  if (pay.freq === 'semimonthly') {
    const days = pay.days ?? [15, 31];
    const key = `${days[0]}-${days[1]}`;
    return (
      <Field label="On the">
        <Select value={SEMI_DAYS.some(o => o.value === key) ? key : '15-31'} onChange={v => onChange({ days: SEMI_DAYS.find(o => o.value === v)!.days })} options={SEMI_DAYS} />
      </Field>
    );
  }
  if (pay.freq === 'monthly') {
    return (
      <Field label="Paid on the">
        <Stepper label="Payday" value={dayOf(pay.anchor)} min={1} max={31} format={d => (d >= 31 ? 'Last day' : ordinal(d))} onChange={d => onChange({ anchor: `${monthKey()}-${String(d).padStart(2, '0')}` })} />
      </Field>
    );
  }
  return (
    <Field label="A recent payday">
      <TextInput type="date" value={pay.anchor} onChange={e => e.target.value && onChange({ anchor: e.target.value })} />
    </Field>
  );
}

/** Weekly and bi-weekly pay count from a real date; a monthly "31st" is not one, so fall back to today. */
export function fixAnchor(p: PaySchedule): PaySchedule {
  if (p.freq !== 'weekly' && p.freq !== 'biweekly') return p;
  const d = new Date(`${p.anchor}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== p.anchor ? { ...p, anchor: new Date().toLocaleDateString('en-CA') } : p;
}

/** Frequency and dates for one partner. */
export function PaySchedulePicker({ person }: { person: PersonId }) {
  const doc = useAtomValue(docAtom);
  const pay = doc.settings.pay[person];
  const set = (patch: Partial<PaySchedule>) => updateDoc(d => { d.settings.pay[person] = fixAnchor({ ...d.settings.pay[person], ...patch }); });
  const income = payOf(doc, person);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Paid"><Select<PayFreq> value={pay.freq} onChange={freq => set({ freq })} options={freqOptions} /></Field>
      <PayDayField pay={pay} onChange={set} />
      {income > 0 && <p className="text-[13px] text-muted sm:col-span-2">About <strong className="num text-ink">{money0(perCheque(income, pay.freq))}</strong> per paycheque.</p>}
    </div>
  );
}

/** Monthly take-home for one partner, typed in or estimated from a yearly salary. */
export function IncomeField({ person }: { person: PersonId }) {
  const doc = useAtomValue(docAtom);
  const s = doc.settings;
  const supported = isSupported(s.region);
  const gross = s.pay[person].gross ?? 0;
  const [mode, setMode] = useState<'salary' | 'net'>(supported && (gross > 0 || !payOf(doc, person)) ? 'salary' : 'net');
  const [open, setOpen] = useState(false);
  const income = payOf(doc, person);
  const est = supported ? takeHome(gross, s.region) : null;
  const key = person === 'p1' ? 'inc1' : 'inc2';
  const region = REGIONS.find(r => r.value === s.region)?.label ?? s.region;
  const setIncome = (v: number) => updateDoc(d => { d.settings = applySplit({ ...d.settings, [key]: v }); });

  function setGross(g: number) {
    const t = takeHome(g, s.region);
    updateDoc(d => {
      d.settings.pay[person] = { ...d.settings.pay[person], gross: g || undefined };
      if (t) d.settings = applySplit({ ...d.settings, [key]: t.monthly });
    });
  }

  return (
    <div className="grid gap-3 rounded-2xl bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{who(doc, person)}</span>
        {supported && <Segmented size="sm" className="w-full sm:w-64" value={mode} onChange={m => { setMode(m); if (m === 'net') updateDoc(d => { d.settings.pay[person] = { ...d.settings.pay[person], gross: undefined }; }); }} options={[{ value: 'salary', label: 'From salary' }, { value: 'net', label: 'Take-home' }]} />}
      </div>
      {mode === 'salary' && supported ? (
        <>
          <Field label="Salary before tax, per year"><MoneyInput label={`${who(doc, person)} yearly salary`} value={gross} onChange={setGross} step={1000} /></Field>
          {est && (
            <>
              <Field label="Take-home a month" hint={Math.abs(income - est.monthly) > 1 ? <>Adjusted from the estimate of {money0(est.monthly)}.</> : 'Estimated. Change it if your pay stub differs.'}>
                <MoneyInput label={`${who(doc, person)} monthly take-home`} value={income} onChange={setIncome} step={50} />
              </Field>
              <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1 justify-self-start text-[13px] font-semibold text-brand">
                How this is worked out <LuChevronDown className={cn('transition', open && 'rotate-180')} aria-hidden />
              </button>
              {open && (
                <dl className="grid animate-rise grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-muted">Salary</dt><dd className="num text-right">{money(est.gross)}</dd>
                  <dt className="text-muted">Federal tax</dt><dd className="num text-right">−{money(est.federal)}</dd>
                  <dt className="text-muted">{region} tax</dt><dd className="num text-right">−{money(est.provincial)}</dd>
                  {est.health > 0 && <><dt className="text-muted">{region} Health Premium</dt><dd className="num text-right">−{money(est.health)}</dd></>}
                  <dt className="text-muted">CPP</dt><dd className="num text-right">−{money(est.cpp)}</dd>
                  <dt className="text-muted">EI</dt><dd className="num text-right">−{money(est.ei)}</dd>
                  <dt className="font-semibold">Take-home a year</dt><dd className="num text-right font-semibold">{money(est.net)}</dd>
                  <dd className="col-span-2 pt-1 text-muted">{TAX_YEAR} {region} rates. Pension plans, benefits, RRSP and union dues taken off your pay are not included.</dd>
                </dl>
              )}
            </>
          )}
        </>
      ) : (
        <Field label="Take-home a month" hint={supported ? undefined : `Take-home estimates are not available for ${region} yet, so enter what lands in your account.`}>
          <MoneyInput label={`${who(doc, person)} monthly take-home`} value={income} onChange={setIncome} step={100} />
        </Field>
      )}
    </div>
  );
}

/** Income besides paycheques, such as rent from a property, entered as a monthly amount after tax. */
export function OtherIncomeEditor() {
  const doc = useAtomValue(docAtom);
  const list = doc.settings.otherIncome ?? [];
  const owners = useOwnerOptions<Owner>(['p1', 'shared', 'p2']);
  const set = (fn: (l: OtherIncome[]) => OtherIncome[]) => updateDoc(d => { d.settings.otherIncome = fn(d.settings.otherIncome ?? []); });
  const patch = (id: string, p: Partial<OtherIncome>) => set(l => l.map(x => (x.id === id ? { ...x, ...p } : x)));
  return (
    <div className="grid gap-3 rounded-2xl bg-canvas p-3">
      <div>
        <p className="font-semibold">Other income</p>
        <p className="text-[13px] text-muted">Rent from a property you own, side work, child benefits. It counts toward what you have each month.</p>
      </div>
      {list.map(x => (
        <div key={x.id} className="grid animate-rise gap-2 rounded-2xl bg-surface p-3">
          <div className="flex items-center gap-2">
            <TextInput aria-label="What it is" value={x.name} placeholder="Condo rent" onChange={e => patch(x.id, { name: e.target.value, kind: /rent|tenant|lease|condo|property/i.test(e.target.value) ? 'rental' : x.kind })} />
            <Button size="icon" variant="ghost" aria-label={`Remove ${x.name || 'income'}`} onClick={() => set(l => l.filter(y => y.id !== x.id))}><LuTrash2 /></Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MoneyInput label={`${x.name || 'Income'} a month`} value={x.amount} onChange={amount => patch(x.id, { amount })} step={50} />
            <Segmented size="sm" value={x.owner} onChange={owner => patch(x.id, { owner })} options={owners} />
          </div>
        </div>
      ))}
      <Button size="sm" variant="soft" className="justify-self-start" onClick={() => set(l => [...l, { id: uid(), name: l.length ? '' : 'Condo rent', amount: 0, owner: 'shared', kind: l.length ? 'other' : 'rental' }])}><LuPlus />Add income</Button>
    </div>
  );
}
