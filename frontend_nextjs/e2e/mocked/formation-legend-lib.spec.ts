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

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-19' }, fn);

const hitsOf = (file: string, form: 'LIB' | 'ABCD') => {
  const bars = parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}`, 'utf-8'))).bars;
  return scanFormations(new FormationContext('EURUSD', { H4: bars }), 1e10).filter((h) => h.form === form);
};

frm('Libra zeichnet keinen Zickzack, ABCD zeichnet einen', () => {
  const lib = hitsOf('cyp-lib-h4-01.json', 'LIB');
  const abcd = hitsOf('abcd-buy-h4-02.json', 'ABCD');
  expect(lib.length).toBeGreaterThan(0);
  expect(abcd.length).toBeGreaterThan(0);
  expect(lib.map((h) => drawsZigzag(h.candidate))).toEqual(lib.map(() => false));
  expect(abcd.some((h) => drawsZigzag(h.candidate))).toBe(true);
});
