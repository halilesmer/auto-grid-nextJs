/**
 * Anfang des Suchfensters (FRM-38, 1114-A4): der Trendzug beginnt an der ersten geladenen Kerze. Rückt der Anfang des Fensters weiter, darf
 * sich im Verlaufsfenster (`HISTORY_DAYS`) nichts ändern; sonst zeichnet der Trend Wendepunkte neu und ein laufender Handel verschwindet.
 *
 * Fall (echte XAUUSD-Kerzen, nur M15 geladen, Chart-Standard-Trendzug): AB=CD Kauf, A 09-22 03:00, B 09-22 11:30, C 09-22 13:30, Einstieg
 * 4249.36 in der Kerze 09-24 13:30, Stand TP1. Mit dem Fenster, das die Suche zu jedem Zeitpunkt lädt (`formationRequests`, `ratesWindow`),
 * verschwand der Handel am 09-26 15:00 (Samstag: keine neue Kerze, nur der Fensteranfang rückt weiter). Mit allen Kerzen geladen bleibt er.
 * Ursache: ohne Vorlauf beginnt der Zug im Fenster; die Wendepunkte am Anfang und ihre Art hängen davon ab, wo das Fenster beginnt.
 */
import { expect, test } from '@playwright/test';
import { ratesWindow, TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { pastRequestEnd } from '../../src/lib/formation/asOf';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import { FormationContext } from '../../src/lib/formation/context';
import { HISTORY_DAYS } from '../../src/lib/formation/params';
import { buildEnvWithoutZones } from '../../src/lib/formation/reasons';
import { formationRequests } from '../../src/lib/formation/requests';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { XAUUSD_M15_0907_0928 } from '../fixtures/formation-window-start-xau-rows';
import { CHART_TREND_HL2 } from '../fixtures/formation-trend';

const frm = (title: string, fn: () => void) => test(title, { tag: ['@FRM-38', '@FRM-05'] }, fn);

const M15 = TIMEFRAME_SEC.M15;
const DAY = 86400;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 16);
const bars: FormationBar[] = XAUUSD_M15_0907_0928.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const opts = { trend: CHART_TREND_HL2 };

/** Kontext wie die Suche ihn zu `t` lädt: M15-Anfrage aus `formationRequests`, hizalt mit `ratesWindow` (wie `useMarketRates`) */
const chartCtx = (t: number) => {
  const r = formationRequests('', 'XAUUSD', pastRequestEnd(t)).M15;
  const win = ratesWindow(r.from, r.to, M15);
  return new FormationContext('XAUUSD', { M15: { bars: bars.filter((b) => b.time >= win.from && b.time < win.to), missing: [] } }, opts);
};
/** Kontext mit allen Kerzen der Reihe: fester Anfang */
const allCtx = new FormationContext('XAUUSD', { M15: { bars, missing: [] } }, opts);

const shownIn = (ctx: FormationContext, t: number) => analyzeAbcd(ctx, t).find((a) => a.tf === 'M15')!.candidate;
const tradeOf = (c: Candidate) =>
  c.side === 'buy' && c.points.A?.time === at('2026-09-22T03:00') && c.points.C?.time === at('2026-09-22T13:30') && c.trade?.entry != null && c.trade.status !== undefined
    ? { entry: c.trade.entry, status: c.trade.status.kind, ended: c.trade.status.endIdx !== undefined }
    : null;

/** Wendepunkte des M15-Zugs im Verlaufsfenster zu `t`, dazu die zwei davor (der Punkt vor X gehört zur Basis eines Harmonischen) */
const windowPivots = (ctx: FormationContext, t: number) => {
  const env = buildEnvWithoutZones(ctx, t, 'M15')!;
  const view = env.views.get('M15')!.bars;
  const pivots = env.trends.get('M15')!.pivots;
  const first = pivots.findIndex((p) => view[p.idx].time >= t - HISTORY_DAYS.M15 * DAY);
  return pivots.slice(Math.max(0, (first < 0 ? pivots.length : first) - 2)).map((p) => `${iso(view[p.idx].time)} ${p.side} ${p.kind} ${p.price}`);
};

const FROM = at('2026-09-25T20:00');
const TO = at('2026-09-28T03:00');

test.describe('Suchfenster: der Anfang des Fensters ändert nichts im Verlaufsfenster (1114-A4)', () => {
  frm('AB=CD Kauf XAUUSD M15 (Einstieg 09-24 13:30): der laufende Handel bleibt, wenn der Fensteranfang weiterrückt', () => {
    test.setTimeout(120_000);
    const missing: string[] = [];
    const missingAll: string[] = [];
    // alle drei Stunden (vorher fehlte der Handel ab 09-26 14:30 bis zum Ende der Reihe)
    for (let t = FROM; t <= TO; t += 12 * M15) {
      const own = tradeOf(shownIn(chartCtx(t), t));
      const all = tradeOf(shownIn(allCtx, t));
      // Vorbedingung: mit allen Kerzen geladen läuft der Handel durch (TP1, nicht beendet); es ist ein Fenstereffekt
      if (!all || all.ended || all.status !== 'tp1') missingAll.push(iso(t));
      if (!own || own.ended) missing.push(iso(t));
      else expect(own.entry).toBeCloseTo(4249.36, 6);
    }
    expect(missingAll).toEqual([]);
    expect(missing, 'Zeitpunkte, an denen der laufende Handel im Fenster der Suche fehlt').toEqual([]);
  });

  frm('Wendepunkte des M15-Zugs im Verlaufsfenster sind dieselben wie mit allen Kerzen geladen', () => {
    test.setTimeout(120_000);
    const differ: string[] = [];
    for (let t = FROM; t <= TO; t += 4 * M15) {
      if (JSON.stringify(windowPivots(chartCtx(t), t)) !== JSON.stringify(windowPivots(allCtx, t))) differ.push(iso(t));
    }
    expect(differ, 'Zeitpunkte mit anderen Wendepunkten im Verlaufsfenster').toEqual([]);
  });
});
