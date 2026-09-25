'use client';

import { Bot, Pause, Play, RotateCcw, Server, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { API, axiosInstance } from '@/lib/api';
import { useAccountStore, useBotRuntimeStore, useLogsStore } from '@/store';
import { getApiErrorMessage } from '@/lib/apiError';
import { useT } from '@/i18n';

export default function BotControls() {
  const t = useT();
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
    pushActivity("info", t("bot.activity.startRequested", { account: selectedAccount }));

    // Worker MT5'e önce API sürecinde, sonra bot sürecinde bağlanır (her biri
    // 120 sn'ye kadar). 15 sn sonra "Stopped" göstermek bağlantıyı yarıda
    // bırakılmış gibi gösteriyordu.
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      if (!useBotRuntimeStore.getState().isConnecting) return;
      setIsConnecting(false);
      pushActivity("warn", t("bot.activity.noConnection"));
    }, 180_000);

    try {
      const res = await axiosInstance.post(
        `${API}/start?account_id=${selectedAccount}`,
        {},
      );
      pushActivity("info", res.data?.message || t("bot.activity.accepted"));
      if (useBotRuntimeStore.getState().isConnecting) {
        pushActivity("info", t("bot.activity.processStarted"));
      }
    } catch (err) {
      setIsConnecting(false);
      setIsRunning(false);
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      const message = await getApiErrorMessage(err, t("bot.startFailed"));
      setError(message);
      pushActivity("error", t("bot.activity.startFailed", { message }));
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, setIsRunning, setIsConnecting, updateLiveData, pushActivity, t]);

  const handleStopBot = useCallback(async () => {
    if (!selectedAccount) return;
    setStopConfirmOpen(false);
    setLoading(true);
    setError("");
    pushActivity("info", t("bot.activity.stopRequested", { account: selectedAccount }));
    try {
      await axiosInstance.post(
        `${API}/stop?account_id=${selectedAccount}`,
        {},
      );
      pushActivity("success", t("bot.activity.stopped"));
    } catch (err) {
      const message = await getApiErrorMessage(err, t("bot.stopFailed"));
      setError(message);
      pushActivity("error", t("bot.activity.stopFailed", { message }));
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, pushActivity, t]);

  if (!selectedAccount) return null;

  // Süreç çalışıyor ama MT5'e bağlı değil (bağlantı kopmuş / asılı): hem yeniden
  // başlatma hem durdurma sunulmalı, yoksa arayüzden çıkış yolu yoktu.
  const processWithoutMt5 = !liveData.mt5_connected && Boolean(liveData.bot_running);

  const status = isConnecting
    ? { label: t("bot.status.connecting"), hint: t("bot.status.connecting.hint"), tone: "warning" as const, box: "border-warning/30 bg-warning/[0.06] text-warning" }
    : liveData.mt5_connected
      ? { label: t("bot.status.running"), hint: t("bot.status.running.hint"), tone: "success" as const, box: "border-success/30 bg-success/[0.06] text-success" }
      : processWithoutMt5
        ? { label: t("bot.status.processNoMt5"), hint: t("bot.status.processNoMt5.hint"), tone: "warning" as const, box: "border-warning/30 bg-warning/[0.06] text-warning" }
        : { label: t("bot.status.stopped"), hint: t("bot.status.stopped.hint"), tone: "neutral" as const, box: "border-border bg-muted/60 text-muted-foreground" };

  return (
    <Card data-testid="bot-controls">
      <CardHeader
        icon={<Bot size={16} />}
        title={t("bot.title")}
        description={t("bot.subtitle")}
      />
      <CardContent className="space-y-4">
        {/* Durum paneli */}
        <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-4 py-3", status.box)}>
          <Tooltip content={status.hint} className="min-w-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <StatusDot tone={status.tone} pulse={status.tone !== "neutral"} />
              <span data-testid="bot-status" className="text-sm font-semibold">{status.label}</span>
            </div>
          </Tooltip>
          <Tooltip content={t("bot.market.hint")}>
            <span className="text-xs text-muted-foreground">
              {t("bot.market")}{" "}
              <span className={liveData.market_open ? "text-success" : "text-danger"}>
                {liveData.market_open ? t("bot.market.open") : t("bot.market.closed")}
              </span>
            </span>
          </Tooltip>
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
              wrapperClassName="flex-1"
              onClick={handleStartBot}
              disabled={isConnecting}
              loading={loading || isConnecting}
              hint={
                loading || isConnecting
                  ? t("bot.connecting.hint")
                  : processWithoutMt5
                    ? t("bot.restartHint")
                    : t("bot.start.hint")
              }
            >
              {!(loading || isConnecting) &&
                (processWithoutMt5 ? <RotateCcw size={16} /> : <Play size={16} fill="currentColor" />)}
              {loading || isConnecting ? t("bot.connecting") : processWithoutMt5 ? t("bot.restart") : t("bot.start")}
            </Button>
          )}
          {(liveData.mt5_connected || processWithoutMt5) && (
            <Button
              variant="danger"
              size="lg"
              wrapperClassName="flex-1"
              onClick={() => setStopConfirmOpen(true)}
              loading={loading}
              hint={t("bot.stop.hint")}
            >
              {!loading && <Pause size={16} fill="currentColor" />}
              {t("bot.stop")}
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
          <Alert tone="danger" title={t("bot.alert.startupFailed")}>
            {liveData.startup_error}
          </Alert>
        )}
        {liveData.order_rejected_alarm && (
          <Alert tone="danger" title={t("bot.alert.orderRejected")}>
            {liveData.last_error}
          </Alert>
        )}
        {liveData.algo_trading_error && (
          <Alert tone="warning" title={t("bot.alert.algoOff")}>
            {t("bot.alert.algoOff.text")}
          </Alert>
        )}
      </CardContent>

      {/* Stop Bot Confirmation */}
      <ConfirmModal
        open={stopConfirmOpen}
        onClose={() => setStopConfirmOpen(false)}
        onConfirm={handleStopBot}
        title={t("bot.disconnect.title")}
        message={t("bot.disconnect.message")}
        infoText={t("bot.disconnect.info")}
        confirmLabel={t("bot.disconnect.confirm")}
        confirmHint={t("bot.disconnect.confirm.hint")}
        variant="warning"
        loading={loading}
      />
    </Card>
  );
}