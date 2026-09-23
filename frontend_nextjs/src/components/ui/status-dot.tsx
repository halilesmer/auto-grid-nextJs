import { cn } from '@/lib/utils';

type Tone = 'success' | 'danger' | 'warning' | 'neutral';

const COLORS: Record<Tone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  neutral: 'bg-muted-foreground',
};

export function StatusDot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {pulse && <span className={cn('absolute inset-0 rounded-full animate-ping-soft', COLORS[tone])} />}
      <span className={cn('relative inline-flex size-2 rounded-full', COLORS[tone])} />
    </span>
  );
}
