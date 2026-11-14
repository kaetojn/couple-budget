import { useAtomValue } from 'jotai';
import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { LuCheck, LuChevronDown } from 'react-icons/lu';
import type { Go } from '@/App';
import { SplitBar } from '@/components/charts/charts';
import { IconTile } from '@/components/icons';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, Field } from '@/components/ui/card';
import { MoneyInput, Segmented, Select, Slider, TextInput } from '@/components/ui/controls';
import { Avatar, Progress } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { ARRANGEMENTS, METHODS } from '@/lib/defaults';
import { money, money0, monthLabel, pct } from '@/lib/format';
import { allocation, applySplit, billPayment, breakdownAdvice, planOf, splitText } from '@/lib/plan';
import { IncomeField, OtherIncomeEditor, PaySchedulePicker } from './PayFields';
import { docAtom, importAtom, monthAtom, store, toast, updateDoc } from '@/lib/store';
import type { Arrangement, PersonId, Settings, SplitMethod } from '@/lib/types';

type Step = 'names' | 'setup' | 'income' | 'pay' | 'split' | 'plan' | 'done';
const options = <T extends string>(o: Record<T, string | { label: string; hint: string }>) =>
  (Object.entries(o) as [T, string | { label: string; hint: string }][]).map(([value, v]) => (typeof v === 'string' ? { value, label: v } : { value, label: v.label, hint: v.hint }));

/** The first-run guide. Each answer is saved as you go. */
export function Onboarding({ go }: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const s = doc.settings;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [error, setError] = useState('');
  const steps: Step[] = ['names', 'setup', 'income', 'pay', ...(s.arrangement === 'joint' ? [] : (['split'] as Step[])), 'plan', 'done'];
  const step = steps[Math.min(index, steps.length - 1)];
  const set = (patch: Partial<Settings>) => updateDoc(d => { d.settings = applySplit({ ...d.settings, ...patch }); });
  const n1 = s.p1 || 'First partner';
  const n2 = s.p2 || 'Second partner';
  const plan = planOf(doc, month);
  // Transactions already saved before setup (earlier imports or testing). Setup starts blank unless the couple keeps them.
  const earlier = Object.entries(doc.months).filter(([, m]) => m?.tx?.length).map(([k]) => k).sort();
  const earlierCount = earlier.reduce((n, k) => n + doc.months[k].tx.length, 0);
  const [fresh, setFresh] = useState(true);

  function finish(upload: boolean) {
    updateDoc(d => {
      if (earlier.length && fresh) {
        d.months = {};
        d.snapshots = {};
        d.accounts = [];
        for (const b of d.bills) b.paid = {};
      }
      d.settings = applySplit({ ...d.settings, onboarded: true });
    });
    toast('Setup saved');
    if (upload) {
      store.set(importAtom, true);
      go('month');
    } else go('home');
  }

  function next(e: FormEvent) {
    e.preventDefault();
    let problem = '';
    if (step === 'names') {
      if (!s.p1.trim() || !s.p2.trim()) problem = 'Enter both names to continue.';
      else if (s.p1.trim().toLowerCase() === s.p2.trim().toLowerCase()) problem = 'Use two different names so your accounts can be told apart.';
    }
    if (step === 'income' && !(s.inc1 + s.inc2 > 0)) problem = 'Enter at least one income to continue.';
    setError(problem);
    if (problem) return;
    if (step === 'done') return finish(true);
    setDir(1);
    setIndex(i => i + 1);
  }

  const advice = breakdownAdvice(doc, month);
  const fixed = doc.bills.filter(b => b.kind === 'bill');
  const people: PersonId[] = ['p1', 'p2'];

  const body: Record<Step, ReactNode> = {
    names: (
      <>
        <Head title="First, what are your names?" text="They label accounts, shares and who looks after which costs." />
        <Field label="First partner"><TextInput autoFocus value={s.p1} onChange={e => set({ p1: e.target.value })} autoComplete="off" /></Field>
        <Field label="Second partner"><TextInput value={s.p2} onChange={e => set({ p2: e.target.value })} autoComplete="off" /></Field>
      </>
    ),
    setup: (
      <>
        <Head title={`How do ${n1} and ${n2} manage money?`} text="This decides how shared costs are checked and how advice is worded." />
        <Select<Arrangement> value={s.arrangement} onChange={arrangement => set({ arrangement })} options={options(ARRANGEMENTS)} />
        <p key={s.arrangement} className="animate-rise text-muted">{ARRANGEMENTS[s.arrangement].hint}</p>
      </>
    ),
    income: (
      <>
        <Head title="What does each of you earn?" text="Your incomes drive the suggested split, the paycheque plan and the insights on your home page." />
        {people.map(p => <IncomeField key={p} person={p} />)}
        <OtherIncomeEditor />
        {plan.income > 0 && <p className="text-muted">Together you take home <strong className="num text-ink">{money(plan.income)}</strong> a month.</p>}
      </>
    ),
    split: (
      <>
        <Head title="How should shared costs be split?" text="Rent, groceries and the rest of your shared budgets are divided this way." />
        <Segmented<SplitMethod> value={s.splitMethod} onChange={splitMethod => set({ splitMethod })} options={[{ value: 'income', label: 'By income' }, { value: 'even', label: '50/50' }, { value: 'custom', label: 'Custom' }]} />
        {s.splitMethod === 'custom' && <Slider label={`${n1}'s share`} value={Math.round(s.split)} max={100} onChange={split => set({ split })} />}
        <SplitBar parts={[{ label: n1, value: s.split, color: '#4b3fe4' }, { label: n2, value: 100 - s.split, color: '#d23a76' }]} height={16} />
        <div className="flex justify-between font-semibold"><span className="flex items-center gap-2"><Avatar id="p1" />{n1} <span className="num">{pct(s.split)}</span></span><span className="flex items-center gap-2"><span className="num">{pct(100 - s.split)}</span> {n2}<Avatar id="p2" /></span></div>
        <p className="text-muted">Of {money(plan.sharedBudget)} in shared budgets, {n1} covers {money(plan.sharedBudget * plan.share)} and {n2} covers {money(plan.sharedBudget * (1 - plan.share))}.</p>
      </>
    ),
    pay: (
      <>
        <Head title="How often do you get paid?" text="Paydays line up against your bills, so the Plan shows which paycheque covers what." />
        {people.map(p => (
          <div key={p} className="grid gap-3 rounded-2xl bg-canvas p-3">
            <div className="flex items-center gap-2 font-semibold"><Avatar id={p} />{p === 'p1' ? n1 : n2}</div>
            <PaySchedulePicker person={p} />
          </div>
        ))}
        <p className="text-[13px] text-muted">Once you add a statement, the app checks these against your actual deposits.</p>
      </>
    ),
    plan: (
      <>
        <Head title="Here is how your pay is spoken for" text="Built from your bills, your shared budgets and your savings. Change anything now or later." />
        {fixed.length > 0 && (
          <div className="rounded-2xl bg-canvas p-3">
            <p className="mb-2 text-[13px] font-semibold text-muted">Fixed bills, {money0(fixed.reduce((a, b) => a + billPayment(b, month), 0))} a month</p>
            <div className="flex flex-wrap gap-1.5">{fixed.map(b => <span key={b.id} className="num rounded-full bg-surface px-2.5 py-1 text-[13px] font-medium">{b.name} {money0(billPayment(b, month))}</span>)}</div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {people.map(p => {
            const a = allocation(doc, p, month);
            const parts = [
              { label: 'Bills', value: a.bills, color: '#4b3fe4' },
              { label: 'Debt', value: a.debt, color: '#d13438' },
              { label: 'Everyday', value: a.flexible, color: '#0fa3a3' },
              { label: 'Savings', value: a.savings, color: '#0a8058' },
              { label: 'Yours', value: Math.max(0, a.left), color: '#cbd2e0' },
            ];
            return (
              <div key={p} className="grid gap-2 rounded-2xl border border-line p-3">
                <div className="flex items-center gap-2"><Avatar id={p} size={28} /><span className="flex-1 font-semibold">{p === 'p1' ? n1 : n2}</span><span className="num text-[13px] text-muted">{money0(a.income)}/mo</span></div>
                <SplitBar parts={parts} height={12} />
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-[13px]">
                  {parts.slice(0, 4).filter(x => x.value > 0.5).map(x => <Fragment key={x.label}><dt className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full" style={{ background: x.color }} />{x.label}</dt><dd className="num text-right">{money0(x.value)}</dd></Fragment>)}
                  <dt className={cn('font-semibold', a.left < 0 && 'text-bad')}>{a.left < 0 ? 'Short by' : 'Left for you'}</dt><dd className={cn('num text-right font-semibold', a.left < 0 && 'text-bad')}>{money0(Math.abs(a.left))}</dd>
                </dl>
              </div>
            );
          })}
        </div>
        {advice.text && (
          <div key={advice.text} className={cn('grid animate-rise gap-2 rounded-2xl p-3 text-sm', advice.kind === 'trim' ? 'bg-bad/8' : advice.kind === 'save' ? 'bg-good/8' : 'bg-canvas')}>
            <p>{advice.text}</p>
            {advice.apply && <Button size="sm" variant={advice.kind === 'trim' ? 'secondary' : 'primary'} className="justify-self-start" onClick={() => { updateDoc(advice.apply!); toast('Plan updated'); }}>{advice.action}</Button>}
          </div>
        )}
        <details className="group rounded-2xl bg-canvas">
          <summary className="flex cursor-pointer list-none items-center justify-between p-3 font-semibold">Adjust savings and budgets<LuChevronDown className="transition group-open:rotate-180" aria-hidden /></summary>
          <div className="grid gap-3 px-2 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${n1} to savings`}><MoneyInput label={`${n1} joint savings`} value={s.sav1} onChange={sav1 => set({ sav1 })} /></Field>
              <Field label={`${n2} to savings`}><MoneyInput label={`${n2} joint savings`} value={s.sav2} onChange={sav2 => set({ sav2 })} /></Field>
            </div>
            <div className="grid max-h-64 gap-2 overflow-y-auto">
              {doc.categories.map((c, i) => c.kind === 'expense' && c.budget > 0 && (
                <div key={c.name} className="flex items-center gap-3">
                  <IconTile icon={c.icon} color={c.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <MoneyInput label={`${c.name} budget`} className="h-10 w-32" value={c.budget} onChange={v => updateDoc(d => { d.categories[i].budget = v; })} />
                </div>
              ))}
            </div>
          </div>
        </details>
        <Progress value={plan.planned} max={plan.income} />
        <p className={cn(plan.free < 0 ? 'font-semibold text-bad' : 'text-muted')}>{money(plan.planned)} planned of {money(plan.income)} take-home. {plan.free < 0 ? `${money(-plan.free)} over.` : `${money(plan.free)} left over.`}</p>
      </>
    ),
    done: (
      <>
        <span className="grid size-14 animate-pop place-items-center rounded-full bg-good text-3xl text-white"><LuCheck /></span>
        <Head title={`You are set, ${n1} and ${n2}`} text="Last step: add this month's statements. Each of you can upload PDFs or banking app screenshots, and the app sorts every transaction." />
        {earlier.length > 0 && (
          <div className="grid gap-2 rounded-2xl bg-canvas p-3">
            <p className="text-sm">This household already has <strong>{earlierCount} transactions</strong> from {monthLabel(earlier[0])}{earlier.length > 1 ? ` to ${monthLabel(earlier[earlier.length - 1])}` : ''}, probably from earlier testing.</p>
            <Segmented size="sm" value={fresh ? 'fresh' : 'keep'} onChange={v => setFresh(v === 'fresh')} options={[{ value: 'fresh', label: 'Start fresh' }, { value: 'keep', label: 'Keep them' }]} />
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
          <dt className="text-muted">Setup</dt><dd className="font-medium">{ARRANGEMENTS[s.arrangement].label}</dd>
          {s.arrangement !== 'joint' && <><dt className="text-muted">Shared costs</dt><dd className="num font-medium">{splitText(s)}, {METHODS[s.splitMethod].toLowerCase()}</dd></>}
          <dt className="text-muted">Take-home</dt><dd className="num font-medium">{money(plan.income)} a month</dd>
          <dt className="text-muted">Planned</dt><dd className="num font-medium">{money(plan.planned)} a month</dd>
        </dl>
      </>
    ),
  };

  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 py-8 md:pt-[8vh]">
      <div className="flex items-center gap-3"><Logo size={36} /><Progress value={index + 1} max={steps.length} className="flex-1" /></div>
      <Card key={step} className={dir > 0 ? 'animate-slide-in' : 'animate-slide-back'}>
        <form onSubmit={next} className="stagger grid gap-4">
          {body[step]}
          {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
          {step === 'done' ? (
            <div className="grid gap-2 pt-1">
              <Button type="submit" variant="primary" size="lg">Upload statements</Button>
              <div className="flex justify-between gap-2">
                <Button onClick={() => { setDir(-1); setError(''); setIndex(i => i - 1); }}>Back</Button>
                <Button variant="ghost" onClick={() => finish(false)}>Skip for now</Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-3 pt-1">
              {index > 0 ? <Button onClick={() => { setDir(-1); setError(''); setIndex(i => i - 1); }}>Back</Button> : <span />}
              <Button type="submit" variant="primary" size="lg">Continue</Button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}

function Head({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h1 className="text-balance text-2xl font-bold">{title}</h1>
      <p className="text-muted">{text}</p>
    </div>
  );
}
