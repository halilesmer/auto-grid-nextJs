'use client';

import React, { type ReactNode, type ReactElement, type ComponentPropsWithoutRef } from 'react';
import { FieldLabel, type HintContent } from './tooltip';

interface InputFieldProps {
  label: string;
  /** Pflicht (hooks/RULES.md §5): erklärt, wozu das Feld dient (i18n-Key `<label-key>.hint`). */
  hint: HintContent;
  children: ReactNode;
  error?: ReactNode;
  className?: string;
  inputClassName?: string;
}

export function InputField({ label, hint, children, error, className, inputClassName }: InputFieldProps) {
  const mergedInputClass = inputClassName ?? '';

  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <FieldLabel label={label} hint={hint} className="text-xs font-medium text-muted-foreground" />
      {React.isValidElement(children)
        ? React.cloneElement(children as ReactElement<ComponentPropsWithoutRef<'input'>>, {
            className: `${(children as ReactElement<ComponentPropsWithoutRef<'input'>>).props.className ?? ''} ${mergedInputClass}`.trim(),
          })
        : children}
      {error}
    </label>
  );
}
