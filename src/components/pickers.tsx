import { useAtom, useAtomValue } from 'jotai';
import { LuCheck, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { cn } from '@/lib/cn';
import { COLORS } from '@/lib/defaults';
import { addMonths, monthLabel } from '@/lib/format';
import { docAtom, monthAtom } from '@/lib/store';
import { ICONS, IconTile } from './icons';

export function MonthSwitcher() {
  const [month, setMonth] = useAtom(monthAtom);
  const btn = 'grid size-10 place-items-center rounded-full border border-line bg-surface text-lg transition hover:bg-canvas active:scale-95';
  return (
    <div className="flex items-center gap-2">
      <button className={btn} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><LuChevronLeft /></button>
      <span className="min-w-36 text-center font-bold" aria-live="polite">{monthLabel(month)}</span>
      <button className={btn} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><LuChevronRight /></button>
    </div>
  );
}

export function IconPicker({ value, onChange, color, icons }: { value: string; onChange: (v: string) => void; color: string; icons: string[] }) {
  return (
    <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Icon">
      {icons.map(key => {
        const Icon = ICONS[key];
        const on = key === value;
        return (
          <button key={key} type="button" role="radio" aria-checked={on} aria-label={key} onClick={() => onChange(key)} className={cn('grid aspect-square place-items-center rounded-xl text-lg transition active:scale-90', on ? 'text-white' : 'bg-canvas text-muted hover:text-ink')} style={on ? { backgroundColor: color } : undefined}>
            <Icon />
          </button>
        );
      })}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {COLORS.map(c => (
        <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={c} onClick={() => onChange(c)} className="grid size-9 place-items-center rounded-full text-white transition active:scale-90" style={{ backgroundColor: c }}>
          {c.toLowerCase() === value.toLowerCase() && <LuCheck />}
        </button>
      ))}
    </div>
  );
}

/** A grid of the couple's categories to choose from. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const doc = useAtomValue(docAtom);
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-canvas p-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Category">
      {doc.categories.map(c => {
        const on = c.name === value;
        return (
          <button key={c.name} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.name)} className={cn('flex items-center gap-2 rounded-xl p-1.5 text-left text-[13px] font-semibold leading-tight transition-[background-color,box-shadow] duration-150 active:bg-surface', on ? 'bg-surface shadow-sm ring-2 ring-brand' : 'hover:bg-surface/70')}>
            <IconTile icon={c.icon} color={c.color} size="sm" />
            <span className="line-clamp-2 min-w-0">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
