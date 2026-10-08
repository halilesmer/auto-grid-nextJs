'use client';

import { Suspense } from 'react';
import { BacktestView } from '@/components/backtest/BacktestView';

export default function BacktestPage() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <BacktestView />
    </Suspense>
  );
}
