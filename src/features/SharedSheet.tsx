import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { LuCircleCheck, LuInfo } from 'react-icons/lu';
import { IconTile } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Avatar, Progress } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { who } from '@/lib/compute';
import { dayLabel, money, money0, monthLabel } from '@/lib/format';
import { crossText, sharedCheck, shortText, type CrossPay } from '@/lib/shared';
import { docAtom, monthAtom, toast, updateDoc } from '@/lib/store';
import type { PersonId } from '@/lib/types';

/** Explains the month's shared costs check: each partner's share, and categories paid by the other person. */
export function SharedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const c = sharedCheck(doc, month);
  const people: PersonId[] = ['p1', 'p2'];

  return (
    <Sheet open={open} onClose={onClose} title={`Shared costs, ${monthLabel(month)}`}>
      {!c.applies ? (
        <p className="text-muted">Add statements for this month to check who covered what.</p>
      ) : (
        <>
          <p className="text-muted">Shared costs are split {Math.round(doc.settings.split)}/{Math.round(100 - doc.settings.split)}. A share counts what each of you paid for shared costs from your own account plus what you moved into the joint account.</p>
          {c.total > 0 && (
            <div className="grid gap-3 rounded-2xl border border-line p-3">
              <p className="flex justify-between font-semibold"><span>Shared costs</span><span className="num">{money(c.total)}</span></p>
              {people.map(p => {
                const s = c.people[p];
                const put = s.direct + s.toppedUp;
                const behind = s.gap > Math.max(5, c.total * 0.01);
                return (
                  <div key={p} className="grid gap-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar id={p} size={24} />
                      <span className="flex-1 font-semibold">{who(doc, p)}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-semibold', behind ? 'bg-warn/12 text-warn' : 'bg-good/10 text-good')}>{behind ? `${money0(s.gap)} behind` : 'Share covered'}</span>
                    </div>
                    <Progress value={Math.min(put, s.fair)} max={s.fair || 1} color={behind ? 'var(--color-warn)' : 'var(--color-good)'} />
                    <p className="num text-[13px] text-muted">{money0(s.direct)} paid directly · {money0(s.toppedUp)} into the joint account · share {money0(s.fair)}</p>
                  </div>
                );
              })}
              {!c.jointSeen && c.people.p1.toppedUp + c.people.p2.toppedUp > 0 && (
                <p className="flex gap-2 text-[13px] text-muted"><LuInfo className="mt-0.5 shrink-0" aria-hidden />The joint account's statement is not added for this month, so its spending is taken to be what you moved into it.</p>
              )}
            </div>
          )}

          {c.short && (
            <div className="grid gap-2 rounded-2xl bg-warn/8 p-3 text-sm">
              <p>{shortText(doc, c, c.short)}</p>
              <ul className="grid gap-1 pl-4 [list-style:disc]">
                <li>{who(doc, c.short)} can top up the joint account by {money0(c.people[c.short].gap)}.</li>
                <li>If shared costs often run past the budget, raise those budgets or revisit the split in Settings.</li>
              </ul>
            </div>
          )}

          {c.cross.length > 0 && (
            <div className="grid gap-3">
              <h3 className="font-bold">Paid by the other person</h3>
              {c.cross.map(g => <CrossCard key={g.key} g={g} />)}
            </div>
          )}

          {!c.issues && (
            <div className="grid justify-items-center gap-2 py-4 text-center">
              <LuCircleCheck className="text-4xl text-good" aria-hidden />
              <p className="font-semibold">All clear for {monthLabel(month)}</p>
              <p className="text-muted">Each of you put in your share, and every category was paid by the person it belongs to. Gifts are not counted.</p>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function CrossCard({ g }: { g: CrossPay }) {
  const doc = useAtomValue(docAtom);
  const month = useAtomValue(monthAtom);
  const [open, setOpen] = useState(false);
  const t = crossText(doc, g);
  const ids = new Set(g.tx.map(x => x.id));
  const edit = (fn: (x: (typeof g.tx)[number]) => void, message: string) => {
    updateDoc(d => { for (const x of d.months[month]?.tx ?? []) if (ids.has(x.id)) fn(x); });
    toast(message);
  };

  return (
    <div className="grid animate-rise gap-2 rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <IconTile icon={g.icon} color={g.color} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{g.category}</p>
          <p className="text-[13px] text-muted">{who(doc, g.owner)}'s category, paid from {g.payer === 'joint' ? 'the joint account' : `${who(doc, g.payer)}'s account`}</p>
        </div>
        <span className="num font-semibold">{money(g.amount)}</span>
      </div>
      <p className="text-sm">{t.what} {t.fix}</p>
      <button onClick={() => setOpen(o => !o)} className="justify-self-start text-[13px] font-semibold text-brand">{open ? 'Hide' : 'Show'} {g.tx.length} transaction{g.tx.length > 1 ? 's' : ''}</button>
      {open && (
        <ul className="grid gap-1 text-[13px]">
          {g.tx.map(x => <li key={x.id} className="flex gap-2"><span className="w-24 shrink-0 text-muted">{dayLabel(x.date)}</span><span className="min-w-0 flex-1 truncate">{x.desc}</span><span className="num">{money(x.amount)}</span></li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="soft" onClick={() => edit(x => { x.owner = g.payer === 'joint' ? 'shared' : g.payer; }, g.payer === 'joint' ? 'Counted as shared' : `Counted as ${who(doc, g.payer)}'s`)}>{g.payer === 'joint' ? 'Count it as shared' : `It was ${who(doc, g.payer)}'s`}</Button>
        <Button size="sm" variant="soft" onClick={() => {
          updateDoc(d => {
            const cat = d.categories.find(x => x.name === g.category);
            if (cat) cat.scope = 'shared';
            for (const x of d.months[month]?.tx ?? []) if (ids.has(x.id)) x.owner = 'shared';
          });
          toast(`${g.category} is now shared`);
        }}>Make {g.category} shared</Button>
        <Button size="sm" variant="ghost" onClick={() => edit(x => { x.ok = true; }, 'Marked as reviewed')}>Leave it</Button>
      </div>
    </div>
  );
}
