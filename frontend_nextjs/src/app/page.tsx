'use client';

import { useEffect, useRef } from 'react';
import { Globe, Monitor, Power, RefreshCw, Server, Settings, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAccountStore, useSettingsStore, useBotRuntimeStore, useSystemStore, useWebSocketManager } from '@/store';
import { useDashboard } from '@/app/hooks/useDashboard';
import AccountSelector from '@/components/account/AccountSelector';
import BotControls from '@/components/BotControls';
import ConfirmModal from '@/components/ConfirmModal';
import ErrorToast from '@/components/ui/ErrorToast';
import LogViewer from '@/components/LogViewer';
import SettingsForm from '@/components/SettingsForm';
import SimulationBar from '@/components/SimulationBar';
import MetricsStrip from '@/components/dashboard/MetricsStrip';
import SaveSettingsBar from '@/components/dashboard/SaveSettingsBar';
import UpdateModal from '@/components/dashboard/UpdateModal';
import ZoneSettingsPanel from '@/components/ZoneSettingsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function Home() {
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
    saveAllError,
    shutdownOpen,
    shuttingDown,
    showSysInfo,
    updateOpen,
    updateResult,
    isDirty,
    isLive,
    handleSaveAll,
    handleShutdown,
    handleCheckUpdates,
    handleApplyUpdate,
    setSaveAllError,
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
            <Badge tone={isLive ? 'danger' : 'info'}>
              <span className={`size-1.5 rounded-full ${isLive ? 'bg-danger' : 'bg-info'}`} />
              {isLive ? 'LIVE' : 'TEST'}
            </Badge>
            <span className="text-xs text-muted-foreground">Auto Grid Engine</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Trading Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {selectedAccount && (
            <SaveSettingsBar
              isDirty={isDirty}
              isLoading={saveAllLoading}
              hasSettings={!!settings}
              onSave={handleSaveAll}
            />
          )}

          <div className="relative" ref={sysMenuRef}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSysInfo(!showSysInfo)}
              title="System Info"
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
                      System Info
                    </p>
                    {[
                      { icon: Monitor, label: 'Host', value: typeof window !== 'undefined' ? window.location.hostname : 'N/A' },
                      { icon: Server, label: 'Port', value: typeof window !== 'undefined' ? window.location.port || '3000' : '3000' },
                      { icon: Globe, label: 'URL', value: typeof window !== 'undefined' ? window.location.origin : '' },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-start gap-2.5 text-sm">
                        <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
                        <span className="min-w-0 break-all font-mono text-xs leading-5 text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border p-1.5">
                    <button
                      onClick={() => {
                        setShowSysInfo(false);
                        setUpdateOpen(true);
                        handleCheckUpdates();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-accent"
                    >
                      <RefreshCw size={14} className="text-muted-foreground" />
                      Check for Updates
                    </button>
                    <button
                      onClick={() => {
                        setShowSysInfo(false);
                        setShutdownOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger transition hover:bg-danger/10"
                    >
                      <Power size={14} />
                      System Shutdown
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShutdownOpen(true)}
            title="System Shutdown"
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <Power size={16} />
          </Button>
        </div>
      </header>

      <AccountSelector />

      {selectedAccount && <SimulationBar />}

      {saveAllError && (
        <ErrorToast
          message={saveAllError}
          onDismiss={() => setSaveAllError('')}
        />
      )}

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
          <p className="text-base font-medium text-foreground">No account selected</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Pick an MT5 account above, or add a new one to start configuring grid zones.
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
        title="System Shutdown"
        message="This will stop all running bots and close the interface. Open positions will remain safe on the broker side."
        confirmLabel="Shutdown"
        variant="danger"
        loading={shuttingDown}
      />
    </div>
  );
}
