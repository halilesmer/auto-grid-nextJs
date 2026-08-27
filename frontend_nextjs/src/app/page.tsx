'use client';
import AccountSelector from '@/components/AccountSelector';
import SettingsForm from '@/components/SettingsForm';
import { useBotStore } from '@/store/useBotStore';
import axios from 'axios';

export default function Home() {
  const { selectedAccount } = useBotStore();

  const handleStopBot = async () => {
    if (!selectedAccount) return alert('Select an account first!');
    try {
      const res = await axios.post(`http://localhost:8000/api/stop?account_id=${selectedAccount}`);
      alert(res.data.message);
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to stop bot');
    }
  };

  const handleClearZone = async () => {
    if (!selectedAccount) return;
    try {
      await axios.post('http://localhost:8000/api/action', {
        account_id: selectedAccount,
        action: 'CLEAR_ZONE'
      });
      alert('Clear zone signal sent!');
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to clear zone');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
          <div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Auto Grid Terminal
            </h1>
            <p className="text-gray-400 text-sm mt-1">Next.js + FastAPI Trading Architecture</p>
          </div>
          <div className="w-full md:w-auto">
            <AccountSelector />
          </div>
        </header>

        {/* Dashboard Grid */}
        {selectedAccount ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            
            {/* Left Sidebar: Controls & Settings */}
            <div className="space-y-6">
              
              {/* Controls */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-xl shadow-xl flex flex-col space-y-4">
                <h3 className="text-xl font-bold text-white border-b border-white/10 pb-2">Bot Controls</h3>
                <button onClick={handleStopBot} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-red-500/20 transition-all active:scale-95">
                  Stop Bot
                </button>
                <button onClick={handleClearZone} className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-yellow-500/20 transition-all active:scale-95">
                  Clear Zone (Emergency)
                </button>
              </div>

              {/* Settings Form (includes Save & Start Bot button) */}
              <SettingsForm />

            </div>

            {/* Main Area: Placeholder - Chart is in Formasyon page */}
            <div className="lg:col-span-2 min-h-[500px] flex items-center justify-center bg-white/5 backdrop-blur-md border border-white/10 rounded-xl">
              <p className="text-gray-500 text-sm">📈 Grafik görüntülemek için <a href="/formasyon" className="text-blue-400 hover:underline">Formasyon</a> sekmesine geçin.</p>
            </div>

          </div>
        ) : (
          <div className="mt-20 flex flex-col items-center justify-center text-gray-500">
            <div className="animate-pulse w-16 h-16 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p className="text-xl">Please select an account to continue.</p>
          </div>
        )}

      </div>
    </div>
  );
}
