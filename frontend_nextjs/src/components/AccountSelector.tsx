'use client';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useBotStore, type Account } from '@/store/useBotStore';
import ConfirmModal from '@/components/ConfirmModal';
import { Plus, Edit3, Trash2, AlertTriangle, X, Download, RefreshCw } from 'lucide-react';

const rawAPI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

// Ngrok header page.tsx'de merkezi olarak ayarlanıyor; duplicate önlemek için burada tekrar etmiyoruz

function emptyAccount(): Account {
  return {
    id: '',
    account_name: '',
    env_type: 'DEMO',
    login: 0,
    password: '',
    server: '',
    mt5_path: '',
    notes: '',
  };
}

export default function AccountSelector() {
  const {
    accounts,
    setAccounts,
    selectedAccount,
    setSelectedAccount,
    activeAccount,
    isRunning,
  } = useBotStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Account>(emptyAccount());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mt5Paths, setMt5Paths] = useState<string[]>([]);
  const [useCustomPath, setUseCustomPath] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    axios
      .get(`${API}/accounts`)
      .then((res) => setAccounts(res.data.accounts))
      .catch((err) => console.error('Failed to fetch accounts', err));
  }, [setAccounts]);

  useEffect(() => {
    if (modalOpen) {
      dialogRef.current?.showModal();
      axios
        .get(`${API}/system/scan-mt5`)
        .then((res) => setMt5Paths(res.data.paths || []))
        .catch(() => setMt5Paths([]));
    } else {
      dialogRef.current?.close();
    }
  }, [modalOpen]);

  const openAdd = () => {
    setForm(emptyAccount());
    setIsEditing(false);
    setError('');
    setUseCustomPath(false);
    setModalOpen(true);
  };

  const openEdit = () => {
    if (!activeAccount) return;
    setForm({ ...activeAccount });
    setIsEditing(true);
    setError('');
    setUseCustomPath(false);
    setModalOpen(true);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'login' ? (value ? parseInt(value, 10) : 0) : value,
    }));
  };

  const handleMt5PathSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setUseCustomPath(true);
    } else {
      setUseCustomPath(false);
      setForm((prev) => ({ ...prev, mt5_path: val }));
    }
  };

  const handleSave = async () => {
    if (!form.account_name || !form.login || !form.password || !form.server || !form.mt5_path) {
      setError('Please fill all required fields (marked with *).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, id: String(form.login), login: form.login };
      if (isEditing) {
        await axios.put(`${API}/accounts/${form.id}`, payload);
      } else {
        await axios.post(`${API}/accounts`, payload);
      }
      const res = await axios.get(`${API}/accounts`);
      setAccounts(res.data.accounts);
      setSelectedAccount(String(form.login));
      setModalOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeAccount) return;
    setSaving(true);
    try {
      await axios.delete(`${API}/accounts/${activeAccount.id}`);
      const res = await axios.get(`${API}/accounts`);
      setAccounts(res.data.accounts);
      const remaining = res.data.accounts;
      if (remaining.length > 0) {
        setSelectedAccount(remaining[0].id);
      }
      setDeleteOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete account.');
    } finally {
      setSaving(false);
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
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white tracking-wide whitespace-nowrap">
            Select Account
          </h2>
          <select
            className="bg-black/40 text-white border border-white/20 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={selectedAccount || ''}
            onChange={(e) => setSelectedAccount(e.target.value)}
          >
            <option value="" disabled>
              -- Select an account --
            </option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_name} ({acc.id})
              </option>
            ))}
          </select>
          {activeAccount && (
            <span
              className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                activeAccount.env_type === 'LIVE'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {activeAccount.env_type}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {activeAccount && (
            <>
              <button
                onClick={handleDownloadLog}
                className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-white/10 transition-all"
                title="Download bot log"
              >
                <Download size={14} />
                <span>Log</span>
              </button>
              <button
                onClick={openEdit}
                disabled={isRunning}
                className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-white/10 transition-all"
                title={isRunning ? 'Stop the bot before editing' : 'Edit account'}
              >
                <Edit3 size={14} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                disabled={isRunning}
                className="flex items-center space-x-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-red-500/10 transition-all"
                title={isRunning ? 'Stop the bot before deleting' : 'Delete account'}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </>
          )}
          <button
            onClick={openAdd}
            className="flex items-center space-x-1 text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg transition-all active:scale-95"
          >
            <Plus size={16} />
            <span>New Account</span>
          </button>
        </div>
      </div>

      {/* Add / Edit Account Dialog */}
      <dialog
        ref={dialogRef}
        className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-0 backdrop:bg-black/60 w-full max-w-2xl text-white"
        onClose={() => setModalOpen(false)}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold">
              {isEditing ? 'Edit Account' : 'New MT5 Account'}
            </h3>
            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center space-x-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Account Name *</label>
              <input
                name="account_name"
                value={form.account_name}
                onChange={handleChange}
                placeholder="e.g. Live Account 1"
                className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Login (ID) *</label>
              <input
                name="login"
                type="number"
                value={form.login || ''}
                onChange={handleChange}
                placeholder="e.g. 12345678"
                className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password *</label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder="MT5 Password"
                className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Server *</label>
              <input
                name="server"
                value={form.server}
                onChange={handleChange}
                placeholder="e.g. Eightcap-Demo"
                className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Environment</label>
              <select
                name="env_type"
                value={form.env_type}
                onChange={handleChange}
                className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="DEMO">DEMO</option>
                <option value="LIVE">LIVE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                MT5 Path *
                {mt5Paths.length > 0 && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await axios.get(`${API}/system/scan-mt5`);
                        setMt5Paths(res.data.paths || []);
                      } catch (e) {
                        setMt5Paths([]);
                        console.error('MT5 rescan failed', e);
                      }
                    }}
                    className="ml-2 text-blue-400 hover:text-blue-300"
                    title="Rescan MT5 paths"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
              </label>
              {mt5Paths.length > 0 && !useCustomPath ? (
                <select
                  name="mt5_path_select"
                  value={form.mt5_path || ''}
                  onChange={handleMt5PathSelect}
                  className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {mt5Paths.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="__custom__">Enter path manually...</option>
                </select>
              ) : (
                <input
                  name="mt5_path"
                  value={form.mt5_path}
                  onChange={handleChange}
                  placeholder="C:/Program Files/MetaTrader 5/terminal64.exe"
                  className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              )}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm text-gray-400 mb-1">Notes (Optional)</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              maxLength={1000}
              rows={3}
              placeholder="Private notes about this account... (Max 1000 chars)"
              className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Account'}
            </button>
          </div>
        </div>
      </dialog>

      {/* Delete Account Confirmation */}
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Account"
        message={`Are you sure you want to delete ${activeAccount?.account_name}? This action cannot be undone.`}
        variant="danger"
        loading={saving}
      />
    </>
  );
}
