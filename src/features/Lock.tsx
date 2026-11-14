import { useEffect, useState, type FormEvent } from 'react';
import { Turnstile } from '@/components/turnstile';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, Field } from '@/components/ui/card';
import { Segmented, TextInput } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { startDemo, toast, unlock } from '@/lib/store';

type Mode = 'passcode' | 'signin' | 'signup' | 'forgot' | 'reset';

/** The first screen: the household passcode, or an account. Nothing loads until one of them checks out. */
/** A reset link from an email lands here as #/reset?token=… */
const linkToken = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('token') ?? '';

export function Lock() {
  const [mode, setMode] = useState<Mode>(linkToken() ? 'reset' : 'passcode');
  const [cfg, setCfg] = useState<{ turnstile: string | null; signup: boolean; email: boolean }>({ turnstile: null, signup: false, email: false });
  const [bot, setBot] = useState('');
  const [sent, setSent] = useState(false);
  const [byCode, setByCode] = useState(true);
  useEffect(() => { void api.config().then(c => { setCfg(c); setByCode(!c.email); }); }, []);
  const [how, setHow] = useState<'passcode' | 'invite' | 'new'>('passcode');
  const [f, setF] = useState({ pass: '', email: '', password: '', name: '', invite: '', signupCode: '', code: '' });
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
      } else if (mode === 'forgot' && !byCode) {
        await api.forgot(f.email, bot);
        setSent(true);
        setBusy(false);
        return;
      } else if (mode === 'forgot' || mode === 'reset') {
        const { token } = await api.reset(mode === 'reset' ? { token: linkToken(), password: f.password } : { code: f.code, email: f.email, password: f.password });
        history.replaceState(null, '', location.pathname);
        await unlock(token);
        toast('Password changed. You are signed in.');
      } else {
        // With the household passcode, the login is added to the existing household and its data.
        const { token } = how === 'passcode'
          ? await api.claim(f.pass, { email: f.email, password: f.password, name: f.name })
          : await api.signup({ email: f.email, password: f.password, name: f.name, turnstile: bot, ...(how === 'invite' ? { invite: f.invite } : { signupCode: f.signupCode }) });
        await unlock(token);
        toast(how === 'passcode' ? 'Login created. Use it next time instead of the passcode.' : how === 'invite' ? 'You joined your partner\'s household' : 'Your household is ready');
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
    forgot: ['Reset your password', byCode ? 'Your partner can make a reset code for you in Settings, under Accounts.' : 'We will email you a link to choose a new password.'],
    reset: ['Choose a new password', 'At least 8 characters. Other devices will need to sign in again.'],
    signup: ['Create your account', how === 'passcode' ? 'Add a login to the household you already share a passcode for. Your data stays as it is.' : how === 'invite' ? 'Join your partner with the invite code from their Settings.' : 'Start a new household. You need a sign-up code.'],
  };

  return (
    <div className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-5 py-10">
      <div className="flex items-center gap-3"><Logo size={48} /><span className="text-xl font-bold">Couple Budget</span></div>
      <Card key={shake} className={cn('grid gap-4', shake > 0 && 'animate-shake')}>
        <Segmented size="sm" value={mode === 'passcode' ? 'passcode' : 'signin'} onChange={m => { setMode(m); setError(''); }} options={[{ value: 'passcode', label: 'Passcode' }, { value: 'signin', label: 'Email' }]} />
        <form onSubmit={submit} className="grid gap-4" key={mode}>
          <div className="animate-rise">
            <h1 className="text-2xl font-bold">{titles[mode][0]}</h1>
            <p className="text-muted">{titles[mode][1]}</p>
          </div>
          {mode === 'forgot' || mode === 'reset' ? (
            <>
              {mode === 'forgot' && cfg.email && (
                <Segmented size="sm" value={byCode ? 'code' : 'email'} onChange={v => { setByCode(v === 'code'); setSent(false); }} options={[{ value: 'email', label: 'Email me a link' }, { value: 'code', label: 'I have a code' }]} />
              )}
              {mode === 'forgot' && <Field label="Email"><TextInput type="email" autoComplete="username" value={f.email} onChange={set('email')} required /></Field>}
              {mode === 'forgot' && byCode && <Field label="Reset code from your partner"><TextInput autoCapitalize="characters" value={f.code} onChange={set('code')} required /></Field>}
              {(mode === 'reset' || byCode) && <Field label="New password" hint="At least 8 characters."><TextInput type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required /></Field>}
              {mode === 'forgot' && !byCode && <Turnstile siteKey={cfg.turnstile} onToken={setBot} />}
              {sent && <p className="text-sm font-semibold text-good" role="status">If that email has an account, a reset link is on its way. It works for an hour.</p>}
            </>
          ) : mode === 'passcode' ? (
            <TextInput type="password" aria-label="Passcode" placeholder="Passcode" autoComplete="current-password" autoFocus value={f.pass} onChange={set('pass')} />
          ) : (
            <>
              {mode === 'signup' && (
                <>
                  <Segmented size="sm" value={how} onChange={setHow} options={[{ value: 'passcode', label: 'Our passcode' }, { value: 'invite', label: 'Invite code' }, { value: 'new', label: 'New' }]} />
                  <Field label="Your first name"><TextInput autoComplete="given-name" value={f.name} onChange={set('name')} required /></Field>
                </>
              )}
              <Field label="Email"><TextInput type="email" autoComplete="username" autoFocus value={f.email} onChange={set('email')} required /></Field>
              <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}><TextInput type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} required minLength={mode === 'signup' ? 8 : undefined} /></Field>
              {mode === 'signup' && (how === 'passcode'
                ? <Field label="Household passcode"><TextInput type="password" autoComplete="off" value={f.pass} onChange={set('pass')} required /></Field>
                : how === 'invite'
                  ? <Field label="Invite code"><TextInput autoCapitalize="characters" value={f.invite} onChange={set('invite')} required /></Field>
                  : <Field label="Sign-up code"><TextInput value={f.signupCode} onChange={set('signupCode')} required /></Field>)}
            </>
          )}
          {mode === 'signup' && <Turnstile siteKey={cfg.turnstile} onToken={setBot} />}
          {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" busy={busy}>{busy ? 'Checking' : mode === 'passcode' ? 'Unlock' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' && !byCode ? 'Email me a link' : 'Set new password'}</Button>
          {mode !== 'passcode' && (
            <button type="button" className="text-sm font-semibold text-brand" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSent(false); }}>
              {mode === 'signin' ? 'New here? Create an account' : 'Back to sign in'}
            </button>
          )}
          {mode === 'signin' && <button type="button" className="text-sm font-semibold text-muted" onClick={() => { setMode('forgot'); setError(''); }}>Forgot your password?</button>}
        </form>
        <Button variant="ghost" onClick={startDemo}>Look around with sample data</Button>
      </Card>
    </div>
  );
}
