import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuPlus, LuTrash2, LuTrendingDown, LuTrendingUp } from 'react-icons/lu';
import type { Go } from '@/App';
import { SplitBar, TrendChart } from '@/components/charts/charts';
import { IconTile } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, Empty, Field, SectionTitle } from '@/components/ui/card';
import { MoneyInput, Segmented, Select, TextInput } from '@/components/ui/controls';
import { Avatar, Count, useOwnerOptions } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { useLast } from '@/lib/hooks';
import { ACCOUNT_TYPES } from '@/lib/defaults';
import { dayLabel, money, money0, monthLabel, uid } from '@/lib/format';
import { netWorth } from '@/lib/plan';
import { docAtom, snapshotNetWorth, toast, updateDoc } from '@/lib/store';
import type { Account, AccountType, Owner } from '@/lib/types';
import { cardChecks } from '@/lib/accounts';

const TYPE_COLOR: Record<AccountType, string> = { chequing: '#3b82f6', savings: '#12a150', investment: '#8b5cf6', property: '#4b3fe4', vehicle: '#0fa3a3', credit: '#e5484d', loan: '#ec8a2f', mortgage: '#d946ef' };

export function NetWorth(_: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const [editing, setEditing] = useState<Account | null>(null);
  const shown = useLast(editing);
  const nw = netWorth(doc);
  const cards = new Map(cardChecks(doc).map(c => [c.account.id, c]));
  const months = Object.keys(doc.snapshots).sort();
  const series = months.map(m => doc.snapshots[m].assets - doc.snapshots[m].debts);
  const change = series.length > 1 ? series[series.length - 1] - series[0] : 0;
  const add = (debt: boolean) => setEditing({ id: '', name: '', type: debt ? 'credit' : 'savings', owner: 'shared', balance: 0 });
  const group = (debt: boolean) => doc.accounts.filter(a => ACCOUNT_TYPES[a.type].debt === debt).sort((a, b) => b.balance - a.balance);

  return (
    <div className="stagger grid gap-6">
      <h1 className="text-2xl font-bold md:text-[28px]">Net worth</h1>

      {!doc.accounts.length ? (
        <Empty title="Add what you own and what you owe" text="Enter balances for your accounts, property and debts. Update them each month and the chart tracks your net worth over time.">
          <div className="flex flex-wrap justify-center gap-2"><Button variant="primary" size="lg" onClick={() => add(false)}><LuPlus />Add an asset</Button><Button size="lg" onClick={() => add(true)}><LuPlus />Add a debt</Button></div>
        </Empty>
      ) : (
        <>
          <Card className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-muted">Together you are worth</p>
                <Count value={nw.net} format={money0} className={cn('display block text-[44px] font-bold leading-none md:text-[52px]', nw.net < 0 && 'text-bad')} />
              </div>
              {series.length > 1 && (
                <p className={cn('flex items-center gap-1.5 font-semibold', change >= 0 ? 'text-good' : 'text-bad')}>
                  {change >= 0 ? <LuTrendingUp /> : <LuTrendingDown />}
                  <span className="num">{change >= 0 ? '+' : '-'}{money0(Math.abs(change))}</span>
                  <span className="font-normal text-muted">since {monthLabel(months[0], 'short')}</span>
                </p>
              )}
            </div>
            {series.length > 1 ? (
              <TrendChart values={series} color="#0a8058" label={i => monthLabel(months[i], 'short')} format={money0} ticks={[0, series.length - 1]} />
            ) : (
              <p className="rounded-2xl bg-canvas p-3 text-sm text-muted">The chart appears once there are two months of balances. Each change you make is recorded for the current month.</p>
            )}
            <div className="grid gap-2">
              <SplitBar parts={[{ label: 'Assets', value: nw.assets, color: '#0a8058' }, { label: 'Debts', value: nw.debts, color: '#d13438' }]} />
              <div className="flex justify-between text-sm"><span><span className="text-muted">Assets</span> <strong className="num">{money0(nw.assets)}</strong></span><span><span className="text-muted">Debts</span> <strong className="num">{money0(nw.debts)}</strong></span></div>
            </div>
          </Card>

          {[false, true].map(debt => (
            <section key={String(debt)}>
              <SectionTitle action={<Button size="sm" variant="soft" onClick={() => add(debt)}><LuPlus />Add</Button>}>{debt ? 'What you owe' : 'What you own'}</SectionTitle>
              <Card className="divide-y divide-line p-0">
                {group(debt).map(a => (
                  <button key={a.id} onClick={() => setEditing(a)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition first:rounded-t-3xl last:rounded-b-3xl hover:bg-canvas">
                    <IconTile icon={ACCOUNT_TYPES[a.type].icon} color={TYPE_COLOR[a.type]} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{a.name}</span><span className="block truncate text-[13px] text-muted">{[ACCOUNT_TYPES[a.type].label, a.last4 && `••${a.last4}`, a.asOf && `from statement ${dayLabel(a.asOf)}`].filter(Boolean).join(' · ')}</span>{cards.get(a.id) && <span className={cn('block text-[13px] font-medium', cards.get(a.id)!.status === 'paid' ? 'text-good' : cards.get(a.id)!.status === 'late' ? 'text-bad' : 'text-warn')}>{cards.get(a.id)!.text}</span>}</span>
                    <span className="num font-semibold">{money(a.balance)}</span>
                    <Avatar id={a.owner} />
                  </button>
                ))}
                {!group(debt).length && <p className="p-4 text-muted">{debt ? 'No debts recorded.' : 'No assets recorded.'}</p>}
              </Card>
            </section>
          ))}
        </>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={shown?.id ? 'Edit account' : 'New account'}>
        {shown && <AccountEditor key={shown.id || 'new'} initial={shown} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function AccountEditor({ initial, onDone }: { initial: Account; onDone: () => void }) {
  const [a, setA] = useState(initial);
  const owners = useOwnerOptions<Owner>(['shared', 'p1', 'p2']);
  const types = (Object.keys(ACCOUNT_TYPES) as AccountType[]).map(value => ({ value, label: ACCOUNT_TYPES[value].label, hint: ACCOUNT_TYPES[value].debt ? 'Something you owe' : 'Something you own', icon: <IconTile icon={ACCOUNT_TYPES[value].icon} color={TYPE_COLOR[value]} size="sm" /> }));

  function save() {
    const name = a.name.trim() || ACCOUNT_TYPES[a.type].label;
    updateDoc(d => {
      const next = { ...a, name, id: a.id || uid() };
      const i = d.accounts.findIndex(o => o.id === a.id);
      if (i < 0) d.accounts.push(next); else d.accounts[i] = next;
      snapshotNetWorth(d);
    });
    toast('Balance saved');
    onDone();
  }

  return (
    <>
      <Field label="Type"><Select value={a.type} onChange={type => setA({ ...a, type })} options={types} /></Field>
      <Field label="Name"><TextInput placeholder={ACCOUNT_TYPES[a.type].label} value={a.name} onChange={e => setA({ ...a, name: e.target.value })} /></Field>
      <Field label={ACCOUNT_TYPES[a.type].debt ? 'Amount owed' : 'Current balance'}><MoneyInput label="Balance" value={a.balance} onChange={balance => setA({ ...a, balance })} /></Field>
      <Field label="Belongs to"><Segmented value={a.owner} onChange={owner => setA({ ...a, owner })} options={owners} /></Field>
      <div className="flex gap-3">
        {a.id && <Button variant="danger" size="lg" aria-label="Delete account" onClick={() => { updateDoc(d => { d.accounts = d.accounts.filter(o => o.id !== a.id); snapshotNetWorth(d); }); toast('Account removed'); onDone(); }}><LuTrash2 /></Button>}
        <Button variant="primary" size="lg" className="flex-1" onClick={save}>Save</Button>
      </div>
    </>
  );
}
