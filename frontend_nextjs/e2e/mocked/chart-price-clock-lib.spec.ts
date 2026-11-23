import { test, expect } from '@playwright/test';
import { axisLabelHeight, formatBrokerClock } from '../../src/lib/chart-workspace/priceClock';

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
