'use client';

import ChartViewer from '@/components/ChartViewer';

export default function FormasyonPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-black p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-purple-400 to-blue-400">
            Formasyon Grafiği
          </h1>
          <p className="text-gray-400 text-sm mt-1">Canlı fiyat grafiği ve teknik formasyon analizi</p>
        </header>
        <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-2 min-h-150">
          <ChartViewer />
        </div>
      </div>
    </div>
  );
}
