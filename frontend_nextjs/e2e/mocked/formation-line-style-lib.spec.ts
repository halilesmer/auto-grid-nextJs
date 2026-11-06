/**
 * Linienstil ohne Browser (lineStyle.ts): Farbfilter und Canvas-Farbe.
 * FRM-46 Formationslinien: Stil je Rolle im Speicher
 */
import { test, expect } from '@playwright/test';
import { canvasColor, sanitizeFormationStyle } from '../../src/lib/formation/lineStyle';

const frm = (name: string, body: () => void) => test(name, { tag: '@FRM-46' }, body);
const zigzag = (color: string) => sanitizeFormationStyle({ zigzag: { color } }).zigzag.color;

frm('Canvas-Farbe: var() wird gelöst, Hex bleibt, leer bleibt leer (R1-01)', () => {
  const read = (n: string) => (n === '--muted-foreground' ? ' #888888 ' : '');
  expect(canvasColor('var(--muted-foreground)', read)).toBe('#888888');
  expect(canvasColor('#16a56b', read)).toBe('#16a56b');
  expect(canvasColor('', read)).toBe('');
  // Unbekannte Variable: keine ungültige Farbe an Canvas geben
  expect(canvasColor('var(--gibt-es-nicht)', read)).toBe('');
});

frm('Farbfilter: Hex nur mit 3, 4, 6 oder 8 Ziffern (R1-09)', () => {
  for (const ok of ['#abc', '#abcd', '#aabbcc', '#aabbccdd']) expect(zigzag(ok)).toBe(ok);
  for (const bad of ['#12345', '#1234567', '#12', '#123456789']) expect(zigzag(bad)).not.toBe(bad);
});

frm('Farbfilter: rgb()/hsl() nur mit Zahlen, var(--name) bleibt (R1-09)', () => {
  for (const ok of ['rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'rgb(1 2 3 / 50%)', 'hsl(120, 50%, 40%)', 'hsla(120,50%,40%,.5)', 'var(--muted-foreground)']) expect(zigzag(ok)).toBe(ok);
  for (const bad of ['rgb(,,,)', 'rgb()', 'rgb(1,2)', 'rgb(1,2,3,4,5)', 'hsl(. , % , /)', 'rgb(1 2 3 / )', 'rgb(1;2;3)', 'red']) expect(zigzag(bad)).not.toBe(bad);
});
