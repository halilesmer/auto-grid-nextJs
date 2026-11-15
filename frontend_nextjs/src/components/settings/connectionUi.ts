import type { LucideIcon } from 'lucide-react';
import { KeyRound, Plug, ShieldAlert, WifiOff } from 'lucide-react';
import type { ConnectionStatus } from '@/store/useConnectionStore';

export type BannerStatus = 'unreachable' | 'unauthorized' | 'insecure' | 'unconfigured';

export const BANNER_STATUSES: ConnectionStatus[] = ['unreachable', 'unauthorized', 'insecure', 'unconfigured'];

export const isBannerStatus = (s: ConnectionStatus): s is BannerStatus => BANNER_STATUSES.includes(s);

/** Bantın ikonu ve rengi; durum yalnız renkle değil ikon ve metinle de anlatılır. */
export const BANNER_LOOK: Record<BannerStatus, { icon: LucideIcon; frame: string; chip: string }> = {
  unreachable: { icon: WifiOff, frame: 'border-danger/35 bg-danger/5', chip: 'bg-danger/15 text-danger' },
  unauthorized: { icon: KeyRound, frame: 'border-warning/40 bg-warning/5', chip: 'bg-warning/15 text-warning' },
  insecure: { icon: ShieldAlert, frame: 'border-danger/35 bg-danger/5', chip: 'bg-danger/15 text-danger' },
  unconfigured: { icon: Plug, frame: 'border-border bg-muted/40', chip: 'bg-muted text-muted-foreground' },
};

/** Banner ve Bağlantı bölümündeki ana eylemin metin anahtarı (`sdlg.cb.<ad>`; ipucu `<ad>.hint`). */
export const ACTION_KEY = { unauthorized: 'key', insecure: 'url', unconfigured: 'connect' } as const;
