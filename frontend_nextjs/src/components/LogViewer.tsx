'use client';

import { Activity, Bot, Download, MonitorCog, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useAccountStore, useLogsStore, useBotRuntimeStore } from '@/store';
import type { ActivityLevel } from '@/store';
import { downloadAccountLogs } from '@/lib/downloadLogs';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';

const POLL_INTERVAL_MS = 10_000;
// Bağlanırken ne olduğunu canlı görmek için daha sık yokla
const CONNECTING_POLL_INTERVAL_MS = 2_000;

type Tab = "activity" | "robot" | "mt5";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "activity", label: "Activity", icon: <Activity size={14} /> },
  { id: "robot", label: "Robot Logs", icon: <Bot size={14} /> },
  { id: "mt5", label: "MT5 Terminal", icon: <MonitorCog size={14} /> },
];

const ACTIVITY_COLORS: Record<ActivityLevel, string> = {
  info: "text-info",
  success: "text-success",
  warn: "text-warning",
  error: "text-danger font-semibold",
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
    return "text-danger font-semibold";
  }
  if (line.includes("WARN") || line.includes("UYARI")) {
    return "text-warning";
  }
  if (
    line.includes("INFO") ||
    line.includes("[START]") ||
    line.includes("[STOP]") ||
    line.includes("BAŞARILI") ||
    line.includes("success")
  ) {
    return "text-info";
  }
  return "text-foreground/75";
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

  let statusTone: "neutral" | "warning" | "danger" | "success" = "neutral";
  let statusText = "Checking worker…";
  if (isConnecting) {
    statusTone = "warning";
    statusText = `Connecting to MT5… ${connectingSeconds}s`;
  } else if (workerStatus.reachable === false) {
    statusTone = "danger";
    statusText = "Worker offline";
  } else if (workerStatus.reachable) {
    statusTone = "success";
    statusText = workerStatus.lastUpdate
      ? `Worker online · updated ${formatTime(workerStatus.lastUpdate)}`
      : "Worker online";
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-3 pt-2">
        <AnimatedTabs
          tabs={TABS}
          activeTab={tab}
          onChange={(id) => setTab(id as Tab)}
          layoutId="log-viewer-tabs"
          variant="underline"
          className="border-b-0"
        />
        <div className="flex items-center gap-0.5 pb-1.5">
          <Button variant="ghost" size="icon-sm" onClick={fetchLogs} title="Refresh">
            <RefreshCw size={14} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleDownloadLog} title="Download log file">
            <Download size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClearLogs}
            title={tab === "activity" ? "Clear activity" : "Clear all logs"}
            className="hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="bg-muted/60 dark:bg-black/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2 font-mono text-[11px]">
          <div
            className="flex min-w-0 items-center gap-2"
            title={workerStatus.error ?? undefined}
          >
            <StatusDot tone={statusTone} pulse={statusTone === "warning" || statusTone === "success"} />
            <span data-testid="worker-status" className="truncate text-muted-foreground">{statusText}</span>
          </div>
          <span className="flex items-center gap-1.5 text-muted-foreground/70">
            <Terminal size={11} />
            {selectedAccount} · refresh {pollInterval / 1000}s
          </span>
        </div>

        {workerStatus.reachable === false && workerStatus.error && (
          <div className="border-b border-danger/20 bg-danger/[0.07] px-4 py-2 text-xs text-danger">
            {workerStatus.error}
          </div>
        )}

        <pre
          ref={logRef}
          data-testid="log-output"
          className="h-72 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[12.5px] leading-relaxed text-foreground/75"
        >
          {tab === "activity" ? (
            activity.length === 0 ? (
              <span className="text-muted-foreground/60">No activity yet – actions like Start/Stop and errors appear here.</span>
            ) : (
              activity.map((entry, i) => (
                <span key={i} className={ACTIVITY_COLORS[entry.level]}>
                  <span className="text-muted-foreground/60">{formatTime(entry.ts)}  </span>
                  {entry.message}
                  {"\n"}
                </span>
              ))
            )
          ) : activeLines.length === 0 ? (
            <span className="text-muted-foreground/60">No log entries yet...</span>
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
    </Card>
  );
}
