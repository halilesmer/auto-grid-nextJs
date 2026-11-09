'use client';

import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { badgeOf, formatSize } from './mediaUtils';
import { KindIcon } from './MediaSlot';
import { useEscapeShield } from './useEscapeShield';
import type { PreviewState } from './useAccountMedia';

const ghost =
  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Dosya içeriği hep güvenli gösterilir: resim <img>, PDF tarayıcı görüntüleyicisi, not düz metin (<pre>, HTML/markdown işlenmez). */
export function MediaPreviewDialog({ preview, onClose }: { preview: PreviewState | null; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const [actual, setActual] = useState(false);
  const [dims, setDims] = useState<{ id: string; w: number; h: number } | null>(null);
  useEscapeShield(preview !== null, onClose);

  const item = preview?.item;
  const ready = preview?.phase === 'ready' ? preview : null;
  const meta = item
    ? [badgeOf(item), formatSize(f, item.size), dims && dims.id === item.id ? `${f.number(dims.w)} × ${f.number(dims.h)}` : null, f.date(item.created_at)]
        .filter(Boolean)
        .join(' · ')
    : '';

  const openInTab = () => ready && window.open(ready.url, '_blank', 'noopener');
  const save = () => {
    if (!ready || !item) return;
    const a = document.createElement('a');
    a.href = ready.url;
    a.download = item.name;
    a.click();
  };

  return (
    <Modal open={preview !== null} onClose={onClose} chrome={false} label={item?.name} className="flex h-[calc(100dvh-2rem)] max-w-5xl flex-col overflow-hidden p-0 sm:h-[min(720px,calc(100dvh-2rem))]">
      {preview && item && (
        <div data-testid="media-preview-dialog" className="flex min-h-0 flex-1 flex-col" onKeyDown={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-2.5 pl-4 pr-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted">
              <KindIcon kind={item.kind} />
            </span>
            <span className="block min-w-40 flex-1">
              <span className="block truncate text-sm font-semibold" data-testid="media-preview-name">
                {item.name}
              </span>
              <span className="block truncate text-xs tabular-nums text-muted-foreground">{meta}</span>
            </span>
            {item.kind === 'image' && ready && (
              <span role="group" aria-label={t('media.preview.sizeGroup')} className="inline-flex rounded-[9px] border border-border bg-muted p-0.5">
                {([false, true] as const).map((isActual) => (
                  <Tooltip key={String(isActual)} content={t(isActual ? 'media.preview.actual.hint' : 'media.preview.fit.hint')}>
                    <button
                      type="button"
                      aria-pressed={actual === isActual}
                      onClick={() => setActual(isActual)}
                      className={cn(
                        'h-[26px] rounded-[7px] px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        actual === isActual ? 'bg-popover text-foreground shadow-sm' : 'text-muted-foreground',
                      )}
                    >
                      {t(isActual ? 'media.preview.actual' : 'media.preview.fit')}
                    </button>
                  </Tooltip>
                ))}
              </span>
            )}
            <Tooltip content={t('media.preview.open.hint')}>
              <button type="button" className={ghost} disabled={!ready} onClick={openInTab}>
                <ExternalLink size={15} aria-hidden="true" />
                <span className="hidden sm:inline">{t('media.preview.open')}</span>
                <span className="sr-only sm:hidden">{t('media.preview.open')}</span>
              </button>
            </Tooltip>
            <Tooltip content={t('media.preview.download.hint')}>
              <button type="button" className={ghost} disabled={!ready} onClick={save}>
                <Download size={15} aria-hidden="true" />
                <span className="hidden sm:inline">{t('media.preview.download')}</span>
                <span className="sr-only sm:hidden">{t('media.preview.download')}</span>
              </button>
            </Tooltip>
            <Tooltip content={t(ready ? 'media.preview.close.hint' : 'media.preview.closeStop.hint')}>
              <button
                type="button"
                data-testid="media-preview-close"
                onClick={onClose}
                aria-label={t(ready ? 'media.preview.close' : 'media.preview.closeStop')}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>

          <div className="relative flex min-h-0 flex-1 bg-muted/55">
            {preview.phase === 'loading' && (
              <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6 text-center">
                <Loader2 size={28} className="animate-spin text-primary" aria-hidden="true" />
                <span className="text-sm font-medium">
                  {t('media.preview.loading')}{' '}
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {formatSize(f, Math.min(preview.loaded, item.size))} / {formatSize(f, item.size)}
                  </span>
                </span>
                <span className="block h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.min(100, Math.round((preview.loaded / Math.max(item.size, 1)) * 100))}%` }}
                  />
                </span>
                <span className="max-w-xs text-xs text-muted-foreground">{t('media.preview.loadingNote')}</span>
              </div>
            )}
            {preview.phase === 'error' && (
              <div role="alert" className="flex flex-1 items-center justify-center p-6 text-center text-sm text-danger">
                {preview.message}
              </div>
            )}
            {ready && item.kind === 'image' && (
              <div className={cn('flex flex-1 p-4', actual ? 'overflow-auto' : 'items-center justify-center overflow-hidden')}>
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image gerekmez */}
                <img
                  src={ready.url}
                  alt={item.name}
                  data-testid="media-preview-image"
                  onLoad={(e) => setDims({ id: item.id, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  className={cn('rounded-lg bg-card shadow-sm', actual ? 'm-auto max-w-none' : 'max-h-full max-w-full object-contain')}
                />
              </div>
            )}
            {ready && item.kind === 'pdf' && (
              <iframe src={ready.url} title={item.name} data-testid="media-preview-pdf" className="size-full flex-1 border-0" />
            )}
            {ready && item.kind === 'note' && (
              <pre
                data-testid="media-preview-note"
                className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-relaxed text-foreground"
              >
                {ready.text}
              </pre>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
