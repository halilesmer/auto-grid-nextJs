'use client';

import { useState, useCallback } from 'react';
import axios from 'axios';
import type { Account, AccountFormData, UseAccountsReturn } from '../types';
import { API, axiosInstance } from '@/lib/api';

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`${API}/accounts`);
      setAccounts(res.data.accounts || []);
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
    try {
      const payload = { ...data, id: String(data.login), login: data.login };
      const res = await axiosInstance.post(`${API}/accounts`, payload);
      await fetchAccounts();
      return res.data;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        throw new Error(e.response?.data?.detail || 'Failed to create account.');
      }
      throw new Error('Failed to create account.');
    }
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (id: string, data: AccountFormData): Promise<Account> => {
    setError(null);
    try {
      const payload = { ...data, id: String(data.login), login: data.login };
      const res = await axiosInstance.put(`${API}/accounts/${id}`, payload);
      await fetchAccounts();
      return res.data;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        throw new Error(e.response?.data?.detail || 'Failed to update account.');
      }
      throw new Error('Failed to update account.');
    }
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string): Promise<void> => {
    setError(null);
    try {
      await axiosInstance.delete(`${API}/accounts/${id}`);
      await fetchAccounts();
    } catch (e) {
      if (axios.isAxiosError(e)) {
        throw new Error(e.response?.data?.detail || 'Failed to delete account.');
      }
      throw new Error('Failed to delete account.');
    }
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