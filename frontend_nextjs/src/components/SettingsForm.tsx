'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useBotStore } from '@/store/useBotStore';

export default function SettingsForm() {
  const { selectedAccount } = useBotStore();
  const [settings, setSettings] = useState({
    lot_size: 0.1,
    grid_spacing: 10,
    stop_loss: 50,
  });

  useEffect(() => {
    if (selectedAccount) {
      axios.get(`http://localhost:8000/api/settings/${selectedAccount}`)
        .then(res => setSettings(res.data.settings || settings))
        .catch(err => console.error(err));
    }
  }, [selectedAccount]);

  const handleStartBot = async () => {
    if (!selectedAccount) return alert('Select an account first!');
    try {
      // 1. Önce ayarları kaydet
      await axios.post('http://localhost:8000/api/settings', {
        account_id: selectedAccount,
        settings
      });
      // 2. Sonra botu başlat
      const res = await axios.post(`http://localhost:8000/api/start?account_id=${selectedAccount}`);
      alert(res.data.message || 'Bot successfully started!');
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to start bot');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({ ...settings, [e.target.name]: parseFloat(e.target.value) });
  };

  if (!selectedAccount) return null;

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-xl shadow-xl flex flex-col space-y-4">
      <h3 className="text-xl font-bold text-white border-b border-white/10 pb-2">Bot Settings</h3>
      
      <div className="flex flex-col space-y-1">
        <label className="text-gray-400 text-sm">Lot Size</label>
        <input name="lot_size" type="number" step="0.01" value={settings.lot_size} onChange={handleChange} 
               className="bg-black/40 border border-white/20 text-white rounded p-2 focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="flex flex-col space-y-1">
        <label className="text-gray-400 text-sm">Grid Spacing (Points)</label>
        <input name="grid_spacing" type="number" value={settings.grid_spacing} onChange={handleChange} 
               className="bg-black/40 border border-white/20 text-white rounded p-2 focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="flex flex-col space-y-1">
        <label className="text-gray-400 text-sm">Stop Loss (Points)</label>
        <input name="stop_loss" type="number" value={settings.stop_loss} onChange={handleChange} 
               className="bg-black/40 border border-white/20 text-white rounded p-2 focus:ring-2 focus:ring-blue-500" />
      </div>

      <button onClick={handleStartBot} className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
        Save & Start Bot
      </button>
    </div>
  );
}
