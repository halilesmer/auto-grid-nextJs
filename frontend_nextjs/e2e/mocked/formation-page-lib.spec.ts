/**
 * Logik der Seite /formasyon ohne Browser: Zeichnungen → SVG-Bausteine (drawingLayout.ts) und Auswahl der Zeiteinheit
 * (scan.ts). Die Kandidaten sind von Hand gebaut; erwartet werden die Regeln des freigegebenen Entwurfs.
 * FRM-20 Zeichnungen einer Formation im Aufbau · FRM-18 Zählung und Sprung
 */
import { test, expect } from '@playwright/test';
import { layoutDrawings } from '../../src/lib/formation/drawingLayout';
import { hitsCount, timeframeForForm, type ScanHit } from '../../src/lib/formation/scan';
import type { Candidate } from '../../src/lib/formation/types';

const frm = (id: string, name: string, body: () => void) => test(name, { tag: `@${id}` }, body);

const point = (i: number, price: number) => ({ time: 1000 + i * 100, price });

/** ABCD im Aufbau (Verkauf): A, B, C bestätigt, D fehlt; eine Zone, eine Verhältnis-Linie */
const forming: Candidate = {
  code: 'ABCD',
  side: 'sell',
  tf: 'H4',
  points: { A: point(0, 10), B: point(1, 20), C: point(2, 15) },
  verdict: 'forming',
  checks: [],
  drawings: [
    { id: 'Z-1', tool: 'zigzag', anchors: [point(0, 10), point(1, 20), point(2, 15)], rules: ['ABCD-01'], side: 'sell' },
    { id: 'Z-2', tool: 'zone', anchors: [point(2, 24), { time: 1500, price: 26 }], rules: ['ABCD-09'], side: 'sell' },
    { id: 'Z-3', tool: 'fib', anchors: [point(0, 10), point(1, 20)], levels: [0.5, -0.272], rules: ['ABCD-04'], side: 'sell' },
  ],
};

const layout = (candidate: Candidate) =>
  layoutDrawings({
    candidate,
    form: 'ABCD',
    width: 500,
    lastBar: { time: 1500, close: 22 },
    x: (time) => (time - 1000) / 2,
    y: (price) => 300 - price * 10,
    yRsi: (value) => 400 - value,
    text: (key) => key,
    fmt: (n) => String(n),
  });

test.describe('Zeichnungen einer Formation im Aufbau', () => {
  frm('FRM-20', 'bestätigte Punkte fest, Weg zum fehlenden D gestrichelt, D als offener Kreis mit Fragezeichen', () => {
    const zig = layout(forming).find((g) => g.id === 'Z-1')!;
    const lines = zig.prims.filter((p) => p.kind === 'line');
    expect(lines.map((l) => l.kind === 'line' && Boolean(l.dashed))).toEqual([false, false, true]);
    const open = zig.prims.find((p) => p.kind === 'circle' && p.open);
    expect(open).toMatchObject({ kind: 'circle', x: 250, y: 80, open: true });
    expect(zig.prims.some((p) => p.kind === 'text' && p.text === 'D?')).toBe(true);
    expect(zig.prims.filter((p) => p.kind === 'text').map((p) => p.kind === 'text' && p.text).sort()).toEqual(['A', 'B', 'C', 'D?']);
  });

  frm('FRM-20', 'D vorhanden, aber nicht erreicht: der Weg läuft gestrichelt zum Punkt D, der als offener Kreis steht', () => {
    const open: Candidate = { ...forming, points: { ...forming.points, D: point(3, 24) } };
    const zig = layout(open).find((g) => g.id === 'Z-1')!;
    expect(zig.prims.find((p) => p.kind === 'circle' && p.open)).toMatchObject({ x: 150, y: 60 });
    expect(zig.prims.some((p) => p.kind === 'text' && p.text === 'D?')).toBe(true);
  });

  frm('FRM-20', 'gleiche Beschriftung auf gleicher Höhe nur einmal, nahe Beschriftungen mindestens 12 px auseinander', () => {
    const twice: Candidate = {
      ...forming,
      drawings: [
        { id: 'Z-3', tool: 'fib', anchors: [point(0, 10), point(1, 20)], levels: [0.5, 0.52], rules: [], side: 'sell' },
        { id: 'Z-4', tool: 'fib', anchors: [point(0, 10), point(1, 20)], levels: [0.5], rules: [], side: 'sell' },
      ],
    };
    const labels = layout(twice).flatMap((g) => g.prims.filter((p) => p.kind === 'text'));
    expect(labels.map((p) => p.kind === 'text' && p.text)).toEqual(['AB 0.5', 'AB 0.52']);
    const ys = labels.map((p) => (p.kind === 'text' ? p.y : 0)).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(12);
  });

  frm('FRM-20', 'Zone heißt „mögliche Zone“, solange D fehlt', () => {
    const zone = layout(forming).find((g) => g.id === 'Z-2')!;
    expect(zone.prims.some((p) => p.kind === 'text' && p.text === 'formation.draw.zonePossible')).toBe(true);
    const done = layout({ ...forming, verdict: 'valid', points: { ...forming.points, D: point(3, 24) } }).find((g) => g.id === 'Z-2')!;
    expect(done.prims.some((p) => p.kind === 'text' && p.text === 'formation.draw.zone')).toBe(true);
  });

  frm('FRM-20', 'Verhältnis-Linien: Preis = Ende + Level × (Start − Ende), mit Beschriftung am rechten Rand', () => {
    const fib = layout(forming).find((g) => g.id === 'Z-3')!;
    const ys = fib.prims.filter((p) => p.kind === 'line').map((p) => (p.kind === 'line' ? p.y1 : null));
    // Start 10, Ende 20: Level 0,5 → 15 (y 150), Level −0,272 → 22,72 (y 72.8)
    expect(ys[0]).toBeCloseTo(150, 5);
    expect(ys[1]).toBeCloseTo(72.8, 5);
    expect(fib.prims.filter((p) => p.kind === 'text').map((p) => p.kind === 'text' && p.text)).toEqual(['AB 0.5', 'AB -0.272']);
  });

  frm('FRM-20', 'jede Gruppe trägt die Bedingungs-IDs für den Hover', () => {
    expect(layout(forming).map((g) => [g.id, g.rules, g.pane])).toEqual([
      ['Z-1', ['ABCD-01'], 'price'],
      ['Z-2', ['ABCD-09'], 'price'],
      ['Z-3', ['ABCD-04'], 'price'],
    ]);
  });
});

const hit = (form: ScanHit['form'], tf: ScanHit['tf'], verdict: Candidate['verdict']): ScanHit => ({
  form,
  tf,
  candidate: { ...forming, code: form, tf, verdict },
});

test.describe('Treffer zählen und Zeiteinheit wählen', () => {
  const hits = [hit('GAR', 'H4', 'valid'), hit('GAR', 'H1', 'forming'), hit('GAR', 'D1', 'invalid'), hit('BAT', 'M15', 'valid')];

  frm('FRM-18', 'ungültige Treffer zählen nicht', () => {
    expect(hitsCount(hits, { form: 'GAR' })).toBe(2);
    expect(hitsCount(hits, { tf: 'D1' })).toBe(0);
    expect(hitsCount(hits, { tf: 'M15' })).toBe(1);
  });

  frm('FRM-18', 'Klick auf eine Formation: eigene Zeiteinheit bleibt, sonst die höchste mit Treffer', () => {
    expect(timeframeForForm(hits, 'GAR', 'H1')).toBe('H1');
    expect(timeframeForForm(hits, 'GAR', 'M15')).toBe('H4');
    expect(timeframeForForm(hits, 'BAT', 'D1')).toBe('M15');
    expect(timeframeForForm(hits, 'CRB', 'H4')).toBe('H4');
  });
});
