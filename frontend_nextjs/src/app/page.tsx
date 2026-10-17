'use client';

import { UserRound } from 'lucide-react';
import { useAccountStore, useSettingsStore, useBotRuntimeStore, useSystemStore, useWebSocketManager } from '@/store';
import { useZoneTransfer } from '@/hooks/useZoneTransfer';
import { Alert } from '@/components/ui/alert';
import { useDashboard } from '@/app/hooks/useDashboard';
import AccountSelector from '@/components/account/AccountSelector';
import BotControls from '@/components/BotControls';
import LogViewer from '@/components/LogViewer';
import SettingsForm from '@/components/SettingsForm';
import MetricsStrip from '@/components/dashboard/MetricsStrip';
import SaveSettingsBar from '@/components/dashboard/SaveSettingsBar';
import ZoneSettingsPanel from '@/components/ZoneSettingsPanel';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useT } from '@/i18n';

export default function Home() {
  const t = useT();
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const setUpdateInfo = useSystemStore((s) => s.setUpdateInfo);
  const settings = useSettingsStore((s) => s.settings);
  const isRunning = useBotRuntimeStore((s) => s.isRunning);
  const liveData = useBotRuntimeStore((s) => s.liveData);
  const mergeAndSaveSettings = useSettingsStore((s) => s.mergeAndSaveSettings);

  // Initialize WebSocket connection when account is selected
  useWebSocketManager(selectedAccount);

  const {
    savedSettingsStr,
    saveAllLoading,
    isDirty,
    isLive,
    handleSaveAll,
    handleDiscard,
    markZoneSaved,
  } = useDashboard({
    selectedAccount,
    activeAccount,
    settings,
    mergeAndSaveSettings: () => mergeAndSaveSettings(selectedAccount || ''),
    setUpdateInfo,
  });

  const transfer = useZoneTransfer(selectedAccount, savedSettingsStr);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <h1 className="sr-only">{t('dashboard.title')}</h1>
      {transfer && isDirty && <Alert tone="warning" title={t('backtest.transfer.unsaved')}>
        {isRunning ? t('backtest.transfer.running') : t('backtest.transfer.notice')}
      </Alert>}

      {/* Kontrol çubuğu: hesap, bot kontrolü ve genel ayarlar tek satırda; sistem menüsü üst menüde (HeaderMenu) */}
      {/* Sıra (order-*): hesap 1 · bot + aralık 3 (BotControls/SettingsForm içinde) · alarmlar order-last, tam genişlik */}
      <Card data-testid="control-bar" className="relative z-20 flex flex-wrap bg-card/95 lg:sticky lg:top-(--nav-height) items-center gap-x-4 gap-y-3 p-3">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          {activeAccount && (
            <Badge
              tone={isLive ? 'danger' : 'info'}
              data-testid="env-badge"
              hint={isLive ? t('account.env.live.hint') : t('account.env.demo.hint')}
            >
              <span className={`size-1.5 rounded-full ${isLive ? 'bg-danger' : 'bg-info'}`} />
              {isLive ? t('dashboard.env.live') : t('dashboard.env.demo')}
            </Badge>
          )}
          <AccountSelector />
        </div>

        <BotControls />
        <SettingsForm />
      </Card>

      {selectedAccount ? (
        <>
          <MetricsStrip />

          <Card className="p-5">
            <ZoneSettingsPanel
              selectedAccount={selectedAccount}
              isRunning={isRunning}
              liveData={liveData}
              isGlobalDirty={isDirty}
              onZoneSaved={markZoneSaved}
              saveAction={
                <SaveSettingsBar
                  isDirty={isDirty}
                  isLoading={saveAllLoading}
                  hasSettings={!!settings}
                  onSave={handleSaveAll}
                  onDiscard={handleDiscard}
                />
              }
            />
          </Card>
          <LogViewer />
        </>
      ) : (
        <Card className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
            <UserRound size={22} />
          </div>
          <p className="text-base font-medium text-foreground">{t('dashboard.empty.title')}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t('dashboard.empty.text')}
          </p>
        </Card>
      )}
    </div>
  );
}
