/**
 * Legende der Seite /formasyon: die Zickzack-Zeile steht nur bei Formationen, deren Zeichnungen einen Zickzack enthalten.
 * FRM-19 Liste und Checkliste
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { drawsZigzag } from '../../src/lib/formation/drawingLayout';
import { parseFixture } from '../../src/lib/formation/fixture';
import { FormationContext } from '../../src/lib/formation/context';
import { scanFormations } from '../../src/lib/formation/scan';
import { FIXTURE_TREND, named } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-19' }, fn);

/** `now` null: Schluss der letzten Kerze (ein Zeitpunkt weit danach liegt außerhalb jedes Verlaufsfensters, 1122-A1.4 a) */
const hitsOf = (file: string, form: 'LIB' | 'ABCD', now: number | null) => {
  const bars = named(`e2e/fixtures/formation/${file}`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}`, 'utf-8')))).bars;
  const t = now ?? bars[bars.length - 1].time + 4 * 3600;
  return scanFormations(new FormationContext('EURUSD', { H4: bars }, { trend: FIXTURE_TREND }), t).filter((h) => h.form === form);
};

frm('Libra zeichnet keinen Zickzack, ABCD zeichnet einen', () => {
  const lib = hitsOf('lib-gone-h4-01.json', 'LIB', 1763064000);
  const abcd = hitsOf('abcd-buy-h4-02.json', 'ABCD', null);
  expect(lib.length).toBeGreaterThan(0);
  expect(abcd.length).toBeGreaterThan(0);
  expect(lib.map((h) => drawsZigzag(h.candidate))).toEqual(lib.map(() => false));
  expect(abcd.some((h) => drawsZigzag(h.candidate))).toBe(true);
});
