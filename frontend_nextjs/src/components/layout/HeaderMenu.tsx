'use client';

import type { ReactNode } from 'react';
import { ChevronDown, Globe, Monitor, Plug, Power, RefreshCw, Server } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import UpdateModal from '@/components/dashboard/UpdateModal';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { StatusDot } from '@/components/ui/status-dot';
import { useSystemActions } from '@/hooks/useSystemActions';
import { useT, type MessageKey } from '@/i18n';
import { hostOf } from '@/lib/connectionCode';
import { useAccountStore } from '@/store/useAccountStore';
import { useIsAdmin } from '@/store/useAuthStore';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useConnectionStore, type ConnectionStatus } from '@/store/useConnectionStore';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';

const TONES: Record<ConnectionStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  unconfigured: 'neutral',
  checking: 'neutral',
  connected: 'success',
  unauthorized: 'warning',
  unreachable: 'danger',
  insecure: 'danger',
};

const SYSINFO: { icon: typeof Monitor; labelKey: MessageKey; value: () => string }[] = [
  { icon: Monitor, labelKey: 'dashboard.sysinfo.host', value: () => window.location.hostname },
  { icon: Server, labelKey: 'dashboard.sysinfo.port', value: () => window.location.port || '3000' },
  { icon: Globe, labelKey: 'dashboard.sysinfo.url', value: () => window.location.origin },
];

/** Adresse dieser Seite; eigene Komponente, damit `window` erst beim Öffnen des Panels gelesen wird (kein SSR). */
function SystemInfo() {
  const t = useT();
  return (
    <div className="space-y-1.5 pb-1">
      {SYSINFO.map(({ icon: Icon, labelKey, value }) => (
        <div key={labelKey} className="flex items-start gap-2.5 text-sm">
          <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="w-10 shrink-0 text-muted-foreground">{t(labelKey)}</span>
          <span className="min-w-0 break-all font-mono text-xs leading-5 text-foreground">{value()}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup className="space-y-1.5 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </DropdownMenuGroup>
  );
}

/**
 * Kopf-Menü rechts in der Kopfzeile: Verbindung, Sprache, Design und System. Der Auslöser zeigt immer den
 * Verbindungspunkt; bei einer Störung zusätzlich den Status als Text (nie nur über die Farbe). Das Panel
 * liegt als Overlay über dem Inhalt. Update- und Herunterfahren-Dialog hängen hier, damit sie auf jeder
 * Seite funktionieren.
 */
export default function HeaderMenu() {
  const t = useT();
  const isAdmin = useIsAdmin();
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const status = useConnectionStore((s) => s.status);
  const showConnectionDialog = useConnectionDialogStore((s) => s.show);
  const system = useSystemActions();
  const activeAccount = useAccountStore((s) => s.activeAccount);

  // Vor dem Lesen des Speichers weder „nicht verbunden" noch „VPS verbinden" zeigen (Flackern)
  const shown: ConnectionStatus = hydrated ? status : 'checking';
  const statusText = t(`connection.status.${shown}`);
  const host = baseUrl ? hostOf(baseUrl) : '';
  const faulty = shown !== 'connected' && shown !== 'checking';
  // Ohne gespeicherte Adresse ist „VPS verbinden" die nützlichere Aufschrift als „Nicht verbunden"
  const faultText = shown === 'unconfigured' ? t('connection.chip.connect') : statusText;

  return (
    <>
      <DropdownMenu
        // Name enthält den sichtbaren Text des Auslösers (WCAG 2.5.3)
        label={t('header.menu.aria', { status: faulty ? faultText : statusText })}
        hint={t('header.menu.hint', { status: statusText })}
        size="sm"
        variant="outline"
        panelClassName="w-72 max-h-[calc(100dvh-var(--nav-height)-1rem)] overflow-y-auto"
        triggerProps={{
          'data-testid': 'connection-chip',
          'data-status': shown,
          // lg–xl: Links stehen daneben, langer Störungstext wird gekürzt (voller Text im aria-label und im Menü)
          className: 'max-w-[9rem] px-2.5 sm:max-w-[16rem] lg:max-w-[9rem] xl:max-w-[16rem]',
        }}
        icon={
          <>
            <StatusDot tone={TONES[shown]} pulse={shown === 'checking'} />
            {faulty && <span className="truncate">{faultText}</span>}
            {/* Verbunden: Host erst ab xl, darunter reicht der Punkt (Host steht im Menü) */}
            {shown === 'connected' && host && <span className="hidden truncate xl:inline">{host}</span>}
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          </>
        }
      >
        <div data-testid="header-menu-panel">
          <Section title={t('header.menu.connection')}>
            <div data-testid="header-menu-connection" className="flex min-w-0 items-center gap-2 text-sm">
              <StatusDot tone={TONES[shown]} pulse={shown === 'checking'} />
              <span className="min-w-0 truncate font-mono text-xs text-foreground">{host || t('connection.chip.connect')}</span>
              <span className="shrink-0 text-xs text-muted-foreground">· {statusText}</span>
            </div>
            <DropdownMenuItem
              icon={<Plug size={14} />}
              hint={t('header.connection.change.hint')}
              onSelect={() => showConnectionDialog()}
              data-testid="connection-change"
            >
              {t('header.connection.change')}
            </DropdownMenuItem>
          </Section>

          <Section title={t('common.language')}>
            <LanguageSwitcher />
          </Section>

          <Section title={t('common.theme')}>
            <ThemeToggle />
          </Section>

          <Section title={t('header.menu.system')}>
            <SystemInfo />
            {/* Worker-Update (git pull + Neustart) ist Admin-Sache: der Worker antwortet Benutzern mit 403 */}
            {isAdmin && (
              <DropdownMenuItem
                icon={<RefreshCw size={14} />}
                hint={t('dashboard.sysinfo.checkUpdates.hint')}
                onSelect={() => {
                  system.setUpdateOpen(true);
                  system.handleCheckUpdates();
                }}
              >
                {t('dashboard.sysinfo.checkUpdates')}
              </DropdownMenuItem>
            )}
            {/* Herunterfahren stoppt nur den Bot des gewählten Kontos (useSystemActions); ohne Konto gibt es nichts zu stoppen */}
            <DropdownMenuItem
              icon={<Power size={14} />}
              tone="danger"
              hint={activeAccount ? t('dashboard.shutdown.hint') : t('dashboard.shutdown.noAccount.hint')}
              disabled={!activeAccount}
              onSelect={() => system.setShutdownOpen(true)}
            >
              {t('dashboard.shutdown')}
            </DropdownMenuItem>
          </Section>
        </div>
      </DropdownMenu>

      <UpdateModal
        isOpen={system.updateOpen}
        onClose={() => {
          system.setUpdateOpen(false);
          system.setUpdateResult(null);
        }}
        updateResult={system.updateResult}
        onApplyUpdate={system.handleApplyUpdate}
      />

      <ConfirmModal
        open={system.shutdownOpen}
        onClose={() => system.setShutdownOpen(false)}
        onConfirm={system.handleShutdown}
        title={t('dashboard.shutdown')}
        message={t('dashboard.shutdown.message', {
          account: activeAccount?.account_name ?? '',
          env: activeAccount?.env_type === 'LIVE' ? t('dashboard.env.live') : t('dashboard.env.demo'),
        })}
        confirmLabel={t('dashboard.shutdown.confirm')}
        confirmHint={t('dashboard.shutdown.confirm.hint')}
        variant="danger"
        loading={system.shuttingDown}
      />
    </>
  );
}
