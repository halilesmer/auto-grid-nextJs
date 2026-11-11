/**
 * Reine Rechenfälle der schwebenden Zeichnungsleiste (UI-29, Plan 1110-A4.13): Knöpfe je Art, erster Platz mit Ausweichen,
 * Deckkraft-erhaltende Farbe, Speicherformat, Pfeiltasten-Schritt.
 */
import { expect, test } from '@playwright/test';
import { barButtons, barFamily, firstPlace, keepAlpha, nudge, parseFloatingBar, LOCK_DISABLED } from '../../src/lib/chart-workspace/floatingBar';

const AREA = { width: 1000, height: 600, left: 0, right: 60, top: 0, bottom: 28 };
const SIZE = { width: 300, height: 40 };

test('Knöpfe je Art folgen der Tabelle A4.13.1', { tag: '@UI-29' }, () => {
  expect(barFamily(['fib-retracement'])).toBe('fib');
  expect(barFamily(['trend-line'])).toBe('line');
  expect(barFamily(['rectangle'])).toBe('shape');
  expect(barFamily(['text'])).toBe('text');
  expect(barFamily(['trend-line', 'rectangle'])).toBe('multi');
  expect(barButtons('fib')).toEqual(['template', 'color', 'width', 'settings', 'lock', 'remove', 'more']);
  expect(barButtons('line')).toEqual(['color', 'width', 'style', 'settings', 'lock', 'remove', 'more']);
  expect(barButtons('shape')).toEqual(['color', 'fill', 'width', 'settings', 'lock', 'remove', 'more']);
  expect(barButtons('text')).toEqual(['color', 'size', 'settings', 'lock', 'remove', 'more']);
  expect(barButtons('multi')).toEqual(['color', 'lock', 'remove', 'more']);
  // Alarm gibt es nicht; bei Sperre bleiben Einstellungen, Sperre und „…“ offen
  for (const f of ['fib', 'line', 'shape', 'text', 'multi'] as const) {
    expect(barButtons(f)).not.toContain('alarm' as never);
    for (const open of ['settings', 'lock', 'more'] as const) expect(LOCK_DISABLED).not.toContain(open);
  }
});

test('Erster Platz: oben Mitte, 6 px tiefer; weicht der Legende aus', { tag: '@UI-29' }, () => {
  // Breite 1000, rechts 60: Mitte von 940 → (940 − 300) / 2 = 320
  expect(firstPlace(AREA, SIZE, [])).toEqual({ left: 320, top: 6 });
  // Legende reicht bis x = 325 (überdeckt die Mitte): rückt rechts daneben (331, 331 + 300 ≤ 634)
  expect(firstPlace(AREA, SIZE, [{ left: 0, top: 0, right: 325, bottom: 20 }])).toEqual({ left: 331, top: 6 });
  // Legende bis x = 400: rechts daneben ist kein Platz → unter die Legende, wieder mittig
  expect(firstPlace(AREA, SIZE, [{ left: 0, top: 0, right: 400, bottom: 20 }])).toEqual({ left: 320, top: 26 });
  // Schmal: rechts daneben ist kein Platz → unter die Legende
  const narrow = { ...AREA, width: 520 };
  expect(firstPlace(narrow, SIZE, [{ left: 0, top: 0, right: 300, bottom: 36 }])).toEqual({ left: Math.round((460 - 300) / 2), top: 42 });
  // Legende endet links der Mitte: kein Ausweichen
  expect(firstPlace(AREA, SIZE, [{ left: 0, top: 0, right: 200, bottom: 20 }])).toEqual({ left: 320, top: 6 });
});

test('Farbe behält die Deckkraft', { tag: '@UI-29' }, () => {
  expect(keepAlpha('#ffffff80', '#F23645')).toBe('#f2364580');
  expect(keepAlpha('#ffffff', '#f23645')).toBe('#f23645');
  expect(keepAlpha(undefined, '#2962ff')).toBe('#2962ff');
});

test('Gespeicherter Platz und Pfeiltasten', { tag: '@UI-29' }, () => {
  expect(parseFloatingBar({ x: 0.4, y: 0.2 })).toEqual({ x: 0.4, y: 0.2 });
  expect(parseFloatingBar({ x: 3, y: -1 })).toEqual({ x: 1, y: 0 });
  expect(parseFloatingBar({ x: 'a', y: 1 })).toBeNull();
  expect(parseFloatingBar(null)).toBeNull();
  expect(nudge({ x: 0.5, y: 0.5 }, 'ArrowRight', false)).toEqual({ x: 0.53, y: 0.5 });
  expect(nudge({ x: 0.5, y: 0.5 }, 'ArrowUp', true)).toEqual({ x: 0.5, y: 0.4 });
  expect(nudge({ x: 0.99, y: 0.5 }, 'ArrowRight', true)?.x).toBe(1);
  expect(nudge({ x: 0.5, y: 0.5 }, 'a', false)).toBeNull();
});
