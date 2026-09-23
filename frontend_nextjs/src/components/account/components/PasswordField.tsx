'use client';

import { Eye, EyeOff } from 'lucide-react';
import type { PasswordFieldProps } from '../types';

export function PasswordField({
  value,
  placeholder = 'MT5 Password',
  onChange,
  onBlur,
  showPassword,
  onToggleShow,
  error,
}: PasswordFieldProps) {
  return (
    <div>
      <div className="relative flex w-full items-center">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete="new-password"
          className={`input-s pr-10 ${error ? 'border-danger' : ''}`}
          aria-invalid={error ? 'true' : 'false'}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2.5 rounded p-0.5 text-muted-foreground outline-none transition-colors hover:text-foreground"
          aria-label={showPassword ? 'Hide Password' : 'Show Password'}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
