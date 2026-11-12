import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Switch as HSwitch } from '@headlessui/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { LuCheck, LuChevronDown, LuMinus, LuPlus } from 'react-icons/lu';
import { cn } from '@/lib/cn';

export interface Option<T extends string> { value: T; label: string; hint?: string; icon?: ReactNode }

/** A dropdown with room for an icon and a one-line hint per option. */
export function Select<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Option<T>[]; className?: string }) {
  const current = options.find(o => o.value === value);
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className={cn('group flex h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 text-left transition hover:border-brand/50 data-[open]:border-brand data-[focus]:outline-2 data-[focus]:outline-brand', className)}>
        {current?.icon}
        <span className="min-w-0 flex-1 truncate font-medium">{current?.label ?? 'Choose'}</span>
        <LuChevronDown className="text-muted transition group-data-[open]:rotate-180" aria-hidden />
      </ListboxButton>
      <ListboxOptions anchor={{ to: 'bottom start', gap: 6 }} transition className="z-[60] max-h-72 w-[var(--button-width)] origin-top overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0">
        {options.map(o => (
          <ListboxOption key={o.value} value={o.value} className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 data-[focus]:bg-brand-soft">
            {o.icon}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{o.label}</span>
              {o.hint && <span className="block text-[13px] leading-snug text-muted">{o.hint}</span>}
            </span>
            <LuCheck className="shrink-0 text-brand opacity-0 group-data-[selected]:opacity-100" aria-hidden />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: Option<T>[]; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div role="radiogroup" className={cn('flex gap-1 rounded-2xl bg-canvas p-1', className)}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn('flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 font-semibold transition duration-200', size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-sm', on ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max, step = 1, color, label }: { value: number; onChange: (v: number) => void; min?: number; max: number; step?: number; color?: string; label: string }) {
  const pos = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  return <input type="range" aria-label={label} className="slider w-full" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} style={{ '--pos': `${pos}%`, '--fill': color } as CSSProperties} />;
}

/** A dollar amount. Keeps what is being typed until the field loses focus. */
export function MoneyInput({ value, onChange, label, step, className, autoFocus }: { value: number; onChange: (v: number) => void; label: string; step?: number; className?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value ? String(value) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value ? String(Math.round(value * 100) / 100) : ''); }, [value, focused]);
  const bump = (d: number) => onChange(Math.max(0, Math.round((value + d) * 100) / 100));
  return (
    <div className={cn('flex h-12 items-center rounded-xl border border-line bg-surface transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20', className)}>
      {step && <button type="button" aria-label={`Lower ${label}`} onClick={() => bump(-step)} className="grid h-full w-11 place-items-center text-muted hover:text-ink"><LuMinus /></button>}
      <span className={cn('text-muted', !step && 'pl-3')}>$</span>
      <input
        aria-label={label}
        autoFocus={autoFocus}
        inputMode="decimal"
        type="number"
        min={0}
        step="0.01"
        placeholder="0"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={e => { setText(e.target.value); onChange(Math.max(0, +e.target.value || 0)); }}
        className="num h-full min-w-0 flex-1 bg-transparent px-1.5 text-[17px] font-semibold outline-none"
      />
      {step && <button type="button" aria-label={`Raise ${label}`} onClick={() => bump(step)} className="grid h-full w-11 place-items-center text-muted hover:text-ink"><LuPlus /></button>}
    </div>
  );
}

export function TextInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-12 w-full rounded-xl border border-line bg-surface px-3 text-[16px] font-medium outline-none transition placeholder:font-normal placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20', className)} {...rest} />;
}

/** Plus and minus buttons around a whole number, for things like the day a bill is due. */
export function Stepper({ value, onChange, min, max, format = String, label }: { value: number; onChange: (v: number) => void; min: number; max: number; format?: (n: number) => string; label: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex h-12 items-center rounded-xl border border-line bg-surface" role="group" aria-label={label}>
      <button type="button" aria-label="Earlier" onClick={() => set(value - 1)} className="grid h-full w-12 place-items-center text-muted hover:text-ink"><LuMinus /></button>
      <span className="num flex-1 text-center text-[17px] font-semibold">{format(value)}</span>
      <button type="button" aria-label="Later" onClick={() => set(value + 1)} className="grid h-full w-12 place-items-center text-muted hover:text-ink"><LuPlus /></button>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <HSwitch checked={checked} onChange={onChange} aria-label={label} className="group relative h-7 w-12 shrink-0 rounded-full bg-line transition data-[checked]:bg-brand">
      <span className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition group-data-[checked]:translate-x-5" />
    </HSwitch>
  );
}
