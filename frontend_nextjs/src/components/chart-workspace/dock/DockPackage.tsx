'use client';

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpToLine, GripVertical, Move, RotateCcw, FoldHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useT, type MessageKey } from '@/i18n';
import type { PackageId } from '@/lib/chart-workspace/dock';
import { cn } from '@/lib/utils';
import { DockOverflow } from './DockOverflow';
import { useDock, type FitApi } from './DockProvider';

const subscribeNone = () => () => {};
const isKept = (el: HTMLElement) => el.hasAttribute('data-keep') || el.querySelector('[data-keep]') !== null;

/**
 * Ein Paket (UI-17): Tutamaç + Düğmeler. Kutu (`.dock-wrap`) bir kez kurulur ve DockProvider onu satırlar ve grafik arasında
 * taşır; içerik buraya portal edilir, bu yüzden durum, odak ve açık menüler taşınırken kalır. `children` paketin düğmeleridir
 * (her doğrudan çocuk bir öğe); sığmayan öğeler sondan başlayarak ok menüsüne girer, `data-keep` işaretli öğe ve ilk öğe girmez.
 */
export function DockPackage({ id, children }: { id: PackageId; children: ReactNode }) {
  const t = useT(), dock = useDock();
  // Kutu bir kez kurulur (istemcide); portal yalnız hidrasyondan sonra çizilir
  const mounted = useSyncExternalStore(subscribeNone, () => true, () => false);
  const [wrap] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'dock-wrap'; el.dataset.dockWrap = id;
    return el;
  });
  const content = useRef<HTMLDivElement>(null);
  const fit = useMemo<FitApi>(() => {
    const items = () => [...(content.current?.children ?? [])].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute('data-dock-more'));
    const more = () => content.current?.querySelector<HTMLElement>('[data-dock-more]');
    return {
      reset: () => { items().forEach(i => { i.hidden = false; }); const m = more(); if (m) m.hidden = true; },
      canHide: () => { const shown = items().filter(i => !i.hidden); return shown.length > 1 && shown.some(i => !isKept(i)); },
      hideNext: () => { const target = items().filter(i => !i.hidden && !isKept(i)).pop(); if (target) target.hidden = true; const m = more(); if (m) m.hidden = false; },
    };
  }, []);

  useLayoutEffect(() => () => wrap?.remove(), [wrap]);
  const register = dock?.registerPackage;
  useLayoutEffect(() => {
    if (!wrap || !register) return;
    register(id, wrap, fit);
    return () => register(id, null);
  }, [wrap, id, register, fit]);
  // İçerik her çizildiğinde (düğme eklendi, ad uzadı) sığdırma yeniden ölçer
  const refit = dock?.refit;
  useLayoutEffect(() => { refit?.(); });

  if (!dock || !wrap || !mounted) return null;
  const place = dock.placeOf(id), up = dock.menuUp(id), name = t(`cw.tbGroup.${id}` as MessageKey), info = dock.menuInfo(id);
  const item = (target: 'row1' | 'bottom' | 'free', icon: ReactNode, label: MessageKey, testId: string) => (
    <DropdownMenuItem icon={icon} hint={t(place === target ? 'cw.tbHere.hint' : `${label}.hint` as MessageKey)} disabled={place === target} data-testid={testId} onSelect={() => dock.act(id, target)}>{t(label)}</DropdownMenuItem>
  );
  const handleHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => dock.startDrag(id, e),
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => dock.moveDrag(e),
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => dock.endDrag(e, true),
    onPointerCancel: () => dock.endDrag(null, false),
    onLostPointerCapture: () => dock.endDrag(null, false),
    // Sürüklemenin ardından gelen tıklama menüyü açmasın
    onClickCapture: (e: React.MouseEvent) => { if (dock.consumeClick()) { e.stopPropagation(); e.preventDefault(); } },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => dock.keyDown(id, e),
  };
  return createPortal(
    <div role="group" aria-label={name} data-dock-pkg={id} data-zone={place} data-menu={up ? 'up' : 'down'}
      className={cn('group/tb flex min-w-0 items-center gap-0.5 rounded-[0.875rem] border border-transparent',
        place === 'free' && 'border-border bg-card p-px shadow-lg')}>
      {!dock.phone && (
        <DropdownMenu label={t('cw.tbHandle')} hint={t('cw.tbHandle.hint')} variant="ghost" size="icon-xs" side={up ? 'top' : 'bottom'} align="left" panelClassName="w-60"
          icon={<GripVertical size={14} aria-hidden="true" />}
          triggerProps={{ className: 'w-4 cursor-grab touch-none active:cursor-grabbing', 'data-dock-handle': id, 'data-testid': `dock-handle-${id}`, ...handleHandlers }}>
          <DropdownMenuGroup>
            {item('row1', <ArrowUpToLine className="size-4" aria-hidden="true" />, 'cw.tbMoveRow1', 'dock-move-row1')}
            {item('bottom', <ArrowDownToLine className="size-4" aria-hidden="true" />, 'cw.tbMoveBottom', 'dock-move-bottom')}
            {item('free', <Move className="size-4" aria-hidden="true" />, 'cw.tbMoveFree', 'dock-move-free')}
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<ArrowLeft className="size-4" aria-hidden="true" />} hint={t('cw.tbLeft.hint')} disabled={!info.canLeft} data-testid="dock-left" onSelect={() => dock.act(id, 'left')}>{t('cw.tbLeft')}</DropdownMenuItem>
            <DropdownMenuItem icon={<ArrowRight className="size-4" aria-hidden="true" />} hint={t('cw.tbRight.hint')} disabled={!info.canRight} data-testid="dock-right" onSelect={() => dock.act(id, 'right')}>{t('cw.tbRight')}</DropdownMenuItem>
            <DropdownMenuItem icon={<FoldHorizontal className="size-4" aria-hidden="true" />} hint={t('cw.tbPack.hint')} disabled={!info.canPack} data-testid="dock-pack" onSelect={() => dock.act(id, 'pack')}>{t('cw.tbPack')}</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<RotateCcw className="size-4" aria-hidden="true" />} hint={t(info.isDefault ? 'cw.tbReset.auto.hint' : 'cw.tbReset.hint')} disabled={info.isDefault} data-testid="dock-reset" onSelect={() => dock.act(id, 'reset')}>{t('cw.tbReset')}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenu>
      )}
      <div ref={content} className="flex min-w-0 items-center gap-0.5">
        {children}
        <DockOverflow content={content} up={up} label={name}>{children}</DockOverflow>
      </div>
    </div>, wrap,
  );
}
