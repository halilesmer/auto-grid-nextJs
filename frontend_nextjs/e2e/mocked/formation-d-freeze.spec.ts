/**
 * D friert am Ende des Handels ein und die Formationen zeichnen eine Einstiegslinie (Plan 1124-A2.1 und 1124-F2.6).
 * Endet der Handel (Stop, Rest am Einstieg, TP2), gilt als D der äußerste Docht bis einschließlich der Endkerze; spätere Kerzen ändern D und alles,
 * was an D hängt (BUT-07-Wert, RSI, Divergenz, Takviyeler), nicht mehr. Läuft der Handel noch, folgt D weiter dem äußersten Docht.
 * Die Einstiegslinie steht am Einstiegspreis des Handelsblocks, von der Einstiegskerze bis zum rechten Rand, wie die Stop-Linie.
 * Kerzen sind Zeilen [Open, High, Low, Close]; Reihen sind Kauf-Reihen, `go` spiegelt sie für den Verkauf.
 * FRM-50 D am Ende des Handels eingefroren, Einstiegslinie
 */
import { expect, test } from '@playwright/test';
import { checkGarCandidate } from '../../src/lib/formation/garChecks';
import { checkBatCandidate } from '../../src/lib/formation/batChecks';
import { checkButCandidate } from '../../src/lib/formation/butChecks';
import { checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import { checkAbcdCandidate } from '../../src/lib/formation/abcdChecks';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import type { Anchor, Candidate } from '../../src/lib/formation/types';
import { AT, harmonic, makeRun } from '../fixtures/formation-harmonic';
import { END, H4, barsOf, mirror, zig, type Row } from '../fixtures/formation-rows';
import { FIXTURE_TREND } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-50' }, fn);

const H_LEGS = [18, 4, 4, 4];
const H_AT = { x: 2, a: 20, b: 24, c: 28 };
const NO_D = { x: AT.x, a: AT.a, b: AT.b, c: AT.c };

const cases = [
  { code: 'GAR', check: checkGarCandidate, rows: zig([100, 130, 111.46, 122.92, 106.41], H_LEGS, 3), at: H_AT, dEnd: 106.41, ids: ['Z-GAR-07', 'Z-GAR-09', 'Z-GAR-10'] },
  { code: 'BAT', check: checkBatCandidate, rows: zig([100, 130, 115, 120.8, 103.42], H_LEGS, 3), at: H_AT, dEnd: 103.42, ids: ['Z-BAT-07', 'Z-BAT-09', 'Z-BAT-10'] },
  { code: 'BUT', check: checkButCandidate, rows: harmonic([100, 130, 106, 120.16, 91.8]), at: NO_D, dEnd: 91.8, ids: ['Z-BUT-07', 'Z-BUT-09', 'Z-BUT-10'] },
  { code: 'CRB', check: checkCrbCandidate, rows: harmonic([100, 130, 112, 123.68, 81.4]), at: NO_D, dEnd: 81.4, ids: ['Z-CRB-06', 'Z-CRB-08', 'Z-CRB-09'] },
] as const;

const tradeOf = (c: Candidate) => {
  if (!c.trade) throw new Error('kein trade');
  return c.trade;
};

/** Zusammenfassung ohne Zeichnungen: Zustand und Wert jeder Prüfung, alle Punkte */
const digest = (c: Candidate) => ({ points: c.points, checks: c.checks.map((k) => [k.id, k.state, k.value]) });

for (const hc of cases) {
  for (const buy of [true, false]) {
    const side = buy ? 'buy' : 'sell';
    const mir = (p: number) => (buy ? p : 200 - p);
    const run = makeRun(hc.check, hc.at as never);
    const go = (rows: Row[]) => run({ H4: buy ? rows : mirror(rows) }, hc.at as never, { buy });
    const t0 = tradeOf(go(hc.rows));
    const entry = mir(t0.entry!);
    const stop = mir(t0.stop!);
    /** Stop-Kerze: Schluss jenseits des Stops, Docht tiefer als das alte D */
    const stopRow: Row = [entry + 1, entry + 1.5, stop - 3, stop - 2];
    /** danach: Kerzen mit noch tieferem Docht, die nichts am Handel ändern */
    const deeper: Row[] = [
      [stop - 2, stop - 1, stop - 9, stop - 8],
      [stop - 8, stop - 6, stop - 14, stop - 12],
    ];

    frm(`${hc.code} (${side}): nach dem Stop bleiben D und die Prüfungen an D stehen`, () => {
      const atStop = go([...hc.rows, stopRow]);
      const later = go([...hc.rows, stopRow, ...deeper]);
      expect(tradeOf(atStop).status?.kind, 'Handel ist gestoppt').toBe('stopped');
      expect(tradeOf(later).status?.endIdx, 'Endkerze gleich').toBe(tradeOf(atStop).status?.endIdx);
      // D liegt am Docht der Stop-Kerze (Halil: „Stop'un olduğu yerde donsa daha mantıklı olur“), nicht am späteren Docht
      expect(atStop.points.D?.price).toBeCloseTo(mir(stop - 3), 6);
      expect(later.points.D, 'D bleibt').toEqual(atStop.points.D);
      expect(digest(later), 'Prüfungen an D bleiben').toEqual(digest(atStop));
    });

    frm(`${hc.code} (${side}): läuft der Handel, folgt D weiter dem äußersten Docht`, () => {
      const lowAt = (low: number): Row => [entry + 1, entry + 1.5, low, entry + 1];
      const first = go([...hc.rows, lowAt(hc.dEnd - 0.5)]);
      expect(tradeOf(first).status?.kind, 'Handel läuft').toBe('open');
      expect(first.points.D?.price).toBeCloseTo(mir(hc.dEnd - 0.5), 6);
      const later = go([...hc.rows, lowAt(hc.dEnd - 0.5), lowAt(hc.dEnd - 0.9)]);
      expect(tradeOf(later).status?.kind).toBe('open');
      expect(later.points.D?.price, 'D wandert mit').toBeCloseTo(mir(hc.dEnd - 0.9), 6);
    });

    frm(`${hc.code} (${side}): Einstiegslinie am Einstiegspreis, ab der Einstiegskerze, mit Beschriftung`, () => {
      const c = go([...hc.rows, [entry + 1, entry + 1.5, hc.dEnd - 0.2, entry + 1]]);
      const t = tradeOf(c);
      const [stopId, lineId, labelId] = hc.ids;
      const line = c.drawings.find((d) => d.id === lineId);
      const label = c.drawings.find((d) => d.id === labelId);
      const stopLine = c.drawings.find((d) => d.id === stopId);
      expect(line, 'Linie').toMatchObject({ tool: 'hline', label: 'entry' });
      expect(line!.anchors[0].price).toBeCloseTo(t.entry!, 6);
      expect(label, 'Beschriftung').toMatchObject({ tool: 'label', label: 'entry' });
      expect(label!.anchors[0].price).toBeCloseTo(t.entry!, 6);
      // gleicher Beginn wie die Stop-Linie (die Einstiegskerze)
      expect(stopLine, 'Stop-Linie').toBeDefined();
      expect(line!.anchors[0].time).toBe(stopLine!.anchors[0].time);
    });
  }
}

// ---- AB=CD ----------------------------------------------------------------------------------------------------

const wickAt = (rows: Row[], idx: number, high: boolean): Anchor => ({ time: idx * H4, price: high ? rows[idx][1] : rows[idx][2] });
const abcd = (rows: Row[], sell: boolean): Candidate => {
  const bars: ContextInput = { H4: barsOf(rows, H4) };
  const ctx = new FormationContext('TEST', bars, { trend: FIXTURE_TREND });
  const at = { a: 2, b: 10, c: 18 };
  return checkAbcdCandidate(ctx, END, { tf: 'H4', a: wickAt(rows, at.a, !sell), b: wickAt(rows, at.b, sell), c: wickAt(rows, at.c, !sell) });
};

for (const sell of [true, false]) {
  const side = sell ? 'sell' : 'buy';
  // Verkauf: A 100, B 130, C 114, D 144 (Level 1); Reihen in Verkaufs-Raum, `dir` spiegelt für den Kauf
  const base = zig([100, 130, 114, 144], 8, 3);
  const dir = (rows: Row[]) => (sell ? rows : mirror(rows, 244));
  const mir = (p: number) => (sell ? p : 244 - p);
  const t0 = tradeOf(abcd(dir(base), sell));
  const entry = mir(t0.entry!);

  frm(`ABCD (${side}): nach dem Stop bleiben D und die Prüfungen an D stehen`, () => {
    const stop = mir(t0.stop!);
    const stopRow: Row = [entry - 1, stop + 3, entry - 2, stop + 2];
    const higher: Row[] = [
      [stop + 2, stop + 9, stop + 1, stop + 8],
      [stop + 8, stop + 14, stop + 6, stop + 12],
    ];
    const atStop = abcd(dir([...base, stopRow]), sell);
    const later = abcd(dir([...base, stopRow, ...higher]), sell);
    expect(tradeOf(atStop).status?.kind).toBe('stopped');
    expect(tradeOf(later).status?.endIdx).toBe(tradeOf(atStop).status?.endIdx);
    expect(atStop.points.D?.price).toBeCloseTo(mir(stop + 3), 6);
    expect(later.points.D, 'D bleibt').toEqual(atStop.points.D);
    expect(digest(later), 'Prüfungen an D bleiben').toEqual(digest(atStop));
  });

  frm(`ABCD (${side}): läuft der Handel, folgt D weiter dem äußersten Docht`, () => {
    const highAt = (high: number): Row => [entry - 1, high, entry - 1.5, entry - 1];
    const a = abcd(dir([...base, highAt(entry + 0.4)]), sell);
    const b = abcd(dir([...base, highAt(entry + 0.4), highAt(entry + 0.9)]), sell);
    expect(tradeOf(b).status?.kind).toBe('open');
    expect(a.points.D!.price).toBeCloseTo(mir(entry + 0.4), 6);
    expect(b.points.D!.price, 'D wandert mit').toBeCloseTo(mir(entry + 0.9), 6);
  });

  frm(`ABCD (${side}): Einstiegslinie am Einstieg, ab der Einstiegskerze, mit Beschriftung`, () => {
    const c = abcd(dir(base), sell);
    const t = tradeOf(c);
    const line = c.drawings.find((d) => d.id === 'Z-ABCD-11');
    const label = c.drawings.find((d) => d.id === 'Z-ABCD-12');
    const stopLine = c.drawings.find((d) => d.id === 'Z-ABCD-07');
    expect(line, 'Linie').toMatchObject({ tool: 'hline', label: 'entry' });
    expect(line!.anchors[0].price).toBeCloseTo(t.entry!, 6);
    expect(label, 'Beschriftung').toMatchObject({ tool: 'label', label: 'entry' });
    expect(line!.anchors[0].time).toBe(stopLine!.anchors[0].time);
  });
}
