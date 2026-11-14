import { useAtomValue } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { LuBadgeCheck, LuChevronDown, LuCircleAlert, LuInfo, LuLoaderCircle, LuRefreshCw, LuSparkles, LuTrash2, LuTrendingDown, LuTrendingUp, LuUpload } from 'react-icons/lu';
import type { Go } from '@/App';
import { Donut, Legend, TrendChart } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Card, Field, SectionTitle } from '@/components/ui/card';
import { MoneyInput, Segmented, Select } from '@/components/ui/controls';
import { Avatar, Count, useOwnerOptions } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { extractHoldings, runPortfolioCheckup, type PortfolioCheckup } from '@/lib/ai';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { who } from '@/lib/compute';
import { dayLabel, money, money0 } from '@/lib/format';
import {
  accountGuidance, accountValue, CLASSES, drift, emptyInvestments, isAllInOne, mainClass, mixOf, mergeAccounts, parseWealthsimple, placeNewMoney,
  portfolio, portfolioFlags, recordValue, syncNetWorth, TARGETS, valueCad, type AssetClass, type InvAccount, type TargetKey,
} from '@/lib/invest';
import { docAtom, sessionAtom, snapshotNetWorth, store, toast, updateDoc } from '@/lib/store';
import type { Owner } from '@/lib/types';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const SIX_HOURS = 6 * 3600 * 1000;

/** Fetches market prices for every holding and saves them; returns how many are still waiting on the free limit. */
async function refreshPrices(credential: string): Promise<{ pending: number; live: boolean }> {
  const inv = store.get(docAtom).investments;
  if (!inv?.accounts.length) return { pending: 0, live: false };
  const symbols = [...new Map(inv.accounts.flatMap(a => a.holdings).map(h => [h.symbol, { symbol: h.symbol, exchange: h.exchange, mic: h.mic, kind: h.kind }])).values()];
  const r = await api.prices(credential, symbols);
  updateDoc(d => {
    const i = d.investments;
    if (!i) return;
    if (r.fx) { i.fx = r.fx; i.fxLive = true; }
    for (const a of i.accounts) for (const h of a.holdings) {
      const q = r.quotes[h.symbol];
      if (q?.price) { h.price = q.price; h.currency = q.currency; h.priced = q.day ?? new Date().toLocaleDateString('en-CA'); h.dayChange = q.change; }
    }
    i.pricedAt = new Date().toISOString();
    recordValue(i);
    syncNetWorth(d);
    snapshotNetWorth(d);
  });
  return { pending: r.pending, live: r.live };
}

export function Invest(_: { go: Go }) {
  const doc = useAtomValue(docAtom);
  const { passcode, demo } = useAtomValue(sessionAtom);
  const inv = doc.investments ?? emptyInvestments();
  const [adding, setAdding] = useState(false);
  const [checkup, setCheckup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ pending: number; live: boolean } | null>(null);
  const tries = useRef(0);
  const p = portfolio(inv);

  async function refresh(quiet = false) {
    if (demo || !passcode) return;
    setBusy(true);
    try {
      const r = await refreshPrices(passcode);
      setStatus(r);
      if (!quiet) toast(r.live ? (r.pending ? `Prices updated. ${r.pending} more will follow (free price limit).` : 'Prices updated') : 'Live prices are off. Showing the prices from your last upload.');
    } catch (e) {
      if (!quiet) toast(`Could not update prices. ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  // Refresh when the tab opens if prices are older than six hours, and keep going while some are waiting.
  useEffect(() => {
    if (!inv.accounts.length || demo) return;
    if (!inv.pricedAt || Date.now() - new Date(inv.pricedAt).getTime() > SIX_HOURS) void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!status?.pending || !status.live || tries.current >= 5) return;
    const t = setTimeout(() => { tries.current++; void refresh(true); }, 65000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!inv.accounts.length) {
    return (
      <div className="stagger grid gap-5">
        <Card className="grid gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-2xl text-brand"><LuTrendingUp /></div>
          <div>
            <h1 className="text-2xl font-bold">Your investments, in one place</h1>
            <p className="text-muted">Upload a Wealthsimple holdings report and see what you own across TFSAs, RRSPs and other accounts, how your mix compares to a target, and where new money could go.</p>
          </div>
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted">
            <li>On the Wealthsimple website, open the <strong className="text-ink">Profile</strong> menu, then <strong className="text-ink">Documents</strong>.</li>
            <li>Choose <strong className="text-ink">Generate document</strong>, then <strong className="text-ink">Holdings report (CSV)</strong>.</li>
            <li>Pick today's date, tick every account, and download the CSV.</li>
          </ol>
          <Button variant="primary" size="lg" className="justify-self-start" onClick={() => setAdding(true)} disabled={demo}><LuUpload />Add holdings</Button>
          {demo && <p className="text-[13px] text-muted">Sign in to add holdings. The sample household has none.</p>}
        </Card>
        <AddHoldings open={adding} onClose={() => setAdding(false)} onSaved={() => void refresh(true)} />
      </div>
    );
  }

  const gainPct = p.book > 0 ? p.gain / p.book : 0;
  const history = Object.entries(inv.history).sort(([a], [b]) => a.localeCompare(b));
  const slices = (Object.keys(CLASSES) as AssetClass[]).map(k => ({ label: CLASSES[k].label, value: p.byClass[k], color: CLASSES[k].color })).filter(s => s.value > 0.5);

  return (
    <div className="stagger grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Invest</h1>
        <div className="flex gap-2">
          <Button onClick={() => void refresh()} busy={busy} disabled={demo}><LuRefreshCw />Prices</Button>
          <Button variant="primary" onClick={() => setAdding(true)} disabled={demo}><LuUpload />Add holdings</Button>
        </div>
      </div>

      <Card className="grid gap-4 border-brand bg-brand text-white">
        <div>
          <p className="text-white/75">Invested across {inv.accounts.length} account{inv.accounts.length > 1 ? 's' : ''}</p>
          <Count value={p.total} format={money0} className="display text-4xl font-bold" />
          {p.book > 0 && (
            <p className="mt-1 flex items-center gap-1.5 font-semibold">
              {p.gain >= 0 ? <LuTrendingUp aria-hidden /> : <LuTrendingDown aria-hidden />}
              {money0(Math.abs(p.gain))} {p.gain >= 0 ? 'up' : 'down'} on what you put in ({pct(gainPct)})
              {Math.abs(p.dayMove) >= 1 && <span className="font-normal text-white/80"> · {p.dayMove >= 0 ? '+' : '−'}{money0(Math.abs(p.dayMove))} today</span>}
            </p>
          )}
        </div>
        {history.length >= 2 && <TrendChart values={history.map(([, v]) => v)} color="#ffffff" height={120} format={money0} label={i => dayLabel(history[i][0])} />}
        <p className="text-[13px] text-white/75">
          {inv.pricedAt ? `Prices checked ${dayLabel(inv.pricedAt.slice(0, 10))}` : 'Prices from your holdings report'}
          {status && !status.live ? ' · live prices are off' : status?.pending ? ` · ${status.pending} waiting on the free price limit` : ''}
          {inv.fx ? ` · US$1 = C$${inv.fx.toFixed(4)}${inv.fxLive ? '' : ' (approximate)'}` : ''}
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionTitle>Your mix</SectionTitle>
          <Card className="grid gap-4">
            <div className="grid justify-items-center gap-4 sm:flex sm:items-center sm:gap-5">
              <Donut slices={slices} size={150} thickness={20}><span className="text-center text-[13px] text-muted">{slices.length} kinds<br />of assets</span></Donut>
              <div className="w-full min-w-0 sm:flex-1"><Legend parts={slices} format={money0} /></div>
            </div>
            <p className="text-[13px] text-muted">All-in-one funds like XEQT or VGRO are split into what they hold, using approximate weights.</p>
          </Card>
        </section>
        <Target target={inv.target} />
      </div>

      <NewMoney />
      <Flags />
      <AccountFit />

      <section>
        <SectionTitle>Accounts</SectionTitle>
        <div className="grid gap-4">{inv.accounts.map(a => <AccountCard key={a.id} account={a} fx={inv.fx} />)}</div>
      </section>

      <Card className="grid gap-3 border-brand/30 bg-brand-soft/60">
        <p className="flex items-center gap-2 font-bold"><LuSparkles className="text-brand" aria-hidden />Portfolio check-up</p>
        <p className="text-sm text-muted">Claude reviews your holdings, mix, fund fees and account types, and suggests what to do with new money. It explains; it does not pick stocks or predict markets.</p>
        <Button variant="primary" className="justify-self-start" onClick={() => setCheckup(true)} disabled={demo}>Run a check-up</Button>
      </Card>

      <p className="flex gap-2 text-[13px] text-muted"><LuInfo className="mt-0.5 shrink-0" aria-hidden />For learning and planning, not financial advice. For big decisions, a fee-only financial planner can look at your whole situation.</p>

      <AddHoldings open={adding} onClose={() => setAdding(false)} onSaved={() => void refresh(true)} />
      <CheckupSheet open={checkup} onClose={() => setCheckup(false)} />
    </div>
  );
}

function Target({ target }: { target: TargetKey }) {
  const doc = useAtomValue(docAtom);
  const inv = doc.investments ?? emptyInvestments();
  const rows = drift(inv).filter(r => r.target > 0 || r.now > 0.005);
  return (
    <section>
      <SectionTitle>Against your target</SectionTitle>
      <Card className="grid gap-4">
        <Select<TargetKey> value={target} onChange={t => updateDoc(d => { d.investments = { ...(d.investments ?? emptyInvestments()), target: t }; })}
          options={(Object.keys(TARGETS) as TargetKey[]).map(k => ({ value: k, label: TARGETS[k].label, hint: TARGETS[k].hint }))} />
        <div className="grid gap-3">
          {rows.map(r => {
            const off = r.now - r.target;
            return (
              <div key={r.cls} className="grid gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: CLASSES[r.cls].color }} />{CLASSES[r.cls].label}</span>
                  <span className={cn('num font-semibold', Math.abs(off) > 0.05 ? 'text-warn' : 'text-muted')}>{Math.round(r.now * 100)}% <span className="font-normal text-muted">of {Math.round(r.target * 100)}%</span></span>
                </div>
                <div className="relative h-2 rounded-full bg-canvas">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, r.now * 100)}%`, background: CLASSES[r.cls].color }} />
                  {r.target > 0 && <div className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `${Math.min(100, r.target * 100)}%` }} aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[13px] text-muted">The dark mark is the target. Crypto and anything unclassified are left out of this comparison.</p>
      </Card>
    </section>
  );
}

function NewMoney() {
  const doc = useAtomValue(docAtom);
  const inv = doc.investments ?? emptyInvestments();
  const [amount, setAmount] = useState(500);
  const plan = placeNewMoney(inv, amount);
  return (
    <section>
      <SectionTitle>Where new money could go</SectionTitle>
      <Card className="grid gap-4">
        <Field label="Investing this month"><MoneyInput label="Amount to invest" value={amount} onChange={setAmount} step={50} /></Field>
        {plan.allInOne ? (
          <p className="flex gap-2 text-sm"><LuBadgeCheck className="mt-0.5 shrink-0 text-good" aria-hidden />Most of your money is in {plan.allInOne}, an all-in-one fund that rebalances itself. Adding the full amount to it keeps things simple{plan.parts.length ? '; or use the split below to steer the rest of the portfolio toward your target' : ''}.</p>
        ) : null}
        {plan.parts.length > 0 ? (
          <ul className="grid gap-2">
            {plan.parts.map(x => (
              <li key={x.cls} className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
                <span className="size-3 shrink-0 rounded-full" style={{ background: CLASSES[x.cls].color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{CLASSES[x.cls].label}</p>
                  <p className="text-[13px] text-muted">{x.fund ? `Add to ${x.fund}, which you already hold` : 'You hold no fund just for this yet; a broad, low-fee index ETF covers it'}</p>
                </div>
                <span className="num font-semibold">{money0(x.amount)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Your mix is on target, so split new money in the target's proportions.</p>}
        <p className="text-[13px] text-muted">This only moves your mix toward the target you picked. It does not judge which funds are best.</p>
      </Card>
    </section>
  );
}

function Flags() {
  const doc = useAtomValue(docAtom);
  const flags = portfolioFlags(doc.investments ?? emptyInvestments());
  if (!flags.length) return null;
  const icon = { good: <LuBadgeCheck className="mt-0.5 shrink-0 text-good" />, warn: <LuCircleAlert className="mt-0.5 shrink-0 text-warn" />, info: <LuInfo className="mt-0.5 shrink-0 text-muted" /> };
  return (
    <section>
      <SectionTitle>Worth knowing</SectionTitle>
      <Card className="grid gap-3">{flags.map(f => <p key={f.text} className="flex gap-2 text-sm">{icon[f.tone]}<span>{f.text}</span></p>)}</Card>
    </section>
  );
}

function AccountFit() {
  const doc = useAtomValue(docAtom);
  const guidance = accountGuidance(doc, doc.investments ?? emptyInvestments());
  return (
    <section>
      <SectionTitle>Which account first</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {guidance.map(g => (
          <Card key={g.person} className="grid gap-2">
            <p className="flex items-center gap-2 font-semibold"><Avatar id={g.person} size={24} />{who(doc, g.person)}<span className="ml-auto rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand">{g.rrspFirst ? 'RRSP, then TFSA' : 'TFSA first'}</span></p>
            {g.lines.map(l => <p key={l} className="text-sm text-muted">{l}</p>)}
          </Card>
        ))}
      </div>
    </section>
  );
}

function AccountCard({ account: a, fx }: { account: InvAccount; fx: number }) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const total = accountValue(a, fx);
  const classOptions = (Object.keys(CLASSES) as AssetClass[]).map(k => ({ value: k, label: CLASSES[k].label }));
  const remove = () => {
    const before = a;
    updateDoc(d => {
      if (!d.investments) return;
      d.investments.accounts = d.investments.accounts.filter(x => x.id !== a.id);
      syncNetWorth(d);
    });
    toast(`Removed ${a.name}`, { label: 'Undo', run: () => updateDoc(d => { d.investments?.accounts.push(before); syncNetWorth(d); }) });
  };
  return (
    <Card className="grid gap-3 p-0">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-center gap-3 px-4 pt-4 text-left">
        <Avatar id={a.owner} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{a.name}</p>
          <p className="text-[13px] text-muted">{a.type} · {a.holdings.length} holding{a.holdings.length > 1 ? 's' : ''} · report from {dayLabel(a.asOf)}</p>
        </div>
        <span className="num font-bold">{money0(total)}</span>
        <LuChevronDown className={cn('shrink-0 text-muted transition', open && 'rotate-180')} aria-hidden />
      </button>
      <ul className="divide-y divide-line border-t border-line">
        {(open ? a.holdings : a.holdings.slice(0, 3)).map(h => {
          const v = valueCad(h, fx);
          const gain = h.bookCad ? v - h.bookCad : null;
          return (
            <li key={h.symbol} className="grid gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-9 min-w-12 place-items-center rounded-xl px-1.5 text-[12px] font-bold text-white" style={{ background: CLASSES[mainClass(h)].color }}>{h.symbol.slice(0, 5)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.name}</p>
                  <p className="num text-[13px] text-muted">{+h.qty.toFixed(4)} × {money(h.price)}{String(h.currency).toUpperCase() === 'USD' ? ' US' : ''}{h.dayChange ? ` · ${h.dayChange >= 0 ? '+' : ''}${h.dayChange.toFixed(2)}% today` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="num font-semibold">{money0(v)}</p>
                  {gain !== null && <p className={cn('num text-[13px]', gain >= 0 ? 'text-good' : 'text-bad')}>{gain >= 0 ? '+' : '−'}{money0(Math.abs(gain))}</p>}
                </div>
              </div>
              {open && isAllInOne(h) && !h.cls && (
                <p className="pl-15 text-[13px] text-muted">An all-in-one fund, split across {Object.keys(mixOf(h)).map(k => CLASSES[k as AssetClass].label.toLowerCase()).join(', ')}.</p>
              )}
              {open && !(isAllInOne(h) && !h.cls) && (
                <div className="flex items-center gap-2 pl-15">
                  <span className="shrink-0 text-[13px] text-muted">Counts as</span>
                  <Select<AssetClass> value={mainClass(h)} onChange={cls => updateDoc(d => { const t = d.investments?.accounts.find(x => x.id === a.id)?.holdings.find(x => x.symbol === h.symbol); if (t) t.cls = cls; })} options={classOptions} className="h-9 min-w-0 flex-1" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!open && a.holdings.length > 3 && <button onClick={() => setOpen(true)} className="px-4 pb-3 text-left text-sm font-semibold text-brand">Show {a.holdings.length - 3} more</button>}
      {open && (
        <div className="px-4 pb-4">
          <Button size="sm" variant={sure ? 'danger' : 'ghost'} onClick={() => (sure ? remove() : setSure(true))}><LuTrash2 />{sure ? 'Tap again to remove this account' : 'Remove account'}</Button>
        </div>
      )}
    </Card>
  );
}

function AddHoldings({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const doc = useAtomValue(docAtom);
  const { passcode } = useAtomValue(sessionAtom);
  const owners = useOwnerOptions<Owner>(['p1', 'p2', 'shared']);
  const [owner, setOwner] = useState<Owner>('p1');
  const [found, setFound] = useState<InvAccount[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fx = doc.investments?.fx ?? 1.38;

  async function read(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setFound(null);
    try {
      const text = await file.text();
      const parsed = parseWealthsimple(text, owner);
      // Not Wealthsimple's format: let Claude read it instead.
      const accounts = parsed?.accounts ?? (await extractHoldings(passcode, text, owner));
      if (!accounts.length) throw new Error('No holdings were found in that file. Use the Holdings report (CSV) from Wealthsimple\'s Documents page.');
      setFound(accounts);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  function save() {
    if (!found) return;
    updateDoc(d => {
      d.investments = d.investments ?? emptyInvestments();
      mergeAccounts(d.investments, found.map(a => ({ ...a, owner })));
      recordValue(d.investments);
      syncNetWorth(d);
      snapshotNetWorth(d);
    });
    toast(`${found.length} account${found.length > 1 ? 's' : ''} saved. Checking market prices.`);
    setFound(null);
    onClose();
    onSaved();
  }

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="Add holdings"
      footer={found && <Button variant="primary" size="lg" className="flex-1" onClick={save}>Save {found.length} account{found.length > 1 ? 's' : ''}</Button>}>
      <Field label="Whose accounts are these?"><Segmented size="sm" value={owner} onChange={setOwner} options={owners} /></Field>
      <label className="grid cursor-pointer justify-items-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-center transition hover:border-brand hover:bg-brand-soft/40">
        {busy ? <LuLoaderCircle className="animate-spin text-2xl text-brand" /> : <LuUpload className="text-2xl text-brand" />}
        <span className="font-semibold">{busy ? 'Reading' : 'Choose the holdings CSV'}</span>
        <span className="text-[13px] text-muted">Wealthsimple: Profile, Documents, Generate document, Holdings report (CSV). Other brokerages' CSVs are read by Claude.</span>
        <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
      {found && (
        <div className="grid gap-2">
          <p className="text-sm text-muted">Found these. Saving replaces earlier holdings for the same accounts.</p>
          {found.map(a => (
            <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.name}</p><p className="text-[13px] text-muted">{a.type} · {a.holdings.map(h => h.symbol).join(', ')}</p></div>
              <span className="num font-semibold">{money0(accountValue(a, fx))}</span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function CheckupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useAtomValue(docAtom);
  const { passcode } = useAtomValue(sessionAtom);
  const [amount, setAmount] = useState(500);
  const [result, setResult] = useState<PortfolioCheckup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try { setResult(await runPortfolioCheckup(passcode, doc, amount)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const list = (title: string, items: string[], tone: string) => items.length > 0 && (
    <div className="grid gap-1.5"><p className={cn('font-bold', tone)}>{title}</p><ul className="grid gap-1.5 pl-5 [list-style:disc]">{items.map(x => <li key={x} className="text-sm">{x}</li>)}</ul></div>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Portfolio check-up">
      {!result ? (
        <>
          <p className="text-muted">Claude looks at your holdings, your mix against the target, fund fees, account types and currency, then suggests how to put new money to work. Educational only.</p>
          <Field label="About how much can you invest each month?"><MoneyInput label="Monthly amount" value={amount} onChange={setAmount} step={50} /></Field>
          {error && <p className="text-sm font-semibold text-bad" role="alert">{error}</p>}
          <Button variant="primary" size="lg" busy={busy} onClick={() => void run()}>{busy ? 'Reviewing' : 'Run the check-up'}</Button>
        </>
      ) : (
        <div className="grid animate-rise gap-4">
          <p className="text-[15px]">{result.summary}</p>
          {list('Going well', result.strengths, 'text-good')}
          {list('Worth watching', result.watch, 'text-warn')}
          {list('Next steps', result.next, 'text-brand')}
          <p className="text-[13px] text-muted">For learning and planning, not financial advice.</p>
          <Button onClick={() => setResult(null)}>Run again</Button>
        </div>
      )}
    </Sheet>
  );
}
