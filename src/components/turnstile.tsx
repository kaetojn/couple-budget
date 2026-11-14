import { useEffect, useRef } from 'react';

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void } }
}

let loading: Promise<void> | null = null;
const load = () => (loading ??= new Promise<void>((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error('The bot check could not load'));
  document.head.appendChild(s);
}));

/** Cloudflare's "are you human" check. Renders nothing when the Worker has it switched off. */
export function Turnstile({ siteKey, onToken }: { siteKey: string | null; onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id = '';
    let gone = false;
    void load().then(() => {
      if (gone || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken(''), theme: 'light', size: 'flexible' });
    }).catch(() => onToken(''));
    return () => { gone = true; if (id) window.turnstile?.remove(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  return siteKey ? <div ref={box} className="min-h-[65px]" /> : null;
}
