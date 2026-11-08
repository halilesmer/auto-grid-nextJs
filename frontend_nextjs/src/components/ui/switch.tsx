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
  /** Voller Name für Screenreader, wenn die sichtbare Beschriftung gekürzt ist. */
  ariaLabel?: string;
}

export function Switch({ checked, onChange, label, description, hint, disabled, id, className, ariaLabel }: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'group inline-flex cursor-pointer select-none items-center gap-3',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <SwitchToggle id={id} checked={checked} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel} />
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

/** Der Schalterknopf allein (ohne Beschriftung und ohne Tooltip). Nur innerhalb eines `InputField` verwenden, dessen `hint` den Schalter erklärt (UI-07). */
export function SwitchToggle({ checked, onChange, disabled, id, ariaLabel }: Pick<SwitchProps, 'checked' | 'onChange' | 'disabled' | 'id' | 'ariaLabel'>) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
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
  );
}
