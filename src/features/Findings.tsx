import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuBanknote, LuCheck, LuPencil, LuPlus, LuX } from 'react-icons/lu';
import { IconTile } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, Field, SectionTitle } from '@/components/ui/card';
import { MoneyInput, Select } from '@/components/ui/controls';
import { Avatar } from '@/components/ui/misc';
import { who } from '@/lib/compute';
import { FREQS, SEMI_DAYS } from '@/lib/defaults';
import { detectRecurring, freqWord, payToConfirm, type PayFound, type RecurringFound } from '@/lib/detect';
import { dayLabel, money, money0, ordinal, uid } from '@/lib/format';
import { applySplit, payOf, monthlyFrom } from '@/lib/plan';
import { docAtom, toast, updateDoc } from '@/lib/store';
import { accountLabel, payAccounts } from '@/lib/accounts';
import type { Bill, PayFreq } from '@/lib/types';

/** "Is this your paycheque?" cards, one per partner whose statements show pay that has not been confirmed. */
export function PayPrompts() {
  const doc = useAtomValue(docAtom);
  const found = payToConfirm(doc);
  if (!found.length) return null;
  return <div className="grid gap-4 md:grid-cols-2">{found.map(f => <PayPrompt key={f.person + f.sig} found={f} />)}</div>;
}

function PayPrompt({ found }: { found: PayFound }) {
  const doc = useAtomValue(docAtom);
  const [editing, setEditing] = useState(false);
  const [cheque, setCheque] = useState(found.cheque);
  const [freq, setFreq] = useState<PayFreq>(found.freq);
  const [days, setDays] = useState(found.days ?? [15, 31]);
  const name = who(doc, found.person);
  const entered = payOf(doc, found.person);
  const monthly = monthlyFrom(cheque, freq);
  const gap = monthly - entered;
  const lands = payAccounts(doc)[found.person];

  function accept() {
    updateDoc(d => {
      const key = found.person === 'p1' ? 'inc1' : 'inc2';
      d.settings.pay[found.person] = {
        ...d.settings.pay[found.person], freq, anchor: found.last || d.settings.pay[found.person].anchor,
        days: freq === 'semimonthly' ? (days as [number, number]) : undefined,
        confirmed: `${found.key}|${cheque}|${freq}`,
      };
      d.settings = applySplit({ ...d.settings, [key]: Math.round(monthly * 100) / 100 });
    });
    toast(`${name}'s pay is set to ${money0(monthly)} a month`);
  }

  function reject() {
    updateDoc(d => { d.settings.notPay = [...(d.settings.notPay ?? []), found.key]; });
    toast('Got it. That deposit will not be treated as pay.');
  }

  return (
    <Card className="grid animate-rise gap-3 border-good/40 bg-good/5">
      <div className="flex items-center gap-3">
        <span className="relative"><Avatar id={found.person} size={40} /><span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-good text-[11px] text-white"><LuBanknote /></span></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Is this {name}'s paycheque?</p>
          <p className="truncate text-[13px] text-muted">{found.label} · seen {found.count} time{found.count > 1 ? 's' : ''}{found.last ? `, last on ${dayLabel(found.last)}` : ''}</p>
          {lands && <p className="truncate text-[13px] text-muted">Direct deposit into {accountLabel(lands)}</p>}
        </div>
      </div>
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Each paycheque"><MoneyInput label="Paycheque amount" value={cheque} onChange={setCheque} /></Field>
          <Field label="Paid"><Select<PayFreq> value={freq} onChange={setFreq} options={(Object.keys(FREQS) as PayFreq[]).map(value => ({ value, label: FREQS[value] }))} /></Field>
          {freq === 'semimonthly' && (
            <Field label="On the"><Select value={`${days[0]}-${days[1]}`} onChange={v => setDays(SEMI_DAYS.find(o => o.value === v)!.days)} options={SEMI_DAYS.some(o => o.value === `${days[0]}-${days[1]}`) ? SEMI_DAYS : [{ value: `${days[0]}-${days[1]}`, label: `${ordinal(days[0])} and ${days[1] >= 31 ? 'last day' : ordinal(days[1])}` }, ...SEMI_DAYS]} /></Field>
          )}
        </div>
      ) : (
        <p className="leading-snug"><strong className="num">{money(cheque)}</strong> {freqWord(freq)}{freq === 'semimonthly' && found.days ? ` (the ${ordinal(found.days[0])} and ${found.days[1] >= 31 ? 'last day' : ordinal(found.days[1])})` : ''}, about <strong className="num">{money0(monthly)}</strong> a month.</p>
      )}
      {entered > 0 && Math.abs(gap) >= 1 && (
        <p className="text-[13px] text-muted">The plan uses {money0(entered)} a month now, so this {gap > 0 ? 'adds' : 'takes off'} <strong className="num text-ink">{money0(Math.abs(gap))}</strong>.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={accept}><LuCheck />{editing ? 'Save' : 'Yes, use this'}</Button>
        {!editing && <Button variant="soft" onClick={() => setEditing(true)}><LuPencil />Correct it</Button>}
        <Button variant="ghost" onClick={reject}>Not a paycheque</Button>
      </div>
    </Card>
  );
}

/** Repeating payments in the statements that are not on the checklist yet. */
export function RecurringFoundList({ limit = 6 }: { limit?: number }) {
  const doc = useAtomValue(docAtom);
  const [all, setAll] = useState(false);
  const found = detectRecurring(doc);
  if (!found.length) return null;
  const shown = all ? found : found.slice(0, limit);

  const toBill = (r: RecurringFound): Bill => ({ id: uid(), name: r.name, amount: r.amount, dueDay: r.dueDay, kind: 'bill', payer: r.payer, icon: r.icon, match: r.key, paid: {} });
  const add = (list: RecurringFound[]) => {
    updateDoc(d => { d.bills.push(...list.map(toBill)); });
    toast(list.length > 1 ? `${list.length} payments added to the checklist` : `${list[0].name} added to the checklist`);
  };
  const dismiss = (r: RecurringFound) => updateDoc(d => { d.settings.notBills = [...(d.settings.notBills ?? []), r.key]; });

  return (
    <section>
      <SectionTitle action={found.length > 1 && <Button size="sm" variant="soft" onClick={() => add(found)}><LuPlus />Add all {found.length}</Button>}>Found in your statements</SectionTitle>
      <Card className="divide-y divide-line p-0">
        {shown.map(r => (
          <div key={r.key} className="flex animate-rise items-center gap-3 px-4 py-3">
            <IconTile icon={r.icon} color="#0fa3a3" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name}</p>
              <p className="flex items-center gap-1.5 text-[13px] text-muted"><Avatar id={r.payer} size={16} />Around the {ordinal(r.dueDay)}, {r.months > 1 ? `${r.months} months running` : 'seen once'}</p>
            </div>
            <span className="num font-semibold">{money(r.amount)}</span>
            <Button size="icon" variant="soft" className="size-9" aria-label={`Add ${r.name} to the checklist`} onClick={() => add([r])}><LuPlus /></Button>
            <Button size="icon" variant="ghost" className="size-9" aria-label={`Dismiss ${r.name}`} onClick={() => dismiss(r)}><LuX /></Button>
          </div>
        ))}
        {found.length > shown.length && <button onClick={() => setAll(true)} className="w-full px-4 py-3 text-left text-sm font-semibold text-brand">Show {found.length - shown.length} more</button>}
      </Card>
      <p className="mt-2 text-[13px] text-muted">Added payments are ticked off automatically when they show up in a statement.</p>
    </section>
  );
}
