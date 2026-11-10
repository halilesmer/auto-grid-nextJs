'use client';

import { useEffect, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChartBinding } from '@/components/chart-workspace/runtime';

// Son mum bu kadar mumdan fazla sağda kaldıysa düğme çıkar (küçük kaymalarda titremesin)
const SHOW_AFTER_BARS = 3;

/**
 * Son muma dön (1110-A1): grafik sola kaydırılıp son mum görünür alanın sağına taştığında, fiyat ekseninin solunda
 * yuvarlak bir ok düğmesi çıkar. Tıklayınca `scrollToRealTime()`: mum aralığı (yakınlaştırma) korunur.
 */
export function LatestBarButton({ binding }: { binding: ChartBinding | null }) {
  const t = useT();
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!binding || binding.isDisposed()) return;
    const scale = binding.chart.timeScale();
    // scrollPosition(): 0 = sağ kenarda, negatif = sola kaydırılmış (mum sayısı)
    const update = () => setAway(scale.scrollPosition() < -SHOW_AFTER_BARS);
    update();
    scale.subscribeVisibleLogicalRangeChange(update);
    return () => {
      try { scale.unsubscribeVisibleLogicalRangeChange(update); } catch { /* Chart schon entfernt */ }
    };
  }, [binding]);

  return (
    <div className={cn('absolute bottom-24 right-20 z-[54] transition-opacity motion-reduce:transition-none', !away && 'pointer-events-none opacity-0')}>
    <Button
      variant="outline"
      size="icon-sm"
      hint={t('analysis.chart.latest.hint')}
      aria-label={t('analysis.chart.latest')}
      aria-hidden={!away}
      tabIndex={away ? 0 : -1}
      className="rounded-full bg-card/90 shadow-md"
      data-testid="chart-latest-bar"
      onClick={() => { if (binding && !binding.isDisposed()) binding.chart.timeScale().scrollToRealTime(); }}
    >
      <ChevronsRight className="size-4" aria-hidden="true" />
    </Button>
    </div>
  );
}
