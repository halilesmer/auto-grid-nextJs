'use client';

import { useEffect, useRef } from 'react';
import { ColorType, createChart, LineSeries, LineStyle, LineType, type UTCTimestamp } from 'lightweight-charts';
import { readChartColors } from '@/lib/chartTheme';
import type { CurvePoint } from '@/lib/analysis/curves';
import { useThemeStore } from '@/store';

export function EquityOverlay({ curves }: { curves: { id: string; label: string; color: string; points: CurvePoint[]; dashed?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useThemeStore((s) => s.resolvedTheme);
  useEffect(() => {
    if (!ref.current) return;
    const colors = readChartColors();
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      timeScale: { timeVisible: true, borderColor: colors.border },
      rightPriceScale: { borderColor: colors.border },
    });
    const themeStyle = getComputedStyle(document.documentElement);
    for (const curve of curves) {
      const token = /^var\((--[a-z0-9-]+)\)$/.exec(curve.color)?.[1];
      const color = token ? themeStyle.getPropertyValue(token).trim() || colors.primary : curve.color;
      const series = chart.addSeries(LineSeries, { title: curve.label, color, lineWidth: 2,
        lineStyle: curve.dashed ? LineStyle.Dashed : LineStyle.Solid, lineType: LineType.WithSteps, priceLineVisible: false });
      series.setData(curve.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [curves, theme]);
  return <div ref={ref} className="h-72 w-full" data-testid="bt-equity-overlay" data-tooltip-exempt />;
}
