/**
 * Trendfortsetzung (TDF) in der Suche der Seite /formasyon: die Suche liefert dieselben Zustände wie `analyzeTdf` allein,
 * das Badge zählt einen Treffer im Aufbau erst mit dem vorletzten Punkt der jeweiligen Unterform (Flagge C2, Dreieck H2, Schale LOW, Rechteck FLOOR).
 * FRM-11 Formationserkennung: Trendfortsetzung · FRM-18 Zählung
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { countsAsHit, FINAL_POINT, SCAN_FORMATIONS, scanFormations, type ScanHit } from '../../src/lib/formation/scan';
import { analyzeTdf } from '../../src/lib/formation/tdfChecks';
import type { Candidate } from '../../src/lib/formation/types';
import { H4 } from '../fixtures/formation-rows';
import { named, trendOf } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: ['@FRM-11', '@FRM-18'] }, fn);

const REAL = [
  { file: 'tdf-flag-h4-01', t: 1766721600 },
  { file: 'tdf-tri-h4-01', t: 1769644800 },
  { file: 'tdf-bowl-h4-01', t: 1768910400 },
  { file: 'tdf-box-h4-01', t: 1772812800 },
  { file: 'tdf-bad-h4-01', t: 1763985600 },
];

for (const r of REAL) {
  frm(`Suche liefert für ${r.file} dieselben Zustände wie analyzeTdf allein`, () => {
    const fx = named(`e2e/fixtures/formation/${r.file}.json`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${r.file}.json`, 'utf-8'))));
    const bars = fx.bars.filter((b) => b.time + H4 <= r.t);
    const ctx = () => new FormationContext(fx.symbol, { H4: bars }, { trend: trendOf(bars) });
    const alone = analyzeTdf(ctx(), r.t)
      .filter((a) => Object.keys(a.candidate.points).length > 0)
      .map((a) => ({ tf: a.tf, candidate: a.candidate }));
    const found = scanFormations(ctx(), r.t)
      .filter((h) => h.form === 'TDF')
      .map((h) => ({ tf: h.tf, candidate: h.candidate }));
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual(alone);
  });
}

frm('TDF steht in der Leiste, der letzte Punkt ist B (Ausbruch)', () => {
  expect(SCAN_FORMATIONS).toContain('TDF');
  expect(FINAL_POINT.TDF).toBe('B');
});

const at = (i: number) => ({ time: 1000 + i * 100, price: 10 + i });
const hit = (names: string[], verdict: Candidate['verdict'] = 'forming'): ScanHit => ({
  form: 'TDF',
  tf: 'H4',
  candidate: { code: 'TDF', side: 'buy', tf: 'H4', points: Object.fromEntries(names.map((n, i) => [n, at(i)])), checks: [], drawings: [], verdict },
});

frm('Badge: im Aufbau zählt erst der vorletzte Punkt der Unterform', () => {
  expect(countsAsHit(hit(['H1', 'S', 'C1', 'F1']))).toBe(false); // Flagge ohne C2
  expect(countsAsHit(hit(['H1', 'S', 'C1', 'F1', 'C2']))).toBe(true);
  expect(countsAsHit(hit(['H1', 'S', 'L1']))).toBe(false); // Dreieck ohne H2
  expect(countsAsHit(hit(['H1', 'S', 'L1', 'H2']))).toBe(true);
  expect(countsAsHit(hit(['H1', 'S']))).toBe(false); // Schale und Rechteck ohne Tief bzw. Boden
  expect(countsAsHit(hit(['H1', 'S', 'LOW']))).toBe(true);
  expect(countsAsHit(hit(['H1', 'S', 'FLOOR']))).toBe(true);
  expect(countsAsHit(hit(['H1', 'S', 'HANDLE']))).toBe(false); // der optionale Henkel allein zählt nicht
  expect(countsAsHit(hit(['H1', 'S'], 'valid'))).toBe(true);
  expect(countsAsHit(hit(['H1', 'S', 'C2'], 'invalid'))).toBe(false);
});
