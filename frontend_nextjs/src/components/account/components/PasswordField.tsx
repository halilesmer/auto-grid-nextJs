'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import type { PasswordFieldProps } from '../types';

export function PasswordField({
  value,
  placeholder,
  onChange,
  onBlur,
  showPassword,
  onToggleShow,
  error,
}: PasswordFieldProps) {
  const t = useT();
  return (
    <div>
      <div className="relative flex w-full items-center">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder ?? t('account.form.password.placeholder')}
          autoComplete="new-password"
          className={`input-s pr-10 ${error ? 'border-danger' : ''}`}
          aria-invalid={error ? 'true' : 'false'}
        />
        <Tooltip
          content={showPassword ? t('account.form.password.hide.hint') : t('account.form.password.show.hint')}
          className="absolute right-2.5"
        >
          <button
            type="button"
            onClick={onToggleShow}
            className="rounded p-0.5 text-muted-foreground outline-none transition-colors hover:text-foreground"
            aria-label={showPassword ? t('account.form.password.hide') : t('account.form.password.show')}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </Tooltip>
      </div>
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
