'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { MAX_TOTAL_BARS, type MissingRange } from '@/lib/analysis/candles';

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
  calendar = false,
  scroll = false,
  allHistory = false,
  limit = false,
  chip = false,
}: {
  missing: MissingRange[];
  clipped: boolean;
  dbFull: boolean;
  loadedFrom: number | null;
  /** W1 oder MN: die fehlenden Bereiche sind D1-Lücken, der Chart zeichnet keine Lückenplätze */
  calendar?: boolean;
  /** Serbest kip: ältere Kerzen werden beim Scrollen nach links geladen (1107-A4); der Hinweis „gekürzt“ sagt das */
  scroll?: boolean;
  /** „Alles“ gewählt: bis zum Beginn der MT5-Historie (nur mit scroll) */
  allHistory?: boolean;
  /** Gesamtgrenze MAX_TOTAL_BARS erreicht (nur mit scroll): bleibt stehen */
  limit?: boolean;
  /** Der Hinweis „gekürzt“ ist ein Einzeilen-Chip; ein Klick öffnet den ganzen Text (1107-A21.12). Warnungen bleiben ganz sichtbar */
  chip?: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  if (missing.length === 0 && !clipped && !dbFull && !limit) return null;
  const scrollText = allHistory ? 'analysis.data.scroll.textAll' : 'analysis.data.scroll.text';
  const clippedText = scroll ? scrollText : 'analysis.data.clipped.text';
  return (
    <div className="space-y-2" data-testid="data-quality">
      {missing.length > 0 && (
        <Alert tone="warning" title={t('analysis.data.missing.title', { n: missing.length })}>
          <p>{t(calendar ? 'analysis.data.missing.textCalendar' : 'analysis.data.missing.text')}</p>
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
      {clipped && loadedFrom !== null && chip && <ClippedChip title={t(scroll ? 'analysis.data.scroll.title' : 'analysis.data.clipped.title')} text={t(clippedText, { from: fmt.mt5DateTime(loadedFrom) })} />}
      {clipped && loadedFrom !== null && !chip && (
        <Alert tone="info" title={t(scroll ? 'analysis.data.scroll.title' : 'analysis.data.clipped.title')}>
          {t(clippedText, { from: fmt.mt5DateTime(loadedFrom) })}
        </Alert>
      )}
      {limit && loadedFrom !== null && (
        <Alert tone="warning" title={t('analysis.data.limit.title')}>
          {t('analysis.data.limit.text', { from: fmt.mt5DateTime(loadedFrom), max: fmt.number(MAX_TOTAL_BARS) })}
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

/** Einzeiliger Chip links oben auf dem Chart; Klick/Tipp öffnet den vollen Text, Escape schließt (1107-A21.12) */
function ClippedChip({ title, text }: { title: string; text: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', away); };
  }, [open]);
  return (
    <div ref={box} className="pointer-events-none flex max-w-full flex-col items-start gap-1" data-testid="data-quality-chip-box">
      <Button size="xs" variant="outline" className="pointer-events-auto max-w-[10.5rem] bg-background/95 text-info sm:max-w-xs" hint={t('analysis.data.chip.hint')} aria-expanded={open} data-testid="data-quality-chip" onClick={() => setOpen(!open)}>
        <Info size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{title}</span>
      </Button>
      {open && (
        <div data-testid="data-quality-chip-text" className="pointer-events-auto w-full max-w-md">
          <Alert tone="info" title={title}>{text}</Alert>
        </div>
      )}
    </div>
  );
}
