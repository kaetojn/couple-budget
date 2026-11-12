import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuArrowRight, LuStethoscope, LuUpload } from 'react-icons/lu';
import type { Go } from '@/App';
import { BarChart, TrendChart } from '@/components/charts/charts';
import { IconTile } from '@/components/icons';
import { MonthSwitcher } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Card, Empty, SectionTitle } from '@/components/ui/card';
import { Avatar, Count, Progress } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { computeMonth, cumulative, monthsWithData, settleText, spendByDay } from '@/lib/compute';
import { addMonths, daysIn, money, money0, monthKey, monthLabel, ordinal } from '@/lib/format';
import { agenda, netWorth, suggestions } from '@/lib/plan';
import { docAtom, monthAtom } from '@/lib/store';
import { CheckupSheet } from './CheckupSheet';

export function Home({ go }: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const [month, setMonth] = useAtom(monthAtom);
  const [checkup, setCheckup] = useState(false);
  const tx = doc.months[month]?.tx ?? [];
  const r = computeMonth(doc, tx);
  const left = r.budget - r.total;
  const today = new Date();
  const isNow = month === monthKey();
  const series = cumulative(spendByDay(doc, tx, month));
  const n = daysIn(month);
  const cats = doc.categories.filter(c => c.kind === 'expense' && (r.byCat[c.name] || 0) > 0).sort((a, b) => r.byCat[b.name] - r.byCat[a.name]).slice(0, 6);
  const upcoming = agenda(doc, monthKey()).filter(a => a.day >= today.getDate() && !(a.bill?.paid[monthKey()])).slice(0, 4);
  const recent = Array.from({ length: 6 }, (_, i) => addMonths(monthsWithData(doc).pop() ?? month, i - 5));
  const tips = suggestions(doc, month).slice(0, 3);
  const nw = netWorth(doc);
  const joint = doc.settings.arrangement === 'joint';

  return (
    <div className="stagger grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-[28px]">{doc.settings.p1} and {doc.settings.p2}</h1>
        <MonthSwitcher />
      </div>

      {tx.length ? (
        <Card className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-muted">{left >= 0 ? 'Left to spend' : 'Over budget by'}</p>
              <Count value={Math.abs(left)} format={money} className={cn('display block text-[44px] font-bold leading-none md:text-[52px]', left < 0 && 'text-bad')} />
            </div>
            <p className="num text-right text-muted"><strong className="text-ink">{money(r.total)}</strong> spent<br />of {money(r.budget)} budgeted</p>
          </div>
          <TrendChart values={series} upTo={isNow ? today.getDate() - 1 : undefined} pace={r.budget} paceLabel="Budget pace" label={i => `${monthLabel(month, 'short')} ${i + 1}`} format={money0} ticks={[0, 7, 14, 21, n - 1]} />
        </Card>
      ) : (
        <Empty title={`No statements for ${monthLabel(month)} yet`} text="Add each partner's statements and Claude will categorize every transaction.">
          <Button variant="primary" size="lg" onClick={() => go('month')}><LuUpload />Add statements</Button>
        </Empty>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="grid content-between gap-3 border-brand bg-brand text-white">
          <p className="text-white/75">{joint ? 'Shared spending' : 'Settle-up'}</p>
          <Count value={joint ? r.shared : r.settle?.amount ?? 0} format={money} className="display text-3xl font-bold" />
          <p className="text-[15px] font-medium text-white/90">{joint ? 'One joint account, so nothing to settle.' : tx.length ? settleText(doc, r) : 'Shows once statements are added.'}</p>
        </Card>
        <Card className="grid content-between gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-xl text-brand"><LuStethoscope /></span>
          <div>
            <p className="font-bold">Financial check-up</p>
            <p className="text-[15px] text-muted">A plain-language read on your plan, spending, debts and net worth.</p>
          </div>
          <Button variant="soft" onClick={() => setCheckup(true)}>{doc.months[month]?.checkup ? 'Open the check-up' : 'Get a check-up'}</Button>
        </Card>
        <Card className="grid content-between gap-3">
          <p className="text-muted">Net worth</p>
          <Count value={nw.net} format={money0} className="display text-3xl font-bold" />
          <Button variant="ghost" className="justify-self-start px-0 hover:bg-transparent" onClick={() => go('worth')}>{doc.accounts.length ? 'See accounts' : 'Add your accounts'}<LuArrowRight /></Button>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {cats.length > 0 && (
          <section>
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => go('budgets')}>All budgets</Button>}>Where it went</SectionTitle>
            <Card className="grid gap-4">
              {cats.map(c => (
                <div key={c.name} className="flex items-center gap-3">
                  <IconTile icon={c.icon} color={c.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2"><span className="truncate font-semibold">{c.name}</span><span className="num font-semibold">{money(r.byCat[c.name])}</span></div>
                    <Progress value={r.byCat[c.name]} max={c.budget || r.byCat[c.name]} color={c.color} className="my-1" />
                    <span className={cn('num text-[13px]', c.budget && r.byCat[c.name] > c.budget ? 'font-semibold text-bad' : 'text-muted')}>{c.budget ? (r.byCat[c.name] > c.budget ? `${money(r.byCat[c.name] - c.budget)} over` : `${money(c.budget - r.byCat[c.name])} left`) : 'No budget set'}</span>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        <div className="grid content-start gap-6">
          <section>
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => go('plan')}>Open plan</Button>}>Coming up</SectionTitle>
            <Card className="grid gap-3">
              {upcoming.length ? upcoming.map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  {a.type === 'pay' ? <Avatar id={a.person!} size={40} /> : <IconTile icon={a.bill!.icon} color={a.bill!.kind === 'debt' ? '#d13438' : '#4b3fe4'} />}
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.label}</p><p className="text-[13px] text-muted">{a.type === 'pay' ? 'Paid' : 'Due'} on the {ordinal(a.day)}</p></div>
                  <span className={cn('num font-semibold', a.type === 'pay' && 'text-good')}>{a.type === 'pay' ? '+' : ''}{money(a.amount)}</span>
                </div>
              )) : <p className="text-muted">Nothing left this month. Every bill is marked paid.</p>}
            </Card>
          </section>

          {monthsWithData(doc).length > 0 && (
            <section>
              <SectionTitle>Last six months</SectionTitle>
              <Card><BarChart bars={recent.map(m => ({ key: m, label: monthLabel(m, 'short'), value: computeMonth(doc, doc.months[m]?.tx ?? []).total }))} active={month} onSelect={setMonth} target={r.budget} format={money0} /></Card>
            </section>
          )}
        </div>
      </div>

      {tips.length > 0 && (
        <section>
          <SectionTitle>Based on your incomes and setup</SectionTitle>
          <Card><ul className="grid gap-3">{tips.map((t, i) => <li key={i} className="flex gap-3 leading-snug"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />{t}</li>)}</ul></Card>
        </section>
      )}

      <CheckupSheet open={checkup} onClose={() => setCheckup(false)} />
    </div>
  );
}
