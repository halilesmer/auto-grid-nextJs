/**
 * Trefferprüfung der Trendlinie (ANA-25, Plan 1105-A7, S4): Abstand Punkt–Strecke in Pixeln.
 */
import { test, expect } from '@playwright/test';
import { TREND_HIT_PX, distanceToSegment, nearestDistance, toScreenSegments } from '../../src/lib/chart/trendHit';

const flat = { x1: 0, y1: 0, x2: 100, y2: 0 };

test('Abstand zur Mitte einer Strecke ist der senkrechte Abstand', { tag: '@ANA-25' }, () => {
  expect(distanceToSegment(50, 4, flat)).toBeCloseTo(4);
  expect(distanceToSegment(50, -4, flat)).toBeCloseTo(4);
  expect(distanceToSegment(50, 0, flat)).toBe(0);
});

test('Abstand zu einer Schräge ist senkrecht zur Strecke', { tag: '@ANA-25' }, () => {
  // Strecke y = x; der Punkt (10, 0) liegt 10 / √2 neben ihr
  expect(distanceToSegment(10, 0, { x1: 0, y1: 0, x2: 100, y2: 100 })).toBeCloseTo(10 / Math.SQRT2);
});

test('Hinter dem Endpunkt zählt der Abstand zum Endpunkt, nicht zur Verlängerung', { tag: '@ANA-25' }, () => {
  expect(distanceToSegment(103, 4, flat)).toBeCloseTo(5);
  expect(distanceToSegment(-3, 4, flat)).toBeCloseTo(5);
  expect(distanceToSegment(100, 0, flat)).toBe(0);
});

test('Eine Strecke der Länge null ist ein Punkt', { tag: '@ANA-25' }, () => {
  const point = { x1: 10, y1: 10, x2: 10, y2: 10 };
  expect(distanceToSegment(13, 14, point)).toBeCloseTo(5);
  expect(distanceToSegment(10, 10, point)).toBe(0);
});

test('Ohne Schenkel gibt es keinen Treffer', { tag: '@ANA-25' }, () => {
  expect(nearestDistance([], 5, 5)).toBe(Infinity);
});

test('Der kleinste Abstand gewinnt, auch bei nur einem Schenkel', { tag: '@ANA-25' }, () => {
  expect(nearestDistance([flat], 50, 3)).toBeCloseTo(3);
  expect(nearestDistance([flat, { x1: 0, y1: 20, x2: 100, y2: 20 }], 50, 18)).toBeCloseTo(2);
});

test('Die Grenze liegt bei 6 px: genau 6 px trifft, 6,01 px nicht', { tag: '@ANA-25' }, () => {
  expect(TREND_HIT_PX).toBe(6);
  expect(nearestDistance([flat], 50, 6) <= TREND_HIT_PX).toBe(true);
  expect(nearestDistance([flat], 50, 6.01) <= TREND_HIT_PX).toBe(false);
});

test('Schenkel außerhalb der sichtbaren Zeitachse (kein x) fallen weg, die übrigen bleiben', { tag: '@ANA-25' }, () => {
  const lines = [
    { from: { time: 1, price: 10 }, to: { time: 2, price: 20 } },
    { from: { time: 2, price: 20 }, to: { time: 3, price: 15 } },
    { from: { time: 3, price: 15 }, to: { time: 4, price: 30 } },
  ];
  const xOf = (time: number) => (time === 1 ? null : time * 10);
  const yOf = (price: number) => (price === 30 ? null : price);
  const segments = toScreenSegments(lines, xOf, yOf);
  expect(segments).toHaveLength(1);
  expect(segments[0]).toMatchObject({ x1: 20, y1: 20, x2: 30, y2: 15 });
  expect(segments[0].line).toBe(lines[1]);
});
