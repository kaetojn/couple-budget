import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-3xl border border-line bg-surface p-5', className)} {...rest} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold">{children}</h2>
      {action}
    </div>
  );
}

/** A label above a control, with an optional hint underneath. */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}

export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <Card className="grid justify-items-center gap-3 py-10 text-center">
      <svg width="88" height="60" viewBox="0 0 88 60" fill="none" aria-hidden>
        <rect x="6" y="30" width="14" height="24" rx="5" fill="#dfdcfb" />
        <rect x="27" y="18" width="14" height="36" rx="5" fill="#b9b3f6" />
        <rect x="48" y="6" width="14" height="48" rx="5" fill="#4b3fe4" />
        <rect x="69" y="24" width="14" height="30" rx="5" fill="#ffb7d3" />
      </svg>
      <div>
        <p className="text-lg font-bold">{title}</p>
        <p className="mx-auto max-w-sm text-muted">{text}</p>
      </div>
      {children}
    </Card>
  );
}
