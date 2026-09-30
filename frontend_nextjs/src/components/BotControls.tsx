'use client';

import { Pause, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { axiosInstance } from '@/lib/api';
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
        `/start?account_id=${selectedAccount}`,
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
        `/stop?account_id=${selectedAccount}`,
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

  const busy = loading || isConnecting;
  const hasAlerts =
    Boolean(error) ||
    (!isConnecting && !liveData.mt5_connected && Boolean(liveData.startup_error)) ||
    Boolean(liveData.order_rejected_alarm) ||
    Boolean(liveData.algo_trading_error);

  return (
    // `contents`: durum/butonlar ve alarm satırı kontrol çubuğunun (page.tsx) kendi flex öğeleri olur
    <div data-testid="bot-controls" className="contents">
      <div className="order-3 flex min-w-0 basis-full items-center gap-2 sm:basis-auto xl:border-l xl:border-border xl:pl-4">
        {/* Durum */}
        <Tooltip
          content={activeAccount ? `${status.hint}\n${activeAccount.account_name} · ${activeAccount.server}` : status.hint}
          className="min-w-0 flex-1 sm:flex-none"
        >
          <div className={cn("flex h-9 w-full min-w-0 items-center gap-2 rounded-md border px-3", status.box)}>
            <StatusDot tone={status.tone} pulse={status.tone !== "neutral"} />
            <span data-testid="bot-status" className="truncate text-sm font-semibold">{status.label}</span>
          </div>
        </Tooltip>

        {!liveData.mt5_connected && (
          <Button
            variant="success"
            onClick={handleStartBot}
            disabled={isConnecting}
            loading={busy}
            hint={busy ? t("bot.connecting.hint") : processWithoutMt5 ? t("bot.restartHint") : t("bot.start.hint")}
          >
            {!busy && (processWithoutMt5 ? <RotateCcw size={15} /> : <Play size={15} fill="currentColor" />)}
            {busy ? t("bot.connecting") : processWithoutMt5 ? t("bot.restart") : t("bot.start")}
          </Button>
        )}
        {(liveData.mt5_connected || processWithoutMt5) && (
          <Button
            variant="danger"
            onClick={() => setStopConfirmOpen(true)}
            loading={loading}
            hint={t("bot.stop.hint")}
          >
            {!loading && <Pause size={15} fill="currentColor" />}
            {t("bot.stop")}
          </Button>
        )}
      </div>

      {/* Hatalar ve alarmlar: çubuğun altında tam genişlikte */}
      {hasAlerts && (
        <div className="order-last basis-full space-y-2">
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
        </div>
      )}

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
    </div>
  );
}