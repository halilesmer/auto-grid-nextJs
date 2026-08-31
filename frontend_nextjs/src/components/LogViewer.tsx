'use client';

import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import axios from "axios";
import { useBotStore } from "@/store/useBotStore";

const rawAPI =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tweet-overlying-monotone.ngrok-free.dev";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";
const POLL_INTERVAL_MS = 10_000;

export default function LogViewer() {
  const { selectedAccount, logs, setLogs, clearLogs, updateLiveData } =
    useBotStore();
  const [tab, setTab] = useState<"robot" | "mt5">("robot");
  const robotRef = useRef<HTMLPreElement>(null);
  const mt5Ref = useRef<HTMLPreElement>(null);

  const fetchLogs = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const res = await axios.get(`${API}/logs/${selectedAccount}`, {
        params: { log_type: "all", lines: 200 },
      });
      const data = res.data;
      setLogs({
        robot_log: data.robot_log || [],
        mt5_log: data.mt5_log || [],
        metrics: data.metrics || null,
      });
      if (data.metrics) {
        updateLiveData(data.metrics);
      }
    } catch {
      // silent fail on poll
    }
  }, [selectedAccount, setLogs, updateLiveData]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    const ref = tab === "robot" ? robotRef : mt5Ref;
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs, tab]);

  const handleDownloadLog = () => {
    if (selectedAccount) {
      window.open(`${API}/logs/download/${selectedAccount}`);
    }
  };

  const handleClearLogs = async () => {
    if (!selectedAccount) return;
    if (
      !window.confirm(
        "Bu hesaba ait tüm logları temizlemek istediğinize emin misiniz?",
      )
    )
      return;
    try {
      await axios.delete(`${API}/logs/${selectedAccount}`);
      clearLogs();
    } catch (err) {
      console.error("Loglar temizlenemedi", err);
    }
  };

  if (!selectedAccount) return null;

  const activeLines = tab === "robot" ? logs.robot_log : logs.mt5_log;

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden">
      <div className="flex items-center border-b border-white/10">
        <button
          onClick={() => setTab("robot")}
          className={`flex-1 py-3 text-sm font-semibold transition-all ${
            tab === "robot"
              ? "bg-white/10 text-white border-b-2 border-blue-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Robot Logs
        </button>
        <button
          onClick={() => setTab("mt5")}
          className={`flex-1 py-3 text-sm font-semibold transition-all ${
            tab === "mt5"
              ? "bg-white/10 text-white border-b-2 border-blue-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          MT5 Terminal Logs
        </button>
      </div>

      <div className="bg-black/70 rounded-b-xl">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/40">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-xs text-gray-500">
            {tab === "robot" ? "Robot" : "MT5"} — {selectedAccount} —
            Auto-refresh {POLL_INTERVAL_MS / 1000}s
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
              title="Clear all logs"
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

        <pre
          ref={tab === "robot" ? robotRef : mt5Ref}
          className="p-4 text-sm font-mono text-green-400 leading-relaxed overflow-auto h-64 whitespace-pre-wrap break-all"
        >
          {activeLines.length === 0 ? (
            <span className="text-gray-600">No log entries yet...</span>
          ) : (
            activeLines.map((line, i) => {
              let colorClass = "text-green-400";
              if (
                line.includes("[ERROR]") ||
                line.includes("ERROR") ||
                line.includes("HATA")
              ) {
                colorClass = "text-red-400";
              } else if (line.includes("WARN") || line.includes("UYARI")) {
                colorClass = "text-yellow-400";
              } else if (
                line.includes("INFO") ||
                line.includes("BAŞARILI") ||
                line.includes("success")
              ) {
                colorClass = "text-blue-400";
              }
              return (
                <span key={i} className={colorClass}>
                  {line}
                  {"\n"}
                </span>
              );
            })
          )}
        </pre>
      </div>
    </div>
  );
}
