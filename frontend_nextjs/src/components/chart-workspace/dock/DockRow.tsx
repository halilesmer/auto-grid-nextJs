'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useDock, type DockRowZone } from './DockProvider';

/**
 * Bir satırın paket bölgesi (UI-17). Boş bir kutudur; paket kutularını DockProvider kayıtlı sırayla içine koyar ve `margin-left` ile
 * boşluk verir. Satırda paket yokken gizlidir, sürüklerken bırakma yeri olarak görünür. Satır 1 başlıkta kalan genişliği kaplar
 * (FormationToolbar, ChartTopBar), alt çubuk `DockSurface`'in kartındadır. Provider yoksa hiçbir şey çizmez.
 */
export function DockRow({ zone, className }: { zone: DockRowZone; className?: string }) {
  const dock = useDock();
  const register = dock?.registerRow;
  const ref = useCallback((el: HTMLDivElement | null) => register?.(zone, el), [register, zone]);
  if (!dock) return null;
  const show = dock.hasIn(zone) || dock.dragging;
  // Telefon: sabit düzen, satır kırılır (A1.5)
  return (
    <div ref={ref} data-dock-row={zone} data-testid={`dock-row-${zone}`}
      className={cn('dock-row pointer-events-auto flex min-h-7 min-w-0 flex-1 basis-0 items-center gap-0.5 rounded-lg', dock.phone && 'flex-wrap', zone === 'row1' && 'min-w-[7rem]', !show && 'hidden',
        dock.dragging && 'outline-2 -outline-offset-1 outline-dashed outline-primary/50 data-[target=true]:bg-primary/10', className)} />
  );
}
