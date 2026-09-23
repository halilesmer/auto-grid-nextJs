'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, BarChart3, FlaskConical, Radio, ShieldCheck } from 'lucide-react';

import ChartViewer from '@/components/ChartViewer';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';

function Placeholder({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} actions={<Badge>Yakında</Badge>} />
      <p className="px-5 pb-6 pt-4 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </Card>
  );
}

export default function ChartPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      {/* Header with Back Button */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            title="Ana Sayfaya Dön"
          >
            <ArrowLeft size={14} />
            Ana Sayfaya Dön
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Grafik ve İstatistikler
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Canlı fiyat, indikatörler ve performans metrikleri</p>
        </div>
        <Badge tone="success">
          <Radio size={12} />
          Live Data Stream
        </Badge>
      </header>

      {/* Main Grid Layout - Expandable for future panels */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Chart Section (2/3 width) */}
        <div className="space-y-5 lg:col-span-2">
          <div className="min-h-125">
            <ChartViewer />
          </div>

          {/* Future: Statistics Panel Placeholder */}
          <div className="hidden lg:block">
            <Placeholder
              icon={<BarChart3 size={16} />}
              title="İstatistikler Paneli"
              text="Buraya backtest sonuçları, win/loss oranları, drawdown grafikleri eklenecek."
            />
          </div>
        </div>

        {/* Side Panel (1/3 width) - Future: Backtest & Demo Panels */}
        <div className="space-y-5 lg:col-span-1">
          <Placeholder
            icon={<FlaskConical size={16} />}
            title="Deneme / Backtest Paneli"
            text="Strateji testleri, parametre optimizasyonu ve simülasyon kontrolleri buraya eklenecek."
          />
          <Placeholder
            icon={<ShieldCheck size={16} />}
            title="Gelişmiş Analiz"
            text="Risk metrikleri, korelasyon analizi ve portföy performansı buraya eklenecek."
          />
        </div>
      </div>
    </div>
  );
}
