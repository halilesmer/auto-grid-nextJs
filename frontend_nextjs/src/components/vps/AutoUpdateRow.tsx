'use client';

import { StatusDot } from '@/components/ui/status-dot';
import { FieldLabel } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';
import { autoUpdateAgeMinutes, autoUpdateState, type AutoUpdateState, type AutoUpdateStatus } from '@/lib/vps';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'danger' | 'warning' | 'neutral';

const STATE_TONE: Record<AutoUpdateState, Tone> = {
  current: 'success',
  pending: 'success',
  offInterval: 'warning',
  offUnsupervised: 'warning',
  otherBranch: 'warning',
  localCommits: 'warning',
  checkFailed: 'danger',
  pullFailed: 'danger',
  overdue: 'danger',
  unknown: 'neutral',
};

const TONE_SURFACE: Record<Tone, string> = {
  success: 'border-border bg-card',
  neutral: 'border-border bg-card',
  warning: 'border-warning/30 bg-warning/[0.06]',
  danger: 'border-danger/30 bg-danger/[0.06]',
};

// Nur hier hat der Text des Workers etwas zu sagen (Branch, Versionen, Fehlermeldung)
const STATES_WITH_DETAIL: readonly AutoUpdateState[] = ['otherBranch', 'localCommits', 'checkFailed', 'pullFailed'];
const STATES_WITH_LAST_RUN: readonly AutoUpdateState[] = [...STATES_WITH_DETAIL, 'current', 'overdue'];

const HOURS_BEFORE_DAYS = 48;

/** Echter Zustand des Auto-Updates aus dem laufenden Worker (UPD-07). `configured`: Registry-Wert aus SSH. */
export default function AutoUpdateRow({
  status,
  readAt,
  configured,
}: {
  status: AutoUpdateStatus | null;
  /** Zeitpunkt der Abfrage (ms), Bezug für das Alter des letzten Laufs */
  readAt: number;
  configured?: string;
}) {
  const t = useT();
  const fmt = useFormat();
  const state = autoUpdateState(status, readAt);
  const tone = STATE_TONE[state];
  const isOverdue = state === 'overdue';

  const age = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    if (hours < 1) return t('vps.autoUpdate.ago.min', { n: minutes });
    if (hours < HOURS_BEFORE_DAYS) return t('vps.autoUpdate.ago.hours', { n: hours });
    return t('vps.autoUpdate.ago.days', { n: Math.floor(hours / 24) });
  };

  const whenParts = () => {
    if (!status) return configured ? [t('vps.autoUpdate.configured', { state: configured })] : [];
    if (!status.enabled) return [];
    const interval = t('vps.tile.autoUpdate.every', { minutes: fmt.number(status.interval_minutes) });
    const minutes = autoUpdateAgeMinutes(status, readAt);
    if (minutes == null || !STATES_WITH_LAST_RUN.includes(state)) return [interval];
    const lastRun = t('vps.autoUpdate.lastRun', { age: age(minutes) });
    // status.checked_at ist hier gesetzt: autoUpdateAgeMinutes gibt sonst null zurück
    return [lastRun, isOverdue ? fmt.dateTime(status.checked_at! * 1000) : interval];
  };
  const when = whenParts().join(' · ');
  const detail = STATES_WITH_DETAIL.includes(state) ? status?.detail : '';

  return (
    <div
      data-testid="vps-auto-update"
      data-state={state}
      data-tone={tone}
      className={cn('grid grid-cols-1 gap-x-4 gap-y-0.5 rounded-xl border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center', TONE_SURFACE[tone])}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <StatusDot tone={tone} pulse={tone === 'success'} />
        <FieldLabel label={t('vps.autoUpdate')} hint={t('vps.autoUpdate.hint')} className="text-xs text-muted-foreground" />
        <span className="min-w-0 text-sm font-semibold text-foreground">{t(`vps.autoUpdate.state.${state}`)}</span>
      </div>
      {when && (
        <p data-testid="vps-auto-update-when" className={cn('text-xs tabular-nums sm:text-right', isOverdue ? 'font-semibold text-danger' : 'text-muted-foreground')}>
          {when}
        </p>
      )}
      {detail && (
        <p data-testid="vps-auto-update-detail" className="break-all font-mono text-xs text-muted-foreground sm:col-span-2">
          {detail}
        </p>
      )}
    </div>
  );
}
