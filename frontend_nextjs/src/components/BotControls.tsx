'use client';

import { Bot, Pause, Play, RotateCcw, Server, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';
import { API, axiosInstance } from '@/lib/api';
import { useAccountStore, useBotRuntimeStore, useLogsStore } from '@/store';
import { getApiErrorMessage } from '@/lib/apiError';

export default function BotControls() {
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const isConnecting = useBotRuntimeStore((s) => s.isConnecting);
  const liveData = useBotRuntimeStore((s) => s.liveData);
  const setIsRunning = useBotRuntimeStore((s) => s.setIsRunning);
  const setIsConnecting = useBotRuntimeStore((s) => s.setIsConnecting);
  const updateLiveData = useBotRuntimeStore((s) => s.updateLiveData);
  const pushActivity = useLogsStore((s) => s.pushActivity);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
  }, []);

  useEffect(() => {
    if (isConnecting) return;
    setIsRunning(Boolean(liveData.mt5_connected));
  }, [liveData.mt5_connected, isConnecting, setIsRunning]);

  const [loading, setLoading] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  const handleStartBot = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError("");
    updateLiveData({ startup_error: null });

    setIsConnecting(true);
    setIsRunning(true);
    pushActivity("info", `Start requested for account ${selectedAccount} – worker is connecting to MT5…`);

    // Worker MT5'e önce API sürecinde, sonra bot sürecinde bağlanır (her biri
    // 120 sn'ye kadar). 15 sn sonra "Stopped" göstermek bağlantıyı yarıda
    // bırakılmış gibi gösteriyordu.
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      if (!useBotRuntimeStore.getState().isConnecting) return;
      setIsConnecting(false);
      pushActivity("warn", "No connection after 180 s – check the Robot Logs tab for details.");
    }, 180_000);

    try {
      const res = await axiosInstance.post(
        `${API}/start?account_id=${selectedAccount}`,
        {},
      );
      pushActivity("info", res.data?.message || "Worker accepted the start request.");
      if (useBotRuntimeStore.getState().isConnecting) {
        pushActivity("info", "Bot process started – waiting for it to connect to MT5…");
      }
    } catch (err) {
      setIsConnecting(false);
      setIsRunning(false);
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      const message = await getApiErrorMessage(err, "Failed to start bot");
      setError(message);
      pushActivity("error", `Start failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, setIsRunning, setIsConnecting, updateLiveData, pushActivity]);

  const handleStopBot = useCallback(async () => {
    if (!selectedAccount) return;
    setStopConfirmOpen(false);
    setLoading(true);
    setError("");
    pushActivity("info", `Stop requested for account ${selectedAccount}…`);
    try {
      await axiosInstance.post(
        `${API}/stop?account_id=${selectedAccount}`,
        {},
      );
      pushActivity("success", "Bot stopped. Positions and pending orders stay at the broker.");
    } catch (err) {
      const message = await getApiErrorMessage(err, "Failed to stop bot");
      setError(message);
      pushActivity("error", `Stop failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, pushActivity]);

  if (!selectedAccount) return null;

  // Süreç çalışıyor ama MT5'e bağlı değil (bağlantı kopmuş / asılı): hem yeniden
  // başlatma hem durdurma sunulmalı, yoksa arayüzden çıkış yolu yoktu.
  const processWithoutMt5 = !liveData.mt5_connected && Boolean(liveData.bot_running);

  const status = isConnecting
    ? { label: "Connecting…", tone: "warning" as const, box: "border-warning/30 bg-warning/[0.06] text-warning" }
    : liveData.mt5_connected
      ? { label: "Running", tone: "success" as const, box: "border-success/30 bg-success/[0.06] text-success" }
      : processWithoutMt5
        ? { label: "Bot process running – not connected to MT5", tone: "warning" as const, box: "border-warning/30 bg-warning/[0.06] text-warning" }
        : { label: "Stopped", tone: "neutral" as const, box: "border-border bg-muted/60 text-muted-foreground" };

  return (
    <Card data-testid="bot-controls">
      <CardHeader
        icon={<Bot size={16} />}
        title="Bot Controls"
        description="MT5 engine lifecycle"
      />
      <CardContent className="space-y-4">
        {/* Durum paneli */}
        <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-4 py-3", status.box)}>
          <div className="flex min-w-0 items-center gap-2.5">
            <StatusDot tone={status.tone} pulse={status.tone !== "neutral"} />
            <span data-testid="bot-status" className="text-sm font-semibold">{status.label}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            Market{" "}
            <span className={liveData.market_open ? "text-success" : "text-danger"}>
              {liveData.market_open ? "Open" : "Closed"}
            </span>
          </span>
        </div>

        {activeAccount && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2">
              <UserRound size={13} className="shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground" title={activeAccount.account_name}>{activeAccount.account_name}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2">
              <Server size={13} className="shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground" title={activeAccount.server}>{activeAccount.server}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!liveData.mt5_connected && (
            <Button
              variant="success"
              size="lg"
              className="flex-1"
              onClick={handleStartBot}
              disabled={isConnecting}
              loading={loading || isConnecting}
              title={processWithoutMt5 ? "Restarts the bot process and reconnects to MT5" : undefined}
            >
              {!(loading || isConnecting) &&
                (processWithoutMt5 ? <RotateCcw size={16} /> : <Play size={16} fill="currentColor" />)}
              {loading || isConnecting ? "Connecting to MT5…" : processWithoutMt5 ? "Restart Bot" : "Start Bot"}
            </Button>
          )}
          {(liveData.mt5_connected || processWithoutMt5) && (
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={() => setStopConfirmOpen(true)}
              loading={loading}
            >
              {!loading && <Pause size={16} fill="currentColor" />}
              Stop Bot
            </Button>
          )}
        </div>

        {/* Hatalar ve alarmlar */}
        {error && (
          <Alert tone="danger" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}
        {!isConnecting && !liveData.mt5_connected && liveData.startup_error && (
          <Alert tone="danger" title="MT5 connection failed">
            {liveData.startup_error}
          </Alert>
        )}
        {liveData.order_rejected_alarm && (
          <Alert tone="danger" title="Order rejected by MT5/Broker">
            {liveData.last_error}
          </Alert>
        )}
        {liveData.algo_trading_error && (
          <Alert tone="warning" title="Algo Trading is off">
            Please enable Algo Trading in your MT5 terminal.
          </Alert>
        )}
      </CardContent>

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
    </Card>
  );
}