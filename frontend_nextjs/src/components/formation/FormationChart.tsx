'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useFormat, useT } from '@/i18n';
import { readChartColors, type ChartColors } from '@/lib/chartTheme';
import type { FormationContext } from '@/lib/formation/context';
import { drawingPriceRange, layoutDrawings, type DrawingGroup, type Prim, type Tone } from '@/lib/formation/drawingLayout';
import { RSI_PARAMS } from '@/lib/formation/params';
import { FINAL_POINT, UPPER_TIMEFRAME, type ScanHit } from '@/lib/formation/scan';
import { captureChart, type ChartPicture } from '@/lib/formation/shotImage';
import { useThemeStore } from '@/store';
import { ChartWorkspace } from '@/components/chart-workspace/ChartWorkspace';
import { type ChartBinding, createChartBinding, appearanceColors, rememberChartView, restoreChartView } from '@/components/chart-workspace/runtime';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { ContextOverlays, useChartOverlays } from '@/components/chart-workspace/ContextOverlays';
import { workspaceKey } from '@/lib/chart-workspace/settings';

const TONE_COLOR: Record<Exclude<Tone, 'side'>, string> = {
  ratio: 'var(--secondary)',
  target: 'var(--warning)',
  zone: 'var(--info)',
  mark: 'var(--primary)',
  text: 'var(--foreground)',
};

const SIDE_COLOR = { buy: 'var(--success)', sell: 'var(--danger)' } as const;

const toneColor = (tone: Tone, side: 'buy' | 'sell'): string => (tone === 'side' ? SIDE_COLOR[side] : TONE_COLOR[tone]);

function PrimView({ prim, side }: { prim: Prim; side: 'buy' | 'sell' }) {
  const color = toneColor(prim.tone, side);
  switch (prim.kind) {
    case 'line': {
      let dash: string | undefined;
      if (prim.dashed) dash = '6 5';
      else if (prim.dotted) dash = '2 4';
      return (
        <>
          <line x1={prim.x1} y1={prim.y1} x2={prim.x2} y2={prim.y2} stroke={color} strokeWidth={prim.width ?? 1.4} strokeDasharray={dash} />
          <line x1={prim.x1} y1={prim.y1} x2={prim.x2} y2={prim.y2} stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }} />
        </>
      );
    }
    case 'rect':
      return (
        <rect
          x={prim.x}
          y={prim.y}
          width={prim.w}
          height={prim.h}
          fill={prim.tone === 'zone' || prim.tone === 'mark' ? color : 'none'}
          fillOpacity={prim.tone === 'mark' && prim.w <= 20 ? 0 : 0.16}
          stroke={color}
          strokeWidth={prim.w <= 20 ? 2 : 1}
          strokeDasharray={prim.dashed ? '4 3' : undefined}
          rx={prim.w <= 20 ? 3 : 0}
        />
      );
    case 'circle':
      return <circle cx={prim.x} cy={prim.y} r={prim.r} fill={prim.open ? 'none' : color} stroke={color} strokeWidth={2} />;
    case 'text':
      return (
        <text
          x={prim.x}
          y={prim.y}
          textAnchor={prim.anchor ?? 'start'}
          fill={color}
          stroke="var(--card)"
          strokeWidth={3}
          strokeLinejoin="round"
          paintOrder="stroke"
          fontSize={prim.bold ? 13 : 11}
          fontWeight={prim.bold ? 600 : 400}
        >
          {prim.text}
        </text>
      );
  }
}

interface Props {
  accountId: string;
  hit: ScanHit;
  context: FormationContext;
  scanAt: number;
  digits: number | null;
  /** Hervorgehobene Zeichnungen (Hover auf Zeile oder Zeichnung); null: alle gleich */
  active: readonly string[] | null;
  onActive: (ids: string[] | null) => void;
  /** Meldet die Aufnahme des gezeigten Charts (Kerzen samt Zeichnungen) oder null, wenn der Chart abgebaut wird */
  onCapture: (capture: (() => Promise<ChartPicture>) | null) => void;
}

/**
 * Kerzen und RSI(7) des gewählten Kandidaten mit den Zeichnungen der Erkennung als SVG-Overlay. Der Container
 * bildet einen eigenen Stapelkontext (die Canvases des Charts tragen z-index), das Overlay endet vor der Preisachse.
 */
export function FormationChart({ accountId, hit, context, scanAt, digits, active, onActive, onCapture }: Props) {
  const t = useT();
  const source = useConnectionStore(s => s.baseUrl);
  const [binding, setBinding] = useState<ChartBinding | null>(null);
  const { number } = useFormat();
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const boxRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const [colors, setColors] = useState<ChartColors | null>(null);
  const [overlay, setOverlay] = useState<{ width: number; height: number; left: number; priceHeight: number; groups: DrawingGroup[] }>({ width: 0, height: 0, left: 0, priceHeight: 0, groups: [] });
  const chartRef = useRef<{ chart: IChartApi; candles: ISeriesApi<'Candlestick'>; rsi: ISeriesApi<'Line'> } | null>(null);

  const contextKey = workspaceKey({ source, view: 'formation', account: accountId, symbol: context.symbol });
  const overlays = useChartOverlays(contextKey, { formations: true, rsi: true });
  const appearance = useChartWorkspaceStore(s => s.preview ?? s.appearance);
  const view = useMemo(() => context.view(hit.tf, scanAt), [context, hit.tf, scanAt]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setColors(readChartColors()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  // Chart und Overlay neu aufbauen, wenn Kandidat oder Kerzen wechseln
  useEffect(() => {
    const host = hostRef.current;
    const box = boxRef.current;
    if (!host || !box || !view || view.bars.length === 0) return;
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, fontSize: 11, panes: { separatorColor: 'transparent' } },
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const extra = drawingPriceRange(hit.candidate);
    const candles = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
      // Zonen und Level können außerhalb der Kerzen liegen: die Preisachse reicht bis zu ihnen
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: { above: number; below: number } } | null) => {
        const base = original();
        if (!base?.priceRange || !extra) return base;
        return { ...base, priceRange: { minValue: Math.min(base.priceRange.minValue, extra.min), maxValue: Math.max(base.priceRange.maxValue, extra.max) } };
      },
    });
    const reserveControls = () => candles.priceScale().applyOptions({
      scaleMargins: { top: box.clientWidth < 640 ? 0.4 : 0.3, bottom: 0.12 },
    });
    reserveControls();
    const rsi = chart.addSeries(LineSeries, { lineWidth: 1, priceLineVisible: false, lastValueVisible: true }, 1);
    const precision = digits ?? 5;
    candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
    candles.setData(view.bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })));
    rsi.setData(view.bars.flatMap((b, i) => (view.rsi[i] === null ? [] : [{ time: b.time as UTCTimestamp, value: view.rsi[i] as number }])));
    rsi.createPriceLine({ price: RSI_PARAMS.overbought, color: 'rgba(128,128,128,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
    rsi.createPriceLine({ price: RSI_PARAMS.oversold, color: 'rgba(128,128,128,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
    chart.panes()[0]?.setStretchFactor(5);
    chart.panes()[1]?.setStretchFactor(1);
    const attached = createChartBinding(chart, candles, host, () => ({ top: box.clientWidth < 640 ? .4 : .3, bottom: .12 }));
    const readyFrame = requestAnimationFrame(() => setBinding(attached));
    chartRef.current = { chart, candles, rsi };
    onCapture(() => captureChart({ chart, host, overlay: overlayRef.current }));

    const indexOf = new Map(view.bars.map((b, i) => [b.time, i]));
    // Die Ansicht hängt nicht vom Kandidaten ab: alle Kerzen oder der gespeicherte Zoom dieses Produkts
    restoreChartView(chart, view.bars.map((b) => b.time), useChartWorkspaceStore.getState().documents[contextKey]?.visibleTime);
    const forgetView = rememberChartView(chart, box, contextKey, () => view.bars.length);

    const lastBar = view.bars[view.bars.length - 1];
    const redraw = () => {
      const left = chart.priceScale('left').width();
      const width = box.clientWidth - left - chart.priceScale('right').width();
      const panes = chart.panes();
      const top = panes[0]?.getHeight() ?? 0;
      const rsiHeight = panes[1]?.getHeight() ?? 0;
      if (width <= 0 || top <= 0) return;
      const groups = layoutDrawings({
        candidate: hit.candidate,
        form: hit.form,
        width,
        lastBar: { time: lastBar.time, close: lastBar.close },
        x: (time) => {
          const i = indexOf.get(time);
          return i === undefined ? null : chart.timeScale().logicalToCoordinate(i as never);
        },
        y: (price) => candles.priceToCoordinate(price),
        yRsi: (value) => {
          const y = rsi.priceToCoordinate(value);
          return y === null ? null : top + y;
        },
        text: (key, params) => t(key as never, { tf: hit.tf, up: UPPER_TIMEFRAME[hit.tf], ...params }),
        fmt: (n) => number(n, { maximumFractionDigits: 3 }),
      });
      setOverlay({ width, left, height: top + rsiHeight, priceHeight: top, groups });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    chart.timeScale().subscribeSizeChange(redraw);
    let lastWidth = box.clientWidth;
    const observer = new ResizeObserver(() => {
      if (lastWidth !== box.clientWidth) {
        lastWidth = box.clientWidth;
        const settings = useChartWorkspaceStore.getState();
        if (!(settings.preview ?? settings.appearance).marginsSet) reserveControls();
      }
      redraw();
    });
    observer.observe(box);
    const pricePane = chart.panes()[0]?.getHTMLElement();
    if (pricePane) observer.observe(pricePane);
    let redrawFrame = 0;
    const frame = requestAnimationFrame(() => { redrawFrame = requestAnimationFrame(redraw); });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(redrawFrame);
      observer.disconnect();
      cancelAnimationFrame(readyFrame);
      forgetView();
      onCapture(null);
      attached.dispose?.();
      chart.remove();
      chartRef.current = null;
    };
  }, [view, hit, digits, t, number, onCapture, contextKey]);

  useEffect(() => {
    if (!colors || !chartRef.current) return;
    const { rsi } = chartRef.current;
    rsi.applyOptions({ color: colors.primary });
  }, [colors, view, hit]);

  useEffect(() => {
    if (!binding || binding.isDisposed() || !view) return;
    const c = appearanceColors(appearance);
    binding.candles.setData(view.bars.map((b, i) => {
      if (!appearance.previous || !i) return { ...b, time: b.time as UTCTimestamp };
      const up = b.close >= view.bars[i - 1].close;
      let color = up ? c.up : c.down; if (!appearance.body) color = 'transparent';
      return { ...b, time: b.time as UTCTimestamp, color, borderColor: up ? c.borderUp : c.borderDown, wickColor: up ? c.wickUp : c.wickDown };
    }));
    chartRef.current?.rsi.applyOptions({ visible: overlays.rsi });
  }, [binding, view, appearance, overlays.rsi]);

  const activeSet = active ? new Set(active) : null;
  const finalName = FINAL_POINT[hit.form];
  return (
    <ChartWorkspace context={{ key: contextKey, symbol: context.symbol, view: 'formation', systemRsi: true, syncIdentity: { source, account: accountId, symbol: context.symbol } }} overlays={<ContextOverlays contextKey={contextKey} values={overlays} options={[
      { key: 'formations', label: 'cw.overlayFormations', hint: 'cw.overlayFormations.hint' },
      { key: 'rsi', label: 'formation.legend.rsi', hint: 'cw.systemRsi.hint' },
    ]} />} binding={binding} bars={view?.bars ?? []} missing={[]} timeframeSec={({ D1: 86400, H4: 14400, H1: 3600, M15: 900 }[hit.tf])} digits={digits} until={scanAt} overlayLayout className="absolute inset-0">
    <div
      ref={boxRef}
      data-testid="formation-chart"
      data-final-point={hit.candidate.points[finalName] ? 'done' : 'open'}
      className="absolute inset-y-0 left-[52px] right-0 isolate overflow-hidden bg-card"
    >
      <div ref={hostRef} tabIndex={0} aria-label={t('cw.canvas')} className="absolute inset-0" />
      <svg
        ref={overlayRef}
        data-testid="formation-overlay"
        className="absolute left-0 top-0 z-10 overflow-hidden"
        width={overlay.width}
        height={overlay.height}
        style={{ pointerEvents: 'none', left: overlay.left, display: overlays.formations ? undefined : 'none' }}
        aria-hidden="true"
      >
        <defs>
          {/* Zeichnungen im Kerzen-Pane enden an dessen Rand: ein Preis außerhalb der Ansicht läuft nicht in den RSI-Pane */}
          <clipPath id="formation-price-clip">
            <rect x={0} y={0} width={overlay.width} height={overlay.priceHeight} />
          </clipPath>
        </defs>
        {overlay.groups.map((g) => (
          <g
            key={g.id}
            clipPath={g.pane === 'price' ? 'url(#formation-price-clip)' : undefined}
            data-drawing={g.id}
            data-active={activeSet?.has(g.id) ? 'true' : 'false'}
            opacity={activeSet && !activeSet.has(g.id) ? 0.2 : 1}
            style={{ transition: 'opacity .15s' }}
            onMouseEnter={() => onActive([g.id])}
            onMouseLeave={() => onActive(null)}
          >
            {g.prims.map((p, i) => (
              <PrimView key={i} prim={p} side={hit.candidate.side} />
            ))}
          </g>
        ))}
      </svg>
    </div>
    </ChartWorkspace>
  );
}
