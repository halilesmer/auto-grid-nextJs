'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { InfoHint, type HintContent } from './tooltip';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  /** Pflicht (hooks/RULES.md §5): erklärt, was der Schalter bewirkt (i18n-Key `<label-key>.hint`). */
  hint: HintContent;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Switch({ checked, onChange, label, description, hint, disabled, id, className }: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'group inline-flex cursor-pointer select-none items-center gap-3',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked ? 'border-primary bg-primary' : 'border-border bg-accent',
        )}
      >
        <span
          className={cn(
            'inline-block size-3.5 rounded-full bg-foreground shadow transition-transform',
            checked ? 'translate-x-[18px] bg-primary-foreground' : 'translate-x-[2px]',
          )}
        />
      </button>
      <span className="flex flex-col">
        <span className="flex items-center gap-1.5">
          {label && <span className="text-sm text-foreground">{label}</span>}
          <InfoHint hint={hint} />
        </span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}
