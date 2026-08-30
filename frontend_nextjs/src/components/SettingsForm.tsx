'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useBotStore, type GlobalSettings } from '@/store/useBotStore';
import { AlertTriangle, Save } from 'lucide-react';

const rawAPI =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tweet-overlying-monotone.ngrok-free.dev";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";

function deepCloneSettings(s: GlobalSettings): GlobalSettings {
  return JSON.parse(JSON.stringify(s));
}

export default function SettingsForm() {
  const {
    selectedAccount,
    setSettings: setZustandSettings,
    setGlobalSettings,
  } = useBotStore();

  const [localGlobals, setLocalGlobals] = useState<Pick<GlobalSettings, 'ORDER_TYPE' | 'SYMBOL' | 'LOOP_INTERVAL_SECONDS'> | null>(null);
  const [originalGlobals, setOriginalGlobals] = useState<Pick<GlobalSettings, 'ORDER_TYPE' | 'SYMBOL' | 'LOOP_INTERVAL_SECONDS'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedAccount) {
      setLocalGlobals(null);
      setOriginalGlobals(null);
      return;
    }
    axios
      .get(`${API}/settings/${selectedAccount}`)
      .then((res) => {
        const data: Record<string, unknown> = res.data?.settings || {};
        const globals = {
          ORDER_TYPE: (data.ORDER_TYPE as string) || 'BUY',
          SYMBOL: (data.SYMBOL as string) || 'USOUSD',
          LOOP_INTERVAL_SECONDS: (data.LOOP_INTERVAL_SECONDS as number) || 1.0,
        };
        setLocalGlobals(globals);
        setOriginalGlobals({ ...globals });
        setGlobalSettings(globals);
      })
      .catch((err) => {
        console.error('Failed to load global settings', err);
        const globals = {
          ORDER_TYPE: 'BUY',
          SYMBOL: 'USOUSD',
          LOOP_INTERVAL_SECONDS: 1.0,
        };
        setLocalGlobals(globals);
        setOriginalGlobals({ ...globals });
        setGlobalSettings(globals);
      });
  }, [selectedAccount, setGlobalSettings]);

  const updateGlobal = useCallback((field: 'ORDER_TYPE' | 'SYMBOL' | 'LOOP_INTERVAL_SECONDS', value: unknown) => {
    setLocalGlobals((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedAccount || !localGlobals) return;
    setSaving(true);
    setError('');
    try {
      await axios.post(`${API}/settings/${selectedAccount}`, { settings: localGlobals });
      setOriginalGlobals({ ...localGlobals });
      setGlobalSettings(localGlobals);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }, [selectedAccount, localGlobals, setGlobalSettings]);

  const hasChanges = localGlobals && originalGlobals && (
    localGlobals.ORDER_TYPE !== originalGlobals.ORDER_TYPE ||
    localGlobals.SYMBOL !== originalGlobals.SYMBOL ||
    localGlobals.LOOP_INTERVAL_SECONDS !== originalGlobals.LOOP_INTERVAL_SECONDS
  );

  if (!selectedAccount || !localGlobals) return null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center space-x-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">
            x
          </button>
        </div>
      )}

      {/* Global Settings Card */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-xl shadow-xl space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-blue-400">⚙️</span>
          Genel Ayarlar
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InputGroup label="Sembol">
            <input
              type="text"
              value={localGlobals.SYMBOL}
              onChange={(e) => updateGlobal('SYMBOL', e.target.value.toUpperCase().trim())}
              className="input-s"
            />
          </InputGroup>

          <InputGroup label="Emir Tipi">
            <select
              value={localGlobals.ORDER_TYPE}
              onChange={(e) => updateGlobal('ORDER_TYPE', e.target.value)}
              className="input-s"
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="BOTH">BOTH</option>
            </select>
          </InputGroup>

          <InputGroup label="Döngü Aralığı (sn)">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={localGlobals.LOOP_INTERVAL_SECONDS}
              onChange={(e) =>
                updateGlobal('LOOP_INTERVAL_SECONDS', parseFloat(e.target.value) || 1.0)
              }
              className="input-s"
            />
          </InputGroup>
        </div>

        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            <span>{saving ? 'Kaydediliyor...' : 'Genel Ayarları Kaydet'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tiny input group helper                                              */
/* ------------------------------------------------------------------ */

function InputGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col space-y-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </label>
  );
}