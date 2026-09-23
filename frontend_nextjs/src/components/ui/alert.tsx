import type { ReactNode } from 'react';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'danger' | 'warning' | 'info';

const TONES: Record<Tone, { box: string; icon: typeof Info }> = {
  danger: { box: 'border-danger/30 bg-danger/[0.07] text-danger', icon: XCircle },
  warning: { box: 'border-warning/30 bg-warning/[0.07] text-warning', icon: AlertTriangle },
  info: { box: 'border-info/30 bg-info/[0.07] text-info', icon: Info },
};

interface AlertProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({ tone = 'danger', title, children, onDismiss, className }: AlertProps) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm', box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="break-words text-foreground/80">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded p-1 opacity-70 transition hover:bg-foreground/5 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
