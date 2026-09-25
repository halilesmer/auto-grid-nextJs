'use client';

import { useEffect, useRef } from 'react';
import { Globe, Monitor, Power, RefreshCw, Server, Settings, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAccountStore, useSettingsStore, useBotRuntimeStore, useSystemStore, useWebSocketManager } from '@/store';
import { useDashboard } from '@/app/hooks/useDashboard';
import AccountSelector from '@/components/account/AccountSelector';
import BotControls from '@/components/BotControls';
import ConfirmModal from '@/components/ConfirmModal';
import LogViewer from '@/components/LogViewer';
import SettingsForm from '@/components/SettingsForm';
import MetricsStrip from '@/components/dashboard/MetricsStrip';
import SaveSettingsBar from '@/components/dashboard/SaveSettingsBar';
import UpdateModal from '@/components/dashboard/UpdateModal';
import ZoneSettingsPanel from '@/components/ZoneSettingsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
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
  const sysMenuRef = useRef<HTMLDivElement>(null);

  // Initialize WebSocket connection when account is selected
  useWebSocketManager(selectedAccount);

  const {
    saveAllLoading,
    shutdownOpen,
    shuttingDown,
    showSysInfo,
    updateOpen,
    updateResult,
    isDirty,
    isLive,
    handleSaveAll,
    markZoneSaved,
    handleShutdown,
    handleCheckUpdates,
    handleApplyUpdate,
    setShowSysInfo,
    setShutdownOpen,
    setUpdateOpen,
    setUpdateResult,
  } = useDashboard({
    selectedAccount,
    activeAccount,
    settings,
    mergeAndSaveSettings: (apiUrl: string) => mergeAndSaveSettings(apiUrl, selectedAccount || ''),
    setUpdateInfo,
  });

  // Sistem menüsü dışına tıklanınca kapat
  useEffect(() => {
    if (!showSysInfo) return;
    const onDown = (e: MouseEvent) => {
      if (sysMenuRef.current && !sysMenuRef.current.contains(e.target as Node)) setShowSysInfo(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showSysInfo, setShowSysInfo]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge
              tone={isLive ? 'danger' : 'info'}
              data-testid="env-badge"
              hint={isLive ? t('account.env.live.hint') : t('account.env.demo.hint')}
            >
              <span className={`size-1.5 rounded-full ${isLive ? 'bg-danger' : 'bg-info'}`} />
              {isLive ? t('dashboard.env.live') : t('dashboard.env.test')}
            </Badge>
            <span className="text-xs text-muted-foreground">{t('dashboard.engine')}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t('dashboard.title')}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={sysMenuRef}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSysInfo(!showSysInfo)}
              hint={t('dashboard.sysinfo.hint')}
              aria-label={t('dashboard.sysinfo.title')}
              aria-expanded={showSysInfo}
            >
              <Settings size={16} />
            </Button>
            <AnimatePresence>
              {showSysInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/15 dark:shadow-black/60"
                >
                  <div className="space-y-2.5 p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('dashboard.sysinfo.title')}
                    </p>
                    {[
                      { icon: Monitor, labelKey: 'dashboard.sysinfo.host' as const, value: typeof window !== 'undefined' ? window.location.hostname : 'N/A' },
                      { icon: Server, labelKey: 'dashboard.sysinfo.port' as const, value: typeof window !== 'undefined' ? window.location.port || '3000' : '3000' },
                      { icon: Globe, labelKey: 'dashboard.sysinfo.url' as const, value: typeof window !== 'undefined' ? window.location.origin : '' },
                    ].map(({ icon: Icon, labelKey, value }) => (
                      <div key={labelKey} className="flex items-start gap-2.5 text-sm">
                        <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="w-10 shrink-0 text-muted-foreground">{t(labelKey)}</span>
                        <span className="min-w-0 break-all font-mono text-xs leading-5 text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border p-1.5">
                    <Tooltip content={t('dashboard.sysinfo.checkUpdates.hint')} className="w-full">
                      <button
                        onClick={() => {
                          setShowSysInfo(false);
                          setUpdateOpen(true);
                          handleCheckUpdates();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-accent"
                      >
                        <RefreshCw size={14} className="text-muted-foreground" />
                        {t('dashboard.sysinfo.checkUpdates')}
                      </button>
                    </Tooltip>
                    <Tooltip content={t('dashboard.shutdown.hint')} className="w-full">
                      <button
                        onClick={() => {
                          setShowSysInfo(false);
                          setShutdownOpen(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger transition hover:bg-danger/10"
                      >
                        <Power size={14} />
                        {t('dashboard.shutdown')}
                      </button>
                    </Tooltip>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShutdownOpen(true)}
            hint={t('dashboard.shutdown.hint')}
            aria-label={t('dashboard.shutdown')}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <Power size={16} />
          </Button>
        </div>
      </header>

      <AccountSelector />

      {selectedAccount ? (
        <>
          <MetricsStrip />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
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
                    />
                  }
                />
              </Card>
              <LogViewer />
            </div>

            <div className="space-y-5 lg:col-span-1">
              <div className="space-y-5 lg:sticky lg:top-20">
                <BotControls />
                <SettingsForm />
              </div>
            </div>
          </div>
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

      <UpdateModal
        isOpen={updateOpen}
        onClose={() => {
          setUpdateOpen(false);
          setUpdateResult(null);
        }}
        updateResult={updateResult}
        onApplyUpdate={handleApplyUpdate}
      />

      <ConfirmModal
        open={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onConfirm={handleShutdown}
        title={t('dashboard.shutdown')}
        message={t('dashboard.shutdown.message')}
        confirmLabel={t('dashboard.shutdown.confirm')}
        confirmHint={t('dashboard.shutdown.confirm.hint')}
        variant="danger"
        loading={shuttingDown}
      />
    </div>
  );
}
