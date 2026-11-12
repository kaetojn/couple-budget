import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextInput } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { startDemo, toast, unlock } from '@/lib/store';

export function Lock() {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pass) return;
    setBusy(true);
    setError('');
    try {
      await unlock(pass);
      toast('Unlocked on this device');
    } catch (err) {
      setError((err as Error).message);
      setShake(n => n + 1);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-5 py-10">
      <div className="flex items-center gap-3"><Logo size={48} /><span className="text-xl font-bold">Couple Budget</span></div>
      <Card key={shake} className={cn('grid gap-4', shake > 0 && 'animate-shake')}>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <h1 className="text-2xl font-bold">Enter your passcode</h1>
            <p className="text-muted">The one you two share. It is checked once, then remembered on this device.</p>
          </div>
          <TextInput type="password" aria-label="Passcode" placeholder="Passcode" autoComplete="current-password" autoFocus value={pass} onChange={e => setPass(e.target.value)} />
          {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" busy={busy}>{busy ? 'Checking' : 'Unlock'}</Button>
        </form>
        <Button variant="ghost" onClick={startDemo}>Look around with sample data</Button>
      </Card>
    </div>
  );
}
