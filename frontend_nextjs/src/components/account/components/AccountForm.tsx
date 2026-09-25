'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldLabel, Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { PasswordField } from './PasswordField';
import { MT5PathSelector } from './MT5PathSelector';
import type { AccountFormProps } from '../types';

export function AccountForm({
  formData,
  errors,
  isSaving,
  isLoading,
  showPassword,
  passwordRequired,
  mt5Paths,
  isScanningMT5,
  useCustomPath,
  onChange,
  onBlur,
  onTogglePassword,
  onMT5PathSelect,
  onUseCustomPathChange,
  onRescanMT5,
  mt5ScanError,
  onSubmit,
  onEditExisting,
}: AccountFormProps) {
  const t = useT();
  return (
    <div>

      {errors.general && (
        <div
          className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/[0.07] p-3 text-sm text-danger"
          role="alert"
        >
          <AlertTriangle size={16} />
          <span className="flex-1">{errors.general}</span>
          {onEditExisting && (
            <Tooltip content={t('account.form.editExisting.hint')}>
              <button
                type="button"
                onClick={onEditExisting}
                className="whitespace-nowrap rounded-md border border-danger/30 bg-danger/15 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger/25"
              >
                {t('account.form.editExisting')}
              </button>
            </Tooltip>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div data-tooltip-scope>
          <FieldLabel
            label={t('account.form.name')}
            hint={t('account.form.name.hint')}
            className="mb-1.5 text-xs font-medium text-muted-foreground"
          />
          <input
            name="account_name"
            value={formData.account_name}
            onChange={(e) => onChange('account_name', e.target.value)}
            onBlur={() => onBlur('account_name')}
            placeholder={t('account.form.name.placeholder')}
            className={`input-s ${errors.account_name ? 'border-danger' : ''}`}
            aria-invalid={errors.account_name ? 'true' : 'false'}
            aria-describedby={errors.account_name ? 'account_name-error' : undefined}
          />
          {errors.account_name && (
            <p id="account_name-error" className="mt-1 text-xs text-danger" role="alert">
              {errors.account_name}
            </p>
          )}
        </div>
        <div data-tooltip-scope>
          <FieldLabel
            label={t('account.form.login')}
            hint={t('account.form.login.hint')}
            className="mb-1.5 text-xs font-medium text-muted-foreground"
          />
          <input
            name="login"
            type="number"
            value={formData.login || ''}
            onChange={(e) => onChange('login', e.target.value)}
            onBlur={() => onBlur('login')}
            placeholder={t('account.form.login.placeholder')}
            className={`input-s ${errors.login ? 'border-danger' : ''}`}
            aria-invalid={errors.login ? 'true' : 'false'}
            aria-describedby={errors.login ? 'login-error' : undefined}
          />
          {errors.login && (
            <p id="login-error" className="mt-1 text-xs text-danger" role="alert">
              {errors.login}
            </p>
          )}
        </div>
        <div data-tooltip-scope>
          <FieldLabel
            label={passwordRequired ? t('account.form.password.required') : t('account.form.passwordLabel')}
            hint={passwordRequired ? t('account.form.password.hint') : t('account.form.password.keep.hint')}
            className="mb-1.5 text-xs font-medium text-muted-foreground"
          />
          <PasswordField
            value={formData.password}
            placeholder={passwordRequired ? t('account.form.password.placeholder') : t('account.form.password.keep')}
            onChange={(v) => onChange('password', v)}
            onBlur={() => onBlur('password')}
            showPassword={showPassword}
            onToggleShow={onTogglePassword}
            error={errors.password}
          />
        </div>
        <div data-tooltip-scope>
          <FieldLabel
            label={t('account.form.server')}
            hint={t('account.form.server.hint')}
            className="mb-1.5 text-xs font-medium text-muted-foreground"
          />
          <input
            name="server"
            value={formData.server}
            onChange={(e) => onChange('server', e.target.value)}
            onBlur={() => onBlur('server')}
            placeholder={t('account.form.server.placeholder')}
            className={`input-s ${errors.server ? 'border-danger' : ''}`}
            aria-invalid={errors.server ? 'true' : 'false'}
            aria-describedby={errors.server ? 'server-error' : undefined}
          />
          {errors.server && (
            <p id="server-error" className="mt-1 text-xs text-danger" role="alert">
              {errors.server}
            </p>
          )}
        </div>
        <div data-tooltip-scope>
          <FieldLabel
            label={t('account.form.env')}
            hint={t('account.form.env.hint')}
            className="mb-1.5 text-xs font-medium text-muted-foreground"
          />
          <select
            name="env_type"
            value={formData.env_type}
            onChange={(e) => onChange('env_type', e.target.value)}
            className="input-s"
            aria-label={t('account.form.env.aria')}
          >
            <option value="DEMO">DEMO</option>
            <option value="LIVE">LIVE</option>
          </select>
        </div>
        <div>
          <MT5PathSelector
            paths={mt5Paths}
            selectedPath={formData.mt5_path}
            isScanning={isScanningMT5}
            useCustomPath={useCustomPath}
            onPathSelect={onMT5PathSelect}
            onUseCustomPathChange={onUseCustomPathChange}
            onRescan={onRescanMT5}
            onCustomPathChange={(v) => onChange('mt5_path', v)}
          />
          {mt5ScanError && (
            <p className="mt-1 text-xs text-warning" role="alert">
              {t('account.path.scanHint', { error: mt5ScanError })}
            </p>
          )}
          {errors.mt5_path && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {errors.mt5_path}
            </p>
          )}
        </div>
      </div>

      <div data-tooltip-scope className="mt-4">
        <FieldLabel
          label={t('account.form.notes')}
          hint={t('account.form.notes.hint')}
          className="mb-1.5 text-xs font-medium text-muted-foreground"
        />
        <textarea
          name="notes"
          value={formData.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t('account.form.notes.placeholder')}
          className="input-s resize-none"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-border pt-5">
        <Button
          variant="primary"
          onClick={() => onSubmit()}
          disabled={isLoading}
          loading={isSaving}
          hint={isLoading ? t('account.form.waitLoading') : t('account.form.save.hint')}
        >
          {isSaving ? t('account.form.saving') : isLoading ? t('account.form.loading') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}