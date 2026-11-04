/**
 * Suche zu einem Zeitpunkt in der Vergangenheit (Plan A13.6, P1): Zeitpunkt aus der Adresse, Ende der Anfragen und kein Blick in die Zukunft.
 * FRM-38 Formation-Suche zu einem Zeitpunkt in der Vergangenheit
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { formatAt, parseAt, pastDayEnd, resolveAsOf, stepAsOf } from '../../src/lib/formation/asOf';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { formationRequests } from '../../src/lib/formation/requests';
import { scanFormations } from '../../src/lib/formation/scan';
import { splitDaily, weeklyFromDaily } from '../../src/lib/formation/weekly';
import type { FormationBar } from '../../src/lib/formation/types';
import { DAY_SEC, dayStart } from '../../src/lib/serverTime';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-38' }, fn);

const DAY = dayStart('2026-10-15');

frm('parseAt rundet auf 15 Minuten ab und weist ungültige Werte ab', () => {
  expect(parseAt('2026-10-15T14:30')).toBe(DAY + 14 * 3600 + 30 * 60);
  expect(parseAt('2026-10-15T14:44')).toBe(DAY + 14 * 3600 + 30 * 60);
  expect(parseAt('2026-10-15T14:45')).toBe(DAY + 14 * 3600 + 45 * 60);
  for (const bad of [null, undefined, '', 'x', '2026-10-15', '2026-10-15T24:00', '2026-10-15T14:60', '2026-02-30T10:00', '2026-10-15 14:30', '2026-10-15T14:30:00']) {
    expect(parseAt(bad)).toBeNull();
  }
});

frm('formatAt ist die Umkehr von parseAt', () => {
  expect(formatAt(DAY + 14 * 3600 + 30 * 60)).toBe('2026-10-15T14:30');
  expect(parseAt(formatAt(DAY + 3 * 900))).toBe(DAY + 3 * 900);
});

frm('resolveAsOf: ab dem Beginn der laufenden M15-Kerze gilt live', () => {
  const now = DAY + 14 * 3600 + 37 * 60; // laufende Kerze beginnt 14:30
  expect(resolveAsOf('2026-10-15T14:15', now)).toBe(DAY + 14 * 3600 + 15 * 60);
  expect(resolveAsOf('2026-10-15T14:30', now)).toBeNull();
  expect(resolveAsOf('2026-10-15T14:44', now)).toBeNull();
  expect(resolveAsOf('2026-10-16T09:00', now)).toBeNull();
  expect(resolveAsOf('kaputt', now)).toBeNull();
  expect(resolveAsOf('2026-10-15T14:30', null)).toBe(DAY + 14 * 3600 + 30 * 60);
});

frm('stepAsOf geht um eine Kerze der Zeiteinheit auf deren Raster', () => {
  const h4 = TIMEFRAME_SEC.H4;
  expect(stepAsOf(DAY + 8 * 3600, h4, 1)).toBe(DAY + 12 * 3600);
  expect(stepAsOf(DAY + 8 * 3600, h4, -1)).toBe(DAY + 4 * 3600);
  expect(stepAsOf(DAY + 9 * 3600 + 15 * 60, h4, -1)).toBe(DAY + 8 * 3600);
  expect(stepAsOf(DAY + 9 * 3600 + 15 * 60, h4, 1)).toBe(DAY + 12 * 3600);
});

frm('Anfragen enden bei at, splitDaily am Ende des Brokertags von at', () => {
  const at = DAY + 14 * 3600 + 30 * 60;
  const req = formationRequests('1', 'EURUSD', at);
  for (const tf of ['D1', 'H4', 'H1', 'M15'] as const) expect(req[tf].to).toBe(at);
  expect(pastDayEnd(at)).toBe(DAY + DAY_SEC);
  const bars: FormationBar[] = [-400, -399, 0].map((d) => ({ time: DAY + d * DAY_SEC, open: 1, high: 2, low: 0.5, close: 1.5 }));
  const { d1 } = splitDaily(bars, [], pastDayEnd(at));
  // D1-Ansicht: 400 Tage bis zum Ende des Brokertags von at; die Kerze 400 Tage davor fällt heraus
  expect(d1.bars.map((b) => b.time)).toEqual([DAY - 399 * DAY_SEC, DAY]);
});

/** Fixture-Kerzen der Zeiteinheit: nach `at` stehen noch Kerzen im Kontext (die „Zukunft“) */
const FX = 'e2e/fixtures/formation';
let withHits = 0;
let futureMatters = 0;
for (const file of readdirSync(FX).filter((f) => f.endsWith('.json')).sort()) {
  frm(`kein Blick in die Zukunft: Kontext mit Kerzen nach at = Kontext bei at geschnitten: ${file}`, () => {
    const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${file}`, 'utf-8')));
    const tfSec = TIMEFRAME_SEC[fx.timeframe];
    const last = fx.bars[fx.bars.length - 1].time;
    // Schnitt vor dem Ende: at liegt in der Mitte, die Kerzen danach sind die „Zukunft“
    const cut = Math.max(10, Math.floor(fx.bars.length * 0.75));
    const at = fx.bars[cut].time + tfSec; // Kerze cut ist bei at gerade geschlossen
    expect(at).toBeLessThanOrEqual(last + tfSec);
    const full: ContextInput = { [fx.timeframe]: fx.bars };
    const trimmed: ContextInput = { [fx.timeframe]: fx.bars.filter((b) => b.time + tfSec <= at) };
    const a = scanFormations(new FormationContext(fx.symbol, full), at);
    const b = scanFormations(new FormationContext(fx.symbol, trimmed), at);
    expect(a).toEqual(b);
    if (a.length > 0) withHits++;
    // `at` mitten in einer Kerze (M15-Raster): die angeschnittene, noch offene Kerze steckt im vollen Kontext und zählt nicht
    const mid = fx.bars[cut].time + tfSec / 4;
    const partial: ContextInput = { [fx.timeframe]: fx.bars.filter((bar) => bar.time + tfSec <= mid) };
    expect(scanFormations(new FormationContext(fx.symbol, full), mid)).toEqual(scanFormations(new FormationContext(fx.symbol, partial), mid));
    // Die Zukunft hätte etwas geändert: die Suche am Ende der Reihe ist eine andere
    if (JSON.stringify(a) !== JSON.stringify(scanFormations(new FormationContext(fx.symbol, full), last + tfSec))) futureMatters++;
  });
}

frm('die Fixture-Prüfung ist nicht leer: Treffer vorhanden und die Zukunft hätte sie verändert', () => {
  expect(withHits).toBeGreaterThan(0);
  expect(futureMatters).toBeGreaterThan(0);
});

frm('kein Blick in die Zukunft auch mit Zickzack nach at (alle Zeiteinheiten, W1)', () => {
  const daily: FormationBar[] = [];
  let pc = 100;
  for (let i = 0; i < 400; i++) {
    const c = pc * (1 + 0.02 * Math.sin(i / 3));
    const time = DAY - (400 - i) * DAY_SEC;
    daily.push({ time, open: pc, high: Math.max(pc, c) * 1.003, low: Math.min(pc, c) * 0.997, close: c });
    pc = c;
  }
  const at = daily[300].time + DAY_SEC;
  const closed = (bars: FormationBar[], sec: number) => bars.filter((b) => b.time + sec <= at);
  const full: ContextInput = { D1: daily, W1: weeklyFromDaily(daily) };
  const cutDaily = closed(daily, DAY_SEC);
  const cut: ContextInput = { D1: cutDaily, W1: weeklyFromDaily(cutDaily) };
  expect(scanFormations(new FormationContext('X', full), at)).toEqual(scanFormations(new FormationContext('X', cut), at));
});
