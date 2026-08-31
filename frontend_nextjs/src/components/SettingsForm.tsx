'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useBotStore } from '@/store/useBotStore';
import { AlertTriangle, Save, Minus, Plus } from 'lucide-react';

const rawAPI =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tweet-overlying-monotone.ngrok-free.dev";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;
const STEP_INTERVAL = 0.1;

export default function SettingsForm() {
  const {
    selectedAccount,
    setGlobalSettings,
  } = useBotStore();

  const [loopInterval, setLoopInterval] = useState<number>(1.0);
  const [originalInterval, setOriginalInterval] = useState<number>(1.0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedAccount) {
      setLoopInterval(1.0);
      setOriginalInterval(1.0);
      return;
    }
    axios
      .get(`${API}/settings/${selectedAccount}`)
      .then((res) => {
        const data: Record<string, unknown> = res.data?.settings || {};
        const interval = (data.LOOP_INTERVAL_SECONDS as number) || 1.0;
        setLoopInterval(interval);
        setOriginalInterval(interval);
        setGlobalSettings({ LOOP_INTERVAL_SECONDS: interval });
      })
      .catch((err) => {
        console.error('Failed to load global settings', err);
        setLoopInterval(1.0);
        setOriginalInterval(1.0);
        setGlobalSettings({ LOOP_INTERVAL_SECONDS: 1.0 });
      });
  }, [selectedAccount, setGlobalSettings]);

  const clampInterval = useCallback((value: number) => {
    const stepped = Math.round(value * 10) / 10;
    return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, stepped));
  }, []);

  const increment = useCallback(() => {
    setLoopInterval((prev) => clampInterval(prev + STEP_INTERVAL));
  }, [clampInterval]);

  const decrement = useCallback(() => {
    setLoopInterval((prev) => clampInterval(prev - STEP_INTERVAL));
  }, [clampInterval]);

  const handleSave = useCallback(async () => {
    if (!selectedAccount) return;
    setSaving(true);
    setError('');
    try {
      await axios.post(`${API}/settings/${selectedAccount}`, {
        settings: { LOOP_INTERVAL_SECONDS: loopInterval },
      });
      setOriginalInterval(loopInterval);
      setGlobalSettings({ LOOP_INTERVAL_SECONDS: loopInterval });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }, [selectedAccount, loopInterval, setGlobalSettings]);

  const hasChanges = loopInterval !== originalInterval;

  if (!selectedAccount) return null;

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

        <div className="flex flex-col space-y-1">
          <span className="text-xs text-gray-400">Kontrol Sıklığı (sn)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={decrement}
              disabled={loopInterval <= MIN_INTERVAL}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
              title="Azalt"
            >
              <Minus size={18} />
            </button>
            <input
              type="number"
              step={STEP_INTERVAL}
              min={MIN_INTERVAL}
              max={MAX_INTERVAL}
              value={loopInterval}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                setLoopInterval(clampInterval(Number.isNaN(parsed) ? MIN_INTERVAL : parsed));
              }}
              className="w-24 bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-center font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={increment}
              disabled={loopInterval >= MAX_INTERVAL}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
              title="Artır"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            <span>{saving ? 'Kaydediliyor...' : 'Kaydet'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
