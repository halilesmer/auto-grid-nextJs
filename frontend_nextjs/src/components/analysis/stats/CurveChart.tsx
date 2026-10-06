'use client';

import { useEffect, useRef, useState } from 'react';
import { BaselineSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { readChartColors, withAlpha, type ChartColors } from '@/lib/chartTheme';
import type { CurvePoint } from '@/lib/analysis/curves';
import { useThemeStore } from '@/store';

/**
 * Eine Linie (MT5-Zeit, als UTC gezeichnet) mit Grundlinie: über `base` Gewinnfarbe, darunter Verlustfarbe.
 * Farben aus den Theme-Tokens, bei Theme-Wechsel neu gesetzt.
 */
export function CurveChart({ points, base, testId }: { points: CurvePoint[]; base: number; testId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [colors, setColors] = useState<ChartColors | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 11,
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScroll: false,
      handleScale: false,
    });
    seriesRef.current = chart.addSeries(BaselineSeries, { lineWidth: 2, priceLineVisible: false });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setColors(readChartColors()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!colors) return;
    chartRef.current?.applyOptions({
      layout: { textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
    seriesRef.current?.applyOptions({
      topLineColor: colors.up,
      topFillColor1: withAlpha(colors.up, 0.25),
      topFillColor2: withAlpha(colors.up, 0.02),
      bottomLineColor: colors.down,
      bottomFillColor1: withAlpha(colors.down, 0.02),
      bottomFillColor2: withAlpha(colors.down, 0.25),
    });
  }, [colors]);

  useEffect(() => {
    seriesRef.current?.applyOptions({ baseValue: { type: 'price', price: base } });
    seriesRef.current?.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    chartRef.current?.timeScale().fitContent();
  }, [points, base]);

  // Der TradingView-Link im Chart (Lizenzhinweis) ist kein eigenes Bedienelement
  return <div ref={ref} className="h-56 w-full" data-tooltip-exempt data-testid={testId} data-points={points.length} />;
}
