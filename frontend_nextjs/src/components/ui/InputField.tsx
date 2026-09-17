'use client';

import type { ReactNode } from 'react';

interface InputFieldProps {
  label: string;
  children: ReactNode;
  error?: ReactNode;
}

export function InputField({ label, children, error }: InputFieldProps) {
  return (
    <label className="flex flex-col space-y-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
      {error}
    </label>
  );
}
