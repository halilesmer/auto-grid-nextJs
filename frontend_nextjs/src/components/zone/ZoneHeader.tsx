'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FlaskConical, MoreHorizontal, Trash2, Pause, Play, RotateCcw, Save, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useT, type MessageKey } from '@/i18n';
import { useAccountStore } from '@/store';
import { useBacktestHandoffStore } from '@/store/useBacktestHandoffStore';
import type { ZoneHeaderProps } from './types';
import { useSymbolLogs } from './SymbolLogs';

const ORDER_TONE = { BUY: 'success', SELL: 'danger', BOTH: 'primary' } as const;
const ORDER_HINT: Record<keyof typeof ORDER_TONE, MessageKey> = {
  BUY: 'zone.header.badge.buy.hint',
  SELL: 'zone.header.badge.sell.hint',
  BOTH: 'zone.header.badge.both.hint',
};

function engineStopReason({
  remotePaused,
  engineState,
}: {
  remotePaused: ZoneHeaderProps['remotePaused'];
  engineState: ZoneHeaderProps['engineState'];
}) {
  if (remotePaused) return 'remote' as const;
  if (engineState === 'AUTO_CLEAR') return 'autoClear' as const;
  if (engineState === 'PAUSE') return 'pause' as const;
  return null;
}

const TEST_LINK_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-accent active:scale-[0.97]';

export function ZoneHeader({
  zone,
  title,
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
  // Backtest-Seite mit Konto und Zone; der Klick übergibt eine Kopie der Zone mit ungespeicherten Änderungen (BKT-06)
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const backtestHref = `/backtest?${new URLSearchParams({ ...(selectedAccount ? { account: selectedAccount } : {}), zone: zone.id })}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const symbolLogs = useSymbolLogs();

  // Nur ein einfacher Klick öffnet die Seite im selben Tab; Strg/Cmd-Klick lässt eine Übergabe liegen
  const onTestClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (plain && selectedAccount) {
      useBacktestHandoffStore.getState().setHandoff({ accountId: selectedAccount, zoneId: zone.id, zone, unsaved: modified, at: Date.now() });
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
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
  const stopReason = isGlobalRunning && isActive ? engineStopReason({ remotePaused, engineState }) : null;
  const engineStop = stopReason && {
    label: t(`zone.stop.${stopReason}.label`),
    hint: t(`zone.stop.${stopReason}.hint`),
    canRestart: stopReason !== 'remote',
  };

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
    // Telefon: 1. satır nokta · başlık · ⋯, 2. satır motor butonu + Kaydet; masaüstünde tek satır (ZON-20, UI-08)
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
        <StatusDot tone={dotTone} pulse={dotTone === 'success'} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-foreground">{title}</span>
            <Badge tone={tone} hint={t(ORDER_HINT[zone.order_type as keyof typeof ORDER_HINT] ?? ORDER_HINT.BOTH)}>
              {zone.order_type}
            </Badge>
            {modified && (
              <Badge tone="warning" hint={t('zone.header.unsaved.hint')}>
                {t('zone.header.unsaved')}
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
        </div>
      </div>

      {/* flex-wrap: bei 375 px ist die Gruppe breiter als die Karte (DE noch mehr) und bricht um statt zu überlaufen */}
      <div className="order-3 flex w-full flex-wrap items-center gap-1.5 sm:order-2 sm:w-auto">
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
        <Tooltip content={t('zone.header.test.hint')} className="hidden sm:inline-flex">
          <Link href={backtestHref} onClick={onTestClick} className={TEST_LINK_CLASS}>
            <FlaskConical size={13} />
            {t('zone.header.test')}
          </Link>
        </Tooltip>
      </div>
      <div className="relative order-2 sm:order-3" ref={menuRef}>
          <Tooltip content={t('zone.header.menu.hint')}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              data-zone-menu-trigger
              aria-haspopup="menu"
              aria-expanded={menuOpen}
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
                {/* 640 px altında „Test“ im Kopf fehlt: erster Menüpunkt */}
                <Tooltip content={t('zone.header.test.hint')} className="w-full sm:hidden">
                  <Link
                    href={backtestHref}
                    onClick={(e) => {
                      onTestClick(e);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                  >
                    <FlaskConical size={14} />
                    <span>{t('zone.header.test')}</span>
                  </Link>
                </Tooltip>
                {symbolLogs && (
                  <Tooltip content={t('zone.logs.toggle.hint')} className="w-full">
                    <button
                      onClick={() => {
                        symbolLogs.show(zone.id);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                    >
                      <ScrollText size={14} />
                      <span>{t('zone.logs.toggle')}</span>
                    </button>
                  </Tooltip>
                )}
                <div role="separator" className="my-1 h-px bg-border" />
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
  );
}
