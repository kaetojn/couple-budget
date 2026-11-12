import { atom, getDefaultStore } from 'jotai';
import { api, ApiError } from './api';
import { monthsWithData } from './compute';
import { defaultDoc, migrate } from './defaults';
import { monthKey } from './format';
import { netWorth } from './plan';
import { sampleDoc } from './sample';
import type { Doc } from './types';

export const store = getDefaultStore();
const DOC_KEY = 'coupleBudget.v2';
const PASS_KEY = 'coupleBudget.pass';

function readLocal(): Doc {
  try {
    const raw = localStorage.getItem(DOC_KEY) ?? localStorage.getItem('coupleBudget.v1');
    return migrate(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultDoc();
  }
}
const readPass = () => { try { return localStorage.getItem(PASS_KEY) ?? ''; } catch { return ''; } };

export type SyncState = 'idle' | 'saving' | 'saved' | 'local';
export interface Session { passcode: string; demo: boolean; loading: boolean; sync: SyncState }

const latestMonth = (doc: Doc) => monthsWithData(doc).pop() ?? monthKey();
const initial = readLocal();

export const docAtom = atom<Doc>(initial);
export const sessionAtom = atom<Session>({ passcode: readPass(), demo: false, loading: false, sync: 'idle' });
export const monthAtom = atom<string>(latestMonth(initial));
export const toastAtom = atom<{ id: number; text: string }[]>([]);

let toastId = 0;
export function toast(text: string) {
  const id = ++toastId;
  store.set(toastAtom, list => [...list, { id, text }]);
  setTimeout(() => store.set(toastAtom, list => list.filter(t => t.id !== id)), 3400);
}

const patchSession = (patch: Partial<Session>) => store.set(sessionAtom, s => ({ ...s, ...patch }));
let synced = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function push() {
  const { passcode, demo } = store.get(sessionAtom);
  if (!synced || !passcode || demo) return;
  try {
    await api.save(passcode, { ...store.get(docAtom), updatedAt: new Date().toISOString() });
    patchSession({ sync: 'saved' });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return lock();
    patchSession({ sync: 'local' });
  }
}

function persist(doc: Doc) {
  const { passcode, demo } = store.get(sessionAtom);
  if (demo) return;
  try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch { /* storage full or blocked */ }
  if (!synced || !passcode) return;
  patchSession({ sync: 'saving' });
  clearTimeout(timer);
  timer = setTimeout(push, 2000);
}

/** The one way to change data: mutate a copy, then it is saved locally and synced. */
export function updateDoc(change: (doc: Doc) => void) {
  const next = structuredClone(store.get(docAtom));
  change(next);
  store.set(docAtom, next);
  persist(next);
}

/** Records this month's balance-sheet totals so net worth can be charted over time. */
export function snapshotNetWorth(doc: Doc) {
  const { assets, debts } = netWorth(doc);
  doc.snapshots[monthKey()] = { assets, debts };
}

export async function pull() {
  const { passcode } = store.get(sessionAtom);
  if (!passcode) return;
  patchSession({ loading: true });
  try {
    const data = await api.load(passcode);
    synced = true;
    if (data) {
      const doc = migrate(data);
      store.set(docAtom, doc);
      store.set(monthAtom, latestMonth(doc));
      try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch { /* ignore */ }
      patchSession({ sync: 'saved' });
    } else {
      await push();
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) lock();
    else {
      patchSession({ sync: 'local' });
      toast(`Working on this device only. ${(e as Error).message}`);
    }
  } finally {
    patchSession({ loading: false });
  }
}

export async function unlock(passcode: string) {
  await api.check(passcode);
  try { localStorage.setItem(PASS_KEY, passcode); } catch { /* ignore */ }
  store.set(docAtom, readLocal());
  patchSession({ passcode, demo: false });
  await pull();
}

export function lock() {
  synced = false;
  try { localStorage.removeItem(PASS_KEY); } catch { /* ignore */ }
  patchSession({ passcode: '', demo: false, sync: 'idle' });
}

export function startDemo() {
  const doc = sampleDoc();
  store.set(docAtom, doc);
  store.set(monthAtom, latestMonth(doc));
  patchSession({ demo: true });
}

export function leaveDemo() {
  store.set(docAtom, readLocal());
  patchSession({ demo: false });
}

export function eraseDevice() {
  try { localStorage.removeItem(DOC_KEY); localStorage.removeItem(PASS_KEY); localStorage.removeItem('coupleBudget.v1'); localStorage.removeItem('coupleBudget.cur'); } catch { /* ignore */ }
  location.reload();
}
