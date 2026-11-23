import { test, expect } from '@playwright/test';
import { PriceClock, axisLabelHeight, axisLabelPadding, contrastText, formatBrokerClock, labelBar } from '../../src/lib/chart-workspace/priceClock';

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

// A tick asks for a redraw only when the last draw did not show this second: streaming and dragging draw anyway, and a full redraw of a big chart is costly.
function clockWith(startMs: number) {
  let nowMs = startMs;
  const updates: number[] = [];
  const attrs = new Map<string, string>();
  const host = { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) };
  const chart = { timeScale: () => ({ getVisibleLogicalRange: () => ({ from: 0, to: 9 }) }) };
  const series = { dataByIndex: () => ({ close: 1.1 }), priceToCoordinate: () => 100, priceFormatter: () => ({ format: () => '1.10000' }), options: () => ({}) };
  // The timer needs a `window`; a node test has none
  Object.assign(globalThis, { window: globalThis });
  const clock = new PriceClock(chart as never, series as never, host as never, () => nowMs);
  const view = (clock as unknown as { view: { text: () => string } }).view;
  clock.attached({ requestUpdate: () => { updates.push(nowMs); } } as never);
  clock.update({ offsetSec: 0, backColor: '#ffeb3b', fontSize: 11 });
  updates.length = 0;
  return { clock, view, updates, attrs, advance: (ms: number) => { nowMs += ms; } };
}

test('Tik ohne neue Sekunde im letzten Zeichnen löst kein Neuzeichnen aus', { tag: '@ANA-28' }, () => {
  const t = clockWith(Date.UTC(2026, 10, 23, 12, 0, 0));
  t.view.text(); // a draw (streaming, drag) showed 12:00:00
  t.clock.tick();
  expect(t.updates).toHaveLength(0);
  expect(t.attrs.get('data-price-clock')).toBe('12:00:00');
  t.advance(1000);
  t.clock.tick(); // the next second was not drawn yet
  expect(t.updates).toHaveLength(1);
  expect(t.attrs.get('data-price-clock')).toBe('12:00:01');
  t.view.text(); // that redraw showed it
  t.clock.tick();
  expect(t.updates).toHaveLength(1);
  t.clock.detached();
});
