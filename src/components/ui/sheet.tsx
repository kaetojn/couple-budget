import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';

/**
 * A bottom sheet on phones and a centred dialog on larger screens.
 * It opens on a long ease-out and leaves faster than it arrives. While it is
 * leaving it ignores taps, so the screen underneath responds straight away.
 */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-ink/45 transition-opacity duration-200 ease-out data-[closed]:opacity-0 data-[leave]:pointer-events-none data-[leave]:duration-150" />
      <div className="fixed inset-0 flex items-end justify-center has-[[data-leave]]:pointer-events-none md:items-center md:p-6">
        <DialogPanel
          transition
          className="flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-surface shadow-2xl transition-[transform,opacity] duration-[260ms] ease-(--ease-out-expo) will-change-transform data-[closed]:translate-y-full data-[leave]:duration-[180ms] data-[leave]:ease-(--ease-in-quick) md:max-w-lg md:rounded-[28px] md:data-[closed]:translate-y-3 md:data-[closed]:opacity-0"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 md:pt-5">
            <DialogTitle className="min-w-0 truncate text-lg font-bold">{title}</DialogTitle>
            <button onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-ink/5 active:bg-ink/10">
              <LuX className="text-xl" />
            </button>
          </div>
          <div className="grid gap-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">{children}</div>
          {footer && <div className="flex gap-3 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
