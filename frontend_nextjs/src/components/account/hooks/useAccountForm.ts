'use client';

import { useState, useCallback, useMemo } from 'react';
import { t } from '@/i18n';
import type { Account, AccountFormData, AccountFormErrors, UseAccountFormOptions, UseAccountFormReturn } from '../types';

function emptyFormData(): AccountFormData {
  return {
    account_name: '',
    login: 0,
    password: '',
    server: '',
    env_type: 'DEMO',
    mt5_path: '',
    notes: '',
  };
}

function accountToFormData(account: Account): AccountFormData {
  return {
    account_name: account.account_name,
    login: account.login,
    // Şifre API'den gelmez; boş bırakılırsa worker kayıtlı şifreyi korur
    password: '',
    server: account.server,
    env_type: account.env_type as 'DEMO' | 'LIVE',
    mt5_path: account.mt5_path,
    notes: account.notes,
  };
}

export function useAccountForm({
  initialData,
  existingAccounts = [],
  isLoading = false,
  onSave,
  onSuccess,
  onError,
  onDuplicate,
}: UseAccountFormOptions): UseAccountFormReturn {
  const [formData, setFormData] = useState<AccountFormData>(() =>
    initialData ? accountToFormData(initialData) : emptyFormData()
  );
  const [errors, setErrors] = useState<AccountFormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof AccountFormData, boolean>>>({});

  // Düzenlemede şifre yalnızca worker'da hiç kayıtlı değilse zorunlu
  const passwordRequired = !initialData || initialData.has_password === false;

  const resetForm = useCallback((data?: Account | null) => {
    setFormData(data ? accountToFormData(data) : emptyFormData());
    setErrors({});
    setTouched({});
    setShowPassword(false);
  }, []);

  const handleChange = useCallback((name: keyof AccountFormData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'login' ? (value ? parseInt(String(value), 10) : 0) : value,
    }));
    setErrors((prev) => {
      if (prev[name]) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return prev;
    });
  }, []);

  const validateField = useCallback((name: keyof AccountFormData): boolean => {
    const value = formData[name];
    let error: string | undefined;

    switch (name) {
      case 'account_name':
        if (!value || String(value).trim() === '') {
          error = t('account.validation.name');
        }
        break;
      case 'login':
        if (!value || Number(value) === 0) {
          error = t('account.validation.login');
        }
        break;
      case 'password':
        if (passwordRequired && (!value || String(value).trim() === '')) {
          error = t('account.validation.password');
        }
        break;
      case 'server':
        if (!value || String(value).trim() === '') {
          error = t('account.validation.server');
        }
        break;
      case 'mt5_path':
        if (!value || String(value).trim() === '') {
          error = t('account.validation.path');
        }
        break;
    }

    setErrors((prev) => ({ ...prev, [name]: error }));
    return !error;
  }, [formData, passwordRequired]);

  const handleBlur = useCallback((name: keyof AccountFormData) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    validateField(name);
  }, [validateField]);

  const togglePassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const validateForm = useCallback((): boolean => {
    const fields: (keyof AccountFormData)[] = [
      'account_name',
      'login',
      'password',
      'server',
      'mt5_path',
    ];
    const results = fields.map(validateField);
    return results.every((r) => r);
  }, [validateField]);

  const handleSubmit = useCallback(async () => {
    if (isLoading) {
      onError?.(t('account.form.waitLoading'));
      return;
    }

    const allTouched: Record<keyof AccountFormData, boolean> = {
      account_name: true,
      login: true,
      password: true,
      server: true,
      env_type: true,
      mt5_path: true,
      notes: true,
    };
    setTouched(allTouched);

    if (!validateForm()) {
      onError?.(t('account.form.fillRequired'));
      return;
    }

    const loginStr = String(formData.login);
    const duplicateAccount = existingAccounts.find(
      (a) => String(a.id) === loginStr && (!initialData || String(initialData.id) !== loginStr)
    );

    if (duplicateAccount) {
      onDuplicate?.(duplicateAccount);
      return;
    }

    setIsSaving(true);
    setErrors((prev) => ({ ...prev, general: undefined }));

    try {
      await onSave(formData);
      onSuccess?.();
    } catch (e) {
      // Backend'in mesajını göster ("Request failed with status code 4xx" yerine)
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const errMsg =
        typeof detail === 'string'
          ? detail
          : typeof (detail as { detail?: unknown })?.detail === 'string'
            ? (detail as { detail: string }).detail
            : e instanceof Error
              ? e.message
              : t('account.form.saveFailed');
      setErrors((prev) => ({ ...prev, general: errMsg }));
      // Ham hatayı ilet: AccountSelector 409 (duplicate) durumunu buradan tanır
      onError?.(e);
    } finally {
      setIsSaving(false);
    }
  }, [formData, initialData, existingAccounts, isLoading, onSave, onSuccess, onError, onDuplicate, validateForm]);

  const displayErrors = useMemo(() => {
    const display: AccountFormErrors = {};
    (Object.keys(errors) as (keyof AccountFormErrors)[]).forEach((key) => {
      if (key === 'general' || touched[key]) {
        display[key] = errors[key];
      }
    });
    return display;
  }, [errors, touched]);

  return {
    formData,
    errors: displayErrors,
    isSaving,
    showPassword,
    passwordRequired,
    handleChange,
    handleBlur,
    togglePassword,
    validateField,
    validateForm,
    handleSubmit,
    resetForm,
  };
}