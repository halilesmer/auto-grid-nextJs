'use client';

import { Alert } from '@/components/ui/alert';
import { useT } from '@/i18n';
import type { BrokerClockState } from '@/hooks/useBrokerClock';

/** UTC-Abstand wie üblich geschrieben: +3, −5, +5:30 */
export function formatOffset(offsetSec: number) {
  const minutes = Math.round(Math.abs(offsetSec) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${offsetSec < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/**
 * Pflicht-Hinweis (nicht abschaltbar): Ist die Brokeruhr unbekannt oder unsicher, können
 * „Heute“ und die Tagesgrenzen um Stunden verschoben sein.
 */
export function BrokerClockNotice({ state }: { state: BrokerClockState }) {
  const t = useT();
  if (state.loading) return null;
  if (!state.clock) {
    if (!state.error) return null;
    return (
      <Alert tone="warning" title={t('analysis.clock.unknown.title')}>
        {t('analysis.clock.unknown.text', { reason: state.error })}
      </Alert>
    );
  }
  if (state.clock.reliable) return null;
  return (
    <Alert tone="warning" title={t('analysis.clock.unsure.title')}>
      {t('analysis.clock.unsure.text')}
    </Alert>
  );
}
