'use client';

import { Eye, FileText, Image as ImageIcon, Loader2, StickyNote, Trash2, Upload, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { MediaItem, MediaKind } from '@/services/mediaApi';
import { badgeOf, formatSize } from './mediaUtils';
import type { UploadState } from './useAccountMedia';

export function KindIcon({ kind, size = 18 }: { kind: MediaKind; size?: number }) {
  const Icon = { pdf: FileText, image: ImageIcon, note: StickyNote }[kind];
  return <Icon size={size} aria-hidden="true" />;
}

const tile = 'flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-foreground';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const cardBox = 'relative rounded-xl border border-border bg-muted/45 transition-colors hover:border-foreground/20';

/** Dolu yer: kart tıklanınca önizleme açılır (dosya o an iner). Telefonda satır, geniş ekranda dikey kart. */
export function MediaSlot({
  item,
  canEdit,
  onOpen,
  onDelete,
}: {
  item: MediaItem;
  canEdit: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const size = formatSize(f, item.size);
  const badge = badgeOf(item);
  return (
    <div data-testid="media-card" className={cardBox}>
      <Tooltip content={t('media.card.hint')} className="flex w-full">
        <button
          type="button"
          data-testid="media-preview"
          onClick={onOpen}
          aria-label={t('media.card.aria', { name: item.name, size })}
          className={cn(
            'flex min-h-[60px] w-full min-w-0 items-center gap-3 rounded-xl p-2.5 text-left',
            canEdit ? 'pr-14 sm:pr-3' : 'pr-2.5',
            'sm:min-h-0 sm:flex-col sm:items-stretch sm:gap-2.5 sm:p-3',
            focusRing,
          )}
        >
          <span className="flex items-center gap-2">
            <span className={tile}>
              <KindIcon kind={item.kind} />
            </span>
            <span className="hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground sm:inline">
              {badge}
            </span>
          </span>
          <span className="block min-w-0 flex-1 sm:flex-none">
            <span className="block truncate text-[13px] font-medium" data-testid="media-name">
              {item.name}
            </span>
            <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
              <span className="sm:hidden">{badge} · </span>
              {size} · {f.date(item.created_at)}
            </span>
          </span>
          <span className="hidden items-center gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground sm:flex">
            <Eye size={14} aria-hidden="true" />
            {t('media.preview')}
          </span>
        </button>
      </Tooltip>
      {canEdit && (
        <Tooltip content={t('media.delete.hint')} className="absolute right-1 top-2 sm:right-2 sm:top-2">
          <button
            type="button"
            data-testid="media-delete"
            onClick={onDelete}
            aria-label={t('media.delete.aria', { name: item.name })}
            className={cn(
              'inline-flex size-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger sm:size-7 sm:rounded-lg',
              focusRing,
            )}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/** Süren yükleme: ilerleme çubuğu, iptal düğmesi (aynı anda tek yükleme). */
export function MediaUploadSlot({ upload, onCancel }: { upload: UploadState; onCancel: () => void }) {
  const t = useT();
  const f = useFormat();
  const percent = upload.percent;
  return (
    <div
      data-testid="media-uploading"
      role="status"
      aria-label={t('media.upload.aria', { name: upload.name, percent: percent ?? 0 })}
      className={cn(cardBox, 'flex min-h-[60px] items-center gap-3 p-2.5 pr-14 sm:min-h-[136px] sm:flex-col sm:items-stretch sm:justify-between sm:gap-2.5 sm:p-3 sm:pr-3')}
    >
      <span className="flex items-center gap-2">
        <span className={tile}>
          <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" />
        </span>
      </span>
      <span className="block min-w-0 flex-1 sm:flex-none">
        <span className="block truncate text-[13px] font-medium">{upload.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {percent === null ? t('media.upload.preparing') : (upload.notice ?? t('media.upload.sending'))}
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent ?? 0}%` }} />
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{f.number((percent ?? 0) / 100, { style: 'percent' })}</span>
        </span>
      </span>
      <Tooltip content={t('media.upload.cancel.hint')} className="absolute right-1 top-2 sm:right-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('media.upload.cancel')}
          className={cn('inline-flex size-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:size-7 sm:rounded-lg', focusRing)}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}

/** Ekleme alanı: boşken tam genişlik (hero), doluyken tek karelik; yükleme sürerken pasif. */
export function MediaAddSlot({
  hero,
  disabled,
  onPick,
}: {
  hero: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const t = useT();
  const ring = (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
      <Upload size={18} aria-hidden="true" />
    </span>
  );
  let body: ReactNode;
  if (hero) {
    body = (
      <>
        {ring}
        <span className="block min-w-0">
          <span className="block text-[13px] font-medium text-foreground">{t('media.add.empty')}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t('media.add.emptySub')}</span>
        </span>
      </>
    );
  } else {
    body = (
      <>
        {ring}
        <span className="block min-w-0 sm:text-center">
          <span className="block text-[13px] font-medium text-foreground">{t('media.add')}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {disabled ? t('media.add.busy') : t('media.add.sub')}
            <span className="hidden sm:block">{disabled ? null : t('media.add.types')}</span>
          </span>
        </span>
      </>
    );
  }
  return (
    <Tooltip content={disabled ? t('media.add.busy.hint') : t('media.add.hint')} className={cn('flex', hero && 'w-full')}>
      <button
        type="button"
        data-testid="media-add"
        disabled={disabled}
        onClick={onPick}
        aria-label={disabled ? t('media.add.busy.aria') : t('media.add.aria')}
        className={cn(
          'flex w-full min-w-0 items-center gap-3 rounded-xl border-[1.5px] border-dashed border-input p-2.5 text-left transition-colors',
          'hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:bg-transparent',
          hero ? 'min-h-[84px] justify-center sm:flex-col sm:text-center' : 'min-h-[60px] sm:min-h-[136px] sm:flex-col sm:justify-center sm:p-3',
          focusRing,
        )}
      >
        {body}
      </button>
    </Tooltip>
  );
}
