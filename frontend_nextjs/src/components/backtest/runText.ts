'use client';

import { useFormat, useT, type MessageKey, type Params } from '@/i18n';
import { tr } from '@/i18n/messages';

/** Werte dieser Namen sind MT5-Zeit (Sekunden) und werden als Datum und Uhrzeit gezeigt */
const TIME_KEYS = new Set(['time', 'from', 'to']);

/** Kennungen aus MT5 (Ticket, Rückgabecode …) bleiben ohne Tausenderpunkte, damit sie zum MT5-Journal passen */
const ID_KEYS = new Set(['ticket', 'retcode', 'status', 'magic']);

type Raw = Record<string, unknown> | undefined;

/**
 * Texte für Meldungen des Laufs: `code` + Werte (lib/backtest) → Satz in der Sprache der Seite. Ein Code ohne Text
 * erscheint mit seinen Werten, nie leer; der Test backtest-page.spec.ts hält die Texte vollständig.
 */
export function useRunText() {
  const t = useT();
  const fmt = useFormat();

  function text(key: string, raw: Raw): string | null {
    if (!(key in tr)) return null;
    return t(key as MessageKey, toParams(raw));
  }

  function formatValue(name: string, value: unknown): string | number {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return t(value ? 'backtest.log.bool.true' : 'backtest.log.bool.false');
    if (Array.isArray(value)) return value.map((v) => formatValue(name, v)).join(name === 'fields' ? ', ' : ' → ');
    if (typeof value === 'number' && ID_KEYS.has(name)) return String(value);
    if (typeof value === 'number') return TIME_KEYS.has(name) ? fmt.mt5DateTime(value) : fmt.number(value, { maximumFractionDigits: 8 });
    if (name === 'reason' && `analysis.data.reason.${String(value)}` in tr) return t(`analysis.data.reason.${String(value)}` as MessageKey);
    return String(value);
  }

  function toParams(raw: Raw): Params {
    return Object.fromEntries(Object.entries(raw ?? {}).map(([name, value]) => [name, formatValue(name, value)]));
  }

  const details = (raw: Raw) => Object.entries(toParams(raw)).map(([name, value]) => `${name}=${value}`).join(' ');

  return {
    /** Satz zu einer Zeile des Laufprotokolls */
    log: (code: string, raw: Raw) => text(`backtest.log.${code}`, raw) ?? t('backtest.log.unknown', { code, details: details(raw) }),
    /** Satz zu einem Abbruchgrund */
    error: (code: string, raw: Raw) => text(`backtest.error.${code}`, raw) ?? t('backtest.error.unknown', { code, details: details(raw) }),
    time: (sec: number) => fmt.mt5DateTime(sec),
  };
}
