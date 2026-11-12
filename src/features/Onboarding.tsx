import { useAtomValue } from 'jotai';
import { useState, type FormEvent, type ReactNode } from 'react';
import { LuCheck } from 'react-icons/lu';
import type { Go } from '@/App';
import { SplitBar } from '@/components/charts/charts';
import { IconTile } from '@/components/icons';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, Field } from '@/components/ui/card';
import { MoneyInput, Segmented, Select, Slider, TextInput } from '@/components/ui/controls';
import { Avatar, Progress } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { ARRANGEMENTS, FREQS, METHODS } from '@/lib/defaults';
import { money, pct } from '@/lib/format';
import { applySplit, planOf, splitText } from '@/lib/plan';
import { docAtom, monthAtom, toast, updateDoc } from '@/lib/store';
import type { Arrangement, PayFreq, PersonId, Settings, SplitMethod } from '@/lib/types';

type Step = 'names' | 'setup' | 'income' | 'split' | 'pay' | 'plan' | 'done';
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
  const steps: Step[] = ['names', 'setup', 'income', ...(s.arrangement === 'joint' ? [] : (['split'] as Step[])), 'pay', 'plan', 'done'];
  const step = steps[Math.min(index, steps.length - 1)];
  const set = (patch: Partial<Settings>) => updateDoc(d => { d.settings = applySplit({ ...d.settings, ...patch }); });
  const n1 = s.p1 || 'First partner';
  const n2 = s.p2 || 'Second partner';
  const plan = planOf(doc, month);

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
    if (step === 'done') {
      set({ onboarded: true });
      toast('Setup saved');
      go('home');
      return;
    }
    setDir(1);
    setIndex(i => i + 1);
  }

  const paySetup = (p: PersonId) => (
    <div className="grid gap-2 rounded-2xl bg-canvas p-3">
      <div className="flex items-center gap-2 font-semibold"><Avatar id={p} />{p === 'p1' ? n1 : n2}</div>
      <Select<PayFreq> value={s.pay[p].freq} onChange={freq => set({ pay: { ...s.pay, [p]: { ...s.pay[p], freq } } })} options={options(FREQS)} />
      {s.pay[p].freq !== 'semimonthly' && (
        <Field label="A recent payday">
          <TextInput type="date" value={s.pay[p].anchor} onChange={e => e.target.value && set({ pay: { ...s.pay, [p]: { ...s.pay[p], anchor: e.target.value } } })} />
        </Field>
      )}
    </div>
  );

  const body: Record<Step, ReactNode> = {
    names: (
      <>
        <Head title="First, what are your names?" text="They label accounts, shares and the settle-up." />
        <Field label="First partner"><TextInput autoFocus value={s.p1} onChange={e => set({ p1: e.target.value })} autoComplete="off" /></Field>
        <Field label="Second partner"><TextInput value={s.p2} onChange={e => set({ p2: e.target.value })} autoComplete="off" /></Field>
      </>
    ),
    setup: (
      <>
        <Head title={`How do ${n1} and ${n2} manage money?`} text="This decides whether there is a settle-up and how advice is worded." />
        <Select<Arrangement> value={s.arrangement} onChange={arrangement => set({ arrangement })} options={options(ARRANGEMENTS)} />
        <p key={s.arrangement} className="animate-rise text-muted">{ARRANGEMENTS[s.arrangement].hint}</p>
      </>
    ),
    income: (
      <>
        <Head title="What does each of you take home in a month?" text="After tax. Your incomes drive the suggested split and the insights on your home page." />
        <Field label={n1}><MoneyInput label={`${n1} monthly take-home`} value={s.inc1} onChange={inc1 => set({ inc1 })} step={100} /></Field>
        <Field label={n2}><MoneyInput label={`${n2} monthly take-home`} value={s.inc2} onChange={inc2 => set({ inc2 })} step={100} /></Field>
        {plan.income > 0 && <p className="text-muted">Together you take home <strong className="num text-ink">{money(plan.income)}</strong> a month.</p>}
      </>
    ),
    split: (
      <>
        <Head title="How should shared costs be split?" text="Rent, groceries and the rest of your shared budgets are divided this way." />
        <Segmented<SplitMethod> value={s.splitMethod} onChange={splitMethod => set({ splitMethod })} options={[{ value: 'income', label: 'By income' }, { value: 'even', label: '50/50' }, { value: 'custom', label: 'Custom' }]} />
        {s.splitMethod === 'custom' && <Slider label={`${n1}'s share`} value={Math.round(s.split)} max={100} onChange={split => set({ split })} />}
        <SplitBar parts={[{ label: n1, value: s.split, color: '#4b3fe4' }, { label: n2, value: 100 - s.split, color: '#e8508b' }]} height={16} />
        <div className="flex justify-between font-semibold"><span className="flex items-center gap-2"><Avatar id="p1" />{n1} <span className="num">{pct(s.split)}</span></span><span className="flex items-center gap-2"><span className="num">{pct(100 - s.split)}</span> {n2}<Avatar id="p2" /></span></div>
        <p className="text-muted">Of {money(plan.sharedBudget)} in shared budgets, {n1} covers {money(plan.sharedBudget * plan.share)} and {n2} covers {money(plan.sharedBudget * (1 - plan.share))}.</p>
      </>
    ),
    pay: (
      <>
        <Head title="When do you get paid?" text="Paydays line up against your bills in the Plan, so you can see which paycheque covers what." />
        {paySetup('p1')}
        {paySetup('p2')}
      </>
    ),
    plan: (
      <>
        <Head title="Set your monthly plan" text="These start from your current numbers. Change any of them now or later." />
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${n1} to savings`}><MoneyInput label={`${n1} joint savings`} value={s.sav1} onChange={sav1 => set({ sav1 })} /></Field>
          <Field label={`${n2} to savings`}><MoneyInput label={`${n2} joint savings`} value={s.sav2} onChange={sav2 => set({ sav2 })} /></Field>
        </div>
        <div className="grid max-h-64 gap-2 overflow-y-auto rounded-2xl bg-canvas p-2">
          {doc.categories.map((c, i) => c.kind === 'expense' && c.budget > 0 && (
            <div key={c.name} className="flex items-center gap-3">
              <IconTile icon={c.icon} color={c.color} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              <MoneyInput label={`${c.name} budget`} className="h-10 w-32" value={c.budget} onChange={v => updateDoc(d => { d.categories[i].budget = v; })} />
            </div>
          ))}
        </div>
        <Progress value={plan.planned} max={plan.income} />
        <p className={cn(plan.free < 0 ? 'font-semibold text-bad' : 'text-muted')}>{money(plan.planned)} planned of {money(plan.income)} take-home. {plan.free < 0 ? `${money(-plan.free)} over.` : `${money(plan.free)} left over.`}</p>
      </>
    ),
    done: (
      <>
        <span className="grid size-14 animate-pop place-items-center rounded-full bg-good text-3xl text-white"><LuCheck /></span>
        <Head title={`You are set, ${n1} and ${n2}`} text="Your home page is ready. Add statements each month and it fills in with what you spent." />
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
          <div className="flex justify-between gap-3 pt-1">
            {index > 0 ? <Button onClick={() => { setDir(-1); setError(''); setIndex(i => i - 1); }}>Back</Button> : <span />}
            <Button type="submit" variant="primary" size="lg">{step === 'done' ? 'Open my home page' : 'Continue'}</Button>
          </div>
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
