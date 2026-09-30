'use client';

import { useState, useCallback } from 'react';
import type { Account, AccountFormData, UseAccountsReturn } from '../types';
import { axiosInstance } from '@/lib/api';
import { useAccountStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { t } from '@/i18n';

/** Worker-Nutzlast: id = login; die Besitzer-Auswahl gibt es nur für den Admin (Benutzer: Worker ignoriert sie). */
function toPayload(data: AccountFormData) {
  const { owner, ...rest } = data;
  const isAdmin = useAuthStore.getState().me?.role === 'admin';
  return { ...rest, ...(isAdmin ? { owner } : {}), id: String(data.login), login: data.login };
}

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`/accounts`);
      const accounts = res.data.accounts || [];
      setAccounts(accounts);
      useAccountStore.getState().setAccounts(accounts);
    } catch (e) {
      const errMsg = t('account.fetchFailed');
      setError(errMsg);
      console.error(errMsg, e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAccount = useCallback(async (data: AccountFormData): Promise<Account> => {
    setError(null);
    const res = await axiosInstance.post<Account>(`/accounts`, toPayload(data));
    await fetchAccounts();
    return res.data;
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (id: string, data: AccountFormData): Promise<Account> => {
    setError(null);
    const res = await axiosInstance.put<Account>(`/accounts/${id}`, toPayload(data));
    await fetchAccounts();
    return res.data;
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string): Promise<void> => {
    setError(null);
    await axiosInstance.delete(`/accounts/${id}`);
    await fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    isLoading,
    error,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
  };
}