'use client';

import Link from 'next/link';
import ChartViewer from '@/components/ChartViewer';
import { ArrowLeft, BarChart2 } from 'lucide-react';

export default function ChartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Back Button */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center space-x-2 text-gray-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/10 transition-all"
              title="Ana Sayfaya Dön"
            >
              <ArrowLeft size={20} />
              <span className="text-lg font-semibold hidden sm:inline">Ana Sayfaya Dön</span>
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                Grafik ve İstatistikler
              </h1>
              <p className="text-gray-500 mt-1">Canlı fiyat, indikatörler ve performans metrikleri</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <BarChart2 size={16} className="text-blue-400" />
            <span>Live Data Stream</span>
          </div>
        </header>

        {/* Main Grid Layout - Expandable for future panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart Section (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-2 min-h-[500px]">
              <ChartViewer />
            </div>

            {/* Future: Statistics Panel Placeholder */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 hidden lg:block">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-blue-400">📊</span>
                İstatistikler Paneli (Gelecek)
              </h3>
              <p className="text-gray-500 text-center py-8">
                Buraya backtest sonuçları, win/loss oranları, drawdown grafikleri eklenecek.
              </p>
            </div>
          </div>

          {/* Side Panel (1/3 width) - Future: Backtest & Demo Panels */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-emerald-400">🧪</span>
                Deneme / Backtest Paneli (Gelecek)
              </h3>
              <p className="text-gray-500 text-center py-8">
                Strateji testleri, parametre optimizasyonu ve simülasyon kontrolleri buraya eklenecek.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-purple-400">📈</span>
                Gelişmiş Analiz (Gelecek)
              </h3>
              <p className="text-gray-500 text-center py-8">
                Risk metrikleri, korelasyon analizi ve portföy performansı buraya eklenecek.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}