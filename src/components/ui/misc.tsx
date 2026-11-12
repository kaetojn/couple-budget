import { atom, useAtomValue } from 'jotai';
import { memo, useMemo } from 'react';
import { LuUsersRound } from 'react-icons/lu';
import { cn } from '@/lib/cn';
import { initial } from '@/lib/format';
import { useCountUp, useMounted } from '@/lib/hooks';
import { dismissToast, docAtom, toastAtom } from '@/lib/store';
import type { Owner, Payer } from '@/lib/types';
import type { Option } from './controls';

export const PERSON_COLOR: Record<string, string> = { p1: '#4b3fe4', p2: '#d23a76', shared: '#0fa3a3', joint: '#0fa3a3', personal: '#64748b' };

/** A coloured initial for a person, or a people icon for shared. */
// Avatars read only the two names, so editing a transaction does not re-render every avatar on screen.
const p1NameAtom = atom(get => get(docAtom).settings.p1);
const p2NameAtom = atom(get => get(docAtom).settings.p2);
const OTHER_NAMES: Record<string, string> = { joint: 'Joint account', personal: 'Each their own', shared: 'Shared' };

export function useName(id: Owner | Payer | 'personal') {
  const p1 = useAtomValue(p1NameAtom);
  const p2 = useAtomValue(p2NameAtom);
  return id === 'p1' ? p1 || 'Partner 1' : id === 'p2' ? p2 || 'Partner 2' : OTHER_NAMES[id];
}

export const Avatar = memo(function Avatar({ id, size = 24 }: { id: Owner | Payer | 'personal'; size?: number }) {
  const name = useName(id);
  const person = id === 'p1' || id === 'p2';
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.46, backgroundColor: PERSON_COLOR[id] }} title={name} aria-label={name}>
      {person ? initial(name) : <LuUsersRound aria-hidden />}
    </span>
  );
});

/** Options for "who does this belong to" controls. Rebuilt only when a name changes. */
export function useOwnerOptions<T extends string>(ids: T[]): Option<T>[] {
  const p1 = useAtomValue(p1NameAtom);
  const p2 = useAtomValue(p2NameAtom);
  const key = ids.join();
  return useMemo(
    () => ids.map(id => ({ value: id, label: id === 'p1' ? p1 || 'Partner 1' : id === 'p2' ? p2 || 'Partner 2' : OTHER_NAMES[id], icon: <Avatar id={id as Owner} size={20} /> })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, p1, p2],
  );
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

/**
 * Toasts sit low on phones, just above the tab bar where the thumb already is,
 * and bottom-centre on larger screens. A toast with an action stays a little longer.
 */
export function Toasts() {
  const toasts = useAtomValue(toastAtom);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] grid justify-items-center gap-2 px-4 md:bottom-8" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto flex max-w-md animate-rise items-center gap-3 rounded-2xl bg-ink py-3 pl-4 pr-3 text-[15px] font-medium text-white shadow-xl">
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button onClick={() => { t.action!.run(); dismissToast(t.id); }} className="-my-1.5 shrink-0 rounded-xl px-3 py-1.5 font-semibold text-[#b9b3f6] transition-colors hover:bg-white/10 active:bg-white/15">
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
