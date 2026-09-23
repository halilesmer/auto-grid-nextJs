'use client';

import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useAccountStore, useLogsStore, useBotRuntimeStore } from '@/store';
import type { ActivityLevel } from '@/store';
import { downloadAccountLogs } from '@/lib/downloadLogs';

const POLL_INTERVAL_MS = 10_000;
// Bağlanırken ne olduğunu canlı görmek için daha sık yokla
const CONNECTING_POLL_INTERVAL_MS = 2_000;

type Tab = "activity" | "robot" | "mt5";

const TABS: { id: Tab; label: string }[] = [
  { id: "activity", label: "Activity" },
  { id: "robot", label: "Robot Logs" },
  { id: "mt5", label: "MT5 Terminal Logs" },
];

const ACTIVITY_COLORS: Record<ActivityLevel, string> = {
  info: "text-blue-400",
  success: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400 font-semibold",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function logLineColor(line: string): string {
  if (
    line.includes("[ERROR]") ||
    line.includes("ERROR") ||
    line.includes("HATA") ||
    line.includes("[INIT]") ||
    line.includes("[LOGIN]") ||
    line.includes("Giriş Başarısız")
  ) {
    return "text-red-400 font-semibold";
  }
  if (line.includes("WARN") || line.includes("UYARI")) {
    return "text-yellow-400";
  }
  if (
    line.includes("INFO") ||
    line.includes("[START]") ||
    line.includes("[STOP]") ||
    line.includes("BAŞARILI") ||
    line.includes("success")
  ) {
    return "text-blue-400";
  }
  return "text-green-400";
}

export default function LogViewer() {
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const robotLog = useLogsStore((s) => s.robot_log);
  const mt5Log = useLogsStore((s) => s.mt5_log);
  const activity = useLogsStore((s) => s.activity);
  const setLogs = useLogsStore((s) => s.setLogs);
  const clearLogs = useLogsStore((s) => s.clearLogs);
  const clearActivity = useLogsStore((s) => s.clearActivity);
  const pushActivity = useLogsStore((s) => s.pushActivity);
  const workerStatus = useLogsStore((s) => s.workerStatus);
  const setWorkerStatus = useLogsStore((s) => s.setWorkerStatus);
  const updateLiveData = useBotRuntimeStore((s) => s.updateLiveData);
  const isConnecting = useBotRuntimeStore((s) => s.isConnecting);

  const [tab, setTab] = useState<Tab>("activity");
  const [connectingSeconds, setConnectingSeconds] = useState(0);
  const logRef = useRef<HTMLPreElement>(null);

  // Start'a basılınca Activity sekmesine geç ve sayacı sıfırla (render sırasında
  // önceki değere göre ayarlama; effect içinde setState'ten kaçınır)
  const [prevConnecting, setPrevConnecting] = useState(isConnecting);
  if (isConnecting !== prevConnecting) {
    setPrevConnecting(isConnecting);
    if (isConnecting) {
      setTab("activity");
      setConnectingSeconds(0);
    }
  }

  const fetchLogs = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const res = await axiosInstance.get(`/logs/${selectedAccount}`, {
        params: { log_type: "all", lines: 200 },
      });
      const data = res.data;
      setLogs({
        robot_log: data.robot_log || [],
        mt5_log: data.mt5_log || [],
      });
      const botRunning =
        typeof data.bot_running === "boolean" ? { bot_running: data.bot_running } : {};
      if (data.metrics || "bot_running" in botRunning) {
        updateLiveData({ ...(data.metrics || {}), ...botRunning });
      }
      if (useLogsStore.getState().workerStatus.reachable === false) {
        pushActivity("success", "Connection to worker restored.");
      }
      setWorkerStatus({ reachable: true, lastUpdate: Date.now(), error: null });
    } catch (err) {
      const message = await getApiErrorMessage(err, "Could not load logs");
      const prev = useLogsStore.getState().workerStatus;
      // Sadece durum değişiminde yaz; her poll'da tekrar etme
      if (prev.reachable !== false) {
        pushActivity("error", message);
      }
      setWorkerStatus({ ...prev, reachable: false, error: message });
    }
  }, [selectedAccount, setLogs, updateLiveData, pushActivity, setWorkerStatus]);

  const pollInterval = isConnecting ? CONNECTING_POLL_INTERVAL_MS : POLL_INTERVAL_MS;

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, pollInterval);
    return () => clearInterval(interval);
  }, [fetchLogs, pollInterval]);

  useEffect(() => {
    if (!isConnecting) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setConnectingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isConnecting]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [robotLog, mt5Log, activity, tab]);

  const handleDownloadLog = () => {
    if (selectedAccount) downloadAccountLogs(selectedAccount);
  };

  const handleClearLogs = async () => {
    if (!selectedAccount) return;
    if (tab === "activity") {
      clearActivity();
      return;
    }
    if (
      !window.confirm(
        "Bu hesaba ait tüm logları temizlemek istediğinize emin misiniz?",
      )
    )
      return;
    try {
      await axiosInstance.delete(`/logs/${selectedAccount}`);
      clearLogs();
      pushActivity("info", "Log files cleared.");
    } catch (err) {
      pushActivity("error", await getApiErrorMessage(err, "Could not clear logs"));
      setTab("activity");
    }
  };

  if (!selectedAccount) return null;

  const activeLines = tab === "robot" ? robotLog : mt5Log;

  let statusDot = "bg-gray-500";
  let statusText = "Checking worker…";
  if (isConnecting) {
    statusDot = "bg-yellow-400 animate-pulse";
    statusText = `Connecting to MT5… ${connectingSeconds}s`;
  } else if (workerStatus.reachable === false) {
    statusDot = "bg-red-500";
    statusText = "Worker offline";
  } else if (workerStatus.reachable) {
    statusDot = "bg-green-500";
    statusText = workerStatus.lastUpdate
      ? `Worker online · updated ${formatTime(workerStatus.lastUpdate)}`
      : "Worker online";
  }

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden">
      <div className="flex items-center border-b border-white/10">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 text-sm font-semibold transition-all ${
              tab === id
                ? "bg-white/10 text-white border-b-2 border-blue-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-black/70 rounded-b-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-white/5 bg-black/40">
          <div
            className="flex items-center space-x-2 min-w-0"
            title={workerStatus.error ?? undefined}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
            <span className="text-xs text-gray-400 truncate">{statusText}</span>
          </div>
          <span className="text-xs text-gray-500">
            {selectedAccount} — Auto-refresh {pollInterval / 1000}s
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadLog}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded hover:bg-white/10 transition-all flex items-center space-x-1"
              title="Download log file"
            >
              <Download size={12} />
              <span>Download</span>
            </button>
            <button
              onClick={handleClearLogs}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-500/10 transition-all flex items-center space-x-1"
              title={tab === "activity" ? "Clear activity" : "Clear all logs"}
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
            <button
              onClick={fetchLogs}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded hover:bg-white/10 transition-all"
            >
              Refresh
            </button>
          </div>
        </div>

        {workerStatus.reachable === false && workerStatus.error && (
          <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
            {workerStatus.error}
          </div>
        )}

        <pre
          ref={logRef}
          className="p-4 text-sm font-mono text-green-400 leading-relaxed overflow-auto h-64 whitespace-pre-wrap break-all"
        >
          {tab === "activity" ? (
            activity.length === 0 ? (
              <span className="text-gray-600">No activity yet – actions like Start/Stop and errors appear here.</span>
            ) : (
              activity.map((entry, i) => (
                <span key={i} className={ACTIVITY_COLORS[entry.level]}>
                  <span className="text-gray-500">{formatTime(entry.ts)}  </span>
                  {entry.message}
                  {"\n"}
                </span>
              ))
            )
          ) : activeLines.length === 0 ? (
            <span className="text-gray-600">No log entries yet...</span>
          ) : (
            activeLines.map((line, i) => (
              <span key={i} className={logLineColor(line)}>
                {line}
                {"\n"}
              </span>
            ))
          )}
        </pre>
      </div>
    </div>
  );
}
