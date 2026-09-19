'use client';

import { AlertTriangle } from 'lucide-react';
import { PasswordField } from './PasswordField';
import { MT5PathSelector } from './MT5PathSelector';
import type { AccountFormProps } from '../types';

export function AccountForm({
  formData,
  errors,
  isSaving,
  showPassword,
  mt5Paths,
  isScanningMT5,
  useCustomPath,
  onChange,
  onBlur,
  onTogglePassword,
  onMT5PathSelect,
  onUseCustomPathChange,
  onRescanMT5,
  onSubmit,
  onEditExisting,
}: AccountFormProps) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold">Account Details</h3>
      </div>

      {errors.general && (
        <div
          className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center space-x-2"
          role="alert"
        >
          <AlertTriangle size={16} />
          <span className="flex-1">{errors.general}</span>
          {onEditExisting && (
            <button
              type="button"
              onClick={onEditExisting}
              className="px-3 py-1 text-xs bg-red-500/20 border border-red-500/30 rounded text-red-300 hover:bg-red-500/30 transition-colors whitespace-nowrap"
            >
              Edit Existing
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-gray-400 mb-1 flex items-center">
            Account Name *
          </label>
          <input
            name="account_name"
            value={formData.account_name}
            onChange={(e) => onChange('account_name', e.target.value)}
            onBlur={() => onBlur('account_name')}
            placeholder="e.g. Live Account 1"
            className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none ${
              errors.account_name ? 'border-red-500' : 'border-white/20'
            }`}
            aria-invalid={errors.account_name ? 'true' : 'false'}
            aria-describedby={errors.account_name ? 'account_name-error' : undefined}
          />
          {errors.account_name && (
            <p id="account_name-error" className="mt-1 text-xs text-red-400" role="alert">
              {errors.account_name}
            </p>
          )}
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-1 flex items-center">
            Login (ID) *
          </label>
          <input
            name="login"
            type="number"
            value={formData.login || ''}
            onChange={(e) => onChange('login', e.target.value)}
            onBlur={() => onBlur('login')}
            placeholder="e.g. 12345678"
            className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none ${
              errors.login ? 'border-red-500' : 'border-white/20'
            }`}
            aria-invalid={errors.login ? 'true' : 'false'}
            aria-describedby={errors.login ? 'login-error' : undefined}
          />
          {errors.login && (
            <p id="login-error" className="mt-1 text-xs text-red-400" role="alert">
              {errors.login}
            </p>
          )}
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-1 flex items-center">
            Password *
          </label>
          <PasswordField
            value={formData.password}
            onChange={(v) => onChange('password', v)}
            onBlur={() => onBlur('password')}
            showPassword={showPassword}
            onToggleShow={onTogglePassword}
            error={errors.password}
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-1 flex items-center">
            Server *
          </label>
          <input
            name="server"
            value={formData.server}
            onChange={(e) => onChange('server', e.target.value)}
            onBlur={() => onBlur('server')}
            placeholder="e.g. Eightcap-Demo"
            className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none ${
              errors.server ? 'border-red-500' : 'border-white/20'
            }`}
            aria-invalid={errors.server ? 'true' : 'false'}
            aria-describedby={errors.server ? 'server-error' : undefined}
          />
          {errors.server && (
            <p id="server-error" className="mt-1 text-xs text-red-400" role="alert">
              {errors.server}
            </p>
          )}
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-1 flex items-center">
            Environment
          </label>
          <select
            name="env_type"
            value={formData.env_type}
            onChange={(e) => onChange('env_type', e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
            aria-label="Environment Type"
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
          {errors.mt5_path && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {errors.mt5_path}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label className="text-sm text-gray-400 mb-1 flex items-center">
          Notes (Optional)
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Private notes about this account... (Max 1000 chars)"
          className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
        />
      </div>

      <div className="flex justify-end space-x-3 mt-6">
        <button
          type="button"
          onClick={() => onSubmit()}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}