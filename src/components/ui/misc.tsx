import { useAtomValue } from 'jotai';
import { LuUsersRound } from 'react-icons/lu';
import { cn } from '@/lib/cn';
import { who } from '@/lib/compute';
import { initial } from '@/lib/format';
import { useCountUp, useMounted } from '@/lib/hooks';
import { docAtom, toastAtom } from '@/lib/store';
import type { Owner, Payer } from '@/lib/types';
import type { Option } from './controls';

export const PERSON_COLOR: Record<string, string> = { p1: '#4b3fe4', p2: '#e8508b', shared: '#0fa3a3', joint: '#0fa3a3', personal: '#64748b' };

/** A coloured initial for a person, or a people icon for shared. */
export function Avatar({ id, size = 24 }: { id: Owner | Payer | 'personal'; size?: number }) {
  const doc = useAtomValue(docAtom);
  const person = id === 'p1' || id === 'p2';
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.46, backgroundColor: PERSON_COLOR[id] }} title={who(doc, id)} aria-label={who(doc, id)}>
      {person ? initial(who(doc, id)) : <LuUsersRound aria-hidden />}
    </span>
  );
}

/** Options for "who does this belong to" controls. */
export function useOwnerOptions<T extends string>(ids: T[]): Option<T>[] {
  const doc = useAtomValue(docAtom);
  return ids.map(id => ({ value: id, label: who(doc, id as Owner), icon: <Avatar id={id as Owner} size={20} /> }));
}

export function Progress({ value, max, color = 'var(--color-brand)', className }: { value: number; max: number; color?: string; className?: string }) {
  const mounted = useMounted();
  const over = max > 0 && value > max + 0.005;
  const width = mounted ? Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0)) : 0;
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-ink/8', className)}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${width}%`, backgroundColor: over ? 'var(--color-bad)' : color }} />
    </div>
  );
}

/** A number that eases to its value. */
export function Count({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{format(v)}</span>;
}

export function Toasts() {
  const toasts = useAtomValue(toastAtom);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[70] grid justify-items-center gap-2 px-4 md:bottom-8 md:top-auto" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="max-w-md animate-rise rounded-2xl bg-ink px-4 py-3 text-[15px] font-medium text-white shadow-xl">{t.text}</div>
      ))}
    </div>
  );
}
