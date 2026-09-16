'use client';

import { useEffect, useState } from 'react';
import { useBotStore } from '@/store/useBotStore';
import ConfirmModal from '@/components/ConfirmModal';
import {
  AccountDropdown,
  AccountActions,
  AccountFormDialog,
  AccountForm,
} from './components';
import {
  useMT5Scanner,
  useAccounts,
  useAccountForm,
} from './hooks';
import { API, axiosInstance } from '@/lib/api';

export default function AccountSelector() {
  const {
    accounts: storeAccounts,
    selectedAccount,
    setSelectedAccount,
    activeAccount,
    isRunning,
    setSettings,
  } = useBotStore();

  const { paths: mt5Paths, isScanning: scanningMt5, scan: scanMT5 } = useMT5Scanner();
  const { fetchAccounts, createAccount, updateAccount, deleteAccount } = useAccounts();

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [useCustomPath, setUseCustomPath] = useState(false);

  const { formData, errors, isSaving, showPassword, handleChange, handleBlur, togglePassword, handleSubmit, resetForm } =
    useAccountForm({
      initialData: isEditing ? activeAccount : null,
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
      },
    });

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (selectedAccount) {
      axiosInstance
        .get(`${API}/settings/${selectedAccount}`)
        .then((res) => setSettings(res.data.settings || res.data))
        .catch((err) => console.error('Failed to fetch settings', err));
    }
  }, [selectedAccount, setSettings]);

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