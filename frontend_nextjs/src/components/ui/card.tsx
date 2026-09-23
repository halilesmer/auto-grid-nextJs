import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card/80 text-card-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, icon, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function SectionLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs font-semibold text-foreground/70', className)}
      {...props}
    />
  );
}
