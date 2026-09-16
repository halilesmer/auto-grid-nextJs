'use client';

import { Eye, EyeOff } from 'lucide-react';
import type { PasswordFieldProps } from '../types';

export function PasswordField({
  value,
  onChange,
  onBlur,
  showPassword,
  onToggleShow,
  error,
}: PasswordFieldProps) {
  return (
    <div className="relative w-full flex items-center">
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="MT5 Password"
        className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 pr-10 text-white focus:ring-2 focus:ring-blue-500 outline-none"
        aria-invalid={error ? 'true' : 'false'}
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-3 text-gray-400 hover:text-white transition-colors outline-none"
        aria-label={showPassword ? 'Hide Password' : 'Show Password'}
        aria-pressed={showPassword}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
      {error && (
        <p className="absolute bottom-full left-0 mb-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}