'use client';

import { Plug, Power, Settings } from 'lucide-react';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { StatusDot } from '@/components/ui/status-dot';
import { useSystemActions } from '@/hooks/useSystemActions';
import { useT } from '@/i18n';
import { hostOf } from '@/lib/connectionCode';
import { cn } from '@/lib/utils';
import { useAccountStore } from '@/store/useAccountStore';
import { useConnectionStore, type ConnectionStatus } from '@/store/useConnectionStore';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';
import SystemModals from './SystemModals';

const TONES: Record<ConnectionStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  unconfigured: 'neutral',
  checking: 'neutral',
  connected: 'success',
  unauthorized: 'warning',
  unreachable: 'danger',
  insecure: 'danger',
};

// Fiş düğmesinin köşe noktası (1115-A7.5): bağlıyken yok; kontrol ederken gri, anahtar reddedilince sarı, öteki hatalarda kırmızı
const BADGE_COLOR: Partial<Record<ConnectionStatus, string>> = {
  checking: 'bg-muted-foreground',
  unauthorized: 'bg-warning',
  unreachable: 'bg-danger',
  insecure: 'bg-danger',
};

/**
 * Fiş menüsü (1115-A9.5): bağlantı durumu, Bağlantı ayarları, Ayarlar ve seçili hesabın botunu durdurma. Dil, tema,
 * sürüm ve güncelleme ayar penceresindedir. Durdurma onay penceresi burada asılı durur, her sayfada çalışsın diye.
 */
export default function HeaderMenu() {
  const t = useT();
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const status = useConnectionStore((s) => s.status);
  const showSettings = useSettingsDialogStore((s) => s.show);
  const lastSection = useSettingsDialogStore((s) => s.lastSection);
  const system = useSystemActions();
  const activeAccount = useAccountStore((s) => s.activeAccount);

  // Bis zur Hydrierung keinen falschen Verbindungsstatus melden.
  const shown: ConnectionStatus = hydrated ? status : 'checking';
  const statusText = t(`connection.status.${shown}`);
  const host = baseUrl ? hostOf(baseUrl) : '';
  const badge = BADGE_COLOR[shown];

  return (
    <>
      <DropdownMenu
        label={t('header.menu.aria', { status: statusText })}
        hint={t('header.menu.hint', { status: statusText })}
        size="icon-sm"
        variant="outline"
        panelClassName="w-72 max-h-[calc(100dvh-var(--nav-height)-1rem)] overflow-y-auto"
        triggerProps={{
          'data-testid': 'connection-chip',
          'data-status': shown,
        }}
        icon={
          <span className="relative inline-flex">
            <Plug size={16} />
            {badge && (
              <span
                aria-hidden="true"
                data-testid="connection-chip-dot"
                className={cn('absolute -right-1.5 -top-1.5 size-2 rounded-full ring-2 ring-background', badge)}
              />
            )}
          </span>
        }
      >
        <div data-testid="header-menu-panel">
          <DropdownMenuGroup className="space-y-1">
            <div data-testid="header-menu-connection" className="flex min-w-0 items-center gap-2.5 rounded-lg bg-accent/60 px-2.5 py-2 text-sm">
              <StatusDot tone={TONES[shown]} pulse={shown === 'checking'} />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{statusText}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{host || t('connection.chip.connect')}</span>
              </span>
            </div>
            <DropdownMenuItem
              icon={<Plug size={14} />}
              hint={t('header.connection.change.hint')}
              onSelect={() => showSettings('connection')}
              data-testid="connection-change"
            >
              {t('header.connection.change')}
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<Settings size={14} />}
              hint={t('header.settings.hint')}
              onSelect={() => showSettings(lastSection)}
              data-testid="header-settings"
            >
              {t('sdlg.open')}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuGroup>
            {/* Durdurma yalnız seçili hesabın botunu durdurur (useSystemActions); hesap yoksa durdurulacak bir şey yok */}
            <DropdownMenuItem
              icon={<Power size={14} />}
              tone="danger"
              hint={activeAccount ? t('header.stopBot.hint') : t('dashboard.shutdown.noAccount.hint')}
              disabled={!activeAccount}
              onSelect={() => system.setShutdownOpen(true)}
              data-testid="header-stop-bot"
            >
              {t('header.stopBot')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </div>
      </DropdownMenu>

      <SystemModals system={system} />
    </>
  );
}
