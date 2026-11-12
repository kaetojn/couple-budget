import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';

/** A bottom sheet on phones and a centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-ink/45 transition duration-200 data-[closed]:opacity-0" />
      <div className="fixed inset-0 flex items-end justify-center md:items-center md:p-6">
        <DialogPanel
          transition
          className="flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-surface shadow-2xl transition duration-300 ease-out data-[closed]:translate-y-full md:max-w-lg md:rounded-[28px] md:data-[closed]:translate-y-4 md:data-[closed]:opacity-0"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 md:pt-5">
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
            <button onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-ink/5">
              <LuX className="text-xl" />
            </button>
          </div>
          <div className="grid gap-5 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
          {footer && <div className="flex gap-3 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
