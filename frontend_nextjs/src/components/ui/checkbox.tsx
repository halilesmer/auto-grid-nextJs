'use client';

import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoHint, type HintContent } from './tooltip';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** Pflicht (hooks/RULES.md §5): erklärt, was das Häkchen bewirkt (i18n-Key `<label-key>.hint`). */
  hint: HintContent;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, label, hint, disabled, className }: CheckboxProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn('inline-flex cursor-pointer select-none items-center gap-3', disabled && 'cursor-not-allowed opacity-50', className)}
    >
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'inline-flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground bg-transparent',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
      </button>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 text-sm text-foreground">{label}</span>
        <InfoHint hint={hint} />
      </span>
    </label>
  );
}
