import { test, expect } from '@playwright/test';
import { axisLabelHeight, axisLabelPadding, contrastText, formatBrokerClock, labelBar } from '../../src/lib/chart-workspace/priceClock';

// 1123-A10.1 = B: the clock under the last price label shows the broker time as SS:DD:ss.
test('Brokerzeit wird mit UTC-Getter als SS:DD:ss geschrieben', { tag: '@ANA-28' }, () => {
  expect(formatBrokerClock(Date.UTC(2026, 10, 23, 15, 1, 15) / 1000)).toBe('15:01:15');
  expect(formatBrokerClock(Date.UTC(2026, 10, 23, 0, 0, 0) / 1000)).toBe('00:00:00');
  expect(formatBrokerClock(Date.UTC(2026, 10, 23, 23, 59, 59) / 1000)).toBe('23:59:59');
});

test('Sekundenbruchteile werden abgeschnitten, nicht gerundet', { tag: '@ANA-28' }, () => {
  expect(formatBrokerClock(Date.UTC(2026, 10, 23, 15, 1, 15) / 1000 + 0.99)).toBe('15:01:15');
});

test('Labelhöhe wächst mit der Schriftgröße', { tag: '@ANA-28' }, () => {
  expect(axisLabelHeight(14)).toBeGreaterThan(axisLabelHeight(11));
  expect(axisLabelHeight(11)).toBeGreaterThan(11);
});

test('Labelbreite ohne Text wächst mit der Schriftgröße', { tag: '@ANA-28' }, () => {
  expect(axisLabelPadding(12)).toBe(1 + 10 + 5);
  expect(axisLabelPadding(16)).toBeGreaterThan(axisLabelPadding(12));
});

test('Textfarbe folgt der Helligkeit des Hintergrunds wie in der Bibliothek', { tag: '@ANA-28' }, () => {
  expect(contrastText([255, 235, 59])).toBe('black'); // yellow
  expect(contrastText([20, 20, 20])).toBe('white');
  expect(contrastText([128, 128, 128])).toBe('white'); // grayscale 128 < 160
  expect(contrastText([200, 200, 200])).toBe('black');
});

test('Label-Kerze: rechter Rand rundet auf, wie die Bibliothek', { tag: '@ANA-28' }, () => {
  const asked: number[] = [];
  const series = { dataByIndex: (i: number) => { asked.push(i); return { close: i * 10 }; } };
  const chart = (to: number | null) => ({ timeScale: () => ({ getVisibleLogicalRange: () => (to === null ? null : { from: 0, to }) }) });
  // The edge cuts bar 69 at 69.4: the library takes bar 70
  expect(labelBar(chart(69.4) as never, series as never)).toEqual({ close: 700 });
  expect(asked.at(-1)).toBe(70);
  expect(labelBar(chart(69) as never, series as never)).toEqual({ close: 690 });
  expect(labelBar(chart(null) as never, series as never)).toBeNull();
});
