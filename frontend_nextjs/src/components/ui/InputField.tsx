'use client';

import React, { type ReactNode, type ReactElement, type ComponentPropsWithoutRef } from 'react';

interface InputFieldProps {
  label: string;
  children: ReactNode;
  error?: ReactNode;
  className?: string;
  inputClassName?: string;
}

export function InputField({ label, children, error, className, inputClassName }: InputFieldProps) {
  const mergedInputClass = inputClassName ?? '';

  return (
    <label className={`flex flex-col space-y-1 ${className ?? ''}`}>
      <span className="text-xs text-gray-400">{label}</span>
      {React.isValidElement(children)
        ? React.cloneElement(children as ReactElement<ComponentPropsWithoutRef<'input'>>, {
            className: `${(children as ReactElement<ComponentPropsWithoutRef<'input'>>).props.className ?? ''} ${mergedInputClass}`.trim(),
          })
        : children}
      {error}
    </label>
  );
}
