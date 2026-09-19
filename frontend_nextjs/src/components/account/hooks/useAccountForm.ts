'use client';

import { useState, useCallback, useMemo } from 'react';
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
    password: account.password,
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
          error = 'Account name is required';
        }
        break;
      case 'login':
        if (!value || Number(value) === 0) {
          error = 'Login (ID) is required';
        }
        break;
      case 'password':
        if (!value || String(value).trim() === '') {
          error = 'Password is required';
        }
        break;
      case 'server':
        if (!value || String(value).trim() === '') {
          error = 'Server is required';
        }
        break;
      case 'mt5_path':
        if (!value || String(value).trim() === '') {
          error = 'MT5 Path is required';
        }
        break;
    }

    setErrors((prev) => ({ ...prev, [name]: error }));
    return !error;
  }, [formData]);

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
      onError?.('Please wait for accounts to load before submitting.');
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
      onError?.('Please fill all required fields (marked with *).');
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
      const errMsg = e instanceof Error ? e.message : 'Failed to save account.';
      setErrors((prev) => ({ ...prev, general: errMsg }));
      onError?.(errMsg);
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
    handleChange,
    handleBlur,
    togglePassword,
    validateField,
    validateForm,
    handleSubmit,
    resetForm,
  };
}