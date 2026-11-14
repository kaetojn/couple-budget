import { useRef } from 'react';
import { useAtomValue } from 'jotai';
import type { IconType } from 'react-icons';
import { LuCalendarDays, LuChartLine, LuChartPie, LuCloud, LuCloudOff, LuLayoutDashboard, LuRefreshCw, LuSettings, LuTarget, LuTrendingUp } from 'react-icons/lu';
import { Logo } from './components/logo';
import { Button } from './components/ui/button';
import { Toasts } from './components/ui/misc';
import { Budgets } from './features/Budgets';
import { Home } from './features/Home';
import { Lock } from './features/Lock';
import { Month } from './features/Month';
import { NetWorth } from './features/NetWorth';
import { Invest } from './features/Invest';
import { Onboarding } from './features/Onboarding';
import { Plan } from './features/Plan';
import { Settings } from './features/Settings';
import { cn } from './lib/cn';
import { useHashRoute } from './lib/hooks';
import { docAtom, leaveDemo, sessionAtom, type SyncState } from './lib/store';

export type Go = (route: string) => void;

const TABS: { id: string; label: string; icon: IconType }[] = [
  { id: 'home', label: 'Home', icon: LuLayoutDashboard },
  { id: 'month', label: 'Month', icon: LuCalendarDays },
  { id: 'budgets', label: 'Budgets', icon: LuChartPie },
  { id: 'plan', label: 'Plan', icon: LuTarget },
  { id: 'worth', label: 'Net worth', icon: LuChartLine },
  { id: 'invest', label: 'Invest', icon: LuTrendingUp },
];
const PAGES: Record<string, (p: { go: Go }) => React.ReactNode> = { home: Home, month: Month, budgets: Budgets, plan: Plan, worth: NetWorth, invest: Invest, settings: Settings };

function SyncBadge({ state }: { state: SyncState }) {
  if (state === 'idle') return null;
  const [Icon, text] = state === 'saving' ? [LuRefreshCw, 'Saving'] : state === 'saved' ? [LuCloud, 'Saved'] : [LuCloudOff, 'This device only'];
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-muted" role="status">
      <Icon className={cn(state === 'saving' && 'animate-spin')} aria-hidden />
      {text}
    </span>
  );
}

export default function App() {
  const session = useAtomValue(sessionAtom);
  const doc = useAtomValue(docAtom);
  const [route, go] = useHashRoute('home');
  // Screens play their entrance once per session; a return visit only fades in.
  const visits = useRef({ route: '', revisit: false, seen: new Set<string>() });
  if (visits.current.route !== route) {
    const { seen } = visits.current;
    visits.current = { route, revisit: seen.has(route), seen };
    seen.add(route);
  }
  const { revisit } = visits.current;

  if (!session.passcode && !session.demo) return <><Lock /><Toasts /></>;
  if (session.loading) {
    return (
      <div className="mx-auto grid max-w-md gap-3 px-6 pt-[18vh]">
        <Logo size={44} />
        <p className="text-xl font-bold">Loading your budget</p>
        <div className="skeleton h-4 w-3/4" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-1/2" />
      </div>
    );
  }
  if (!doc.settings.onboarded) return <><Onboarding go={go} /><Toasts /></>;

  const Page = PAGES[route] ?? Home;
  return (
    <div className="min-h-dvh md:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-1 border-r border-line bg-surface p-4 md:flex">
        <a href="#/home" className="mb-5 flex items-center gap-3 px-2 pt-1">
          <Logo />
          <span className="text-[17px] font-bold leading-tight">Couple<br />Budget</span>
        </a>
        {TABS.map(t => (
          <a key={t.id} href={`#/${t.id}`} aria-current={route === t.id ? 'page' : undefined} className={cn('flex h-11 items-center gap-3 rounded-xl px-3 font-semibold transition', route === t.id ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-canvas hover:text-ink')}>
            <t.icon className="text-xl" aria-hidden />
            {t.label}
          </a>
        ))}
        <div className="mt-auto grid gap-3">
          <div className="px-3"><SyncBadge state={session.sync} /></div>
          <a href="#/settings" aria-current={route === 'settings' ? 'page' : undefined} className={cn('flex h-11 items-center gap-3 rounded-xl px-3 font-semibold transition', route === 'settings' ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-canvas hover:text-ink')}>
            <LuSettings className="text-xl" aria-hidden />
            Settings
          </a>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur md:hidden">
        <a href="#/home" className="flex items-center gap-2.5"><Logo size={30} /><span className="font-bold">Couple Budget</span></a>
        <span className="ml-auto"><SyncBadge state={session.sync} /></span>
        <a href="#/settings" aria-label="Settings" className={cn('grid size-10 place-items-center rounded-full text-xl', route === 'settings' ? 'bg-brand-soft text-brand' : 'text-muted')}><LuSettings /></a>
      </header>

      {session.demo && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-soft px-4 py-2 text-center text-sm font-medium text-brand">
          You are looking at a sample household. Nothing is saved.
          <Button size="sm" variant="primary" onClick={leaveDemo}>Sign in</Button>
        </div>
      )}

      <main key={route} data-revisit={revisit || undefined} className="mx-auto max-w-5xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
        <Page go={go} />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Sections">
        {TABS.map(t => (
          <a key={t.id} href={`#/${t.id}`} aria-current={route === t.id ? 'page' : undefined} className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', route === t.id ? 'text-brand' : 'text-muted')}>
            <span className={cn('grid h-7 w-12 place-items-center rounded-full text-xl transition', route === t.id && 'bg-brand-soft')}><t.icon aria-hidden /></span>
            {t.label}
          </a>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
