import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, type HintContent } from './tooltip';

type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
};

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'title'> {
  tone?: Tone;
  /** Erklärt, was der Zustand bedeutet (Pflicht bei Zustands-Badges, hooks/RULES.md §5). */
  hint?: HintContent;
}

export function Badge({ tone = 'neutral', hint, className, ...props }: BadgeProps) {
  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
  return hint ? <Tooltip content={hint}>{badge}</Tooltip> : badge;
}
