'use client';

import { AlertCircle, Globe, Monitor, Power, RefreshCw, Save, Server, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import AccountSelector from '@/components/AccountSelector';
import BotControls from '@/components/BotControls';
import ConfirmModal from '@/components/ConfirmModal';
import LogViewer from '@/components/LogViewer';
import SettingsForm from '@/components/SettingsForm';
import SimulationBar from '@/components/SimulationBar';
import { VERSION } from '@/app/version';
import ZoneSettingsPanel from '@/components/ZoneSettingsPanel';
import axios from 'axios';
import { useBotStore } from '@/store/useBotStore';

const rawAPI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";

export default function Home() {
  const {
    selectedAccount,
    activeAccount,
    setUpdateInfo,
    settings,
    isRunning,
    liveData,
    mergeAndSaveSettings,
  } = useBotStore();
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveAllError, setSaveAllError] = useState("");
  const [savedSettingsStr, setSavedSettingsStr] = useState<string | null>(null);
  const [prevAccount, setPrevAccount] = useState<string | null>(
    selectedAccount,
  );
  const [shutdownOpen, setShutdownOpen] = useState(false);

  if (selectedAccount !== prevAccount) {
    setPrevAccount(selectedAccount);
    setSavedSettingsStr(null);
  }

  const currentSettingsStr = settings ? JSON.stringify(settings) : "";
  if (settings && savedSettingsStr === null) {
    setSavedSettingsStr(currentSettingsStr);
  }

  const isDirty = Boolean(
    settings && savedSettingsStr && currentSettingsStr !== savedSettingsStr,
  );
  const [shuttingDown, setShuttingDown] = useState(false);
  const [showSysInfo, setShowSysInfo] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateResult, setUpdateResult] = useState<{
    hasUpdate: boolean;
    localVer: string;
    remoteVer: string;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    axios
      .get(`${API}/system/update/check?branch=main`)
      .then((res) => {
        const { has_update, local_ver, remote_ver } = res.data;
        if (has_update) {
          setUpdateInfo({
            hasUpdate: true,
            localVer: local_ver,
            remoteVer: remote_ver,
          });
        }
      })
      .catch(() => {});
  }, [setUpdateInfo]);

  const handleShutdown = async () => {
    setShuttingDown(true);
    try {
      if (selectedAccount) {
        await axios.post(`${API}/stop?account_id=${selectedAccount}`);
      }
    } catch {
      // best-effort stop
    }
    window.close();
  };

  const handleCheckUpdates = async () => {
    setUpdateResult({
      hasUpdate: false,
      localVer: "...",
      remoteVer: "...",
      loading: true,
    });
    try {
      const res = await axios.get(`${API}/system/update/check?branch=main`);
      setUpdateResult({
        ...res.data,
        hasUpdate: res.data.has_update,
        loading: false,
      });
    } catch {
      setUpdateResult(null);
    }
  };
const handleApplyUpdate = async () => {
  if (!updateResult) return;
  setUpdateResult({ ...updateResult, loading: true });
  try {
    await axios.post(`${API}/system/update?branch=main`);
    window.location.reload();
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      alert(err.response?.data?.detail || "Update failed");
    } else {
      alert("Update failed");
    }
    setUpdateResult(null);
  }
};

  const isLive = activeAccount?.env_type === 'LIVE';

  const handleSaveAll = async () => {
    if (!selectedAccount || !settings) return;
    setSaveAllLoading(true);
    setSaveAllError("");
    try {
      await mergeAndSaveSettings(API);
      setSavedSettingsStr(JSON.stringify(settings));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSaveAllError(err.message);
      } else {
        setSaveAllError("Tüm ayarları kaydetme başarısız");
      }
    } finally {
      setSaveAllLoading(false);
    }
  };

  

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-black p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-emerald-400">
              Grid Robot Dashboard{" "}
              <span className="text-base text-gray-500 font-normal">
                {VERSION}
              </span>
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span
                className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                  isLive
                    ? "bg-red-500/20 text-red-400"
                    : "bg-blue-500/20 text-blue-400"
                }`}
              >
                {isLive ? "🔴 LIVE" : "🧪 TEST"}
              </span>
              <span className="text-xs text-gray-500">Auto Grid Engine</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowSysInfo(!showSysInfo)}
                className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white px-2 py-2 rounded-lg hover:bg-white/10 transition-all"
                title="System Info"
              >
                <Settings size={18} />
              </button>
              {showSysInfo && (
                <div className="absolute right-0 top-full mt-2 bg-gray-800 border border-white/10 rounded-xl shadow-2xl p-4 z-30 w-72 space-y-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                    System Info
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-300">
                      <Monitor size={14} className="text-gray-500" />
                      <span>
                        Host:{" "}
                        {typeof window !== "undefined"
                          ? window.location.hostname
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <Server size={14} className="text-gray-500" />
                      <span>
                        Port:{" "}
                        {typeof window !== "undefined"
                          ? window.location.port || "3000"
                          : "3000"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <Globe size={14} className="text-gray-500" />
                      <span>
                        URL:{" "}
                        <span className="text-blue-400 text-xs break-all">
                          {typeof window !== "undefined"
                            ? window.location.origin
                            : ""}
                        </span>
                      </span>
                    </div>
                  </div>
                  <hr className="border-white/10" />
                  <button
                    onClick={() => {
                      setShowSysInfo(false);
                      setUpdateOpen(true);
                      handleCheckUpdates();
                    }}
                    className="w-full flex items-center justify-center space-x-2 text-sm text-blue-400 hover:text-blue-300 px-3 py-2 rounded-lg hover:bg-blue-500/10 transition-all"
                  >
                    <RefreshCw size={14} />
                    <span>Check for Updates</span>
                  </button>
                  <hr className="border-white/10" />
                  <button
                    onClick={() => {
                      setShowSysInfo(false);
                      setShutdownOpen(true);
                    }}
                    className="w-full flex items-center justify-center space-x-2 text-sm text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-all"
                  >
                    <Power size={14} />
                    <span>System Shutdown</span>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShutdownOpen(true)}
              className="flex items-center space-x-1 text-xs text-red-400 hover:text-red-300 px-2 py-2 rounded-lg hover:bg-red-500/10 transition-all shrink-0"
              title="System Shutdown"
            >
              <Power size={18} />
            </button>
          </div>
        </header>

        {/* Account Selector — full width row */}
        <div>
          <AccountSelector />
        </div>

        {/* Simulation Bar (Mac only) */}
        {selectedAccount && <SimulationBar />}

        {/* Save All Button */}
        {selectedAccount && (
          <button
            onClick={handleSaveAll}
            disabled={saveAllLoading || !settings || !isDirty}
            className={`w-full sm:w-auto flex items-center justify-center space-x-2 font-bold py-4 px-6 rounded-xl transition-all active:scale-[0.98] focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
              isDirty && !saveAllLoading
                ? "bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/30"
                : "bg-gray-800 text-gray-500 opacity-50 cursor-not-allowed border border-white/5"
            }`}
          >
            <Save size={24} />
            <span className="text-lg">
              {saveAllLoading
                ? "Kaydediliyor..."
                : isDirty
                  ? "Tüm Ayarları Kaydet"
                  : "Kaydedildi"}
            </span>
          </button>
        )}

        {/* Save All Error Toast */}
        {saveAllError && (
          <div className="fixed bottom-6 right-6 z-50 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 flex items-center gap-3 shadow-2xl animate-slide-in">
            <AlertCircle size={20} />
            <span>{saveAllError}</span>
            <button
              onClick={() => setSaveAllError("")}
              className="ml-4 text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Dashboard Grid */}
        {selectedAccount ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
            {/* Left (2/3): Zone Settings + Logs */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-2 min-h-112.5">
                <ZoneSettingsPanel
                  selectedAccount={selectedAccount}
                  activeAccount={activeAccount}
                  isRunning={isRunning}
                  liveData={liveData}
                />
              </div>
              <LogViewer />
            </div>

            {/* Right (1/3): Controls + Global Settings */}
            <div className="lg:col-span-1 space-y-6">
              <BotControls />
              <SettingsForm />
            </div>
          </div>
        ) : (
          <div className="mt-20 flex flex-col items-center justify-center text-gray-500">
            <div className="animate-pulse w-16 h-16 border-4 border-gray-600 border-t-blue-500 rounded-full mb-4" />
            <p className="text-xl">Please select an account to continue.</p>
          </div>
        )}
      </div>

      {/* Update Check Modal */}
      {updateOpen && updateResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Update Check</h3>
            {updateResult.loading ? (
              <p className="text-gray-400 text-sm">Checking for updates...</p>
            ) : updateResult.hasUpdate ? (
              <div className="space-y-3">
                <p className="text-yellow-400 text-sm font-semibold">
                  New version available!
                </p>
                <div className="text-sm text-gray-300 space-y-1">
                  <p>
                    Current:{" "}
                    <span className="text-white font-mono">
                      {updateResult.localVer}
                    </span>
                  </p>
                  <p>
                    Latest:{" "}
                    <span className="text-green-400 font-mono">
                      {updateResult.remoteVer}
                    </span>
                  </p>
                </div>
                <button
                  onClick={handleApplyUpdate}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-all active:scale-95"
                >
                  Apply Update (git pull)
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-green-400 text-sm font-semibold">
                  You are up to date!
                </p>
                <p className="text-sm text-gray-400">
                  Version:{" "}
                  <span className="text-white font-mono">
                    {updateResult.localVer}
                  </span>
                </p>
              </div>
            )}
            <button
              onClick={() => {
                setUpdateOpen(false);
                setUpdateResult(null);
              }}
              className="w-full mt-4 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* System Shutdown Confirmation */}
      <ConfirmModal
        open={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onConfirm={handleShutdown}
        title="System Shutdown"
        message="This will stop all running bots and close the interface. Open positions will remain safe on the broker side."
        confirmLabel="Shutdown"
        variant="danger"
        loading={shuttingDown}
      />
    </div>
  );
}