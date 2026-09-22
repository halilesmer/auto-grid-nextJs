'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries, CandlestickSeries, UTCTimestamp, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useAccountStore, useBotRuntimeStore, useWebSocketManager } from '@/store';

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
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.1)' },
        horzLines: { color: 'rgba(255,255,255,0.1)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.1)',
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#a855f7',
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

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-xl shadow-xl flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white">Live Price & Indicators</h3>
        <div className="flex space-x-4 text-sm font-semibold">
          <div className="text-gray-300">Price: <span className="text-white">{metrics.price}</span></div>
          <div className="text-purple-400">RSI: {metrics.rsi ? metrics.rsi.toFixed(2) : '--'}</div>
          <div className={`text-${metrics.profit >= 0 ? 'green' : 'red'}-400`}>
            P/L: ${metrics.profit !== undefined ? metrics.profit.toFixed(2) : '0.00'}
          </div>
          <div className="text-blue-400">Positions: {metrics.open_positions !== undefined ? metrics.open_positions : 0}</div>
        </div>
      </div>
      <div ref={chartContainerRef} className="flex-1 w-full relative" />
    </div>
  );
}