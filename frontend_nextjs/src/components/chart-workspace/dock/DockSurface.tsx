'use client';

import { Fragment, useEffect, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { TOOLBAR_GROUPS, type ToolbarGroupId } from '@/lib/chart-workspace/toolbar';
import { DockPackage } from './DockPackage';
import { DockRow } from './DockRow';
import { useDock } from './DockProvider';

interface Props {
  host: RefObject<HTMLDivElement | null>;
  symbol: string;
  /** Her paketin düğmeleri; null olan paket gösterilmez (ör. Görünüm, gezinme kapalı ve Formation modu değilken). */
  groups: Record<ToolbarGroupId, ReactNode | null>;
  /** Taşıma yalnız grafik sayfasının yüzen düzeninde (overlayLayout); değilse eski düz çubuk. */
  movable: boolean;
  /** Alt çubuk (paketleri varken): ChartWorkspace yüksekliğini grafiğin altından ayırır (--workspace-card). */
  bottomRef: (el: HTMLDivElement | null) => void;
}

/**
 * ChartWorkspace'in paket yüzeyi (UI-17): dört araç grubu paket olur (DockPackage), alt çubuk ve serbest alan burada durur.
 * Satır 1 başlıktadır (FormationToolbar, ChartTopBar); paketleri DockProvider oraya taşır.
 */
export function DockSurface({ host, symbol, groups, movable, bottomRef }: Props) {
  const dock = useDock();
  const registerChart = dock?.registerChart;
  // useEffect: üst öğenin ref'i alt öğelerin yerleşim efektinden sonra bağlanır
  useEffect(() => {
    const el = host.current;
    if (!movable || !el || !registerChart) return;
    registerChart(el);
    return () => registerChart(null);
  }, [movable, host, registerChart]);

  if (!movable || !dock) return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-2 py-1.5" data-testid="workspace-toolbar">
      <span className="min-w-0 truncate text-xs font-medium">{symbol}</span>
      <div className="flex flex-wrap items-center gap-1">{TOOLBAR_GROUPS.map(id => <Fragment key={id}>{groups[id]}</Fragment>)}</div>
    </div>
  );
  const showBottom = dock.hasIn('bottom') || dock.dragging;
  return <>
    {TOOLBAR_GROUPS.filter(id => groups[id] != null).map(id => <DockPackage key={id} id={id}>{groups[id]}</DockPackage>)}
    {showBottom && (
      <div ref={bottomRef} data-dock-card data-strip="bottom" data-testid="workspace-toolbar"
        className={cn('pointer-events-auto absolute bottom-8 left-[60px] right-20 z-[53] flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 shadow-lg data-[target=true]:bg-primary/10', dock.phone && 'flex-wrap')}>
        <span className="max-w-[30%] shrink-0 truncate text-xs font-medium">{symbol}</span>
        <DockRow zone="bottom" className="outline-none" />
      </div>
    )}
    {dock.dragging && <div aria-hidden="true" data-dock-free-hint className="pointer-events-none absolute inset-y-0 left-[52px] right-0 z-[52] rounded-lg bg-primary/5 opacity-0 outline-2 -outline-offset-4 outline-dashed outline-primary/50 transition-opacity data-[target=true]:opacity-100" />}
  </>;
}
