'use client';

import { API, axiosInstance } from '@/lib/api';
import { downloadAccountLogs } from '@/lib/downloadLogs';
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
import { Card } from '@/components/ui/card';
import { isDuplicateAccountError } from './types';

export default function AccountSelector() {
  const storeAccounts = useAccountStore((s) => s.accounts);
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const isRunning = useBotRuntimeStore((s) => s.isRunning);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const { paths: mt5Paths, isScanning: scanningMt5, scan: scanMT5, error: mt5ScanError } = useMT5Scanner();
  const { fetchAccounts, createAccount, updateAccount, deleteAccount, isLoading } = useAccounts();

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [duplicateAccount, setDuplicateAccount] = useState<Account | null>(null);

  // Hesap seçimi tek noktadan: hesap değişirse eski hesabın ayarlarını hemen temizle
  // (aksi halde yeni hesabın "kaydedilmiş" referansı eski ayarlardan alınıyordu).
  // Aynı hesap tekrar seçilse bile activeAccount güncel listeden yeniden kurulur.
  const selectAccount = useCallback(
    (accountId: string | null) => {
      const store = useAccountStore.getState();
      if (accountId !== store.selectedAccount) setSettings(null);
      if (accountId) {
        store.setSelectedAccount(accountId);
      } else {
        useAccountStore.setState({ selectedAccount: null, activeAccount: null });
      }
    },
    [setSettings],
  );

  // MT5 yollarını tara; kayıtlı yol listede yoksa "Özel Yol" moduna geç (eski davranış)
  const scanAndSyncPath = useCallback(
    async (currentPath?: string | null) => {
      const found = await scanMT5();
      if (currentPath && !found.includes(currentPath)) {
        setUseCustomPath(true);
      }
    },
    [scanMT5],
  );

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
        // Kaydedilen hesabı seç: activeAccount güncellenir, login değiştiyse eski id'de kalınmaz
        selectAccount(String(data.login));
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
    if (!selectedAccount) return;
    // Hızlı hesap değişiminde geç gelen eski yanıt yeni hesabın ayarlarını ezmesin
    let stale = false;
    axiosInstance
      .get(`${API}/settings/${selectedAccount}`)
      .then((res) => {
        if (!stale) setSettings(res.data.settings || res.data);
      })
      .catch((err) => console.error('Failed to fetch settings', err));
    return () => {
      stale = true;
    };
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
    scanAndSyncPath();
  };

  const openEdit = () => {
    if (!activeAccount) return;
    resetForm(activeAccount);
    setIsEditing(true);
    setUseCustomPath(false);
    setModalOpen(true);
    scanAndSyncPath(activeAccount.mt5_path);
  };

  const handleDelete = async () => {
    if (!activeAccount) return;
    try {
      await deleteAccount(activeAccount.id);
      // Silinen hesapta kalma: kalan ilk hesabı seç (yoksa seçimi temizle)
      const remaining = useAccountStore.getState().accounts;
      selectAccount(remaining.length > 0 ? String(remaining[0].id) : null);
      setDeleteOpen(false);
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleDownloadLog = () => {
    if (selectedAccount) downloadAccountLogs(selectedAccount);
  };

  const handleDuplicateConfirm = useCallback((confirmEdit: boolean) => {
    if (confirmEdit && duplicateAccount) {
      // Seçim ve activeAccount birlikte değişmeli; yoksa silme/düzenleme başka hesaba gider
      selectAccount(String(duplicateAccount.id));
      resetForm(duplicateAccount);
      setIsEditing(true);
      setModalOpen(true);
      scanAndSyncPath(duplicateAccount.mt5_path);
    }
    setDuplicateAccount(null);
  }, [duplicateAccount, resetForm, scanAndSyncPath, selectAccount]);

  const handleEditExisting = useCallback(() => {
    if (duplicateAccount) {
      selectAccount(String(duplicateAccount.id));
      resetForm(duplicateAccount);
      setIsEditing(true);
      // Keep modal open, don't call setModalOpen(true) again as it's already open
      scanAndSyncPath(duplicateAccount.mt5_path);
    }
    setDuplicateAccount(null);
  }, [duplicateAccount, resetForm, scanAndSyncPath, selectAccount]);

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
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
        <AccountDropdown
          accounts={storeAccounts}
          selectedAccount={selectedAccount}
          activeAccount={activeAccount}
          onSelect={selectAccount}
        />

        <AccountActions
          activeAccount={activeAccount}
          isRunning={isRunning}
          onEdit={openEdit}
          onDelete={() => setDeleteOpen(true)}
          onDownloadLog={handleDownloadLog}
          onAdd={openAdd}
        />
      </Card>

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
          onRescanMT5={() => scanAndSyncPath(formData.mt5_path)}
          mt5ScanError={mt5ScanError}
          onSubmit={handleSubmit}
          onEditExisting={duplicateAccount ? handleEditExisting : undefined}
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