'use client';

import { API, axiosInstance } from '@/lib/api';
import {
  AccountActions,
  AccountDropdown,
  AccountForm,
  AccountFormDialog,
} from './components';
import {
  useAccountForm,
  useAccounts,
  useMT5Scanner,
} from './hooks';
import { useAccountStore, useBotRuntimeStore, useSettingsStore } from '@/store';
import { useCallback, useEffect, useState } from 'react';

import type { Account } from './types';
import ConfirmModal from '@/components/ConfirmModal';
import { isDuplicateAccountError } from './types';

export default function AccountSelector() {
  const storeAccounts = useAccountStore((s) => s.accounts);
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const setSelectedAccount = useAccountStore((s) => s.setSelectedAccount);
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const isRunning = useBotRuntimeStore((s) => s.isRunning);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const { paths: mt5Paths, isScanning: scanningMt5, scan: scanMT5 } = useMT5Scanner();
  const { fetchAccounts, createAccount, updateAccount, deleteAccount, isLoading } = useAccounts();

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [duplicateAccount, setDuplicateAccount] = useState<Account | null>(null);

  const { formData, errors, isSaving, showPassword, handleChange, handleBlur, togglePassword, handleSubmit, resetForm } =
    useAccountForm({
      initialData: isEditing ? activeAccount : null,
      existingAccounts: storeAccounts,
      isLoading,
      onSave: async (data) => {
        if (isEditing && activeAccount) {
          await updateAccount(activeAccount.id, data);
        } else {
          await createAccount(data);
        }
      },
      onSuccess: () => {
        setModalOpen(false);
      },
      onError: (err) => {
        console.error('Form error:', err);
        if (isDuplicateAccountError(err)) {
          const existing = err.response?.data?.detail?.existing_account;
          if (existing) setDuplicateAccount(existing);
        }
      },
      onDuplicate: (account) => {
        setDuplicateAccount(account);
      },
    });

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      axiosInstance
        .get(`${API}/settings/${selectedAccount}`)
        .then((res) => setSettings(res.data.settings || res.data))
        .catch((err) => console.error('Failed to fetch settings', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  

  const handleMT5PathSelect = (path: string) => {
    handleChange('mt5_path', path);
  };

  const openAdd = () => {
    resetForm(null);
    setIsEditing(false);
    setUseCustomPath(false);
    setModalOpen(true);
    scanMT5();
  };

  const openEdit = () => {
    if (!activeAccount) return;
    resetForm(activeAccount);
    setIsEditing(true);
    setUseCustomPath(false);
    setModalOpen(true);
    scanMT5();
  };

  const handleDelete = async () => {
    if (!activeAccount) return;
    try {
      await deleteAccount(activeAccount.id);
      setDeleteOpen(false);
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleDownloadLog = () => {
    if (selectedAccount) {
      window.open(`${API}/logs/download/${selectedAccount}`);
    }
  };

  const handleDuplicateConfirm = useCallback((confirmEdit: boolean) => {
    if (confirmEdit && duplicateAccount) {
      useAccountStore.getState().setActiveAccount(duplicateAccount);
      resetForm(duplicateAccount);
      setIsEditing(true);
      setModalOpen(true);
      scanMT5();
    }
    setDuplicateAccount(null);
  }, [duplicateAccount, resetForm, scanMT5]);

  const handleEditExisting = useCallback(() => {
    if (duplicateAccount) {
      useAccountStore.getState().setActiveAccount(duplicateAccount);
      resetForm(duplicateAccount);
      setIsEditing(true);
      // Keep modal open, don't call setModalOpen(true) again as it's already open
      scanMT5();
    }
    setDuplicateAccount(null);
  }, [duplicateAccount, resetForm, scanMT5]);

  useEffect(() => {
    if (duplicateAccount) {
      // Using setTimeout to defer state update and satisfy lint rule
      // window.confirm is synchronous but we need to update state after
      setTimeout(() => {
        const confirmed = window.confirm(
          `Account "${duplicateAccount.account_name}" (Login: ${duplicateAccount.login}) already exists. Edit it instead?`
        );
        handleDuplicateConfirm(confirmed);
      }, 0);
    }
  }, [duplicateAccount, handleDuplicateConfirm]);

  return (
    <>
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-xl flex items-center justify-between gap-4">
        <AccountDropdown
          accounts={storeAccounts}
          selectedAccount={selectedAccount}
          activeAccount={activeAccount}
          onSelect={setSelectedAccount}
        />

        <AccountActions
          activeAccount={activeAccount}
          isRunning={isRunning}
          onEdit={openEdit}
          onDelete={() => setDeleteOpen(true)}
          onDownloadLog={handleDownloadLog}
          onAdd={openAdd}
        />
      </div>

      <AccountFormDialog open={modalOpen} onClose={() => setModalOpen(false)} title={isEditing ? 'Edit Account' : 'New MT5 Account'}>
        <AccountForm
          formData={formData}
          errors={errors}
          isSaving={isSaving}
          isLoading={isLoading}
          showPassword={showPassword}
          mt5Paths={mt5Paths}
          isScanningMT5={scanningMt5}
          useCustomPath={useCustomPath}
          onChange={handleChange}
          onBlur={handleBlur}
          onTogglePassword={togglePassword}
          onMT5PathSelect={handleMT5PathSelect}
          onUseCustomPathChange={setUseCustomPath}
          onRescanMT5={scanMT5}
          onSubmit={handleSubmit}
          onEditExisting={handleEditExisting}
        />
      </AccountFormDialog>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Account"
        message={`Are you sure you want to delete ${activeAccount?.account_name}? This action cannot be undone.`}
        variant="danger"
        loading={isSaving}
      />
    </>
  );
}