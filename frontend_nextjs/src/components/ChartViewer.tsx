'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries, CandlestickSeries, UTCTimestamp } from 'lightweight-charts';
import { useBotStore } from '@/store/useBotStore';

export default function ChartViewer() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { metrics, updateMetrics } = useBotStore();
  const candleSeriesRef = useRef<any>(null);
  const rsiSeriesRef = useRef<any>(null);
  const chartRef = useRef<any>(null);

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
      color: '#a855f7', // purple-500
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

    const ws = new WebSocket('ws://localhost:8000/ws/stream');
    
    let currentBar = {
        time: 0 as UTCTimestamp,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'METRICS') {
        updateMetrics(data.payload);
        
        const price = data.payload.price;
        const time = Math.floor(Date.now() / 1000) as UTCTimestamp;
        
        if (currentBar.open === 0) {
            currentBar = { time, open: price, high: price, low: price, close: price };
        } else {
            if (time - currentBar.time > 10) {
                currentBar = { time, open: price, high: price, low: price, close: price };
            } else {
                currentBar.high = Math.max(currentBar.high, price);
                currentBar.low = Math.min(currentBar.low, price);
                currentBar.close = price;
            }
        }
        
        candleSeries.update(currentBar);

        if (data.payload.rsi !== undefined) {
          rsiSeries.update({ time, value: data.payload.rsi });
        }
      }
    };

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      chart.remove();
    };
  }, [updateMetrics]);

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
