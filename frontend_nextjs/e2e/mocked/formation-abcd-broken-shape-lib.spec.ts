/**
 * AB=CD: hält die Form des Tripels nicht (ABCD-01, -02, -04, -05, -06), trägt es keinen Handel (1126-A20.2, Annahme nach dem Regelbuch:
 * Abnahmefall `abcd-neg-h4-01` = „kein Handel, ungültig durch ABCD-06“). Echte H1-Kerzen (XAUUSD, EURUSD; [Zeit, O, H, L, C], Brokerzeit als UTC).
 * Der Kandidat bleibt mit Prüfliste und Urteil; Einstieg, Stop, Ziele und Stand entfallen, und der Vorrang laufender Handel (1122-A1.3) sieht ihn nicht.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import { parseFixture } from '../../src/lib/formation/fixture';
import { named, trendOf } from '../fixtures/formation-trend';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';

const load = (name: string): FormationBar[] =>
  (JSON.parse(readFileSync(`e2e/fixtures/long-leg-${name}-h1.json`, 'utf-8')) as number[][]).map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
const XAU = load('xauusd');
const EUR = load('eurusd');
const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-05' }, fn);
const ctxOf = (symbol: string, bars: FormationBar[]) => new FormationContext(symbol, { H1: { bars, missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
const shown = (ctx: FormationContext, iso: string): Candidate => analyzeAbcd(ctx, Date.parse(iso) / 1000).find((a) => a.tf === 'H1')!.candidate;
const abc = (c: Candidate) => [c.points.A?.price, c.points.B?.price, c.points.C?.price].map((v) => Math.round((v ?? 0) * 1e5) / 1e5);

test.describe('AB=CD: Form verfehlt → kein Handel (1126-A20.2)', () => {
  frm('XAUUSD 2025-12-23 18:00: ungültiges Tripel (C jenseits von A) trägt keinen Handel', () => {
    const c = shown(ctxOf('XAUUSD', XAU), '2025-12-23T18:00Z');
    expect(abc(c)).toEqual([4374.58, 4309.38, 4497.66]);
    expect(c.verdict).toBe('invalid');
    expect(c.invalidBy).toContain('ABCD-05');
    expect(c.trade).toBeUndefined();
    expect(c.drawings.some((d) => d.id === 'Z-ABCD-11')).toBe(false);
  });

  frm('EURUSD 2026-07-14 16:00: kein Verkauf auf dem Tripel mit C jenseits von A', () => {
    const c = shown(ctxOf('EURUSD', EUR), '2026-07-14T16:00Z');
    expect(abc(c)).toEqual([1.13839, 1.14454, 1.13769]);
    expect(c.trade).toBeUndefined();
  });

  frm('XAUUSD 2026-10-06 18:00: der Vorrang springt nicht auf das ungültige Tripel, der nächste Kandidat (im Aufbau) wird gezeigt', () => {
    const c = shown(ctxOf('XAUUSD', XAU), '2026-10-06T18:00Z');
    expect(abc(c)).toEqual([4226.26, 4103.82, 4179.63]);
    expect(c.verdict).toBe('forming');
  });

  frm('Positivkontrolle: gültige Tiefe (0,658) behält den Handel (XAUUSD 2026-10-08 07:00, Verkauf, Einstieg 4061.99, TP1)', () => {
    const c = shown(ctxOf('XAUUSD', XAU), '2026-10-08T07:00Z');
    expect(abc(c)).toEqual([4226.26, 4103.82, 4184.43]);
    expect(c.trade?.entry).toBe(4061.99);
    expect(c.trade?.status?.kind).toBe('tp1');
  });

  frm('1123-A bleibt: ein Tripel mit gültiger Form und ohne Einstieg (gar-buy-h4-01, im Aufbau) wird weiter gezeigt', () => {
    const fx = named('e2e/fixtures/formation/gar-buy-h4-01.json', parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-buy-h4-01.json', 'utf-8'))));
    // 1126-A13.2: das frühere Tripel (A 1.17279, B 1.15764) hat ein AB als Korrektur im Aufwärtstrend; derselbe Fall an einem Tripel mit Impuls-AB (Kauf nach dem Anstieg 1.15419 → 1.17279, vor dem ersten Einstieg)
    const now = 1761105600;
    const bars = fx.bars.filter((b) => b.time + 14400 <= now);
    const ctx = new FormationContext(fx.symbol, { H4: { bars, missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
    const c = analyzeAbcd(ctx, now).find((a) => a.tf === 'H4')!.candidate;
    expect(abc(c)).toEqual([1.15419, 1.17279, 1.15973]);
    expect(c.verdict).toBe('forming');
  });

  frm('1123-A gilt auch ohne Handel: D weit über CD > 1,618 × AB hinaus bei verfehlter Form lässt das Tripel fallen (abcd-buy-h4-02, Kerze 208)', () => {
    const fx = named('e2e/fixtures/formation/abcd-buy-h4-02.json', parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/abcd-buy-h4-02.json', 'utf-8'))));
    const ctx = new FormationContext(fx.symbol, { H4: { bars: fx.bars, missing: [] } }, { trend: trendOf(fx.bars) });
    const c = analyzeAbcd(ctx, fx.bars[208].time + 14400).find((a) => a.tf === 'H4')?.candidate;
    if (c?.points.A && c.points.D) {
      const cd = Math.abs(c.points.D.price - c.points.C!.price) / Math.abs(c.points.B!.price - c.points.A.price);
      expect(cd).toBeLessThanOrEqual(1.618);
    }
  });
});
