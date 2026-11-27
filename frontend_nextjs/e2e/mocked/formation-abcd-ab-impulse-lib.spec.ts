/**
 * AB=CD: AB muss ein Impuls im Trend der Formations-Zeiteinheit sein (1126-A13.2, Annahme aus dem Regelbuch: ABCD-01 „A = Beginn des ersten
 * Impulses, B = Ende des Impulses, C = Ende der Korrektur“, Trendbezug „bestimmt, welche Bewegung AB ist“).
 * Echte XAUUSD-H1-Kerzen (long-leg-Fixture), Chart-Standard-Trendzug.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeAbcd, checkAbcdCandidate } from '../../src/lib/formation/abcdChecks';
import { selectOrder } from '../../src/lib/formation/abcd';
import type { Pivot } from '../../src/lib/formation/trd';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-05' }, fn);
const bars: FormationBar[] = (JSON.parse(readFileSync('e2e/fixtures/long-leg-xauusd-h1.json', 'utf-8')) as number[][]).map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const ctx = new FormationContext('XAUUSD', { H1: { bars, missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const candidateAt = (t: number): Candidate => analyzeAbcd(ctx, t).find((a) => a.tf === 'H1')!.candidate;
const unmet01 = (c: Candidate) => c.checks.find((k) => k.id === 'ABCD-01')?.state === 'unmet';

test.describe('AB=CD: AB ist ein Impuls', () => {
  frm('XAUUSD H1 2026-01-02 22:00: gezeigt wird der Impuls-Tripel (A 4549.88, B 4274.05, C 4402.30)', () => {
    const c = candidateAt(at('2026-01-02T22:00'));
    expect([c.points.A, c.points.B, c.points.C].map((p) => p && [p.time, p.price])).toEqual([
      [1766772000, 4549.88],
      [1767168000, 4274.05],
      [1767366000, 4402.3],
    ]);
  });

  frm('Ohne Impuls-Tripel (Wahl): die letzten drei Wendepunkte bleiben, Kandidat nie leer', () => {
    const pv = (idx: number, side: 'support' | 'resistance', price: number, kind: Pivot['kind']): Pivot => ({ idx, doneAt: idx + 5, side, price, kind, len: 0 });
    // A tief 100, B hoch 90 (AB = Korrektur), C tief 95: Tiefe gültig, AB aber keine Impulsbewegung
    const corr = [pv(0, 'resistance', 110, 'start'), pv(10, 'support', 100, 'impulse'), pv(20, 'resistance', 120, 'correction'), pv(30, 'support', 108, 'correction')];
    expect(selectOrder(corr).map((p) => p.c.idx)).toEqual([30]);
    // mit Impuls-AB (B: impulse, C: correction) zuerst dieses Tripel, dann der Rückfall
    const imp = [pv(0, 'support', 100, 'start'), pv(10, 'resistance', 120, 'impulse'), pv(20, 'support', 108, 'correction')];
    expect(selectOrder(imp).map((p) => p.c.idx)).toEqual([20]);
  });

  // 1126-A13.2.4: an 36 der 5999 Schlüsse (Kerzenindex 680–704, 1410–1411, 3337–3338, 4847–4850, 5809–5811; Schluss = Öffnung + 1 Stunde) hält kein Tripel
  // die Regeln: das Tripel mit Impuls-AB fehlt, die letzten drei Wendepunkte (ABCD-01 ☐) fallen durch die Oberlinie von 1123-A (D-Bein über 1,618 × AB hinaus,
  // `proportionLost`). Der Kandidat bleibt leer; das ist richtig (es gibt dann kein gültiges AB=CD).
  frm('Kein Tripel hält die Regeln: der Kandidat bleibt leer (1123-A), sonst nie; es gibt Schlüsse mit AB kein Impuls (ABCD-01 ☐)', () => {
    for (const i of [680, 1410, 3337, 4847, 5809]) expect(candidateAt(bars[i].time + 3600).points.A, `Schluss ${i} bleibt leer`).toBeUndefined();
    let unmet = 0;
    for (let i = 3000; i < 4500; i += 7) {
      const c = candidateAt(bars[i].time + 3600);
      expect(c.points.A, `Schluss ${i}`).toBeDefined();
      if (unmet01(c)) unmet++;
    }
    expect(unmet).toBeGreaterThan(0);
  });

  frm('Eigene Punkte: AB Korrektur → ABCD-01 offen; AB Impuls → erfüllt', () => {
    const t = at('2026-01-02T22:00');
    const own = (a: [number, number], b: [number, number], c: [number, number]) =>
      checkAbcdCandidate(ctx, t, { tf: 'H1', a: { time: a[0], price: a[1] }, b: { time: b[0], price: b[1] }, c: { time: c[0], price: c[1] } });
    const state = (c: Candidate) => c.checks.find((k) => k.id === 'ABCD-01')?.state;
    expect(state(own([1767168000, 4274.05], [1767366000, 4402.3], [1767376800, 4315.17]))).toBe('unmet');
    expect(state(own([1766772000, 4549.88], [1767168000, 4274.05], [1767366000, 4402.3]))).toBe('met');
  });
});
