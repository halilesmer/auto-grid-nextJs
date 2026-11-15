'use client';

import type { ReactNode } from 'react';
import { Info, Lock } from 'lucide-react';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { useAccountStore } from '@/store/useAccountStore';
import type { useVps } from '@/components/vps/useVps';
import type { useSystemActions } from '@/hooks/useSystemActions';
import type { useWorkerSystem } from './useWorkerSystem';

/** Dört sekmenin ortak girdisi: SystemSection tek bir kez kurar, sekmeler yalnız okur. */
export interface SystemCtx {
  vps: ReturnType<typeof useVps>;
  worker: ReturnType<typeof useWorkerSystem>;
  system: ReturnType<typeof useSystemActions>;
  /** SSH satırları kilitli: pencere localhost dışında açık ya da SSH kurulmamış */
  sshLocked: boolean;
  /** İlk SSH durum cevabı henüz gelmedi: SSH düğmeleri o zamana kadar kapalı (F7) */
  sshPending: boolean;
}

export const SYSTEM_TABS = ['status', 'update', 'restart', 'logs'] as const;
export type SystemTab = (typeof SYSTEM_TABS)[number];

/** "SSH · yalnız bu Mac" rozeti. */
export function SshBadge({ short = false }: { short?: boolean }) {
  const t = useT();
  return (
    <Tooltip content={t('sdlg.sys.ssh.badge.hint')}>
      <span
        tabIndex={0}
        data-testid="sys-ssh-badge"
        className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {short ? t('sdlg.sys.ssh.short') : t('sdlg.sys.ssh.badge')}
      </span>
    </Tooltip>
  );
}

/** Kilitli SSH satırının değer yerine gösterdiği metin. */
export function LockedValue() {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" data-testid="sys-ssh-locked">
      <Lock size={14} aria-hidden="true" />
      {t('sdlg.sys.ssh.locked')}
    </span>
  );
}

/** Pencere bu Mac'te açık değilse ya da SSH kurulu değilse üstte nedeni anlatan not. */
export function SshLockNote({ ctx }: { ctx: SystemCtx }) {
  const t = useT();
  if (!ctx.sshLocked) return null;
  const reason = ctx.vps.disabled ? t('sdlg.sys.ssh.note.disabled', { reason: ctx.vps.disabled }) : t('sdlg.sys.ssh.note.local');
  return (
    <div
      role="note"
      data-testid="sys-ssh-note"
      className="mt-4 flex items-start gap-2.5 rounded-lg border border-warning/35 bg-warning/[0.06] px-4 py-3 text-[13px] leading-relaxed text-foreground"
    >
      <Info size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
      <span>{reason}</span>
    </div>
  );
}

/** Nokta + metin (+ ikinci satırda ayrıntı). */
export function StateValue({
  tone,
  children,
  detail,
  testId,
}: {
  tone: 'success' | 'danger' | 'warning' | 'neutral';
  children: ReactNode;
  detail?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId} data-tone={tone}>
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusDot tone={tone} pulse={tone === 'success'} />
        <span className="font-medium">{children}</span>
      </span>
      {detail && <span className="min-w-0 break-words text-[13px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

/** Onay penceresinde çalışan botlar ve LIVE/DEMO bilgisi (hesap listesi varsa); SSH okunamıyorsa worker'ın sayısı. */
export function useBotsLine(ctx: SystemCtx): () => string | undefined {
  const t = useT();
  const accounts = useAccountStore((s) => s.accounts);
  return () => {
    const bots = ctx.vps.status?.bots;
    if (bots) {
      if (bots.length === 0) return t('sdlg.sys.confirm.noBots');
      const list = bots
        .map((b) => {
          const a = accounts.find((x) => String(x.id) === b.account || String(x.login) === b.account);
          if (!a) return b.account;
          return `${b.account} (${a.env_type === 'LIVE' ? t('dashboard.env.live') : t('dashboard.env.demo')})`;
        })
        .join(', ');
      return t('sdlg.sys.confirm.bots', { accounts: list });
    }
    const n = ctx.worker.error ? undefined : ctx.worker.status?.bots_running;
    return n == null ? undefined : t('sdlg.sys.confirm.botsCount', { count: n });
  };
}
