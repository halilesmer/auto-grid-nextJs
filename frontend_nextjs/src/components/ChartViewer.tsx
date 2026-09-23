'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries, CandlestickSeries, UTCTimestamp, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useAccountStore, useBotRuntimeStore, useWebSocketManager } from '@/store';
import { CandlestickChart } from 'lucide-react';
import { cn } from '@/lib/utils';

// Grafik sayfaları hesap seçilmeden de açılabilir; akış (/ws/stream) hesaba bağlı değil.
const CHART_STREAM_KEY = 'chart';
const BAR_SECONDS = 10;

export default function ChartViewer() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const metrics = useBotRuntimeStore((s) => s.metrics);
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  // /chart ve /formasyon sayfalarında da canlı veri akışı açık olmalı
  useWebSocketManager(selectedAccount ?? CHART_STREAM_KEY);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8a8a8a',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(231,138,83,0.4)', labelBackgroundColor: '#e78a53' },
        horzLine: { color: 'rgba(231,138,83,0.4)', labelBackgroundColor: '#e78a53' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34c38f',
      downColor: '#ef5b5b',
      borderVisible: false,
      wickUpColor: '#34c38f',
      wickDownColor: '#ef5b5b',
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#6aa9c9',
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

      if (rsi !== undefined) {
        rsiSeries.update({ time, value: rsi });
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  const profit = metrics.profit ?? 0;
  const stats = [
    { label: 'Price', value: metrics.price ?? '--', className: 'text-foreground' },
    { label: 'RSI', value: metrics.rsi ? metrics.rsi.toFixed(2) : '--', className: 'text-info' },
    {
      label: 'P/L',
      value: `$${profit.toFixed(2)}`,
      className: profit > 0 ? 'text-success' : profit < 0 ? 'text-danger' : 'text-foreground',
    },
    { label: 'Positions', value: metrics.open_positions ?? 0, className: 'text-foreground' },
  ];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card/80 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <CandlestickChart size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Live Price & Indicators</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{BAR_SECONDS}s candles · RSI overlay</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-muted/50 px-3 py-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">{s.label}</div>
              <div className={cn('font-mono text-sm font-semibold tabular-nums', s.className)}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-2">
        <div ref={chartContainerRef} className="relative w-full" />
      </div>
    </div>
  );
}
