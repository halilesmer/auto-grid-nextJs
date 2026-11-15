import type { VpsStatus } from '@/lib/vps';
import type { MessageKey } from '@/i18n';

export function uptime(minutes: number, t: (key: MessageKey, params?: Record<string, string | number>) => string): string {
  if (minutes < 60) return t('vps.uptime.min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('vps.uptime.hours', { h: hours, m: minutes % 60 });
  return t('vps.uptime.days', { n: Math.floor(hours / 24) });
}

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

// Aufgabe läuft alle 5 min; deutlich älter = deaktiviert, keine Sitzung oder Skriptfehler
const SELF_HEAL_STALE_MINUTES = 15;

// Tunnel-Watchdog (AutoGrid-Tunnel): eingerichtet? prüft er noch? letzte Prüfung ok oder wie oft in Folge fehlgeschlagen?
export function selfHealState(status: VpsStatus, t: TFn): string {
  if (!status.tasks.tunnel?.exists) return t('vps.tile.selfHeal.missing');
  const wd = status.tunnel_watchdog;
  if (!wd || !wd.last_check) return t('vps.tile.selfHeal.pending');
  if ((wd.check_age_minutes ?? 0) > SELF_HEAL_STALE_MINUTES && status.uptime_minutes > SELF_HEAL_STALE_MINUTES) {
    return t('vps.tile.selfHeal.stale', { n: wd.check_age_minutes ?? 0 });
  }
  if (wd.failures > 0) return t('vps.tile.selfHeal.failing', { n: wd.failures });
  return wd.last_ok ? t('vps.tile.selfHeal.ok') : t('vps.tile.selfHeal.pending');
}

