/**
 * Keeping the app current. A browser tab or iPhone home-screen app keeps running the version it
 * loaded, so the app checks for a newer published version and reloads, after sending any waiting
 * changes (unsent changes are also kept on the device, so a reload never loses them).
 */
import { flush } from './store';

const SCRIPT = /<script[^>]+type="module"[^>]+src="([^"]*assets\/[^"]+\.js)"/;

/** The script file this copy of the app was built into, e.g. assets/index-a1b2c3.js. */
export const running = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/"]')?.src ?? '';

/** A short label for this version, taken from the build's file name. */
export const versionLabel = () => running().match(/index-([\w-]+)\.js/)?.[1]?.slice(0, 8) ?? 'dev';

/** True when the published app is newer than the one running. */
export async function newerAvailable(): Promise<boolean> {
  const current = running();
  if (!current) return false;
  const html = await (await fetch(location.pathname, { cache: 'no-store' })).text();
  const src = html.match(SCRIPT)?.[1];
  return !!src && new URL(src, location.href).href !== current;
}

/** Sends waiting changes, then loads the newest version. */
export function reloadApp() {
  flush();
  setTimeout(() => location.reload(), 800);
}

/** Reloads quietly when a newer version is out. */
export async function checkForUpdate() {
  try { if (await newerAvailable()) reloadApp(); } catch { /* offline: try again later */ }
}
