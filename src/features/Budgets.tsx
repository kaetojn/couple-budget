import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuChevronRight, LuPlus, LuTrash2 } from 'react-icons/lu';
import type { Go } from '@/App';
import { Donut, Legend } from '@/components/charts/charts';
import { IconTile, PICKABLE } from '@/components/icons';
import { ColorPicker, IconPicker, MonthSwitcher } from '@/components/pickers';
import { Button } from '@/components/ui/button';
import { Card, Field, SectionTitle } from '@/components/ui/card';
import { MoneyInput, Segmented, Slider, TextInput } from '@/components/ui/controls';
import { Avatar, Progress } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { computeMonth, ownerFor, who } from '@/lib/compute';
import { COLORS } from '@/lib/defaults';
import { money, money0, pct } from '@/lib/format';
import { planOf } from '@/lib/plan';
import { docAtom, monthAtom, toast, updateDoc } from '@/lib/store';
import type { Category, Scope } from '@/lib/types';

const SCOPES: Scope[] = ['shared', 'p1', 'p2', 'personal'];

export function Budgets(_: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const [editing, setEditing] = useState<{ original: string | null; draft: Category } | null>(null);
  const r = computeMonth(doc, doc.months[month]?.tx ?? []);
  const plan = planOf(doc, month);
  const expense = doc.categories.filter(c => c.kind === 'expense');
  const budgeted = expense.filter(c => c.budget > 0).sort((a, b) => b.budget - a.budget);
  const slices = [...budgeted.slice(0, 7).map(c => ({ label: c.name, value: c.budget, color: c.color })), ...(budgeted.length > 7 ? [{ label: 'Everything else', value: budgeted.slice(7).reduce((a, c) => a + c.budget, 0), color: '#cbd2e0' }] : [])];
  const add = () => setEditing({ original: null, draft: { name: '', budget: 0, scope: 'shared', kind: 'expense', icon: 'dots', color: COLORS[expense.length % COLORS.length] } });

  return (
    <div className="stagger grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-[28px]">Budgets</h1>
        <MonthSwitcher />
      </div>

      <Card className="flex flex-col items-center gap-6 sm:flex-row">
        <Donut slices={slices}>
          <div className="display text-2xl font-bold">{money0(plan.budget)}</div>
          <div className="text-xs text-muted">a month</div>
        </Donut>
        <div className="grid w-full flex-1 gap-3">
          <p className="text-muted">{plan.income ? <>Budgets take <strong className="num text-ink">{pct((plan.budget / plan.income) * 100)}</strong> of your {money0(plan.income)} take-home.</> : 'Add your incomes in Settings to see budgets as a share of take-home.'}</p>
          <Legend parts={slices.slice(0, 6)} format={money0} />
        </div>
      </Card>

      {SCOPES.map(scope => {
        const list = expense.filter(c => c.scope === scope);
        if (!list.length) return null;
        const total = list.reduce((a, c) => a + c.budget, 0);
        return (
          <section key={scope}>
            <SectionTitle action={<span className="num text-sm font-semibold text-muted">{money0(total)} budgeted</span>}>
              <span className="flex items-center gap-2"><Avatar id={scope} />{scope === 'personal' ? 'Whoever pays' : who(doc, scope)}</span>
            </SectionTitle>
            <Card className="divide-y divide-line p-0">
              {list.map(c => {
                const spent = r.byCat[c.name] || 0;
                return (
                  <button key={c.name} onClick={() => setEditing({ original: c.name, draft: { ...c } })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition first:rounded-t-3xl last:rounded-b-3xl hover:bg-canvas">
                    <IconTile icon={c.icon} color={c.color} />
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2"><span className="truncate font-semibold">{c.name}</span><span className="num font-semibold">{c.budget ? money0(c.budget) : <span className="font-normal text-muted">No budget</span>}</span></span>
                      {c.budget > 0 && <Progress value={spent} max={c.budget} color={c.color} className="my-1.5" />}
                      <span className={cn('num block text-[13px]', c.budget && spent > c.budget ? 'font-semibold text-bad' : 'text-muted')}>{money(spent)} spent{c.budget ? (spent > c.budget ? `, ${money(spent - c.budget)} over` : `, ${money(c.budget - spent)} left`) : ''}</span>
                    </span>
                    <LuChevronRight className="shrink-0 text-muted" aria-hidden />
                  </button>
                );
              })}
            </Card>
          </section>
        );
      })}

      <Button variant="soft" size="lg" onClick={add}><LuPlus />Add a category</Button>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.original ? 'Edit category' : 'New category'}>
        {editing && <CategoryEditor key={editing.original ?? 'new'} original={editing.original} initial={editing.draft} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function CategoryEditor({ original, initial, onDone }: { original: string | null; initial: Category; onDone: () => void }) {
  const doc = useAtomValue(docAtom);
  const [c, setC] = useState(initial);
  const [error, setError] = useState('');
  const set = (patch: Partial<Category>) => setC(prev => ({ ...prev, ...patch }));
  const scopes = SCOPES.map(value => ({ value, label: value === 'personal' ? 'Whoever pays' : who(doc, value), icon: <Avatar id={value} size={18} /> }));
  const sliderMax = Math.max(500, Math.ceil((initial.budget * 2) / 100) * 100);

  function save() {
    const name = c.name.trim();
    if (!name) return setError('Give the category a name.');
    if (doc.categories.some(o => o.name.toLowerCase() === name.toLowerCase() && o.name !== original)) return setError('You already have a category with that name.');
    updateDoc(d => {
      const next = { ...c, name };
      const i = d.categories.findIndex(o => o.name === original);
      if (i < 0) d.categories.splice(d.categories.findIndex(o => o.kind !== 'expense'), 0, next);
      else d.categories[i] = next;
      for (const m of Object.values(d.months)) {
        for (const t of m.tx) {
          if (t.category !== original) continue;
          t.category = name;
          if (next.scope !== initial.scope) t.owner = ownerFor(next, t.paidBy);
        }
      }
      for (const rule of d.rules) if (rule.category === original) rule.category = name;
    });
    toast(original ? 'Category updated' : 'Category added');
    onDone();
  }

  function remove() {
    updateDoc(d => {
      d.categories = d.categories.filter(o => o.name !== original);
      for (const m of Object.values(d.months)) for (const t of m.tx) if (t.category === original) t.category = 'Other';
      d.rules = d.rules.filter(rule => rule.category !== original);
    });
    toast('Category removed. Its transactions moved to Other.');
    onDone();
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <IconTile icon={c.icon} color={c.color} size="lg" />
        <TextInput aria-label="Category name" placeholder="Category name" value={c.name} onChange={e => set({ name: e.target.value })} autoFocus={!original} />
      </div>
      <Field label="Belongs to" hint="Shared categories are split between you. A personal one is that person's alone. Existing transactions follow the change."><Segmented value={c.scope} onChange={scope => set({ scope })} options={scopes} size="sm" /></Field>
      <Field label="Monthly budget">
        <MoneyInput label="Monthly budget" value={c.budget} onChange={budget => set({ budget })} step={25} />
        <Slider label="Monthly budget" value={Math.min(sliderMax, c.budget)} max={sliderMax} step={25} color={c.color} onChange={budget => set({ budget })} />
      </Field>
      <Field label="Icon"><IconPicker value={c.icon} onChange={icon => set({ icon })} color={c.color} icons={PICKABLE} /></Field>
      <Field label="Colour"><ColorPicker value={c.color} onChange={color => set({ color })} /></Field>
      {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
      <div className="flex gap-3">
        {original && original !== 'Other' && <Button variant="danger" size="lg" aria-label="Delete category" onClick={remove}><LuTrash2 /></Button>}
        <Button variant="primary" size="lg" className="flex-1" onClick={save}>Save</Button>
      </div>
    </>
  );
}
