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

  const handleSave = async () => {
    if (!selectedAccount) return;
    try {
      await axios.post('http://localhost:8000/api/settings', {
        account_id: selectedAccount,
        settings
      });
      alert('Settings saved!');
    } catch (err) {
      console.error(err);
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

      <button onClick={handleSave} className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-lg transition-colors">
        Save Settings
      </button>
    </div>
  );
}
