'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IRange, LogicalRange } from 'lightweight-charts';
import { useFormat, useT } from '@/i18n';
import type { ChartGesture } from '@/lib/chart-workspace/toolbar';
import type { ChartBinding } from './runtime';

export interface ZoomSnapshot { logical: LogicalRange; price: IRange<number> | null; autoScale: boolean }
interface Point { x: number; y: number; logical: number; price: number }
export function ChartGestureLayer({ binding, mode, digits, finishZoom, cancel }: { binding: ChartBinding; mode: ChartGesture; digits: number | null; finishZoom: (previous: ZoomSnapshot) => void; cancel: () => void }) {
  const t = useT(), fmt = useFormat();
  const [rect, setRect] = useState<{ from: Point; to: Point } | null>(null);
  const from = useRef<Point | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setRect(null); from.current = null; cancel(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [cancel]);
  if (!mode || binding.isDisposed()) return null;
  const pane = binding.chart.paneSize(0), left = binding.chart.priceScale('left').width();
  const point = (event: React.PointerEvent<HTMLDivElement>): Point | null => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(pane.width, event.clientX - box.left)), y = Math.max(0, Math.min(pane.height, event.clientY - box.top));
    const logical = binding.chart.timeScale().coordinateToLogical(x), price = binding.candles.coordinateToPrice(y);
    return logical === null || price === null ? null : { x, y, logical, price };
  };
  return createPortal(<div ref={layer} tabIndex={0} role="application" aria-label={t(mode === 'measure' ? 'cw.rail.measure' : 'cw.rail.zoomArea')} data-testid="chart-gesture-layer" className="absolute z-30 touch-none cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ left, top: 0, width: pane.width, height: pane.height }}
    onPointerDown={event => { event.preventDefault(); event.stopPropagation(); const start = point(event); if (!start) return; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); from.current = start; setRect({ from: start, to: start }); }}
    onPointerMove={event => { if (!from.current) return; const to = point(event); if (to) setRect({ from: from.current, to }); }}
    onPointerCancel={() => { from.current = null; setRect(null); }}
    onPointerUp={event => {
      const start = from.current, to = point(event); from.current = null;
      if (!start || !to) return;
      setRect({ from: start, to });
      if (mode !== 'zoom' || Math.abs(to.x - start.x) < 5 || Math.abs(to.y - start.y) < 5) return;
      const scale = binding.chart.timeScale(), priceScale = binding.candles.priceScale(), logical = scale.getVisibleLogicalRange();
      if (!logical) return;
      const previous = { logical, price: priceScale.getVisibleRange(), autoScale: priceScale.options().autoScale };
      scale.setVisibleLogicalRange({ from: Math.min(start.logical, to.logical), to: Math.max(start.logical, to.logical) });
      priceScale.setAutoScale(false); priceScale.setVisibleRange({ from: Math.min(start.price, to.price), to: Math.max(start.price, to.price) });
      setRect(null); finishZoom(previous);
    }}>
    {rect && <div className="pointer-events-none absolute border border-primary bg-primary/10" data-testid="chart-measurement" style={{ left: Math.min(rect.from.x, rect.to.x), top: Math.min(rect.from.y, rect.to.y), width: Math.max(1, Math.abs(rect.to.x - rect.from.x)), height: Math.max(1, Math.abs(rect.to.y - rect.from.y)) }}>
      {mode === 'measure' && <output className="absolute left-0 top-0 max-w-[220px] rounded bg-popover px-2 py-1 text-xs text-foreground shadow" aria-live="polite">{t('cw.rail.measurement', { price: fmt.price(rect.to.price - rect.from.price, digits ?? 5), percent: fmt.number(rect.from.price ? 100 * (rect.to.price - rect.from.price) / rect.from.price : 0, { maximumFractionDigits: 2 }), bars: fmt.number(Math.abs(Math.round(rect.to.logical) - Math.round(rect.from.logical))) })}</output>}
    </div>}
  </div>, binding.host);
}
