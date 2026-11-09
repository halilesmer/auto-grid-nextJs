'use client';

import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { MediaItem } from '@/services/mediaApi';
import { MediaPreviewDialog } from './MediaPreviewDialog';
import { MediaAddSlot, MediaSlot, MediaUploadSlot } from './MediaSlot';
import { ACCEPT, DEFAULT_MAX_BYTES, MEDIA_LIMIT, formatSize } from './mediaUtils';
import { useAccountMedia } from './useAccountMedia';
import { useEscapeShield } from './useEscapeShield';
import { useFormat } from '@/i18n';

/** Hesap formu için bilgi satırı: yeni hesapta dosya bağlanacak kimlik henüz yok (3g). */
export function AccountMediaPending() {
  const t = useT();
  return (
    <section data-testid="media-section" className="mt-5" aria-labelledby="media-title">
      <div className="mb-2 text-xs font-medium text-muted-foreground" id="media-title">
        <FieldLabel label={t('media.title')} hint={t('media.title.hint')} />
      </div>
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-input p-3 text-xs text-muted-foreground">
        <Info size={14} className="shrink-0" aria-hidden="true" />
        {t('media.pending')}
      </p>
    </section>
  );
}

/** Hesap başına en çok 3 dosya (PDF, resim, not). Liste açılışta gelir; dosya baytı yalnız karta tıklanınca iner. */
export function AccountMedia({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  const t = useT();
  const f = useFormat();
  const media = useAccountMedia(accountId);
  const { list, upload, preview, error } = media;
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dragDepth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEscapeShield(toDelete !== null, () => setToDelete(null));

  const items = list.status === 'ready' ? list.items : [];
  const limit = list.status === 'ready' ? list.limit : MEDIA_LIMIT;
  const used = items.length + (upload ? 1 : 0);
  const full = used >= limit;
  const showAdd = canEdit && list.status === 'ready' && !full;
  const hero = showAdd && used === 0;

  // Portal-Modale (Vorschau, Frage) hängen im React-Baum unter <section>: ihre Ereignisse nicht als Ablage werten
  const own = (e: DragEvent) => e.currentTarget.contains(e.target as Node);
  const onDrag = (e: DragEvent, delta: number) => {
    if (!canEdit || !own(e) || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current + delta);
    setDragging(dragDepth.current > 0);
  };
  const onDrop = (e: DragEvent) => {
    if (!canEdit || !own(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !upload) void media.addFile(file);
  };

  return (
    <section
      data-testid="media-section"
      aria-labelledby="media-title"
      className="relative mt-5"
      onDragEnter={(e) => onDrag(e, 1)}
      onDragOver={(e) => canEdit && own(e) && e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={(e) => onDrag(e, -1)}
      onDrop={onDrop}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-muted-foreground" id="media-title">
          <FieldLabel label={t('media.title')} hint={t('media.info.hint')} />
        </div>
        <span
          data-testid="media-count"
          aria-label={t('media.count.aria', { count: list.status === 'ready' ? used : 0, limit })}
          className="inline-flex h-5 items-center rounded-full border border-border bg-muted px-2 text-[11px] font-medium tabular-nums"
        >
          {list.status === 'ready' ? used : '–'} / {limit}
        </span>
      </div>
      <p className="mb-2.5 text-xs leading-snug text-muted-foreground">{t('media.desc')}</p>

      {list.status === 'loading' && (
        <div aria-busy="true" aria-label={t('media.loading')} className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('h-[60px] animate-pulse rounded-xl border border-border bg-muted/60 sm:h-[136px]', i > 0 && 'hidden sm:block')} />
          ))}
        </div>
      )}

      {list.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/[0.07] p-3 text-sm text-danger">
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{list.message}</span>
          <Button size="sm" variant="outline" hint={t('media.retry.hint')} onClick={() => void media.reload()}>
            <RefreshCw size={14} aria-hidden="true" />
            {t('media.retry')}
          </Button>
        </div>
      )}

      {list.status === 'ready' && (
        <div className={cn('grid grid-cols-1 gap-2 sm:gap-3', !hero && 'sm:grid-cols-3')}>
          {items.map((item) => (
            <MediaSlot
              key={item.id}
              item={item}
              canEdit={canEdit}
              onOpen={() => void media.openPreview(item)}
              onDelete={() => setToDelete(item)}
            />
          ))}
          {upload && <MediaUploadSlot upload={upload} onCancel={media.cancelUpload} />}
          {showAdd && <MediaAddSlot hero={hero} disabled={upload !== null} onPick={() => input.current?.click()} />}
        </div>
      )}

      {list.status === 'ready' && full && canEdit && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info size={13} className="shrink-0" aria-hidden="true" />
          {t('media.full')}
        </p>
      )}

      {error && (
        <Alert tone="danger" className="mt-3" onDismiss={() => media.setError(null)}>
          <span data-testid="media-error">{error}</span>
        </Alert>
      )}

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {t('media.limits', {
          big: formatSize(f, list.status === 'ready' ? list.maxBytes.pdf : DEFAULT_MAX_BYTES.pdf),
          note: formatSize(f, list.status === 'ready' ? list.maxBytes.note : DEFAULT_MAX_BYTES.note),
        })}
      </p>

      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-popover/90 text-sm font-medium text-primary"
        >
          {t('media.drop')}
        </div>
      )}

      <input
        ref={input}
        type="file"
        hidden
        accept={ACCEPT}
        data-testid="media-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void media.addFile(file);
        }}
      />

      <MediaPreviewDialog preview={preview} onClose={media.closePreview} />

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          setDeleting(true);
          try {
            await media.removeItem(toDelete);
          } finally {
            setDeleting(false);
          }
        }}
        loading={deleting}
        title={t('media.delete.title')}
        message={t('media.delete.message', { name: toDelete?.name ?? '' })}
        confirmHint={t('media.delete.confirm.hint')}
        variant="danger"
      />
    </section>
  );
}
