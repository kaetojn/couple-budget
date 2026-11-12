import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuCircleCheck, LuListChecks, LuTriangleAlert } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { runCheckup } from '@/lib/ai';
import { monthLabel } from '@/lib/format';
import { docAtom, monthAtom, sessionAtom, updateDoc } from '@/lib/store';

const GROUPS = [
  { key: 'wins', title: 'Going well', icon: LuCircleCheck, tone: 'text-good bg-good/10' },
  { key: 'watch', title: 'Keep an eye on', icon: LuTriangleAlert, tone: 'text-warn bg-warn/10' },
  { key: 'actions', title: 'Next steps', icon: LuListChecks, tone: 'text-brand bg-brand-soft' },
] as const;

/** Claude's read on the couple's finances, saved with the month so it does not have to be regenerated. */
export function CheckupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const { passcode, demo } = useAtomValue(sessionAtom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checkup = doc.months[month]?.checkup;

  async function run() {
    setBusy(true);
    setError('');
    try {
      const result = await runCheckup(passcode, doc, month);
      updateDoc(d => { (d.months[month] ??= { tx: [] }).checkup = result; });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Check-up for ${monthLabel(month)}`}
      footer={demo ? undefined : <Button variant="primary" size="lg" className="flex-1" busy={busy} onClick={run}>{busy ? 'Reading your numbers' : checkup ? 'Run it again' : 'Run the check-up'}</Button>}
    >
      {busy ? (
        <div className="grid gap-3" aria-label="Loading"><div className="skeleton h-6 w-11/12" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-2/3" /></div>
      ) : checkup ? (
        <div className="stagger grid gap-5">
          <p className="text-balance text-xl font-bold leading-snug">{checkup.headline}</p>
          {GROUPS.map(g => checkup[g.key].length > 0 && (
            <section key={g.key} className="grid gap-2">
              <h3 className="flex items-center gap-2 font-bold"><span className={`grid size-8 place-items-center rounded-full ${g.tone}`}><g.icon /></span>{g.title}</h3>
              <ul className="grid gap-2 pl-10">{checkup[g.key].map((x, i) => <li key={i} className="leading-snug">{x}</li>)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-muted">{demo ? 'The check-up uses Claude, which is off in the sample household. Enter your passcode to run it on your own numbers.' : 'Claude reads your plan, this month\'s spending, your debts and your net worth, then tells you what is going well, what to watch and what to do next.'}</p>
      )}
      {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
    </Sheet>
  );
}
