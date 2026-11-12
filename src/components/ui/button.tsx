import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { LuLoaderCircle } from 'react-icons/lu';
import { cn } from '@/lib/cn';

const button = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-sm shadow-brand/30 hover:bg-[#3f34cf]',
        secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
        soft: 'bg-brand-soft text-brand hover:bg-[#dfdcfb]',
        ghost: 'text-ink hover:bg-ink/5',
        danger: 'text-bad hover:bg-bad/10',
      },
      size: { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-[15px]', lg: 'h-13 px-6 text-base', icon: 'size-11' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { busy?: boolean };

export function Button({ className, variant, size, busy, children, disabled, type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={cn(button({ variant, size }), className)} disabled={disabled || busy} {...rest}>
      {busy && <LuLoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
