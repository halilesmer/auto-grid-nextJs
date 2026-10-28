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
import { layoutDrawings, type DrawingGroup, type Prim, type Tone } from '@/lib/formation/drawingLayout';
import { RSI_PARAMS } from '@/lib/formation/params';
import { FINAL_POINT, UPPER_TIMEFRAME, type ScanHit } from '@/lib/formation/scan';
import { useThemeStore } from '@/store';

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
  hit: ScanHit;
  context: FormationContext;
  scanAt: number;
  digits: number | null;
  /** Hervorgehobene Zeichnungen (Hover auf Zeile oder Zeichnung); null: alle gleich */
  active: readonly string[] | null;
  onActive: (ids: string[] | null) => void;
}

/**
 * Kerzen und RSI(7) des gewählten Kandidaten mit den Zeichnungen der Erkennung als SVG-Overlay. Der Container
 * bildet einen eigenen Stapelkontext (die Canvases des Charts tragen z-index), das Overlay endet vor der Preisachse.
 */
export function FormationChart({ hit, context, scanAt, digits, active, onActive }: Props) {
  const t = useT();
  const { number } = useFormat();
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const boxRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<ChartColors | null>(null);
  const [overlay, setOverlay] = useState<{ width: number; height: number; groups: DrawingGroup[] }>({ width: 0, height: 0, groups: [] });
  const chartRef = useRef<{ chart: IChartApi; candles: ISeriesApi<'Candlestick'>; rsi: ISeriesApi<'Line'> } | null>(null);

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
    const candles = chart.addSeries(CandlestickSeries, { borderVisible: false });
    const rsi = chart.addSeries(LineSeries, { lineWidth: 1, priceLineVisible: false, lastValueVisible: true }, 1);
    const precision = digits ?? 5;
    candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
    candles.setData(view.bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })));
    rsi.setData(view.bars.flatMap((b, i) => (view.rsi[i] === null ? [] : [{ time: b.time as UTCTimestamp, value: view.rsi[i] as number }])));
    rsi.createPriceLine({ price: RSI_PARAMS.overbought, color: 'rgba(128,128,128,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
    rsi.createPriceLine({ price: RSI_PARAMS.oversold, color: 'rgba(128,128,128,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
    chart.panes()[0]?.setStretchFactor(3);
    chart.panes()[1]?.setStretchFactor(1);
    chartRef.current = { chart, candles, rsi };

    const indexOf = new Map(view.bars.map((b, i) => [b.time, i]));
    const first = Math.min(...Object.values(hit.candidate.points).map((p) => indexOf.get(p.time) ?? view.bars.length - 1));
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, first - 12), to: view.bars.length - 1 + 6 });

    const lastBar = view.bars[view.bars.length - 1];
    const redraw = () => {
      const width = box.clientWidth - chart.priceScale('right').width();
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
      setOverlay({ width, height: top + rsiHeight, groups });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    chart.timeScale().subscribeSizeChange(redraw);
    const observer = new ResizeObserver(redraw);
    observer.observe(box);
    const frame = requestAnimationFrame(() => requestAnimationFrame(redraw));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [view, hit, digits, t, number]);

  useEffect(() => {
    if (!colors || !chartRef.current) return;
    const { chart, candles, rsi } = chartRef.current;
    chart.applyOptions({
      layout: { textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
    candles.applyOptions({ upColor: colors.up, downColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down });
    rsi.applyOptions({ color: colors.primary });
  }, [colors, view, hit]);

  const activeSet = active ? new Set(active) : null;
  const finalName = FINAL_POINT[hit.form];
  return (
    <div
      ref={boxRef}
      data-testid="formation-chart"
      data-final-point={hit.candidate.points[finalName] ? 'done' : 'open'}
      className="relative isolate h-[460px] overflow-hidden rounded-lg bg-card"
    >
      <div ref={hostRef} className="absolute inset-0" />
      <svg
        data-testid="formation-overlay"
        className="absolute left-0 top-0 z-10 overflow-hidden"
        width={overlay.width}
        height={overlay.height}
        style={{ pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {overlay.groups.map((g) => (
          <g
            key={g.id}
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
  );
}
