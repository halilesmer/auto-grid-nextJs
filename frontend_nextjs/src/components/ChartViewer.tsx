'use client';
import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  LineSeries,
  CandlestickSeries,
  LineStyle,
  UTCTimestamp,
  IChartApi,
  IPriceLine,
  ISeriesApi,
} from 'lightweight-charts';
import { useAccountStore, useBotRuntimeStore, useSettingsStore, useThemeStore, useWebSocketManager } from '@/store';
import { getSymbolConfig } from '@/utils/zoneHelpers';
import type { ResolvedTheme } from '@/lib/theme';
import { CandlestickChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldLabel } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';

// Grafik sayfaları hesap seçilmeden de açılabilir; akış (/ws/stream) hesaba bağlı değil.
const CHART_STREAM_KEY = 'chart';
const BAR_SECONDS = 10;

// lightweight-charts renkleri JS ile verilir; Tailwind/CSS değişkenlerinden etkilenmez.
// Değerler globals.css'teki token'larla eşleşmeli.
const CHART_COLORS: Record<ResolvedTheme, {
  text: string; grid: string; border: string; crosshair: string; crosshairLabel: string;
  up: string; down: string; rsi: string;
}> = {
  dark: {
    text: '#8a8a8a',
    grid: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.06)',
    crosshair: 'rgba(231,138,83,0.4)',
    crosshairLabel: '#e78a53',
    up: '#34c38f',
    down: '#ef5b5b',
    rsi: '#6aa9c9',
  },
  light: {
    text: '#6a6a70',
    grid: 'rgba(0,0,0,0.05)',
    border: 'rgba(0,0,0,0.1)',
    crosshair: 'rgba(201,99,43,0.45)',
    crosshairLabel: '#c9632b',
    up: '#16895c',
    down: '#d93a3a',
    rsi: '#2f7aa3',
  },
};

/** Mum serisine çizilen yatay seviye (ör. bölgenin min/max fiyatı) */
export interface ChartPriceLine {
  price: number;
  title: string;
}

interface ChartViewerProps {
  priceLines?: ChartPriceLine[];
}

export default function ChartViewer({ priceLines }: ChartViewerProps = {}) {
  const t = useT();
  const fmt = useFormat();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const priceLineRefs = useRef<IPriceLine[]>([]);
  const metrics = useBotRuntimeStore((s) => s.metrics);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  // /chart ve /formasyon sayfalarında da canlı veri akışı açık olmalı
  useWebSocketManager(selectedAccount ?? CHART_STREAM_KEY);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 11,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      lineWidth: 2,
      priceScaleId: 'rsi',
    });
    
    chart.priceScale('rsi').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.3,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    rsiSeriesRef.current = rsiSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // Gelen METRICS verisinden 10 saniyelik mumlar oluştur (store split'inde kaybolmuştu)
    let currentBar = { time: 0 as UTCTimestamp, open: 0, high: 0, low: 0, close: 0 };
    const unsubscribe = useBotRuntimeStore.subscribe((state, prev) => {
      if (state.metrics === prev.metrics) return;
      const { price, rsi } = state.metrics;
      if (!Number.isFinite(price) || price <= 0) return;

      const time = Math.floor(Date.now() / 1000) as UTCTimestamp;
      if (currentBar.open === 0 || time - currentBar.time > BAR_SECONDS) {
        currentBar = { time, open: price, high: price, low: price, close: price };
      } else {
        currentBar = {
          ...currentBar,
          high: Math.max(currentBar.high, price),
          low: Math.min(currentBar.low, price),
          close: price,
        };
      }
      candleSeries.update(currentBar);

      // Worker RSI hesaplayamazsa null gönderebilir veya hiç göndermez (metrik yedeği)
      if (typeof rsi === 'number' && Number.isFinite(rsi)) {
        rsiSeries.update({ time, value: rsi });
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Renkler oluşturma efektinden sonra ve her tema değişiminde uygulanır (grafik yeniden yaratılmaz)
  useEffect(() => {
    const c = CHART_COLORS[resolvedTheme];
    chartRef.current?.applyOptions({
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: {
        vertLine: { color: c.crosshair, labelBackgroundColor: c.crosshairLabel },
        horzLine: { color: c.crosshair, labelBackgroundColor: c.crosshairLabel },
      },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: c.up,
      downColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
    });
    rsiSeriesRef.current?.applyOptions({ color: c.rsi });
  }, [resolvedTheme]);

  // Seviye çizgileri: değişince eskiler silinip yeniden çizilir (tema rengi dahil)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const color = CHART_COLORS[resolvedTheme].crosshairLabel;
    priceLineRefs.current = (priceLines ?? [])
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .map((l) =>
        series.createPriceLine({
          price: l.price,
          title: l.title,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
        }),
      );
    return () => {
      // Unmount'ta grafik (chart.remove) bu temizlikten önce kaldırılmış olabilir
      try {
        priceLineRefs.current.forEach((line) => series.removePriceLine(line));
      } catch {
        /* seri zaten yok edildi */
      }
      priceLineRefs.current = [];
    };
  }, [priceLines, resolvedTheme]);

  const profit = metrics.profit ?? 0;
  const priceDigits = metrics.symbol ? getSymbolConfig(metrics.symbol, symbolDetails).precision : undefined;
  const stats = [
    {
      id: 'price',
      label: t('chart.stat.price'),
      hint: t('chart.stat.price.hint'),
      value: typeof metrics.price === 'number' ? fmt.price(metrics.price, priceDigits) : '--',
      className: 'text-foreground',
    },
    {
      id: 'rsi',
      label: t('chart.stat.rsi'),
      hint: t('chart.stat.rsi.hint'),
      value: metrics.rsi ? fmt.number(metrics.rsi, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--',
      className: 'text-info',
    },
    {
      id: 'pl',
      label: t('chart.stat.pl'),
      hint: t('chart.stat.pl.hint'),
      value: fmt.money(profit),
      className: profit > 0 ? 'text-success' : profit < 0 ? 'text-danger' : 'text-foreground',
    },
    {
      id: 'positions',
      label: t('chart.stat.positions'),
      hint: t('chart.stat.positions.hint'),
      value: metrics.open_positions ?? 0,
      className: 'text-foreground',
    },
  ];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card/80 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <CandlestickChart size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">{t('chart.viewer.title')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('chart.viewer.subtitle', { seconds: BAR_SECONDS })}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              data-testid={`chart-stat-${s.id}`}
              className="rounded-md border border-border bg-muted/50 px-3 py-1.5"
            >
              <FieldLabel label={s.label} hint={s.hint} className="text-[11px] font-medium text-muted-foreground" />
              <div className={cn('font-mono text-sm font-semibold tabular-nums', s.className)}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-2">
        {/* Die TradingView-Namensnennung (Link) erzeugt lightweight-charts selbst */}
        <div ref={chartContainerRef} data-tooltip-exempt className="relative w-full" />
      </div>
    </div>
  );
}
