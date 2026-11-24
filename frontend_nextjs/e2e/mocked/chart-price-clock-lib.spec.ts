import { test, expect } from '@playwright/test';
import { PriceClock, type PriceClockState, axisLabelHeight, axisLabelPadding, contrastText, formatCountdown, labelBar, secondsToClose } from '../../src/lib/chart-workspace/priceClock';

// 1124-A9: the box under the last price label shows the time left to the close of the last bar.
const at = (y: number, mo: number, d: number, h = 0, mi = 0, sec = 0) => Date.UTC(y, mo - 1, d, h, mi, sec) / 1000;

test('Restzeit unter einer Stunde: MM:SS', { tag: '@ANA-28' }, () => {
  expect(formatCountdown(52 * 60 + 47, 'd')).toBe('52:47');
  expect(formatCountdown(59 * 60 + 59, 'd')).toBe('59:59');
  expect(formatCountdown(5, 'd')).toBe('00:05');
});

test('Restzeit unter einem Tag: SS:MM:ss', { tag: '@ANA-28' }, () => {
  expect(formatCountdown(3600, 'd')).toBe('01:00:00');
  expect(formatCountdown(2 * 3600 + 50 * 60 + 53, 'd')).toBe('02:50:53');
  expect(formatCountdown(86399, 'd')).toBe('23:59:59');
});

test('Restzeit ab einem Tag: Tage mit Buchstaben der Sprache, dann SS:MM', { tag: '@ANA-28' }, () => {
  const sec = 3 * 86400 + 2 * 3600 + 50 * 60 + 53;
  expect(formatCountdown(sec, 'g')).toBe('3g 02:50');
  expect(formatCountdown(sec, 'd')).toBe('3d 02:50');
  expect(formatCountdown(sec, 'T')).toBe('3T 02:50');
  expect(formatCountdown(86400, 'T')).toBe('1T 00:00');
});

test('Sekundenbruchteile werden abgeschnitten, nicht gerundet', { tag: '@ANA-28' }, () => {
  expect(formatCountdown(52 * 60 + 47.99, 'd')).toBe('52:47');
  expect(formatCountdown(-3, 'd')).toBe('00:00');
});

test('D1 schließt um Mitternacht der Brokerzeit', { tag: '@ANA-28' }, () => {
  expect(secondsToClose('D1', at(2026, 11, 18), at(2026, 11, 18, 21, 30, 0))).toBe(2.5 * 3600);
  expect(secondsToClose('D1', at(2026, 11, 18), at(2026, 11, 19))).toBe(0);
});

test('W1 schließt nach sieben Tagen, MN am Monatsende nach Kalender', { tag: '@ANA-28' }, () => {
  expect(secondsToClose('W1', at(2026, 11, 23), at(2026, 11, 25, 12))).toBe(4.5 * 86400);
  // November has 30 days, December 31, February 2028 has 29
  expect(secondsToClose('MN', at(2026, 11, 1), at(2026, 11, 24))).toBe(7 * 86400);
  expect(secondsToClose('MN', at(2026, 12, 1), at(2026, 12, 24))).toBe(8 * 86400);
  expect(secondsToClose('MN', at(2028, 2, 1), at(2028, 2, 28))).toBe(2 * 86400);
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
function clockWith(startMs: number, state: Partial<PriceClockState> = {}) {
  let nowMs = startMs;
  const updates: number[] = [];
  const attrs = new Map<string, string>();
  const host = { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) };
  const chart = { timeScale: () => ({ getVisibleLogicalRange: () => ({ from: 0, to: 9 }) }) };
  const series = { dataByIndex: () => ({ close: 1.1 }), priceToCoordinate: () => 100, priceFormatter: () => ({ format: () => '1.10000' }), options: () => ({}) };
  // The timer needs a `window`; a node test has none. Other specs in this worker test `typeof window`, so the test removes it again.
  Object.assign(globalThis, { window: globalThis });
  const clock = new PriceClock(chart as never, series as never, host as never, () => nowMs);
  const view = (clock as unknown as { view: { text: () => string } }).view;
  clock.attached({ requestUpdate: () => { updates.push(nowMs); } } as never);
  clock.update({ offsetSec: 0, backColor: '#ffeb3b', fontSize: 11, lastBarTime: Date.UTC(2026, 10, 23, 11, 0, 0) / 1000, timeframe: 'H1', dayUnit: 'd', ...state });
  updates.length = 0;
  return { clock, view, updates, attrs, advance: (ms: number) => { nowMs += ms; } };
}

test('Tik ohne neue Sekunde im letzten Zeichnen löst kein Neuzeichnen aus', { tag: '@ANA-28' }, () => {
  // H1 bar opened 11:00, now 12:00:00 → the bar closes in 00:00 (closed); take 11:30:00 for 30:00 left
  const t = clockWith(Date.UTC(2026, 10, 23, 11, 30, 0));
  try {
    t.view.text(); // a draw (streaming, drag) showed 30:00
    t.clock.tick();
    expect(t.updates).toHaveLength(0);
    expect(t.attrs.get('data-price-clock')).toBe('30:00');
    t.advance(1000);
    t.clock.tick(); // the next second was not drawn yet
    expect(t.updates).toHaveLength(1);
    expect(t.attrs.get('data-price-clock')).toBe('29:59');
    t.view.text(); // that redraw showed it
    t.clock.tick();
    expect(t.updates).toHaveLength(1);
  } finally {
    t.clock.detached();
    delete (globalThis as { window?: unknown }).window;
  }
});

test('Bar geschlossen und keine neue Kerze (Wochenende): Box versteckt, Text leer', { tag: '@ANA-28' }, () => {
  const t = clockWith(Date.UTC(2026, 10, 23, 11, 59, 59));
  try {
    const axis = (t.clock as unknown as { view: { visible: () => boolean } }).view;
    expect(t.view.text()).toBe('00:01');
    expect(axis.visible()).toBe(true);
    t.advance(1000); // 12:00:00: the bar is closed
    expect(t.view.text()).toBe('');
    expect(axis.visible()).toBe(false);
    t.clock.tick();
    expect(t.attrs.has('data-price-clock')).toBe(false);
    // a new bar arrives: the box is back
    t.clock.update({ offsetSec: 0, backColor: '#ffeb3b', fontSize: 11, lastBarTime: Date.UTC(2026, 10, 23, 12, 0, 0) / 1000, timeframe: 'H1', dayUnit: 'd' });
    expect(t.view.text()).toBe('01:00:00');
    expect(axis.visible()).toBe(true);
  } finally {
    t.clock.detached();
    delete (globalThis as { window?: unknown }).window;
  }
});
