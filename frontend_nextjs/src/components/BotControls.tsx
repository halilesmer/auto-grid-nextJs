'use client';
import { useState, useCallback } from 'react';
import axios from 'axios';
import { useBotStore } from '@/store/useBotStore';
import ConfirmModal from '@/components/ConfirmModal';
import { Play, Pause, AlertTriangle } from 'lucide-react';

const API = 'http://localhost:8000/api';

export default function BotControls() {
  const {
    selectedAccount,
    activeAccount,
    isRunning,
    isConnecting,
    liveData,
    updateLiveData,
  } = useBotStore();

  const [loading, setLoading] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const mt5Connected = liveData.mt5_connected;

  const handleStartBot = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API}/start?account_id=${selectedAccount}`);
      updateLiveData({ mt5_connected: true });
      alert(res.data.message || 'Bot started!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start bot.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, updateLiveData]);

  const handleStopBot = useCallback(async () => {
    if (!selectedAccount) return;
    setStopConfirmOpen(false);
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API}/stop?account_id=${selectedAccount}`);
      updateLiveData({ mt5_connected: false });
      alert(res.data.message || 'Bot stopped!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to stop bot.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, updateLiveData]);

  const handleClearZone = useCallback(async () => {
    if (!selectedAccount) return;
    setClearConfirmOpen(false);
    try {
      await axios.post(`${API}/action`, { account_id: selectedAccount, action: 'CLEAR_ZONE' });
      alert('Clear zone signal sent!');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to clear zone');
    }
  }, [selectedAccount]);

  if (!selectedAccount) return null;

  const motorStatus = isConnecting ? '⏳' : isRunning ? (!mt5Connected ? '🔴' : '🟢') : '🔴';
  const motorLabel = isConnecting
    ? 'Connecting...'
    : isRunning
    ? !mt5Connected
      ? 'Disconnected'
      : 'Running'
    : 'Stopped';

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-xl shadow-xl space-y-4">
      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center space-x-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">
            x
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Bot Controls</h3>
          <p className="text-xs text-gray-500">
            {motorStatus} {motorLabel}
            {activeAccount && (
              <span>
                {' '}
                | {activeAccount.account_name} | {activeAccount.server}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-2">
        {!isRunning && (
          <button
            onClick={handleStartBot}
            disabled={loading}
            className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-lg shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <Play size={16} />
            <span>{loading ? '...' : 'Start Bot'}</span>
          </button>
        )}
        {isRunning && (
          <>
            <button
              onClick={() => setStopConfirmOpen(true)}
              disabled={loading}
              className="flex items-center space-x-1 bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2.5 rounded-lg shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <Pause size={16} />
              <span>{loading ? '...' : 'Stop Bot'}</span>
            </button>
            <button
              onClick={() => setClearConfirmOpen(true)}
              className="flex items-center space-x-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold px-5 py-2.5 rounded-lg shadow-lg shadow-yellow-500/20 transition-all active:scale-95"
            >
              Clear Zone
            </button>
          </>
        )}
      </div>

      <hr className="border-white/10" />

      {/* Live Metrics */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Live Metrics</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-300">
            Price:{' '}
            <span className="text-white font-semibold">
              ${liveData.current_price.toFixed(2)}
            </span>
          </div>
          <div className={liveData.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
            P/L: <span className="font-semibold">${liveData.profit.toFixed(2)}</span>
          </div>
          <div className="text-blue-400">
            Positions: <span className="font-semibold">{liveData.open_positions}</span>
          </div>
          <div className="text-purple-400">
            Pending: <span className="font-semibold">{liveData.pending_orders}</span>
          </div>
        </div>
      </div>

      {/* Alarms */}
      {liveData.order_rejected_alarm && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          CRITICAL: MT5/Broker rejected an order! {liveData.last_error}
        </div>
      )}
      {liveData.algo_trading_error && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
          ALGO TRADING OFF: Please enable Algo Trading in your MT5 terminal.
        </div>
      )}

      {/* Market Status */}
      <div className="text-xs text-gray-500">
        Market:{' '}
        <span className={liveData.market_open ? 'text-green-400' : 'text-red-400'}>
          {liveData.market_open ? 'Open' : 'Closed'}
        </span>
      </div>

      {/* Stop Bot Confirmation */}
      <ConfirmModal
        open={stopConfirmOpen}
        onClose={() => setStopConfirmOpen(false)}
        onConfirm={handleStopBot}
        title="Disconnect MT5"
        message="Are you sure you want to disconnect the MT5 connection?"
        infoText="Open positions and pending orders are preserved on the broker side."
        confirmLabel="Disconnect"
        variant="warning"
        loading={loading}
      />

      {/* Clear Zone Confirmation */}
      <ConfirmModal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={handleClearZone}
        title="Clear Zone"
        message="This will close pending orders for the selected zone. Open positions will remain."
        confirmLabel="Clear"
        variant="warning"
      />
    </div>
  );
}
