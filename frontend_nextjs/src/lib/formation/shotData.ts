import type { Locale, MessageKey } from '@/i18n';
import { ruleText } from './ruleTexts';
import type { ScanHit } from './scan';
import type { Check, RuleKind, Verdict } from './types';

export type ShotState = 'met' | 'unmet' | 'excluded' | 'clear' | 'unmeasurable';

export interface ShotRow {
  state: ShotState;
  text: string;
  stateLabel: string;
  value: string;
}

export interface ShotGroup {
  title: string;
  rows: ShotRow[];
}

/** Alles, was im Bild als Text steht; enthält bewusst weder Konto noch Verbindungsdaten. */
export interface ShotData {
  title: string;
  verdict: Verdict;
  verdictLabel: string;
  stamp: string;
  scores: string[];
  groups: ShotGroup[];
  footer: string;
  legend: { state: ShotState; label: string }[];
}

const GROUPS: RuleKind[] = ['required', 'bonus', 'exclusion'];

/** Wie in der Checkliste: Ausschlüsse sind Ereignisse, „erfüllt“ heißt, das Ereignis liegt vor. */
const rowState = (c: Check): ShotState => {
  if (c.state === 'unmeasurable') return 'unmeasurable';
  if (c.kind === 'exclusion') return c.state === 'met' ? 'excluded' : 'clear';
  return c.state;
};

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function buildShotData(input: {
  hit: ScanHit;
  symbol: string;
  stamp: string;
  locale: Locale;
  t: Translate;
  number: (value: number, opts?: Intl.NumberFormatOptions) => string;
}): ShotData {
  const { hit, symbol, stamp, locale, t, number } = input;
  const { candidate } = hit;
  const required = candidate.checks.filter((c) => c.kind === 'required');
  const bonus = candidate.checks.filter((c) => c.kind === 'bonus');
  const unmeasurable = required.filter((c) => c.state === 'unmeasurable').length;
  const form = t(`formation.form.${hit.form}` as MessageKey);
  const requiredScore = `${t('formation.score.required')} ${required.filter((c) => c.state === 'met').length}/${required.length}`;
  return {
    title: `${form} ${t(`formation.side.${candidate.side}` as MessageKey)} · ${symbol} · ${hit.tf}`,
    verdict: candidate.verdict,
    verdictLabel: t(`formation.verdict.${candidate.verdict}` as MessageKey),
    stamp,
    scores: [
      unmeasurable > 0 ? `${requiredScore} (${t('formation.score.unmeasurable', { n: unmeasurable })})` : requiredScore,
      `${t('formation.score.bonus')} ${bonus.filter((c) => c.state === 'met').length}/${bonus.length}`,
    ],
    groups: GROUPS.flatMap((kind) => {
      const rows = candidate.checks
        .filter((c) => c.kind === kind)
        .map((c) => {
          const state = rowState(c);
          return {
            state,
            text: ruleText(locale, c.id) ?? c.id,
            stateLabel: t(`formation.state.${state}` as MessageKey),
            value: c.value === undefined ? '' : number(c.value, { maximumFractionDigits: 3 }),
          };
        });
      return rows.length === 0 ? [] : [{ title: t(`formation.group.${kind}` as MessageKey), rows }];
    }),
    footer: `Grid Robot · ${t('formation.title')}`,
    legend: (['met', 'unmet', 'unmeasurable', 'excluded'] as const).map((state) => ({ state, label: t(`formation.state.${state}` as MessageKey) })),
  };
}

/** Dateiname ohne Kontoangaben: Formation, Symbol, Zeiteinheit und Scan-Zeitpunkt (MT5-Sekunden, wie UTC gerechnet). */
export function shotFileName(hit: ScanHit, symbol: string, scanAt: number): string {
  const [day, time] = new Date(scanAt * 1000).toISOString().slice(0, 16).split('T');
  const safe = symbol.replace(/[^A-Za-z0-9._-]/g, '_');
  return `formation-${hit.form}-${safe}-${hit.tf}-${day}_${time.replace(':', '')}.png`;
}
