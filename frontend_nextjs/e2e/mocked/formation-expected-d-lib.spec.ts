/**
 * Erwartetes D und Abzeichen (A5.5, A5.6, A5.6.1) ohne Browser: drawingLayout.ts → gestrichelter Weg in die Zukunft,
 * Abzeichen „Name · oluşuyor“ / „Name ✓“, Stapel, Band bei D-Niveaus näher als 1,5 ATR.
 * FRM-44 Erwartetes D und Abzeichen
 */
import { test, expect } from '@playwright/test';
import { expectedD, layoutDrawings, layoutExpectedD, type DItem } from '../../src/lib/formation/drawingLayout';
import type { Candidate } from '../../src/lib/formation/types';

const frm = (name: string, body: () => void) => test(name, { tag: '@FRM-44' }, body);

const pt = (i: number, price: number) => ({ time: 1000 + i * 100, price });
const abcd = (level: number, verdict: Candidate['verdict'] = 'forming'): Candidate => ({
  code: 'ABCD',
  side: 'sell',
  tf: 'H4',
  points: { A: pt(0, 10), B: pt(1, 20), C: pt(2, 15), ...(verdict === 'valid' ? { D: pt(4, level) } : {}) },
  verdict,
  checks: [],
  drawings: [
    { id: 'Z-ABCD-01', tool: 'zigzag', anchors: [pt(0, 10), pt(1, 20), pt(2, 15)], rules: ['ABCD-01'], side: 'sell' },
    { id: 'Z-ABCD-02', tool: 'hline', anchors: [pt(1, level)], levels: [1], rules: ['ABCD-07'], side: 'sell' },
  ],
});

const text = (key: string) => {
  if (key.startsWith('formation.form.')) return key.slice('formation.form.'.length);
  return key === 'formation.verdict.forming' ? 'oluşuyor' : key;
};
const base = { width: 500, height: 400, lastTime: 1500, barSec: 100, close: 22, atr: 1, x: (t: number) => (t - 1000) / 2, y: (p: number) => 300 - p * 10, text, fmt: (n: number) => String(n) };
const items = (...levels: number[]): DItem[] => levels.map((l, i) => ({ id: `ABCD-H${i}`, form: 'ABCD', candidate: abcd(l) }));

test.describe('FRM-44 Erwartetes D', () => {
  frm('im Aufbau: D = C plus Dauer von AB, Preis = Level 1', () => {
    expect(expectedD(abcd(25), 'ABCD')).toEqual({ time: 1300, price: 25 });
    expect(expectedD(abcd(25, 'valid'), 'ABCD')).toBeNull();
  });

  frm('gestrichelter Weg von C in die Zukunft (nicht zur letzten Kerze), Ring „D?“ und Preis', () => {
    const zig = layoutDrawings({ candidate: abcd(25), form: 'ABCD', lastBar: { time: 1200, close: 22 }, yRsi: (v) => v, yWave: (v) => v, ...base }).find((g) => g.id === 'Z-ABCD-01')!;
    const dashed = zig.prims.find((p) => p.kind === 'line' && p.dashed);
    expect(dashed).toMatchObject({ x1: 100, y1: 150, x2: 150, y2: 50 });
    expect(zig.prims.find((p) => p.kind === 'circle' && p.open)).toMatchObject({ x: 150, y: 50 });
    expect(zig.prims.some((p) => p.kind === 'text' && p.text === 'D?')).toBe(true);
    expect(zig.prims.some((p) => p.kind === 'text' && p.text === '25' && p.anchor === 'end')).toBe(true);
  });

  frm('Weg endet am Rand, wenn das D nicht mehr in den Zeichenbereich passt', () => {
    const zig = layoutDrawings({ candidate: abcd(25), form: 'ABCD', lastBar: { time: 1200, close: 22 }, yRsi: (v) => v, yWave: (v) => v, ...base, width: 120 }).find((g) => g.id === 'Z-ABCD-01')!;
    expect(zig.prims.find((p) => p.kind === 'line' && p.dashed)).toMatchObject({ x2: 112 });
  });

  frm('Abzeichen: im Aufbau mit Text, gültig mit Haken; Stand lesbar ohne Farbe', () => {
    const forming = layoutExpectedD({ ...base, selectedId: 'ABCD-H0', items: items(25) });
    expect(forming.badges).toHaveLength(1);
    expect(forming.badges[0]).toMatchObject({ label: 'ABCD · oluşuyor', status: 'forming', selected: true });
    expect(forming.badges[0].bx).toBeGreaterThan(forming.badges[0].x);
    const valid = layoutExpectedD({ ...base, selectedId: 'v', items: [{ id: 'v', form: 'GAR', candidate: abcd(18, 'valid') }] });
    expect(valid.badges[0]).toMatchObject({ label: 'GAR ✓', status: 'valid' });
  });

  frm('mehrere Formationen: ein Stapel, nächstes D oben, nur blasse Ringe für die übrigen, Klick-Ziel je Abzeichen', () => {
    const d = layoutExpectedD({ ...base, selectedId: 'ABCD-H1', items: items(40, 24, 8) });
    expect(d.badges.map((b) => b.id)).toEqual(['ABCD-H1', 'ABCD-H2', 'ABCD-H0']);
    const ys = d.badges.map((b) => b.by);
    expect(ys[1]).toBeGreaterThan(ys[0]);
    expect(ys[2]).toBeGreaterThan(ys[1]);
    expect(d.rings.map((r) => r.id).sort()).toEqual(['ABCD-H0', 'ABCD-H2']);
  });

  frm('D-Niveaus näher als 1,5 ATR: ein Band „D? bölgesi“ mit beiden Preisen', () => {
    const d = layoutExpectedD({ ...base, selectedId: 'ABCD-H0', items: items(25, 26, 40) });
    expect(d.bands).toHaveLength(1);
    expect(d.bands[0].label).toBe('formation.expectedD.band 25 – 26');
    expect(layoutExpectedD({ ...base, atr: 0.5, selectedId: 'ABCD-H0', items: items(25, 26) }).bands).toHaveLength(0);
  });
  frm('R1-07: D-Zeit in der Vergangenheit rückt eine Kerze hinter die letzte Kerze (Ring und Abzeichen)', () => {
    const past = layoutExpectedD({ ...base, selectedId: 'ABCD-H0', items: items(25) });
    expect(past.badges[0].x).toBeGreaterThanOrEqual(base.x(1500));
    const zig = layoutDrawings({ candidate: abcd(25), form: 'ABCD', lastBar: { time: 1500, close: 22 }, yRsi: (v) => v, yWave: (v) => v, ...base }).find((g) => g.id === 'Z-ABCD-01')!;
    const ring = zig.prims.find((p) => p.kind === 'circle' && p.open)!;
    expect((ring as { x: number }).x).toBeGreaterThanOrEqual(base.x(1500));
    expect((ring as { x: number }).x).toBe(past.badges[0].x);
  });

  frm('R1-07: D-Zeit in einer Marktlücke: Rozet-Zahl = Ring-Zahl', () => {
    const gap = { ...base, x: (t: number) => (t > 1250 && t < 1350 ? null : base.x(t)) };
    const badges = layoutExpectedD({ ...gap, selectedId: 'ABCD-H0', items: items(25) }).badges;
    const zig = layoutDrawings({ candidate: abcd(25), form: 'ABCD', lastBar: { time: 1500, close: 22 }, yRsi: (v) => v, yWave: (v) => v, ...gap }).find((g) => g.id === 'Z-ABCD-01')!;
    const rings = zig.prims.filter((p) => p.kind === 'circle' && p.open);
    expect(rings).toHaveLength(1);
    expect(badges).toHaveLength(rings.length);
  });

  frm('R1-07: D-Zeit auch nach dem Verschieben nicht abbildbar: Rozet-Zahl = Ring-Zahl', () => {
    const none = { ...base, x: (t: number) => (t >= 1600 ? null : base.x(t)) };
    const badges = layoutExpectedD({ ...none, selectedId: 'ABCD-H0', items: items(25) }).badges;
    const zig = layoutDrawings({ candidate: abcd(25), form: 'ABCD', lastBar: { time: 1500, close: 22 }, yRsi: (v) => v, yWave: (v) => v, ...none }).find((g) => g.id === 'Z-ABCD-01')!;
    const rings = zig.prims.filter((p) => p.kind === 'circle' && p.open);
    expect(rings).toHaveLength(1);
    expect(badges).toHaveLength(rings.length);
  });

  frm('R1-08: Stapel bleibt im Zeichenbereich, Preisschrift schneidet kein Abzeichen', () => {
    const d = layoutExpectedD({ ...base, height: 120, selectedId: 'ABCD-H0', items: items(40, 24, 8, 30, 12) });
    for (const b of d.badges) {
      expect(b.by).toBeGreaterThanOrEqual(0);
      expect(b.by + b.h).toBeLessThanOrEqual(120);
    }
    const stack = { left: Math.min(...d.badges.map((b) => b.bx)), top: Math.min(...d.badges.map((b) => b.by)), bottom: Math.max(...d.badges.map((b) => b.by + b.h)) };
    const zig = layoutDrawings({ candidate: abcd(25), form: 'ABCD', lastBar: { time: 1500, close: 22 }, stack, yRsi: (v) => v, yWave: (v) => v, ...base, y: (p: number) => 150 - p * 4 }).find((g) => g.id === 'Z-ABCD-01')!;
    const price = zig.prims.find((p) => p.kind === 'text' && p.text === '25' && p.anchor === 'end') as { x: number; y: number };
    expect(price.x).toBeLessThanOrEqual(stack.left);
  });
});

test('FRM-44 gemessenes, aber nicht erreichtes D (nicht im Zickzack): weiter erwartetes D', { tag: '@FRM-44' }, () => {
  const c = abcd(25);
  c.points.D = pt(3, 18);
  expect(expectedD(c, 'ABCD')).toEqual({ time: 1300, price: 25 });
});
