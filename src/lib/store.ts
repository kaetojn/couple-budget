import { atom, getDefaultStore } from 'jotai';
import { api, ApiError, type CheckResult } from './api';
import { monthsWithData } from './compute';
import { defaultDoc, migrate } from './defaults';
import { monthKey } from './format';
import { netWorth } from './plan';
import { sampleDoc } from './sample';
import type { Doc } from './types';

export const store = getDefaultStore();
const DOC_KEY = 'coupleBudget.v2';
const PASS_KEY = 'coupleBudget.pass';
/** Set while this device has changes the cloud has not received yet. */
const DIRTY_KEY = 'coupleBudget.unsynced';
/** Which household the local copy belongs to. */
const HH_KEY = 'coupleBudget.household';
const isDirty = () => { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch { return false; } };
const setDirty = (on: boolean) => { try { on ? localStorage.setItem(DIRTY_KEY, '1') : localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ } };

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
export interface ToastAction { label: string; run: () => void }
export const toastAtom = atom<{ id: number; text: string; action?: ToastAction }[]>([]);

let toastId = 0;
export function dismissToast(id: number) {
  store.set(toastAtom, list => list.filter(t => t.id !== id));
}
export function toast(text: string, action?: ToastAction) {
  const id = ++toastId;
  // One toast at a time keeps the message under the thumb readable.
  store.set(toastAtom, [{ id, text, action }]);
  setTimeout(() => dismissToast(id), action ? 6000 : 3400);
}

const patchSession = (patch: Partial<Session>) => store.set(sessionAtom, s => ({ ...s, ...patch }));
let synced = false;
let timer: ReturnType<typeof setTimeout> | undefined;

let retry: ReturnType<typeof setTimeout> | undefined;

async function push() {
  const { passcode, demo } = store.get(sessionAtom);
  if (!synced || !passcode || demo) return;
  clearTimeout(timer);
  clearTimeout(retry);
  timer = undefined;
  const doc = store.get(docAtom);
  try {
    await api.save(passcode, doc);
    // Only clear the flag if nothing changed while the save was in flight.
    if (store.get(docAtom) === doc) { setDirty(false); patchSession({ sync: 'saved' }); }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return lock();
    patchSession({ sync: 'local' });
    // Keep trying quietly; the change is safe on this device in the meantime.
    retry = setTimeout(() => void push(), 15000);
  }
}

/** Sends any waiting change now, for when the app is being closed or hidden. */
export function flush() {
  if (!store.get(sessionAtom).passcode) return;
  // Never reached the cloud this session (opened offline): connect first, which also sends newer local changes.
  if (!synced) void pull(true);
  else if (timer || isDirty()) void push();
}

function persist(doc: Doc) {
  const { passcode, demo } = store.get(sessionAtom);
  if (demo) return;
  try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch { /* storage full or blocked */ }
  if (!passcode) return;
  setDirty(true);
  if (!synced) return;
  patchSession({ sync: 'saving' });
  clearTimeout(timer);
  timer = setTimeout(() => void push(), 800);
}

/** The one way to change data: mutate a copy, then it is saved locally and synced. */
export function updateDoc(change: (doc: Doc) => void) {
  const next = structuredClone(store.get(docAtom));
  change(next);
  next.updatedAt = new Date().toISOString();
  store.set(docAtom, next);
  persist(next);
}

/** Records this month's balance-sheet totals so net worth can be charted over time. */
export function snapshotNetWorth(doc: Doc) {
  const { assets, debts } = netWorth(doc);
  doc.snapshots[monthKey()] = { assets, debts };
}

/**
 * Loads the household from the cloud. If this device has changes the cloud never received
 * (closed too quickly, or offline) and they are newer, they are kept and sent instead.
 * A quiet pull (when the app comes back to the front) shows no spinner or message.
 */
export async function pull(quiet = false) {
  const { passcode, demo } = store.get(sessionAtom);
  if (!passcode || demo) return;
  if (quiet && timer) return;
  if (!quiet) patchSession({ loading: true });
  try {
    const data = await api.load(passcode);
    synced = true;
    const local = store.get(docAtom);
    const remote = data ? migrate(data) : null;
    if (remote && !(isDirty() && (local.updatedAt ?? '') > (remote.updatedAt ?? ''))) {
      if (quiet && remote.updatedAt === local.updatedAt) return void patchSession({ sync: 'saved' });
      store.set(docAtom, remote);
      if (!quiet) store.set(monthAtom, latestMonth(remote));
      try { localStorage.setItem(DOC_KEY, JSON.stringify(remote)); } catch { /* ignore */ }
      setDirty(false);
      patchSession({ sync: 'saved' });
    } else {
      await push();
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) lock();
    else {
      patchSession({ sync: 'local' });
      if (!quiet) toast(`Working on this device only. ${(e as Error).message}`);
    }
  } finally {
    if (!quiet) patchSession({ loading: false });
  }
}

export const accountAtom = atom<CheckResult | null>(null);

/**
 * Signs in with the household passcode or an account token. The local copy belongs to one household,
 * so signing in to a different household on this device starts from a clean slate.
 */
export async function unlock(credential: string) {
  const info = await api.check(credential);
  let local = readLocal();
  try {
    const before = localStorage.getItem(HH_KEY);
    if (before !== info.household) {
      if (before !== null || info.household !== 'legacy') {
        local = defaultDoc();
        localStorage.setItem(DOC_KEY, JSON.stringify(local));
        setDirty(false);
      }
      localStorage.setItem(HH_KEY, info.household);
    }
    localStorage.setItem(PASS_KEY, credential);
  } catch { /* ignore */ }
  store.set(docAtom, local);
  store.set(accountAtom, info);
  patchSession({ passcode: credential, demo: false });
  await pull();
}

/** Swaps the passcode for an account sign-in on this device (same household, so data stays). */
export function setCredential(credential: string) {
  try { localStorage.setItem(PASS_KEY, credential); } catch { /* ignore */ }
  patchSession({ passcode: credential });
  void refreshAccount();
}

export async function refreshAccount() {
  const { passcode } = store.get(sessionAtom);
  if (!passcode) return;
  try { store.set(accountAtom, await api.check(passcode)); } catch { /* shown elsewhere */ }
}

export function lock() {
  flush();
  synced = false;
  store.set(accountAtom, null);
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
  try { localStorage.removeItem(DOC_KEY); localStorage.removeItem(PASS_KEY); localStorage.removeItem('coupleBudget.v1'); localStorage.removeItem('coupleBudget.cur'); localStorage.removeItem(DIRTY_KEY); localStorage.removeItem(HH_KEY); } catch { /* ignore */ }
  location.reload();
}
