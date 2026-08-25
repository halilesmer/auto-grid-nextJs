'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries, UTCTimestamp } from 'lightweight-charts';
import { useBotStore } from '@/store/useBotStore';

export default function ChartViewer() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { metrics, updateMetrics } = useBotStore();
  const lineSeriesRef = useRef<any>(null);
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
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
    });
    
    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // WebSocket connection for real-time data
    const ws = new WebSocket('ws://localhost:8000/ws/stream');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'METRICS') {
        updateMetrics(data.payload);
        
        // Update chart (simulating time with simple incremental counter or timestamp)
        const time = Math.floor(Date.now() / 1000) as UTCTimestamp;
        lineSeries.update({ time, value: data.payload.price });
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
        <h3 className="text-xl font-bold text-white">Live Price & Metrics</h3>
        <div className="flex space-x-4 text-sm font-semibold">
          <div className="text-gray-300">Price: <span className="text-white">{metrics.price}</span></div>
          <div className={`text-${metrics.profit >= 0 ? 'green' : 'red'}-400`}>
            P/L: ${metrics.profit.toFixed(2)}
          </div>
          <div className="text-blue-400">Positions: {metrics.open_positions}</div>
        </div>
      </div>
      <div ref={chartContainerRef} className="flex-1 w-full relative" />
    </div>
  );
}
