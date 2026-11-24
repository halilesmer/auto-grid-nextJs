/**
 * Laufender harmonischer Handel, dessen X das Verlaufsfenster verlässt (FRM-07, FRM-39, 1114-A4 Schritt 2b): das Fenster gilt für einen laufenden
 * Handel ab seinem Einstieg (1122-A1.4 a). Der Handel bleibt, bis er endet; sein Ende zeigt sich einmal.
 *
 * Fall (echte XAUUSD-Kerzen, nur M15 geladen, Chart-Standard-Trendzug, Fenster wie die Suche es zu jedem Zeitpunkt lädt: `formationRequests`,
 * `ratesWindow`): Butterfly und Crab Verkauf auf derselben Basis X 2026-10-29 23:00, A 10-30 22:45, B 11-02 18:30, C 11-03 11:00. Einstieg BUT 4080.33
 * (Kerze 11-05 03:00), CRB 4135.07 (Kerze 11-05 04:00), beide Stand TP1. Das M15-Fenster (10 Tage) beginnt um 11-09 00:00 nach X. Vorher verschwanden
 * beide Handel um 11-09 00:00, mit allen Kerzen geladen ebenso: `historicBases` nahm nur Basen mit X im Fenster.
 * Danach: BUT endet zum Schluss 11-09 02:45 (Breakeven), CRB zum Schluss 11-09 22:00 (Breakeven).
 */
import { expect, test } from '@playwright/test';
import { ratesWindow, TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { pastRequestEnd } from '../../src/lib/formation/asOf';
import { analyzeBut } from '../../src/lib/formation/butChecks';
import { analyzeCrb } from '../../src/lib/formation/crbChecks';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS, HISTORY_DAYS } from '../../src/lib/formation/params';
import { formationRequests } from '../../src/lib/formation/requests';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { XAUUSD_M15_1019_1109 } from '../fixtures/formation-harmonic-x-window-xau-rows';

const frm = (title: string, fn: () => void) => test(title, { tag: ['@FRM-07', '@FRM-39'] }, fn);

const M15 = TIMEFRAME_SEC.M15;
const DAY = 86400;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 16);
const bars: FormationBar[] = XAUUSD_M15_1019_1109.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const opts = { trend: DEFAULT_TREND_SETTINGS };

/** Kontext wie die Suche ihn zu `t` lädt: M15-Anfrage aus `formationRequests` (Fenster plus Vorlauf), hizalt mit `ratesWindow` */
const chartCtx = (t: number) => {
  const r = formationRequests('', 'XAUUSD', pastRequestEnd(t)).M15;
  const win = ratesWindow(r.from, r.to, M15);
  return new FormationContext('XAUUSD', { M15: { bars: bars.filter((b) => b.time >= win.from && b.time < win.to), missing: [] } }, opts);
};

const X = at('2026-10-29T23:00');
const C = at('2026-11-03T11:00');
/** Stand des Handels auf der Basis des Falls, null wenn die Suche einen anderen Kandidaten zeigt */
const tradeOf = (c: Candidate) =>
  c.side === 'sell' && c.points.X?.time === X && c.points.C?.time === C && c.trade?.entry != null && c.trade.status !== undefined
    ? { entry: c.trade.entry, status: c.trade.status.kind, ended: c.trade.status.endIdx !== undefined }
    : null;

const CASES = [
  { form: 'BUT', analyze: analyzeBut, entry: 4080.33, end: at('2026-11-09T02:45') },
  { form: 'CRB', analyze: analyzeCrb, entry: 4135.07, end: at('2026-11-09T22:00') },
] as const;

const FROM = at('2026-11-06T20:00');
const TO = at('2026-11-09T23:00');

test.describe('Laufender Harmonischer: X verlässt das Verlaufsfenster, der Einstieg nicht (1114-A4, 1122-A1.4 a)', () => {
  for (const { form, analyze, entry, end } of CASES) {
    frm(`${form} Verkauf XAUUSD M15 (Einstieg ${entry}): läuft weiter, nachdem X das Fenster verließ, und zeigt sein Ende einmal`, () => {
      test.setTimeout(300_000);
      const wrong: string[] = [];
      let outsideX = 0;
      for (let t = FROM; t <= TO; t += M15) {
        // Wochenende: keine neue Kerze, gleiche Lage
        if (!bars.some((b) => b.time + M15 === t)) continue;
        if (X < t - HISTORY_DAYS.M15 * DAY) outsideX++;
        const own = tradeOf(analyze(chartCtx(t), t).find((a) => a.tf === 'M15')!.candidate);
        if (t < end) {
          if (!own || own.ended) wrong.push(`${iso(t)} fehlt`);
          else expect(own.entry).toBeCloseTo(entry, 6);
        } else if (t === end) {
          if (!own || !own.ended || own.status !== 'breakeven') wrong.push(`${iso(t)} Ende nicht gezeigt (${own?.status ?? 'fehlt'})`);
        } else if (own) wrong.push(`${iso(t)} nach dem Ende noch da`);
      }
      // Abdeckung: der Lauf prüft Zeitpunkte mit X vor dem Fenster
      expect(outsideX, 'Zeitpunkte mit X vor dem Verlaufsfenster').toBeGreaterThan(0);
      expect(wrong, 'Zeitpunkte mit falschem Stand').toEqual([]);
    });
  }
});
