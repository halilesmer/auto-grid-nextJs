import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, type HintContent } from './tooltip';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'danger' | 'warning';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_6px_20px_-8px_var(--primary)]',
  secondary: 'bg-accent text-accent-foreground hover:bg-accent/80 border border-border',
  outline: 'border border-border bg-transparent text-foreground hover:bg-accent',
  ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  success: 'bg-success text-success-foreground hover:bg-success/90 shadow-[0_6px_20px_-8px_var(--success)]',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-[0_6px_20px_-8px_var(--danger)]',
  warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-sm gap-2',
  icon: 'size-9',
  'icon-sm': 'size-8',
};

// `title` fehlt absichtlich: Erklärungen laufen über `hint` (hooks/RULES.md §5), nie über native Titel.
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Pflicht (hooks/RULES.md §5): wozu der Button dient; bei deaktiviertem Button auch warum. */
  hint: HintContent;
  /** Layout des Tooltip-Wrappers (z. B. `flex-1`, `w-full`), wenn der Button ihn füllen soll. */
  wrapperClassName?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  hint,
  wrapperClassName,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    // Der Wrapper (nicht der Button) bekommt die Zeigerereignisse: ein deaktivierter Button hat
    // pointer-events-none, soll aber trotzdem erklären, warum er deaktiviert ist.
    <Tooltip content={hint} className={wrapperClassName}>
      <button
        type={type}
        disabled={disabled || loading}
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
          VARIANTS[variant],
          SIZES[size],
          wrapperClassName && 'w-full',
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
    </Tooltip>
  );
}
