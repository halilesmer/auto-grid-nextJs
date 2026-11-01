/** Grenzfälle mit eigenen Preisen; beide Handelsrichtungen nutzen gespiegelte Kerzen. */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { checkButCandidate } from '../../src/lib/formation/butChecks';
import { checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import { checkCypCandidate } from '../../src/lib/formation/cypChecks';
import { checkBatCandidate } from '../../src/lib/formation/batChecks';
import { checkGarCandidate } from '../../src/lib/formation/garChecks';
import { pipOf } from '../../src/lib/formation/xabcd';
import type { FormationBar } from '../../src/lib/formation/types';

const M15 = 900;
const H1 = 3600;
const H4 = 14400;
const D1 = 86400;
const DUR = { M15, H1, H4, D1 } as const;
const bar = (time: number, low: number, high: number, body: number): FormationBar => ({ time, low, high, open: body, close: body });
const reflect = (b: FormationBar): FormationBar => ({ time: b.time, low: -b.high, high: -b.low, open: -b.open, close: -b.close });

const ZONE_SPECS = [
  { id: 'GAR-10', tag: '@FRM-07', check: checkGarCandidate, b: 500, c: 800, target: 364 },
  { id: 'BAT-11', tag: '@FRM-07', check: checkBatCandidate, b: 200, c: 800, target: 114 },
  { id: 'BUT-12', tag: '@FRM-13', check: checkButCandidate, c: 800, target: -272 },
  { id: 'CRB-12', tag: '@FRM-14', check: checkCrbCandidate, c: 800, target: -618 },
  { id: 'CYP-09', tag: '@FRM-12', check: checkCypCandidate, c: 2000, target: 428 },
] as const;

for (const spec of ZONE_SPECS) {
  for (const buy of [true, false]) {
    for (const edge of [{ gap: 0, want: 'met' }, { gap: 0.001, want: 'unmet' }] as const) {
      test(`${spec.id}: ${buy ? 'Kauf' : 'Verkauf'}, Zonenkante mit Abstand ${edge.gap}`, { tag: spec.tag }, () => {
        // Frühere D1-Unterstützung mit Breite 1. Das Ziel liegt an der Unterkante oder 0.001 darunter.
        const low = spec.target + edge.gap;
        const h4 = Array.from({ length: 50 }, (_, i) => bar(i * H4, 2999, 3001, 3000));
        const d1 = Array.from({ length: 5 }, (_, i) => i === 2 ? bar(i * D1, low, low + 3, low + 1) : bar(i * D1, low + 2, low + 4, low + 3));
        const ctx = new FormationContext('TEST', { H4: buy ? h4 : h4.map(reflect), D1: buy ? d1 : d1.map(reflect) });
        const anchor = (idx: number, price: number) => ({ time: idx * H4, price: buy ? price : -price });
        const candidate = spec.check(ctx, 50 * H4, {
          tf: 'H4', x: anchor(36, 0), a: anchor(38, 1000), b: anchor(40, 'b' in spec ? spec.b : 200), c: anchor(42, spec.c), d: anchor(44, spec.target),
        });
        expect(candidate.side).toBe(buy ? 'buy' : 'sell');
        expect(candidate.checks.find((c) => c.id === spec.id)?.state).toBe(edge.want);
      });
    }
  }
}

// Zonen zählen nur aus der Formations-Zeiteinheit oder einer höheren (Regelbuch: „der Formations- oder einer höheren ZE“)
type Tf = keyof typeof DUR;
for (const spec of ZONE_SPECS) {
  for (const c of [
    { form: 'H4', zone: 'H1', want: 'unmet' },
    { form: 'H4', zone: 'H4', want: 'met' },
    { form: 'H4', zone: 'D1', want: 'met' },
    { form: 'M15', zone: 'H1', want: 'met' },
    { form: 'M15', zone: 'M15', want: 'met' },
  ] as const) {
    test(`${spec.id}: Formation ${c.form}, Zone nur in ${c.zone} → ${c.want}`, { tag: spec.tag }, () => {
      const dur = DUR[c.form as Tf];
      // Grundreihe fällt so steil, dass jede Kerze unter dem Tief ihrer Vorgängerin schließt: sie hat kein Fraktal
      const falling = Array.from({ length: 50 }, (_, i) => bar(i * dur, 2999 - 10 * i, 3001 - 10 * i, 3000 - 10 * i));
      // Fraktal-Tief am Ziel (Zonenbreite 1): in der Grundreihe selbst oder als eigene 5-Kerzen-Reihe der Zonen-Zeiteinheit
      const dip = (time: number): FormationBar => ({ time, low: spec.target, high: spec.target + 4, open: spec.target + 1, close: spec.target + 3 }); // Docht 1 < 2 × Körper 2: keine Manipulationszone
      const own = c.zone === c.form;
      const base = own ? falling.map((b, i) => (i === 24 ? dip(b.time) : b)) : falling;
      const start = 10 * dur;
      const zoneBars = Array.from({ length: 5 }, (_, i) => (i === 2 ? dip(start + i * DUR[c.zone as Tf]) : bar(start + i * DUR[c.zone as Tf], spec.target + 2, spec.target + 4, spec.target + 3)));
      const extra = own ? null : zoneBars;
      const ctx = new FormationContext('TEST', { [c.form]: base, ...(extra ? { [c.zone]: extra } : {}) });
      const anchor = (idx: number, price: number) => ({ time: idx * dur, price });
      const candidate = spec.check(ctx, 50 * dur, {
        tf: c.form, x: anchor(36, 0), a: anchor(38, 1000), b: anchor(40, 'b' in spec ? spec.b : 200), c: anchor(42, spec.c), d: anchor(44, spec.target),
      });
      expect(candidate.checks.find((x) => x.id === spec.id)?.state).toBe(c.want);
    });
  }
}

test('Pip-Klassen: Währungspaare, Metalle und übrige Symbole', { tag: '@FRM-07' }, () => {
  expect(pipOf('EURUSD')).toBe(0.0001);
  expect(pipOf('eurusd.a')).toBe(0.0001);
  expect(pipOf('USDJPY')).toBe(0.01);
  expect(pipOf('XAUUSD')).toBe(0.1);
  expect(pipOf('XAGUSD')).toBe(0.01);
  expect(pipOf('GERMANY40')).toBe(0.01);
  expect(pipOf('BTCUSD')).toBe(0.01);
});

for (const buy of [true, false]) {
  for (const edge of [{ b: 382.01, want: 'met' }, { b: 382.011, want: 'unmet' }] as const) {
    test(`GAR-03: GERMANY40 ${buy ? 'Kauf' : 'Verkauf'}, B ${edge.b}`, { tag: '@FRM-07' }, () => {
      const bars = Array.from({ length: 12 }, (_, i) => bar(i * H4, 0, 1000, 500));
      const anchor = (idx: number, price: number) => ({ time: idx * H4, price: buy ? price : -price });
      const candidate = checkGarCandidate(new FormationContext('GERMANY40', { H4: buy ? bars : bars.map(reflect) }), 12 * H4, {
        tf: 'H4', x: anchor(2, 0), a: anchor(4, 1000), b: anchor(6, edge.b), c: anchor(8, 800), d: anchor(10, 300),
      });
      expect(candidate.side).toBe(buy ? 'buy' : 'sell');
      expect(candidate.checks.find((c) => c.id === 'GAR-03')?.state).toBe(edge.want);
    });
  }
}

for (const spec of [
  { id: 'BUT-02', tag: '@FRM-13', check: checkButCandidate, key: 'b', level: 214, short: 214.001 },
  { id: 'BUT-04', tag: '@FRM-13', check: checkButCandidate, key: 'c', level: 505.6, short: 505.599 },
  { id: 'BUT-07', tag: '@FRM-13', check: checkButCandidate, key: 'd', level: -272, short: -271.999 },
  { id: 'BUT-08', tag: '@FRM-13', check: checkButCandidate, key: 'c', level: 694.4, short: 694.399 },
  { id: 'CRB-02', tag: '@FRM-14', check: checkCrbCandidate, key: 'c', level: 505.6, short: 505.599 },
  { id: 'CRB-04', tag: '@FRM-14', check: checkCrbCandidate, key: 'd', level: -618, short: -617.999 },
  { id: 'CRB-06', tag: '@FRM-14', check: checkCrbCandidate, key: 'b', level: 618, short: 618.001 },
  { id: 'CRB-08', tag: '@FRM-14', check: checkCrbCandidate, key: 'b', level: 114, short: 114.001 },
  { id: 'CYP-03', tag: '@FRM-12', check: checkCypCandidate, key: 'b', level: 618, short: 618.001 },
  { id: 'CYP-04', tag: '@FRM-12', check: checkCypCandidate, key: 'c', level: 1272, short: 1271.999 },
] as const) {
  for (const buy of [true, false]) {
    for (const edge of [{ price: spec.level, want: 'met' }, { price: spec.short, want: 'unmet' }] as const) {
      test(`${spec.id}: ${buy ? 'Kauf' : 'Verkauf'}, Pflichtlevel ${edge.price}`, { tag: spec.tag }, () => {
        const bars = Array.from({ length: 12 }, (_, i) => bar(i * H4, -1000, 2000, 500));
        const prices = { x: 0, a: 1000, b: 200, c: 800, d: -700, [spec.key]: edge.price };
        const anchor = (idx: number, price: number) => ({ time: idx * H4, price: buy ? price : -price });
        const candidate = spec.check(new FormationContext('TEST', { H4: buy ? bars : bars.map(reflect) }), 12 * H4, {
          tf: 'H4', x: anchor(2, prices.x), a: anchor(4, prices.a), b: anchor(6, prices.b), c: anchor(8, prices.c), d: anchor(10, prices.d),
        });
        expect(candidate.side).toBe(buy ? 'buy' : 'sell');
        expect(candidate.checks.find((c) => c.id === spec.id)?.state).toBe(edge.want);
      });
    }
  }
}

for (const buy of [true, false]) {
  test(`BUT-02: ${buy ? 'Kauf' : 'Verkauf'}, exakter Preis 106.42`, { tag: '@FRM-13' }, () => {
    const bars = Array.from({ length: 12 }, (_, i) => bar(i * H4, 90, 140, 110));
    const anchor = (idx: number, price: number) => ({ time: idx * H4, price: buy ? price : -price });
    const candidate = checkButCandidate(new FormationContext('TEST', { H4: buy ? bars : bars.map(reflect) }), 12 * H4, {
      tf: 'H4', x: anchor(2, 100), a: anchor(4, 130), b: anchor(6, 106.42), c: anchor(8, 120), d: anchor(10, 91.84),
    });
    expect(candidate.checks.find((c) => c.id === 'BUT-02')?.state).toBe('met');
  });
}

for (const buy of [true, false]) {
  for (const edge of [{ d: 428.01, want: 'met' }, { d: 428.011, want: 'unmet' }] as const) {
    test(`CYP-07: ${buy ? 'Kauf' : 'Verkauf'}, 1-Pip-Grenze bei D ${edge.d}`, { tag: '@FRM-12' }, () => {
      const bars = Array.from({ length: 12 }, (_, i) => bar(i * H4, 0, 2000, 500));
      const anchor = (idx: number, price: number) => ({ time: idx * H4, price: buy ? price : -price });
      const candidate = checkCypCandidate(new FormationContext('TEST', { H4: buy ? bars : bars.map(reflect) }), 12 * H4, {
        tf: 'H4', x: anchor(2, 0), a: anchor(4, 1000), b: anchor(6, 500), c: anchor(8, 2000), d: anchor(10, edge.d),
      });
      expect(candidate.checks.find((c) => c.id === 'CYP-07')?.state).toBe(edge.want);
    });
  }
}
