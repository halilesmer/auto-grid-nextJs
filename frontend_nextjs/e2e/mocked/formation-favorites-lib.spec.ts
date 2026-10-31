/**
 * Filter der Favoriten-Suche ohne Browser (scan.ts): nur gebildete Formationen zählen, ein Produkt je Formation einmal.
 * FRM-29 Suche über Favoriten und Filter
 */
import { test, expect } from '@playwright/test';
import { favoriteSymbols, formedHits, formedSummary, isFormed, timeframeCount, type FormedHit, type ScanFormation, type ScanHit } from '../../src/lib/formation/scan';
import type { Verdict } from '../../src/lib/formation/types';

const frm = (name: string, body: () => void) => test(name, { tag: '@FRM-29' }, body);

function hit(form: ScanFormation, tf: 'D1' | 'H4' | 'H1' | 'M15', verdict: Verdict): ScanHit {
  return { form, tf, candidate: { code: form, side: 'buy', tf, points: { A: { time: 1, price: 1 } }, checks: [], drawings: [], verdict } };
}

frm('isFormed zählt nur gültige Treffer', () => {
  expect(isFormed(hit('ABCD', 'H4', 'valid'))).toBe(true);
  expect(isFormed(hit('ABCD', 'H4', 'forming'))).toBe(false);
  expect(isFormed(hit('ABCD', 'H4', 'invalid'))).toBe(false);
});

frm('formedHits behält gebildete Treffer und nennt jede Formation je Zeitraum einmal', () => {
  const hits = [hit('ABCD', 'H4', 'valid'), hit('ABCD', 'H4', 'valid'), hit('GAR', 'H4', 'forming'), hit('BAT', 'D1', 'valid'), hit('BUT', 'H1', 'invalid')];
  expect(formedHits(hits)).toEqual([
    { form: 'ABCD', tf: 'H4' },
    { form: 'BAT', tf: 'D1' },
  ]);
});

const results: Record<string, FormedHit[]> = {
  EURUSD: [{ form: 'ABCD', tf: 'H4' }, { form: 'BAT', tf: 'D1' }],
  GBPUSD: [{ form: 'ABCD', tf: 'H4' }, { form: 'CDT', tf: 'H4' }],
  XAUUSD: [],
};

frm('formedSummary nennt je Zeitraum nur Formationen mit Treffer, in Reihenfolge der Formationen, mit den Produkten', () => {
  expect(formedSummary(results, 'H4')).toEqual([
    { form: 'ABCD', symbols: ['EURUSD', 'GBPUSD'] },
    { form: 'CDT', symbols: ['GBPUSD'] },
  ]);
  expect(formedSummary(results, 'D1')).toEqual([{ form: 'BAT', symbols: ['EURUSD'] }]);
  expect(formedSummary(results, 'M15')).toEqual([]);
});

frm('timeframeCount zählt Produkte mit mindestens einer gebildeten Formation im Zeitraum', () => {
  expect(timeframeCount(results, 'H4')).toBe(2);
  expect(timeframeCount(results, 'D1')).toBe(1);
  expect(timeframeCount(results, 'H1')).toBe(0);
});

frm('favoriteSymbols filtert die Tabelle nach Formation und behält die Reihenfolge der Favoriten', () => {
  const favorites = ['XAUUSD', 'GBPUSD', 'EURUSD'];
  expect(favoriteSymbols(favorites, results, 'H4', null)).toEqual(favorites);
  expect(favoriteSymbols(favorites, results, 'H4', 'ABCD')).toEqual(['GBPUSD', 'EURUSD']);
  expect(favoriteSymbols(favorites, results, 'H4', 'CDT')).toEqual(['GBPUSD']);
  expect(favoriteSymbols(favorites, results, 'D1', 'CDT')).toEqual([]);
});
