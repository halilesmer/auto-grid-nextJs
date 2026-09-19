'use client';

import { useState, useCallback } from 'react';
import type { Account, AccountFormData, UseAccountsReturn } from '../types';
import { API, axiosInstance } from '@/lib/api';
import { useAccountStore } from '@/store';

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`${API}/accounts`);
      const accounts = res.data.accounts || [];
      setAccounts(accounts);
      useAccountStore.getState().setAccounts(accounts);
    } catch (e) {
      const errMsg = 'Failed to fetch accounts';
      setError(errMsg);
      console.error(errMsg, e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAccount = useCallback(async (data: AccountFormData): Promise<Account> => {
    setError(null);
    const payload = { ...data, id: String(data.login), login: data.login };
    const res = await axiosInstance.post<Account>(`${API}/accounts`, payload);
    await fetchAccounts();
    return res.data;
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (id: string, data: AccountFormData): Promise<Account> => {
    setError(null);
    const payload = { ...data, id: String(data.login), login: data.login };
    const res = await axiosInstance.put<Account>(`${API}/accounts/${id}`, payload);
    await fetchAccounts();
    return res.data;
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string): Promise<void> => {
    setError(null);
    await axiosInstance.delete(`${API}/accounts/${id}`);
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