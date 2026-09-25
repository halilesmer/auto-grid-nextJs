'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FlaskConical, MoreHorizontal, Trash2, Pause, Play, RotateCcw, Save } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import type { ZoneHeaderProps } from './types';

const ORDER_TONE = { BUY: 'success', SELL: 'danger', BOTH: 'primary' } as const;

export function ZoneHeader({
  zone,
  isActive,
  isGlobalRunning,
  modified,
  disableButtons,
  engineState,
  remotePaused,
  onToggleActive,
  onRestart,
  onDelete,
  onSave,
  saving,
}: ZoneHeaderProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  let btnClass = '';
  let btnText = '';
  let btnIcon = <Play size={13} fill="currentColor" />;
  let dotTone: 'success' | 'warning' | 'neutral' = 'neutral';

  if (isGlobalRunning) {
    if (isActive) {
      btnClass = 'border-success/40 bg-success/10 text-success hover:bg-success/20';
      btnText = t('zone.header.started');
      btnIcon = <Pause size={13} fill="currentColor" />;
      dotTone = 'success';
    } else {
      btnClass = 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20';
      btnText = t('zone.header.start');
      btnIcon = <Play size={13} fill="currentColor" />;
    }
  } else {
    if (isActive) {
      btnClass = 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20';
      btnText = t('zone.header.ready');
      btnIcon = <Pause size={13} fill="currentColor" />;
      dotTone = 'warning';
    } else {
      btnClass = 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground';
      btnText = t('zone.header.off');
      btnIcon = <Play size={13} fill="currentColor" />;
    }
  }

  // Bölge ayarlarda açık ama motor onu durdurmuş olabilir:
  // AUTO_CLEAR = fiyat bölgeden çıktı ve temizlendi; PAUSE = üst üste reddedilen emirler.
  // Uzaktan (telefon) durdurma tüm motoru etkiler; burada yeniden başlatılamaz.
  const engineStop =
    isGlobalRunning && isActive
      ? remotePaused
        ? {
            label: t('zone.stop.remote.label'),
            hint: t('zone.stop.remote.hint'),
            canRestart: false,
          }
        : engineState === 'AUTO_CLEAR'
          ? {
              label: t('zone.stop.autoClear.label'),
              hint: t('zone.stop.autoClear.hint'),
              canRestart: true,
            }
          : engineState === 'PAUSE'
            ? {
                label: t('zone.stop.pause.label'),
                hint: t('zone.stop.pause.hint'),
                canRestart: true,
              }
            : null
      : null;

  if (engineStop) {
    btnClass = 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20';
    btnText = engineStop.canRestart ? t('zone.header.restart') : t('zone.header.stopped');
    btnIcon = <RotateCcw size={13} />;
    dotTone = 'warning';
  }

  const handleMainClick = () => {
    if (engineStop?.canRestart) onRestart(zone.id);
    else if (!engineStop) onToggleActive(zone.id, isActive);
  };

  const tone = ORDER_TONE[zone.order_type as keyof typeof ORDER_TONE] ?? 'neutral';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot tone={dotTone} pulse={dotTone === 'success'} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-base font-semibold tracking-tight text-foreground">
              {zone.symbol || '—'}
            </span>
            <Badge tone={tone}>{zone.order_type}</Badge>
            {modified && <Badge tone="warning">{t('zone.header.unsaved')}</Badge>}
            {engineStop && (
              <Badge tone="warning" title={engineStop.hint}>
                {engineStop.label}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {zone.min_price} – {zone.max_price}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={handleMainClick}
          disabled={Boolean(engineStop && !engineStop.canRestart)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
            btnClass,
          )}
          title={engineStop ? engineStop.hint : t('zone.header.manage')}
        >
          {btnIcon}
          <span>{btnText}</span>
        </button>
        <Button
          size="sm"
          variant={modified ? 'primary' : 'secondary'}
          onClick={onSave}
          loading={saving}
          disabled={!modified}
          title={t('zone.header.saveOnly')}
          data-testid="zone-save"
        >
          {!saving && <Save size={13} />}
          {t('common.save')}
        </Button>
        <Link
          href={`/chart?zone=${zone.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-accent active:scale-[0.97]"
          title={t('zone.header.testTitle')}
        >
          <FlaskConical size={13} />
          {t('zone.header.test')}
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label={t('zone.header.menu')}
          >
            <MoreHorizontal size={16} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-popover p-1 shadow-xl shadow-black/10 dark:shadow-black/50"
              >
                <button
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                  disabled={disableButtons}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                  <span>{t('zone.header.delete')}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
