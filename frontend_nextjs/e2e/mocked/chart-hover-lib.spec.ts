import { test, expect } from '@playwright/test';
import { lineTarget, nextSelection, valueAtTime } from '../../src/lib/chart-workspace/hover';

const times = [100, 200, 300, 400];
const values = [null, 10, 20, 30];

test('Wert ohne Fadenkreuz ist der letzte Wert', { tag: '@ANA-22' }, () => {
  expect(valueAtTime(times, values, null)).toBe(30);
});

test('Wert an einer Kerze ist der Wert genau dieser Kerze', { tag: '@ANA-22' }, () => {
  expect(valueAtTime(times, values, 300)).toBe(20);
  expect(valueAtTime(times, values, 200)).toBe(10);
});

test('Wert in der Anlaufphase ist leer', { tag: '@ANA-22' }, () => {
  expect(valueAtTime(times, values, 100)).toBeNull();
  expect(valueAtTime(times, values, 50)).toBeNull();
});

test('Wert zwischen zwei Zeitpunkten ist der Wert der letzten Zeit davor', { tag: '@ANA-22' }, () => {
  expect(valueAtTime(times, values, 350)).toBe(20);
});

test('Wert nach der letzten Kerze ist der letzte Wert', { tag: '@ANA-22' }, () => {
  expect(valueAtTime(times, values, 900)).toBe(30);
});

test('Leere Reihe liefert leeren Wert', { tag: '@ANA-22' }, () => {
  expect(valueAtTime([], [], 100)).toBeNull();
  expect(valueAtTime([], [], null)).toBeNull();
});

test('Linie unter der Maus gehört dem Indikator, sonst keinem', { tag: '@ANA-22' }, () => {
  expect(lineTarget('sma-1', { toolActive: false, drawingHovered: false })).toBe('sma-1');
  expect(lineTarget(null, { toolActive: false, drawingHovered: false })).toBeNull();
});

test('Zeichenwerkzeug und Zeichnung unter der Maus haben Vorrang vor der Linie', { tag: '@ANA-22' }, () => {
  expect(lineTarget('sma-1', { toolActive: true, drawingHovered: false })).toBeNull();
  expect(lineTarget('sma-1', { toolActive: false, drawingHovered: true })).toBeNull();
});

test('Klick wählt die Linie, Klick ins Leere hebt die Auswahl auf', { tag: '@ANA-22' }, () => {
  const free = { toolActive: false, drawingHovered: false };
  expect(nextSelection('rsi-1', 'sma-1', free)).toBe('sma-1');
  expect(nextSelection('sma-1', null, free)).toBeNull();
});

test('Klick auf eine Zeichnung oder mit aktivem Werkzeug ändert die Auswahl nicht', { tag: '@ANA-22' }, () => {
  expect(nextSelection('sma-1', null, { toolActive: true, drawingHovered: false })).toBe('sma-1');
  expect(nextSelection('sma-1', null, { toolActive: false, drawingHovered: true })).toBe('sma-1');
});
