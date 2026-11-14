import { useAtomValue } from 'jotai';
import { useState, type FormEvent } from 'react';
import { LuCheck, LuCopy, LuKeyRound, LuLogOut, LuUserPlus } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Card, Field, SectionTitle } from '@/components/ui/card';
import { TextInput } from '@/components/ui/controls';
import { Avatar } from '@/components/ui/misc';
import { api, isAccount, WORKER } from '@/lib/api';
import { accountAtom, docAtom, lock, sessionAtom, toast, setCredential } from '@/lib/store';

function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); } catch { toast('Copy it by hand: select the text and copy.'); }
  };
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-canvas p-1 pl-3">
      <code className="min-w-0 flex-1 truncate text-sm font-semibold" aria-label={label}>{value}</code>
      <Button size="sm" variant="soft" onClick={copy} aria-label={`Copy ${label}`}>{done ? <LuCheck /> : <LuCopy />}{done ? 'Copied' : 'Copy'}</Button>
    </div>
  );
}

/** Logins for the household: create one from the passcode, invite the partner, change the password. */
export function AccountSection() {
  const { passcode } = useAtomValue(sessionAtom);
  const info = useAtomValue(accountAtom);
  const doc = useAtomValue(docAtom);
  const account = isAccount(passcode);
  const [f, setF] = useState({ name: doc.settings.p1 || '', email: '', password: '', current: '', next: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [invite, setInvite] = useState('');
  const [changing, setChanging] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));

  async function run(what: string, fn: () => Promise<void>) {
    setBusy(what);
    setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  const claim = (e: FormEvent) => {
    e.preventDefault();
    void run('claim', async () => {
      const { token } = await api.claim(passcode, { email: f.email, password: f.password, name: f.name });
      setCredential(token);
      toast('Login created. You are signed in with it on this device.');
    });
  };

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    void run('password', async () => {
      const { token } = await api.changePassword(passcode, f.current, f.next);
      setCredential(token);
      setChanging(false);
      setF(v => ({ ...v, current: '', next: '' }));
      toast('Password changed. Other devices and Claude will need to sign in again.');
    });
  };

  return (
    <section>
      <SectionTitle>Accounts</SectionTitle>
      <Card className="grid gap-4">
        {!account ? (
          <form onSubmit={claim} className="grid gap-3">
            <div>
              <p className="font-semibold">You are using the shared passcode</p>
              <p className="text-[13px] text-muted">Create a login so each of you can sign in with your own email, and so you can invite your partner. The passcode keeps working.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="First name"><TextInput autoComplete="given-name" value={f.name} onChange={set('name')} required /></Field>
              <Field label="Email"><TextInput type="email" autoComplete="username" value={f.email} onChange={set('email')} required /></Field>
              <Field label="Password"><TextInput type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required /></Field>
            </div>
            <Button type="submit" variant="primary" className="justify-self-start" busy={busy === 'claim'}><LuKeyRound />Create my login</Button>
          </form>
        ) : (
          <>
            <div className="grid gap-2">
              {(info?.members.length ? info.members : info?.user ? [info.user] : []).map((m, i) => (
                <div key={m.email} className="flex items-center gap-3">
                  <Avatar id={i === 0 ? 'p1' : 'p2'} size={32} />
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.name || m.email}{m.email === info?.user?.email ? ' (you)' : ''}</p><p className="truncate text-[13px] text-muted">{m.email}</p></div>
                </div>
              ))}
            </div>
            {(info?.members.length ?? 0) < 2 && (
              <div className="grid gap-2 rounded-2xl bg-canvas p-3">
                <p className="text-sm">Invite your partner. They choose <strong>Email</strong> on the sign-in screen, then <strong>Create an account</strong>, and enter this code.</p>
                {invite ? <CopyField value={invite} label="invite code" /> : <Button size="sm" variant="soft" className="justify-self-start" busy={busy === 'invite'} onClick={() => void run('invite', async () => setInvite((await api.invite(passcode)).code))}><LuUserPlus />Make an invite code</Button>}
                {invite && <p className="text-[13px] text-muted">Works for 7 days. Making a new code cancels this one.</p>}
              </div>
            )}
            {changing ? (
              <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
                <Field label="Current password"><TextInput type="password" autoComplete="current-password" value={f.current} onChange={set('current')} required /></Field>
                <Field label="New password"><TextInput type="password" autoComplete="new-password" minLength={8} value={f.next} onChange={set('next')} required /></Field>
                <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="primary" busy={busy === 'password'}>Change password</Button><Button variant="ghost" onClick={() => setChanging(false)}>Cancel</Button></div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="soft" onClick={() => setChanging(true)}><LuKeyRound />Change password</Button>
                <Button size="sm" variant="soft" busy={busy === 'out'} onClick={() => void run('out', async () => { await api.signOutEverywhere(passcode); lock(); })}><LuLogOut />Sign out everywhere</Button>
              </div>
            )}
          </>
        )}
        {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
      </Card>
    </section>
  );
}

/** How to add Couple Budget to Claude as a connector, so statements can be read with a Claude plan. */
export function ClaudeSection() {
  const { passcode } = useAtomValue(sessionAtom);
  const account = isAccount(passcode);
  return (
    <section>
      <SectionTitle>Use with Claude</SectionTitle>
      <Card className="grid gap-3">
        <p className="text-sm">Add Couple Budget to Claude as a connector. Then you can drop statements or screenshots into a Claude chat and say "add these to Couple Budget", or ask how the month is going. Claude reads them on your own Claude plan.</p>
        <CopyField value={`${WORKER}/mcp`} label="connector address" />
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted">
          <li>On claude.ai, open <strong className="text-ink">Customize</strong>, then <strong className="text-ink">Connectors</strong>, and choose <strong className="text-ink">Add custom connector</strong>.</li>
          <li>Name it Couple Budget, paste the address above and add it. Leave the advanced settings empty.</li>
          <li>Press <strong className="text-ink">Connect</strong> and sign in with {account ? 'your email and password' : 'your email and password, or the household passcode'}.</li>
          <li>It then works in the Claude apps on your phone too.</li>
        </ol>
        <p className="text-[13px] text-muted">Claude can read your budget and add or change transactions, budgets and balances. Disconnect it any time in Claude's connector settings{account ? ', or use Sign out everywhere above' : ''}.</p>
      </Card>
    </section>
  );
}
