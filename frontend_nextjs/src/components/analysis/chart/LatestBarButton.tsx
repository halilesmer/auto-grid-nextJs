'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChartBinding } from '@/components/chart-workspace/runtime';

// Son mum bu kadar mumdan fazla sağda kaldıysa düğme çıkar (küçük kaymalarda titremesin)
const SHOW_AFTER_BARS = 3;
// `scrollToRealTime()` animasyonunun süresi (lightweight-charts 5.2.1, `DefaultAnimationDuration`)
const SCROLL_ANIMATION_MS = 400;
// Bu olaylar kullanıcının grafiği kendisinin oynattığını gösterir: o zaman son konum yazılmaz (grafiği kaydıran bir tuş yok)
const USER_INPUTS = ['pointerdown', 'wheel', 'touchstart'] as const;

/**
 * Son muma dön (1110-A1): grafik sola kaydırılıp son mum görünür alanın sağına taştığında, fiyat ekseninin solunda
 * yuvarlak bir ok düğmesi çıkar. Tıklayınca `scrollToRealTime()`: mum aralığı (yakınlaştırma) korunur; animasyon bitince son konum yazılır.
 */
export function LatestBarButton({ binding }: { binding: ChartBinding | null }) {
  const t = useT();
  const [away, setAway] = useState(false);
  const settle = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!binding || binding.isDisposed()) return;
    const scale = binding.chart.timeScale();
    // scrollPosition(): 0 = sağ kenarda, negatif = sola kaydırılmış (mum sayısı)
    const update = () => setAway(scale.scrollPosition() < -SHOW_AFTER_BARS);
    update();
    scale.subscribeVisibleLogicalRangeChange(update);
    return () => {
      settle.current?.();
      try { scale.unsubscribeVisibleLogicalRangeChange(update); } catch { /* Chart schon entfernt */ }
    };
  }, [binding]);

  // Kütüphanenin animasyonu her karede ara konumu yazar, süre dolduğu karede ise hedefi yazmaz: görünüm son karenin konumunda kalır.
  // Yük altında son kare erken kalırsa son mum birkaç mum geride durur ve düğme açık kalır (1116-A35, UI-26). Süre dolunca hedefi
  // biz yazarız; arada kullanıcı grafiği oynattıysa yazmayız.
  const scrollToLatest = () => {
    if (!binding || binding.isDisposed()) return;
    const scale = binding.chart.timeScale();
    settle.current?.();
    scale.scrollToRealTime();
    const cancel = () => {
      window.clearTimeout(timer);
      USER_INPUTS.forEach((name) => window.removeEventListener(name, cancel, true));
      if (settle.current === cancel) settle.current = null;
    };
    const timer = window.setTimeout(() => {
      cancel();
      if (!binding.isDisposed()) scale.scrollToPosition(scale.options().rightOffset, false);
    }, SCROLL_ANIMATION_MS);
    USER_INPUTS.forEach((name) => window.addEventListener(name, cancel, { capture: true, passive: true }));
    settle.current = cancel;
  };

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
      onClick={scrollToLatest}
    >
      <ChevronsRight className="size-4" aria-hidden="true" />
    </Button>
    </div>
  );
}
