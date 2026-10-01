'use client';

import { Alert } from '@/components/ui/alert';
import { useFormat, useT, type MessageKey } from '@/i18n';
import type { MissingRange } from '@/lib/analysis/candles';

const REASON_KEYS: Record<string, MessageKey> = {
  unavailable: 'analysis.data.reason.unavailable',
  error: 'analysis.data.reason.error',
  busy: 'analysis.data.reason.busy',
  invalid: 'analysis.data.reason.invalid',
};
/** So viele Bereiche werden einzeln genannt, der Rest gezählt */
const LISTED = 5;

/**
 * Pflicht-Hinweis zur Datenqualität (ohne Schalter, docs/analyse-regeln.md §3): welche Teilbereiche
 * fehlen, warum und wann zuletzt geprüft wurde; dazu gekürzter Zeitraum und volle Datenbank.
 */
export function DataQualityBanner({
  missing,
  clipped,
  dbFull,
  loadedFrom,
}: {
  missing: MissingRange[];
  clipped: boolean;
  dbFull: boolean;
  loadedFrom: number | null;
}) {
  const t = useT();
  const fmt = useFormat();
  if (missing.length === 0 && !clipped && !dbFull) return null;
  return (
    <div className="space-y-2" data-testid="data-quality">
      {missing.length > 0 && (
        <Alert tone="warning" title={t('analysis.data.missing.title', { n: missing.length })}>
          <p>{t('analysis.data.missing.text')}</p>
          <ul className="mt-1.5 space-y-0.5 font-mono text-xs tabular-nums" data-testid="missing-ranges">
            {missing.slice(0, LISTED).map((m) => (
              <li key={`${m.from}-${m.to}-${m.reason}`}>
                {fmt.mt5DateTime(m.from)} – {fmt.mt5DateTime(m.to)} · {t(REASON_KEYS[m.reason] ?? 'analysis.data.reason.other')}
                {m.checked_at ? ` · ${t('analysis.data.checked', { at: fmt.dateTime(m.checked_at * 1000) })}` : ''}
              </li>
            ))}
            {missing.length > LISTED && <li>{t('analysis.data.more', { n: missing.length - LISTED })}</li>}
          </ul>
        </Alert>
      )}
      {clipped && loadedFrom !== null && (
        <Alert tone="info" title={t('analysis.data.clipped.title')}>
          {t('analysis.data.clipped.text', { from: fmt.mt5DateTime(loadedFrom) })}
        </Alert>
      )}
      {dbFull && (
        <Alert tone="warning" title={t('analysis.data.dbFull.title')}>
          {t('analysis.data.dbFull.text')}
        </Alert>
      )}
    </div>
  );
}
