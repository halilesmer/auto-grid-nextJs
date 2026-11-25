/**
 * AB=CD: Start der Ziel-Fib (`from`) nach dem Einstieg eingefroren, Ziele zählen nur auf der Gewinnseite (Decision 1120-A35.1).
 *
 * Echter Fall (XAUUSD H1, Kauf, A 2026-05-14 10:00): 60 Kerzen vor A bis 2026-05-15 12:00, nur H1 geladen, Chart-Standard-Trendzug.
 * Am Einstieg (Kerze 05-14 16:00, Docht 4666.82 über Level 1 4683.41 hinaus) gilt ABCD-19 (Divergenz): `frozenFrom` = A 4718.75,
 * der Stop 4669.91 kommt daraus. TP1 zählt in der Kerze 05-14 17:00, dieselbe Kerze schließt unter dem Einstieg (Rest am Einstieg).
 * Danach läuft D weiter (05-14 22:00: 4653.15) und ABCD-19 wird ☐. Vor 1120-A35.1 sprang `from` dann auf C (4710.02) und
 * `tradeStatusOf` rechnete den beendeten Handel neu: TP1 zählte 4683.32, unter dem Einstieg eines Kaufs (fillOnLossSide).
 * Seit 1122-A1.4 zeigt die Suche dieses Tripel nie: zum Schluss der Einstiegskerze war C noch der Docht 05-14 13:00 (4705.54). Die Tests messen
 * das Tripel daher direkt (`checkAbcdCandidate`); der letzte Test hält fest, was die Suche zeigt.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { analyzeAbcd, checkAbcdCandidate } from '../../src/lib/formation/abcdChecks';
import { fibPrice, targetEnd } from '../../src/lib/formation/trade';
import { tradeStatusOf } from '../../src/lib/formation/tradeStatus';
import { parseFixture } from '../../src/lib/formation/fixture';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { fixtureTrend, CHART_TREND_HL2 } from '../fixtures/formation-trend';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-05' }, fn);

// [Zeit, Eröffnung, Hoch, Tief, Schluss]
const ROWS: [number, number, number, number, number][] = [
  [1778526000, 4732.24, 4733.46, 4707.97, 4716.45],
  [1778529600, 4716.52, 4724.64, 4715.95, 4723.69],
  [1778533200, 4723.7, 4729.35, 4721.02, 4724.77],
  [1778536800, 4725.15, 4736.16, 4722.39, 4733.69],
  [1778540400, 4733.8, 4738.36, 4729.91, 4734.75],
  [1778547600, 4738.08, 4755.27, 4737.57, 4750.9],
  [1778551200, 4750.9, 4769.71, 4746.26, 4767.49],
  [1778554800, 4767.44, 4773.58, 4748.86, 4749.41],
  [1778558400, 4749.47, 4755.58, 4720.41, 4727.18],
  [1778562000, 4727.13, 4733.92, 4722.25, 4730.09],
  [1778565600, 4730.05, 4733.32, 4718.02, 4720.22],
  [1778569200, 4720.22, 4730.32, 4711.08, 4714.26],
  [1778572800, 4714.28, 4722.15, 4708.86, 4714.39],
  [1778576400, 4714.39, 4714.39, 4694.7, 4697.35],
  [1778580000, 4697.2, 4703.92, 4687.49, 4699.74],
  [1778583600, 4699.85, 4706.99, 4697.26, 4703.38],
  [1778587200, 4703.47, 4705.27, 4694.25, 4699.46],
  [1778590800, 4699.46, 4708.47, 4685.14, 4694.42],
  [1778594400, 4694.39, 4709.19, 4687.28, 4706.58],
  [1778598000, 4706.63, 4711.51, 4689.69, 4705.75],
  [1778601600, 4705.74, 4708.79, 4676.82, 4678.66],
  [1778605200, 4679.25, 4695.07, 4669.79, 4672.89],
  [1778608800, 4672.9, 4676.14, 4638.57, 4666.07],
  [1778612400, 4666.56, 4675.2, 4664.32, 4671.18],
  [1778616000, 4671.33, 4682.41, 4671.33, 4678.77],
  [1778619600, 4678.81, 4698.13, 4676.22, 4695.93],
  [1778623200, 4696.13, 4715.53, 4696.13, 4715.53],
  [1778626800, 4715.62, 4719.38, 4712.11, 4715.27],
  [1778634000, 4716.75, 4722.57, 4712.32, 4717.03],
  [1778637600, 4717.03, 4724, 4715.18, 4717.08],
  [1778641200, 4716.37, 4726.76, 4714.11, 4714.69],
  [1778644800, 4714.69, 4717.2, 4701.11, 4702.62],
  [1778648400, 4702.56, 4707.67, 4687.6, 4691.9],
  [1778652000, 4692.04, 4705.9, 4689.12, 4696.13],
  [1778655600, 4696.13, 4703.36, 4695.66, 4699.66],
  [1778659200, 4699.63, 4707.34, 4693.81, 4704.29],
  [1778662800, 4704.26, 4715.35, 4699.17, 4701.26],
  [1778666400, 4701.8, 4708.8, 4696.79, 4702.83],
  [1778670000, 4702.81, 4704.37, 4694.31, 4700.65],
  [1778673600, 4700.65, 4701.92, 4685.97, 4700.94],
  [1778677200, 4700.91, 4710.38, 4693.68, 4694.26],
  [1778680800, 4694.43, 4705.55, 4691.61, 4697.44],
  [1778684400, 4697.01, 4701.73, 4676.56, 4683.91],
  [1778688000, 4683.69, 4694.71, 4669.65, 4679.3],
  [1778691600, 4679.29, 4690.81, 4672.92, 4679.82],
  [1778695200, 4679.82, 4700.01, 4679.02, 4695.53],
  [1778698800, 4695.47, 4709.71, 4695.01, 4695.79],
  [1778702400, 4695.69, 4701.31, 4684.55, 4685.58],
  [1778706000, 4685.65, 4694.02, 4677.64, 4684.92],
  [1778709600, 4684.92, 4690.51, 4683.45, 4688.35],
  [1778713200, 4688.29, 4693.35, 4685.87, 4688.77],
  [1778720400, 4691.88, 4700.6, 4689.01, 4700.05],
  [1778724000, 4699.87, 4702.08, 4693.36, 4696.62],
  [1778727600, 4696.28, 4706.81, 4689.67, 4704.98],
  [1778731200, 4704.99, 4706.99, 4683.57, 4688.9],
  [1778734800, 4688.93, 4699.66, 4680.38, 4686.68],
  [1778738400, 4686.74, 4693.37, 4674.13, 4675.11],
  [1778742000, 4675.06, 4712.27, 4668.77, 4702.17],
  [1778745600, 4702.26, 4703.93, 4689, 4689.67],
  [1778749200, 4688.88, 4702.55, 4686.15, 4700.21],
  [1778752800, 4699.52, 4718.75, 4691.1, 4692.95],
  [1778756400, 4693.08, 4706.73, 4692.14, 4693.3],
  [1778760000, 4693.39, 4702.57, 4688.47, 4699.57],
  [1778763600, 4699.68, 4705.54, 4691.31, 4697.07],
  [1778767200, 4697, 4704.86, 4689.42, 4694.52],
  [1778770800, 4694.48, 4710.02, 4692.44, 4704.79],
  [1778774400, 4704.81, 4707.75, 4666.82, 4679.71],
  [1778778000, 4679.26, 4700.84, 4677.68, 4679.35],
  [1778781600, 4679.45, 4689.46, 4677.16, 4685.96],
  [1778785200, 4685.74, 4687.02, 4670.41, 4678.59],
  [1778788800, 4678.67, 4683.11, 4676.5, 4678.14],
  [1778792400, 4678.21, 4678.41, 4667.07, 4671.68],
  [1778796000, 4671.84, 4671.84, 4653.15, 4654.29],
  [1778799600, 4654.28, 4657.01, 4644.4, 4652.37],
  [1778806800, 4653.03, 4662.74, 4647.31, 4662.45],
  [1778810400, 4662.45, 4665.35, 4646.95, 4652.19],
  [1778814000, 4652.15, 4658.18, 4613.73, 4630.12],
  [1778817600, 4630.04, 4631.44, 4607.47, 4613.5],
  [1778821200, 4614.23, 4623.49, 4609.4, 4618.19],
  [1778824800, 4618.1, 4622.24, 4607.59, 4615.45],
  [1778828400, 4615.48, 4621.61, 4604.33, 4605.95],
  [1778832000, 4606.27, 4606.62, 4559.04, 4559.55],
  [1778835600, 4558.9, 4580.53, 4556.5, 4569.7],
  [1778839200, 4569.97, 4588.75, 4566.02, 4570.97],
  [1778842800, 4571.49, 4572.02, 4550.07, 4554.18],
  [1778846400, 4554.56, 4563.82, 4532.03, 4545.78],];
const BARS: FormationBar[] = ROWS.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const ctxOf = () => new FormationContext('XAUUSD', { H1: { bars: BARS, missing: [] } }, { trend: CHART_TREND_HL2 });
/** Das Tripel A 05-14 10:00, B 11:00, C 15:00 direkt gemessen: die Suche zeigt es nie (1122-A1.4 b, siehe letzter Test) */
const candidateAt = (iso: string): Candidate =>
  checkAbcdCandidate(ctxOf(), at(iso), {
    tf: 'H1',
    a: { time: 1778752800, price: 4718.75 },
    b: { time: 1778756400, price: 4692.14 },
    c: { time: 1778770800, price: 4710.02 },
  });
/** Was die Suche zum Schluss der Kerze vor `iso` zeigt */
const shownAt = (ctx: FormationContext, iso: string): Candidate => analyzeAbcd(ctx, at(iso)).find((a) => a.tf === 'H1')!.candidate;
const ENTRY = 4683.41;
/** Stop = Level 1 − 0.382 × (A − Level 1), eingefroren mit `frozenFrom` = A */
const STOP = ENTRY - 0.382 * (4718.75 - ENTRY);
const state = (c: Candidate, id: string) => c.checks.find((x) => x.id === id)?.state;

test.describe('AB=CD: Ziel-Fib-Start nach dem Einstieg (XAUUSD H1, Kauf 2026-05-14)', () => {
  frm('Vorbedingung: derselbe Kandidat, Einstieg Level 1, Stop aus A (Divergenz am Einstieg), Ende in der Kerze 05-14 17:00', () => {
    for (const iso of ['2026-05-14T18:00', '2026-05-14T23:00', '2026-05-15T03:00']) {
      const c = candidateAt(iso);
      const p = c.points;
      expect([c.side, p.A?.price, p.B?.price, p.C?.price]).toEqual(['buy', 4718.75, 4692.14, 4710.02]);
      expect(c.trade!.entry).toBeCloseTo(ENTRY, 6);
      // Stop = Level 1 − 0.382 × (A − Level 1): eingefroren mit `frozenFrom` = A
      expect(c.trade!.stop).toBeCloseTo(ENTRY - 0.382 * (4718.75 - ENTRY), 6);
      expect(c.trade!.status).toMatchObject({ kind: 'breakeven', endIdx: 67, stopMovedIdx: 67 });
      expect(BARS[67].time).toBe(at('2026-05-14T17:00'));
    }
    // Die Divergenz gilt beim Einstieg, nicht mehr, wenn D weiterläuft: daran hängt der Sprung von `from`
    expect(state(candidateAt('2026-05-14T18:00'), 'ABCD-19')).toBe('met');
    expect(state(candidateAt('2026-05-14T23:00'), 'ABCD-19')).toBe('unmet');
  });

  frm('TP1 eines Kaufs zählt nie unter dem Einstieg (fillOnLossSide), auch nachdem D weiterläuft', () => {
    for (const iso of ['2026-05-14T18:00', '2026-05-14T23:00', '2026-05-15T03:00']) {
      const fill = candidateAt(iso).trade!.status!.tp1Fill!;
      expect(fill, `tp1Fill bei ${iso}`).toBeGreaterThan(ENTRY);
    }
  });

  frm('Ein beendeter Handel ändert seinen Stand mit späteren Kerzen nicht (tp1Fill bleibt der Wert der Endkerze)', () => {
    const ended = candidateAt('2026-05-14T18:00').trade!.status!;
    // TP1 der Kerze 05-14 17:00 aus der Fib A → Stop (0.382): der Docht 4666.82 liegt jenseits des Stops 4669.91 und zieht die Ziele nicht weiter (1121-A14.1)
    expect(ended.tp1Fill).toBeCloseTo(fibPrice(4718.75, STOP, 0.382), 6);
    for (const iso of ['2026-05-14T23:00', '2026-05-15T03:00', '2026-05-15T13:00']) {
      expect(candidateAt(iso).trade!.status, `Stand bei ${iso}`).toEqual(ended);
    }
  });

  frm('Nach dem Einstieg laufen TP1, TP2 und die Ziel-Fib Z-ABCD-05 ab A weiter, auch wenn ABCD-19 später ☐ wird', () => {
    for (const iso of ['2026-05-14T18:00', '2026-05-14T23:00', '2026-05-15T13:00']) {
      const c = candidateAt(iso);
      // Ende der Ziel-Fib: äußerster Docht, höchstens der Stop (1121-A14.1)
      const end = targetEnd(4718.75, c.points.D!.price, STOP);
      expect(c.trade!.tp1, `tp1 bei ${iso}`).toBeCloseTo(fibPrice(4718.75, end, 0.382), 6);
      expect(c.trade!.tp2, `tp2 bei ${iso}`).toBeCloseTo(fibPrice(4718.75, end, 0.618), 6);
      const fib = c.drawings.find((x) => x.id === 'Z-ABCD-05')!;
      expect(fib.anchors[0], `Z-ABCD-05 bei ${iso}`).toEqual({ time: 1778752800, price: 4718.75 });
      // Die Zeichnung endet wie TP1 am begrenzten Ende; die Zeit bleibt die des Punkts D
      expect(fib.anchors[1].price, `Z-ABCD-05 Ende bei ${iso}`).toBeCloseTo(end, 6);
      expect(fib.anchors[1].time).toBe(c.points.D!.time);
    }
  });

  frm('Suche (1122-A1.4 b, c): beim Einstieg zeigt sie C 4705.54 mit Einstieg 4678.93, das Tripel mit C 4710.02 zeigt sie nie', () => {
    const ctx = ctxOf();
    // zum Schluss der Einstiegskerze 05-14 16:00: das C der Wahl ist der Docht 05-14 13:00; der Docht 15:00 ist noch kein Wendepunkt
    const atEntry = shownAt(ctx, '2026-05-14T17:00');
    expect([atEntry.side, atEntry.points.A?.price, atEntry.points.B?.price, atEntry.points.C?.price]).toEqual(['buy', 4718.75, 4692.14, 4705.54]);
    expect(atEntry.trade!.entry).toBeCloseTo(4678.93, 2);
    expect(atEntry.trade!.status?.kind).toBe('open');
    for (let t = at('2026-05-14T15:00'); t <= at('2026-05-15T13:00'); t += 3600) {
      const c = analyzeAbcd(ctx, t).find((a) => a.tf === 'H1')!.candidate;
      const iso = new Date(t * 1000).toISOString().slice(0, 16);
      expect(c.points.C?.time === 1778770800 && c.points.A?.price === 4718.75, `Tripel mit C 4710.02 gezeigt zur Zeit ${iso}`).toBe(false);
    }
  });
});

// ---- Schutz: ein mitlaufendes Ziel hinter dem Einstieg zählt nicht (1120-A35.1) ----
// Verkauf: from (C) 114, Einstieg 144, Stop 155.46 (Schluss), kein Not-SL. Ein Docht bis 165 (Schluss 150, nicht jenseits des Stops)
// zieht TP1 auf 165 − 0.382 × 51 = 145.518, über den Einstieg. Die nächste Kerze berührt 145 und schließt 147. Kauf gespiegelt (p → 200 − p).
for (const side of ['sell', 'buy'] as const) {
  const tag = side === 'sell' ? 'Verkauf' : 'Kauf';
  const m = (p: number) => (side === 'sell' ? p : 200 - p);
  const statusOf = (rows: [number, number, number][]) => {
    const bars: FormationBar[] = rows.map(([h, l, c], i) => {
      const [hh, ll] = side === 'sell' ? [h, l] : [m(l), m(h)];
      return { time: 1000 + i * 3600, open: m(c), high: hh, low: ll, close: m(c) };
    });
    return tradeStatusOf({ bars, entryIdx: 0, side, entry: m(144), stop: m(155.46), emergencyStop: null, from: m(114), targets: { tp1: 0.382, tp2: 0.618 } });
  };

  frm(`Schutz (${tag}): TP1 hinter dem Einstieg (sehr tiefer Docht, eingefrorenes from) zählt nicht, der Handel bleibt offen`, () => {
    const st = statusOf([[150, 140, 144], [165, 145, 150], [150, 145, 147]]);
    expect(st.kind).toBe('open');
    expect(st.tp1Fill).toBeUndefined();
    expect(st.stopNow).toBeCloseTo(m(155.46), 9);
  });

  frm(`Schutz (${tag}): ein Ziel auf der Gewinnseite zählt weiter wie bisher`, () => {
    // Docht nur bis 152: TP1 = 152 − 0.382 × 38 = 137.484, unter dem Einstieg
    const st = statusOf([[150, 140, 144], [152, 145, 150], [150, 137, 140]]);
    expect(st.kind).toBe('tp1');
    expect(st.tp1Fill).toBeCloseTo(m(137.484), 9);
  });
}

// crb-form-h4-01 (Kauf, Stand 2025-11-18 20:00): Einstieg 100,57, Start C 101,129, Stop 100,356 (Schluss), Not-SL 99,985. Der Docht 100,142 liegt
// jenseits des Stops (ohne Schluss dort). Vor 1120-A35.1 zog er TP1 auf 100,519 unter den Einstieg und TP1 zählte dort; mit 1120-A35.1 zählte es nicht
// und der Handel blieb offen. Seit 1121-A14.1 endet die Ziel-Fib am Stop: TP1 = Fib(C → Stop, 0.382) liegt über dem Einstieg und zählt dort.
// Der Handel endet 2025-11-18 08:00 (tp12) mit CD = 1,77 × AB: seit 1123-A wählt die Suche ihn danach nicht mehr (Proportion verloren); gemessen
// wird deshalb mit denselben Punkten über checkAbcdCandidate.
frm('Ende am Stop, echte Kerzen (crb-form-h4-01): ein Docht jenseits des Stops zieht TP1 nicht unter den Einstieg; TP1 und TP2 zählen auf der Gewinnseite', () => {
  const fx = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/crb-form-h4-01.json', 'utf-8')));
  const now = 1763496000;
  const bars = fx.bars.filter((b) => b.time + 14400 <= now);
  const ctx = new FormationContext(fx.symbol, { H4: bars }, { trend: fixtureTrend('crb-form-h4-01') });
  const points = { A: { time: 1763136000, price: 101.289 }, B: { time: 1763352000, price: 100.73 }, C: { time: 1763366400, price: 101.129 } };
  // 1123-A: der beendete Handel mit CD > 1.618 × AB ist nicht mehr die Wahl der Suche
  expect(analyzeAbcd(ctx, now).find((a) => a.tf === 'H4')!.candidate.points.A?.time).not.toBe(points.A.time);
  const c = checkAbcdCandidate(ctx, now, { tf: 'H4', a: points.A, b: points.B, c: points.C });
  expect([c.side, c.points.C?.price, c.points.D?.price]).toEqual(['buy', 101.129, 100.142]);
  const t = c.trade!;
  expect(t.entry).toBeCloseTo(100.57, 9);
  // Vorbedingung: der Docht D liegt jenseits des Stops, aber diesseits des Not-SL
  expect(c.points.D!.price).toBeLessThan(t.stop!);
  expect(c.points.D!.price).toBeGreaterThan(t.emergencyStop!);
  expect(t.tp1!).toBeCloseTo(fibPrice(101.129, t.stop!, 0.382), 9);
  expect(t.tp1!).toBeGreaterThan(100.57);
  expect(t.status).toMatchObject({ kind: 'tp12', tp1Fill: t.tp1, tp2Fill: t.tp2 });
  expect(t.status!.tp1Fill!).toBeGreaterThan(100.57);
});
