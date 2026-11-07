'use client';

import { useEffect, useState } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';
import { useFormat, useT } from '@/i18n';
import { MAX_TOTAL_BARS, type OlderEdge } from '@/lib/analysis/candles';
import { cn } from '@/lib/utils';
import type { ChartBinding } from '@/components/chart-workspace/runtime';

const EDGE_KEYS = {
  loading: 'analysis.chart.edge.loading',
  range: 'analysis.chart.edge.rangeStart',
  history: 'analysis.chart.edge.historyStart',
  limit: 'analysis.chart.edge.limit',
} as const;
const HINT_KEYS = {
  loading: 'analysis.chart.edge.loading.hint',
  range: 'analysis.chart.edge.rangeStart.hint',
  history: 'analysis.chart.edge.historyStart.hint',
  limit: 'analysis.chart.edge.limit.hint',
} as const;

/**
 * Sol kenar göstergesi (1107-A4, S0.2): yüklenirken sol kenarda ince bir şerit, aralığın / geçmişin başında ilk mumun
 * solunda kesik çizgi, sol üstte tıklanmayan bir hap. Hap ve çizgi yalnız ilk mum görünürken çıkar; uyarı kutusu
 * (DataQualityBanner) bunun yanında kalıcıdır. Etkileşimsiz: ipucu ekran okuyucu için gizli metin olarak durur.
 */
export function OlderEdgeMark({ binding, state, firstTime }: { binding: ChartBinding | null; state: 'loading' | OlderEdge; firstTime: number | null }) {
  const t = useT();
  const fmt = useFormat();
  // Ilk mumun x konumu (yatay eksen); null = ilk mum görünmüyor
  const [x, setX] = useState<number | null>(null);
  useEffect(() => {
    if (!binding || binding.isDisposed() || firstTime === null) return;
    const scale = binding.chart.timeScale();
    const update = () => {
      const px = scale.timeToCoordinate(firstTime as UTCTimestamp);
      setX(px !== null && px >= 0 ? Math.round(px) : null);
    };
    update();
    scale.subscribeVisibleLogicalRangeChange(update);
    scale.subscribeSizeChange(update);
    return () => {
      try {
        scale.unsubscribeVisibleLogicalRangeChange(update);
        scale.unsubscribeSizeChange(update);
      } catch { /* Chart schon entfernt */ }
    };
  }, [binding, firstTime, state]);

  const loading = state === 'loading';
  // Bitiş durumlarında ilk mum görünmüyorsa gösterge de yok
  if (!loading && x === null) return null;
  const from = firstTime === null ? '' : fmt.mt5DateTime(firstTime);
  const key = EDGE_KEYS[state];
  const text = t(key, { from, max: fmt.number(MAX_TOTAL_BARS) });
  const hint = t(HINT_KEYS[state], { max: fmt.number(MAX_TOTAL_BARS) });
  const tone = state === 'limit' ? 'warning' : 'info';
  return (
    <>
      {loading && <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] animate-pulse bg-info motion-reduce:animate-none" data-testid="older-loading-strip" />}
      {!loading && x !== null && (
        <div
          className={cn('pointer-events-none absolute inset-y-0 z-10 border-l border-dashed', tone === 'warning' ? 'border-warning/70' : 'border-info/70')}
          style={{ left: x }}
          data-testid="older-edge-line"
        />
      )}
      <div
        role="status"
        className={cn(
          'pointer-events-none absolute left-2 top-2 z-10 rounded-full border bg-card/90 px-2.5 py-0.5 text-xs font-medium',
          tone === 'warning' ? 'border-warning/40 text-warning' : 'border-info/40 text-info',
        )}
        data-testid="older-edge"
        data-state={state}
      >
        {text}
        <span className="sr-only"> — {hint}</span>
      </div>
    </>
  );
}
