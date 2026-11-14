import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, Field } from '@/components/ui/card';
import { Segmented, TextInput } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { startDemo, toast, unlock } from '@/lib/store';

type Mode = 'passcode' | 'signin' | 'signup';

/** The first screen: the household passcode, or an account. Nothing loads until one of them checks out. */
export function Lock() {
  const [mode, setMode] = useState<Mode>('passcode');
  const [how, setHow] = useState<'invite' | 'new'>('invite');
  const [f, setF] = useState({ pass: '', email: '', password: '', name: '', invite: '', signupCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'passcode') {
        if (!f.pass) throw new Error('Enter the passcode.');
        await unlock(f.pass);
        toast('Unlocked on this device');
      } else if (mode === 'signin') {
        const { token } = await api.login(f.email, f.password);
        await unlock(token);
        toast('Signed in');
      } else {
        const { token } = await api.signup({ email: f.email, password: f.password, name: f.name, ...(how === 'invite' ? { invite: f.invite } : { signupCode: f.signupCode }) });
        await unlock(token);
        toast(how === 'invite' ? 'You joined your partner\'s household' : 'Your household is ready');
      }
    } catch (err) {
      setError((err as Error).message);
      setShake(n => n + 1);
      setBusy(false);
    }
  }

  const titles: Record<Mode, [string, string]> = {
    passcode: ['Enter your passcode', 'The one you two share. It is checked once, then remembered on this device.'],
    signin: ['Sign in', 'With the email and password you set up in Settings.'],
    signup: ['Create your account', how === 'invite' ? 'Join your partner with the invite code from their Settings.' : 'Start a new household. You need a sign-up code.'],
  };

  return (
    <div className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-5 py-10">
      <div className="flex items-center gap-3"><Logo size={48} /><span className="text-xl font-bold">Couple Budget</span></div>
      <Card key={shake} className={cn('grid gap-4', shake > 0 && 'animate-shake')}>
        <Segmented size="sm" value={mode === 'signup' ? 'signin' : mode} onChange={m => { setMode(m); setError(''); }} options={[{ value: 'passcode', label: 'Passcode' }, { value: 'signin', label: 'Email' }]} />
        <form onSubmit={submit} className="grid gap-4" key={mode}>
          <div className="animate-rise">
            <h1 className="text-2xl font-bold">{titles[mode][0]}</h1>
            <p className="text-muted">{titles[mode][1]}</p>
          </div>
          {mode === 'passcode' ? (
            <TextInput type="password" aria-label="Passcode" placeholder="Passcode" autoComplete="current-password" autoFocus value={f.pass} onChange={set('pass')} />
          ) : (
            <>
              {mode === 'signup' && (
                <>
                  <Segmented size="sm" value={how} onChange={setHow} options={[{ value: 'invite', label: 'Join my partner' }, { value: 'new', label: 'New household' }]} />
                  <Field label="Your first name"><TextInput autoComplete="given-name" value={f.name} onChange={set('name')} required /></Field>
                </>
              )}
              <Field label="Email"><TextInput type="email" autoComplete="username" autoFocus value={f.email} onChange={set('email')} required /></Field>
              <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}><TextInput type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} required minLength={mode === 'signup' ? 8 : undefined} /></Field>
              {mode === 'signup' && (how === 'invite'
                ? <Field label="Invite code"><TextInput autoCapitalize="characters" value={f.invite} onChange={set('invite')} required /></Field>
                : <Field label="Sign-up code"><TextInput value={f.signupCode} onChange={set('signupCode')} required /></Field>)}
            </>
          )}
          {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" busy={busy}>{busy ? 'Checking' : mode === 'passcode' ? 'Unlock' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
          {mode !== 'passcode' && (
            <button type="button" className="text-sm font-semibold text-brand" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
              {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </button>
          )}
        </form>
        <Button variant="ghost" onClick={startDemo}>Look around with sample data</Button>
      </Card>
    </div>
  );
}
