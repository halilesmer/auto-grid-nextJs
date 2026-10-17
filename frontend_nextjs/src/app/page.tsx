'use client';

import { Pin, PinOff, Plus, Save, UserRound } from 'lucide-react';
import { useAccountStore, useSettingsStore, useBotRuntimeStore, useSystemStore, useWebSocketManager } from '@/store';
import { useState } from 'react';
import { useZoneTransfer } from '@/hooks/useZoneTransfer';
import { usePinnedMetrics } from '@/hooks/usePinnedMetrics';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
  const [metricsPinned, setMetricsPinned] = usePinnedMetrics();
  const [addSymbolOpen, setAddSymbolOpen] = useState(false);
  const addSymbolBlocked = isRunning && !liveData.mt5_connected;
  const addSymbolHint = t(addSymbolBlocked ? 'zone.panel.add.off.hint' : 'zone.panel.add.hint');

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 px-2 py-3 sm:space-y-5 sm:px-4 sm:py-6 md:px-8 md:py-8">
      <h1 className="sr-only">{t('dashboard.title')}</h1>
      {transfer && isDirty && <Alert tone="warning" title={t('backtest.transfer.unsaved')}>
        {isRunning ? t('backtest.transfer.running') : t('backtest.transfer.notice')}
      </Alert>}

      {/* Kontrol çubuğu: hesap, bot kontrolü ve genel ayarlar tek satırda; sistem menüsü üst menüde (HeaderMenu) */}
      {/* Sıra (order-*): hesap 1 · bot + aralık 3 (BotControls/SettingsForm içinde) · alarmlar order-last, tam genişlik */}
      {/* Fixierter Bereich (UI-09): bei jeder Breite direkt unter der Navigation. Stapel: Navigation z-50 · Bereich z-20 · Dropdown-Panels absolut im Bereich (z-30, Kontoliste z-50). Bei kleiner Höhe (Querformat) scrollt der Bereich mit, sonst bliebe kein Platz für die Seite. */}
      <div data-testid="sticky-area" className="sticky top-(--nav-height) z-20 [@media(max-height:32rem)]:static -mx-2 space-y-2 bg-background/95 px-2 pb-2 sm:-mx-4 sm:px-4 backdrop-blur md:-mx-8 md:px-8">
      <Card data-testid="control-bar" className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-2 bg-card p-1.5 sm:gap-x-4 sm:gap-y-3 sm:p-3">
        <div className="order-1 flex min-w-44 flex-1 items-center gap-2 sm:min-w-0 sm:flex-none">
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
          <AccountSelector
            menuExtra={
              selectedAccount && (
                <>
                  <DropdownMenuItem
                    icon={<Plus size={14} />}
                    onSelect={() => setAddSymbolOpen(true)}
                    disabled={addSymbolBlocked}
                    data-testid="add-symbol-menu"
                    hint={addSymbolHint}
                  >
                    {t('zone.panel.add')}
                  </DropdownMenuItem>
                  <SettingsForm variant="menu" />
                  <DropdownMenuItem
                    icon={metricsPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    onSelect={() => setMetricsPinned(!metricsPinned)}
                    data-testid="metrics-pin-menu"
                    hint={t(metricsPinned ? 'metrics.unpin.hint' : 'metrics.pin.hint')}
                  >
                    {t(metricsPinned ? 'metrics.unpin' : 'metrics.pin')}
                  </DropdownMenuItem>
                </>
              )
            }
          />
          {selectedAccount && (
            <Button
              variant="primary"
              size="sm"
              wrapperClassName="max-sm:hidden"
              onClick={() => setAddSymbolOpen(true)}
              disabled={addSymbolBlocked}
              hint={addSymbolHint}
            >
              <Plus size={14} />
              {t('zone.panel.add')}
            </Button>
          )}
        </div>

        <BotControls />
        <SettingsForm />

        {selectedAccount && (
          <div className="order-3 ml-auto flex items-center gap-2">
            {/* V3: Speichern-Hinweis nur bei ungespeicherten Änderungen; die Schaltfläche in der Zonenüberschrift bleibt */}
            {isDirty && !!settings && (
              <div data-testid="bar-unsaved" className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-warning" />
                  {t('saveBar.unsaved.short')}
                </span>
                <Button variant="primary" size="sm" onClick={handleSaveAll} loading={saveAllLoading} hint={t('saveBar.saveAll.hint')}>
                  {!saveAllLoading && <Save size={14} />}
                  {t('common.save')}
                </Button>
              </div>
            )}
            {/* V2: Kennzahlen unter der Leiste anheften */}
            <Button
              variant="outline"
              size="icon"
              data-testid="metrics-pin"
              wrapperClassName="max-sm:hidden"
              data-pinned={metricsPinned}
              aria-label={t(metricsPinned ? 'metrics.unpin' : 'metrics.pin')}
              hint={t(metricsPinned ? 'metrics.unpin.hint' : 'metrics.pin.hint')}
              onClick={() => setMetricsPinned(!metricsPinned)}
            >
              {metricsPinned ? <Pin size={15} /> : <PinOff size={15} />}
            </Button>
          </div>
        )}
      </Card>
      {selectedAccount && metricsPinned && <MetricsStrip />}
      </div>

      {selectedAccount ? (
        <>
          {!metricsPinned && <MetricsStrip />}

          <Card className="p-2 sm:p-5">
            <ZoneSettingsPanel
              selectedAccount={selectedAccount}
              isRunning={isRunning}
              liveData={liveData}
              isGlobalDirty={isDirty}
              onZoneSaved={markZoneSaved}
              addSymbolOpen={addSymbolOpen}
              onAddSymbolClose={() => setAddSymbolOpen(false)}
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
