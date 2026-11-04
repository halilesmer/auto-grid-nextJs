/**
 * Gemeinsame Prüfung des Handelsblocks (A40.3) und der Veto-Zeile (A40.2) für die Formationstests.
 * Ein Basisfall jeder Formation ruft `expectTradeShape`: Stop auf der Verlustseite, Not-SL dahinter, TP1 auf der Gewinnseite, Veto nur bei den sieben Formationen.
 */
import { expect } from '@playwright/test';
import type { Candidate } from '../../src/lib/formation/types';

export function expectTradeShape(c: Candidate, o: { veto: boolean }): void {
  const t = c.trade;
  if (!t) throw new Error('kein trade');
  const buy = c.side === 'buy';
  expect(t.entry, 'Einstieg').not.toBeNull();
  expect(t.stop, 'Stop').not.toBeNull();
  expect(t.tp1, 'TP1').not.toBeNull();
  expect(buy ? t.stop! < t.entry! : t.stop! > t.entry!, 'Stop auf der Verlustseite').toBe(true);
  expect(buy ? t.tp1! > t.entry! : t.tp1! < t.entry!, 'TP1 auf der Gewinnseite').toBe(true);
  expect(buy ? t.emergencyStop! < t.stop! : t.emergencyStop! > t.stop!, 'Not-SL hinter dem Stop').toBe(true);
  expect(t.sig29?.id).toBe('SIG-29');
  const veto = c.checks.filter((k) => k.veto);
  expect(veto.map((k) => k.id)).toEqual(o.veto ? [buy ? 'SIG-15' : 'SIG-16'] : []);
  for (const k of veto) expect(k.kind).toBe('exclusion');
  expect(c.invalidBy ?? []).not.toContain(buy ? 'SIG-15' : 'SIG-16');
}
