'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FlaskConical, MoreHorizontal, Trash2, Pause, Play, RotateCcw, Save } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useFormat, useT, type MessageKey } from '@/i18n';
import type { ZoneHeaderProps } from './types';

const ORDER_TONE = { BUY: 'success', SELL: 'danger', BOTH: 'primary' } as const;
const ORDER_HINT: Record<keyof typeof ORDER_TONE, MessageKey> = {
  BUY: 'zone.header.badge.buy.hint',
  SELL: 'zone.header.badge.sell.hint',
  BOTH: 'zone.header.badge.both.hint',
};

export function ZoneHeader({
  zone,
  isActive,
  isGlobalRunning,
  modified,
  disableButtons,
  engineState,
  remotePaused,
  price,
  priceDigits,
  marketOpen,
  onToggleActive,
  onRestart,
  onDelete,
  onSave,
  saving,
}: ZoneHeaderProps) {
  const t = useT();
  const fmt = useFormat();
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
  let btnHint = '';
  let btnIcon = <Play size={13} fill="currentColor" />;
  let dotTone: 'success' | 'warning' | 'neutral' = 'neutral';

  if (isGlobalRunning) {
    if (isActive) {
      btnClass = 'border-success/40 bg-success/10 text-success hover:bg-success/20';
      btnText = t('zone.header.started');
      btnHint = t('zone.header.started.hint');
      btnIcon = <Pause size={13} fill="currentColor" />;
      dotTone = 'success';
    } else {
      btnClass = 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20';
      btnText = t('zone.header.start');
      btnHint = t('zone.header.start.hint');
      btnIcon = <Play size={13} fill="currentColor" />;
    }
  } else {
    if (isActive) {
      btnClass = 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20';
      btnText = t('zone.header.ready');
      btnHint = t('zone.header.ready.hint');
      btnIcon = <Pause size={13} fill="currentColor" />;
      dotTone = 'warning';
    } else {
      btnClass = 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground';
      btnText = t('zone.header.off');
      btnHint = t('zone.header.off.hint');
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
    btnHint = engineStop.hint;
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
            <Badge tone={tone} hint={t(ORDER_HINT[zone.order_type as keyof typeof ORDER_HINT] ?? ORDER_HINT.BOTH)}>
              {zone.order_type}
            </Badge>
            {modified && (
              <Badge tone="warning" hint={t('zone.header.unsaved.hint')}>
                {t('zone.header.unsaved')}
              </Badge>
            )}
            {isGlobalRunning && isActive && marketOpen !== undefined && (
              <Badge
                tone={marketOpen ? 'success' : 'danger'}
                hint={t('zone.market.hint')}
                data-testid="zone-market"
              >
                {marketOpen ? t('zone.market.open') : t('zone.market.closed')}
              </Badge>
            )}
            {engineStop && (
              <Badge tone="warning" hint={engineStop.hint}>
                {engineStop.label}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {zone.min_price} – {zone.max_price}
          </p>
          <Tooltip content={t('zone.header.price.hint')}>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground" tabIndex={0}>
              {t('zone.header.price')}:{' '}
              <span data-testid="zone-price" className="text-foreground">
                {typeof price === 'number' && price > 0 ? fmt.price(price, priceDigits) : '--'}
              </span>
            </p>
          </Tooltip>
        </div>
      </div>

      {/* flex-wrap: bei 375 px ist die Gruppe breiter als die Karte (DE noch mehr) und bricht um statt zu überlaufen */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip content={btnHint}>
          <button
            onClick={handleMainClick}
            disabled={Boolean(engineStop && !engineStop.canRestart)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
              btnClass,
            )}
          >
            {btnIcon}
            <span>{btnText}</span>
          </button>
        </Tooltip>
        <Button
          size="sm"
          variant={modified ? 'primary' : 'secondary'}
          onClick={onSave}
          loading={saving}
          disabled={!modified}
          hint={modified ? t('zone.header.save.hint') : t('zone.header.save.off.hint')}
          data-testid="zone-save"
        >
          {!saving && <Save size={13} />}
          {t('common.save')}
        </Button>
        <Tooltip content={t('zone.header.test.hint')}>
          <Link
            href={`/chart?zone=${zone.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-accent active:scale-[0.97]"
          >
            <FlaskConical size={13} />
            {t('zone.header.test')}
          </Link>
        </Tooltip>
        <div className="relative" ref={menuRef}>
          <Tooltip content={t('zone.header.menu.hint')}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label={t('zone.header.menu')}
            >
              <MoreHorizontal size={16} />
            </button>
          </Tooltip>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-popover p-1 shadow-xl shadow-black/10 dark:shadow-black/50"
              >
                <Tooltip
                  content={disableButtons ? t('zone.header.delete.off.hint') : t('zone.header.delete.hint')}
                  className="w-full"
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
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
