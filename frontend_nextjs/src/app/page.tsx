'use client';

import { Globe, Monitor, Power, RefreshCw, Server, Settings, UserRound } from 'lucide-react';
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
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';
import { useIsAdmin } from '@/store/useAuthStore';

export default function Home() {
  const t = useT();
  const isAdmin = useIsAdmin();
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
    saveAllLoading,
    shutdownOpen,
    shuttingDown,
    updateOpen,
    updateResult,
    isDirty,
    isLive,
    handleSaveAll,
    handleDiscard,
    markZoneSaved,
    handleShutdown,
    handleCheckUpdates,
    handleApplyUpdate,
    setShutdownOpen,
    setUpdateOpen,
    setUpdateResult,
  } = useDashboard({
    selectedAccount,
    activeAccount,
    settings,
    mergeAndSaveSettings: () => mergeAndSaveSettings(selectedAccount || ''),
    setUpdateInfo,
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <h1 className="sr-only">{t('dashboard.title')}</h1>

      {/* Kontrol çubuğu: hesap, bot kontrolü, genel ayarlar ve sistem menüsü tek satırda */}
      {/* Sıra (order-*): hesap 1 · sistem menüsü 2 (lg'den itibaren 4, en sağda) · bot + aralık 3
          (BotControls/SettingsForm içinde) · alarmlar order-last, tam genişlik */}
      <Card data-testid="control-bar" className="relative z-20 flex flex-wrap bg-card/95 lg:sticky lg:top-16 items-center gap-x-4 gap-y-3 p-3">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          {activeAccount && (
            <Badge
              tone={isLive ? 'danger' : 'info'}
              data-testid="env-badge"
              hint={isLive ? t('account.env.live.hint') : t('account.env.demo.hint')}
            >
              <span className={`size-1.5 rounded-full ${isLive ? 'bg-danger' : 'bg-info'}`} />
              {isLive ? t('dashboard.env.live') : t('dashboard.env.test')}
            </Badge>
          )}
          <AccountSelector />
        </div>

        <BotControls />
        <SettingsForm />

        <DropdownMenu
          label={t('dashboard.sysinfo.title')}
          hint={t('dashboard.sysinfo.hint')}
          icon={<Settings size={16} />}
          className="order-2 lg:order-4 lg:ml-auto"
          panelClassName="w-72"
        >
          <div className="space-y-2.5 p-4">
            <p className="text-xs font-medium text-muted-foreground">{t('dashboard.sysinfo.title')}</p>
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
          <DropdownMenuGroup>
            {/* Worker-Update (git pull + Neustart) ist Admin-Sache: der Worker antwortet Benutzern mit 403 */}
            {isAdmin && (
              <DropdownMenuItem
                icon={<RefreshCw size={14} />}
                hint={t('dashboard.sysinfo.checkUpdates.hint')}
                onSelect={() => {
                  setUpdateOpen(true);
                  handleCheckUpdates();
                }}
              >
                {t('dashboard.sysinfo.checkUpdates')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              icon={<Power size={14} />}
              tone="danger"
              hint={t('dashboard.shutdown.hint')}
              onSelect={() => setShutdownOpen(true)}
            >
              {t('dashboard.shutdown')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenu>
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
