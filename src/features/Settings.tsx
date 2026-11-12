import { useAtomValue } from 'jotai';
import { useRef, useState } from 'react';
import { LuDownload, LuLock, LuRefreshCw, LuTrash2, LuUpload } from 'react-icons/lu';
import type { Go } from '@/App';
import { SplitBar } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Card, Field, SectionTitle } from '@/components/ui/card';
import { MoneyInput, Segmented, Select, Slider, TextInput } from '@/components/ui/controls';
import { Avatar } from '@/components/ui/misc';
import { who } from '@/lib/compute';
import { ARRANGEMENTS, migrate } from '@/lib/defaults';
import { pct } from '@/lib/format';
import { applySplit } from '@/lib/plan';
import { docAtom, eraseDevice, lock, sessionAtom, toast, updateDoc } from '@/lib/store';
import type { Arrangement, Settings as SettingsType, SplitMethod } from '@/lib/types';

export function Settings(_: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const { demo } = useAtomValue(sessionAtom);
  const s = doc.settings;
  const [sure, setSure] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<SettingsType>) => updateDoc(d => { d.settings = applySplit({ ...d.settings, ...patch }); });

  function backup() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }));
    a.download = 'couple-budget-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function restore(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.settings || !data.categories) throw new Error('That file is not a Couple Budget backup.');
      const next = migrate(data);
      updateDoc(d => { Object.assign(d, next); });
      toast('Backup restored');
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <div className="stagger mx-auto grid max-w-2xl gap-6">
      <h1 className="text-2xl font-bold md:text-[28px]">Settings</h1>

      <section>
        <SectionTitle>The two of you</SectionTitle>
        <Card className="grid gap-4 sm:grid-cols-2">
          {(['p1', 'p2'] as const).map(p => (
            <div key={p} className="grid gap-3">
              <Field label={p === 'p1' ? 'First partner' : 'Second partner'}><TextInput value={s[p]} onChange={e => set({ [p]: e.target.value })} /></Field>
              <Field label="Monthly take-home"><MoneyInput label={`${who(doc, p)} monthly take-home`} step={100} value={p === 'p1' ? s.inc1 : s.inc2} onChange={v => set(p === 'p1' ? { inc1: v } : { inc2: v })} /></Field>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>How you share costs</SectionTitle>
        <Card className="grid gap-4">
          <Field label="How you manage money"><Select<Arrangement> value={s.arrangement} onChange={arrangement => set({ arrangement })} options={(Object.keys(ARRANGEMENTS) as Arrangement[]).map(value => ({ value, ...ARRANGEMENTS[value] }))} /></Field>
          {s.arrangement !== 'joint' && (
            <Field label="Split of shared costs">
              <Segmented<SplitMethod> value={s.splitMethod} onChange={splitMethod => set({ splitMethod })} options={[{ value: 'income', label: 'By income' }, { value: 'even', label: '50/50' }, { value: 'custom', label: 'Custom' }]} />
              {s.splitMethod === 'custom' && <Slider label={`${who(doc, 'p1')}'s share`} value={Math.round(s.split)} max={100} onChange={split => set({ split })} />}
              <SplitBar parts={[{ label: who(doc, 'p1'), value: s.split, color: '#4b3fe4' }, { label: who(doc, 'p2'), value: 100 - s.split, color: '#e8508b' }]} className="mt-1" />
              <div className="flex justify-between text-sm font-semibold"><span className="flex items-center gap-1.5"><Avatar id="p1" size={20} />{who(doc, 'p1')} <span className="num">{pct(s.split)}</span></span><span className="flex items-center gap-1.5"><span className="num">{pct(100 - s.split)}</span> {who(doc, 'p2')}<Avatar id="p2" size={20} /></span></div>
            </Field>
          )}
        </Card>
      </section>

      {doc.rules.length > 0 && (
        <section>
          <SectionTitle>Remembered corrections</SectionTitle>
          <Card className="divide-y divide-line p-0">
            {doc.rules.map((r, i) => (
              <div key={r.match} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.match}</span><span className="block text-[13px] text-muted">{r.category} · {r.owner === 'shared' ? 'Shared' : 'Whoever pays'}</span></span>
                <Button size="sm" variant="ghost" onClick={() => updateDoc(d => { d.rules.splice(i, 1); })}>Forget</Button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Your data</SectionTitle>
        <Card className="grid gap-3">
          <p className="text-muted">Everything syncs to each device you unlock. A backup file is a copy you keep yourself.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={backup}><LuDownload />Download backup</Button>
            <Button onClick={() => fileRef.current?.click()} disabled={demo}><LuUpload />Restore from backup</Button>
            <input ref={fileRef} type="file" accept=".json" className="sr-only" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>This device</SectionTitle>
        <Card className="flex flex-wrap gap-2">
          <Button onClick={() => updateDoc(d => { d.settings.onboarded = false; })} disabled={demo}><LuRefreshCw />Run the setup guide again</Button>
          <Button onClick={lock}><LuLock />Lock</Button>
          <Button variant="danger" onClick={() => (sure ? eraseDevice() : setSure(true))}><LuTrash2 />{sure ? 'Tap again to erase this device' : 'Lock and erase this device'}</Button>
        </Card>
      </section>
    </div>
  );
}
