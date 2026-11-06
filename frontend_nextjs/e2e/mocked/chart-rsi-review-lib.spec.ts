/**
 * UI-18 / UI-19 Nachbesserungen nach der Prüfung von PR 407 und 412 (docs/journal/2026-11-06-rsi-review-fixes.md).
 * Logiktests ohne Seite: Speicher, Zeilenstil, Alarme, Formationsvergleich, Zurücksetzen, Statuszeilen-Format, Sichtbarkeit aus Version 2.
 */
import { makeFormatters } from '../../src/i18n/format';
import { expect, test } from '@playwright/test';
import { parseIndicators, visibilityFromSeconds } from '../../src/lib/chart-workspace/indicatorStorage';
import { rowStyle } from '../../src/lib/chart-workspace/indicatorStyle';
import { alarmsAfterRemove, legendValueOptions, matchesFormationRsi, newIndicator, resetIndicator, SYSTEM_RSI_ID, systemRsiIndicator, visibleAtInterval } from '../../src/lib/chart-workspace/indicators';
import { useChartWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../../src/store/useChartWorkspaceStore';

const tones = { info: '#0af', warning: '#fa0', up: '#0a0', down: '#a00', muted: '#888' };

test('UI-19 G: Verlaufsfüllung ist am Rand voll deckend', { tag: '@UI-19' }, () => {
  for (const key of ['over', 'under'] as const) {
    expect(rowStyle(systemRsiIndicator(), key, tones).opacity).toBe(100);
  }
  expect(rowStyle(systemRsiIndicator(), 'over', tones).color2).toBe('');
  expect(rowStyle(systemRsiIndicator(), 'under', tones).color).toBe('');
});

/** Memory-backed `localStorage` for the store tests (they run in Node). */
function useFakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  const fake = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, String(v)); }, removeItem: (k: string) => { data.delete(k); }, key: (i: number) => [...data.keys()][i] ?? null, get length() { return data.size; } };
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
  return data;
}
const reload = () => { useChartWorkspaceStore.setState({ hydrated: false, documents: {} }); useChartWorkspaceStore.getState().hydrate(); };

test('UI-18 1: eine Schreibung lässt Version-1-Dokumente nicht roh auf der Platte (kein initial-RSI, ein system-rsi)', { tag: '@UI-18' }, () => {
  const v1 = { version: 1, documents: {
    a: { drawings: '[]', indicators: [{ id: 'initial-RSI', kind: 'RSI', period: 14 }, { id: 'u1', kind: 'EWO' }], overlays: { rsi: true }, systemPanes: { rsi: { hidden: false, collapsed: false } }, paneOrder: ['rsi'], alarms: [], images: {} },
    b: { drawings: '[]', indicators: [{ id: 'initial-RSI', kind: 'RSI', period: 14 }], overlays: {}, systemPanes: { rsi: { hidden: true } }, alarms: [], images: {} },
  } };
  const data = useFakeStorage({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(v1) });
  reload();
  useChartWorkspaceStore.getState().setToolbar('x', {}); // a write that touches no document
  const disk = JSON.parse(data.get(WORKSPACE_STORAGE_KEY) ?? '{}');
  for (const docs of [disk.documents, useChartWorkspaceStore.getState().documents]) {
    for (const key of ['a', 'b']) {
      const ids = (docs[key].indicators as { id: string }[]).map(i => i.id);
      expect(ids.filter(id => id === SYSTEM_RSI_ID)).toHaveLength(1);
      expect(ids).not.toContain('initial-RSI');
    }
  }
  expect(disk.version).toBe(3);
  reload();
  const again = useChartWorkspaceStore.getState().documents;
  expect(again.a.indicators.map(i => i.id)).toEqual([SYSTEM_RSI_ID, 'u1']);
  expect(again.b.indicators.find(i => i.id === SYSTEM_RSI_ID)?.visible).toBe(false);
});

test('UI-19 1: eine Schreibung lässt Version-2-Dokumente nicht ohne Sichtbarkeit im Speicher', { tag: '@UI-19' }, () => {
  const v2 = { version: 2, documents: { a: { drawings: '[]', indicators: [{ id: 'system-rsi', kind: 'RSI', period: 7, minTimeframe: 0, maxTimeframe: 3600 }], overlays: {}, alarms: [], images: {} }, b: { drawings: '[]', indicators: [{ id: 'k', kind: 'EWO' }], overlays: {}, alarms: [], images: {} } } };
  useFakeStorage({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(v2) });
  reload();
  useChartWorkspaceStore.getState().setToolbar('x', {});
  const docs = useChartWorkspaceStore.getState().documents;
  for (const key of ['a', 'b']) for (const indicator of docs[key].indicators) {
    expect(indicator.visibility).toBeDefined();
    expect(() => visibleAtInterval(indicator.visibility, 14400)).not.toThrow();
  }
  expect(docs.a.indicators[0].visibility.day).toBe(false);
});

test('UI-18 2: Löschen des System-RSI behält seine Alarme', { tag: '@UI-18' }, () => {
  const alarms = [{ id: '1', indicatorId: SYSTEM_RSI_ID }, { id: '2', indicatorId: 'u1' }, { id: '3', indicatorId: 'u2' }];
  expect(alarmsAfterRemove(alarms, new Set([SYSTEM_RSI_ID, 'u1'])).map(a => a.id)).toEqual(['1', '3']);
});

test('UI-19 5: Statuszeile zeigt feste Nachkommastellen (53,70, nicht 53,7)', { tag: '@UI-19' }, () => {
  const fmt = makeFormatters('tr');
  expect(fmt.number(53.7, legendValueOptions(systemRsiIndicator()))).toBe('53,70');
  expect(fmt.number(53.7, legendValueOptions({ ...systemRsiIndicator(), precision: 4 }))).toBe('53,7000');
  expect(fmt.number(1.5, legendValueOptions(newIndicator('EWO')))).toBe('1,50000');
});

test('UI-19 6: Zurücksetzen des System-RSI geht auf die Formationswerte, auch bei gespeichertem Standard', { tag: '@UI-19' }, () => {
  const saved = { period: 21, source: 'hlc3' as const, timeframe: 14400, smoothing: 'EMA' as const, upper: 70, middle: 45, lower: 30, color: '#123456', plotType: 'area' as const };
  const reset = resetIndicator({ ...systemRsiIndicator(), period: 9 }, saved);
  expect(reset).toMatchObject({ period: 7, source: 'close', timeframe: 0, smoothing: 'none', upper: 80, middle: 50, lower: 20, id: SYSTEM_RSI_ID });
  expect(reset.color).toBe('#123456'); expect(reset.plotType).toBe('area'); // the look may come from the saved default
  // Other kinds start from the saved default
  expect(resetIndicator({ ...newIndicator('RSI'), id: 'u', paneId: 'u' }, saved).period).toBe(21);
});

test('UI-18 7: Formationsvergleich – Zeitrahmen gleich dem des Charts zählt als Chart-Kerzen', { tag: '@UI-18' }, () => {
  const rsi = systemRsiIndicator();
  expect(matchesFormationRsi({ ...rsi, timeframe: 3600 }, 3600, 7)).toBe(true);
  expect(matchesFormationRsi({ ...rsi, timeframe: 900 }, 3600, 7)).toBe(true);
  expect(matchesFormationRsi({ ...rsi, timeframe: 14400 }, 3600, 7)).toBe(false);
  expect(matchesFormationRsi({ ...rsi, period: 14 }, 3600, 7)).toBe(false);
  expect(matchesFormationRsi({ ...rsi, source: 'hl2' }, 3600, 7)).toBe(false);
});

test('UI-19 10: Version-2-Sekundenbereich engt den Bereich je Einheit ein', { tag: '@UI-19' }, () => {
  const v = visibilityFromSeconds(300, 86400);
  expect(v.minute).toEqual({ on: true, from: 5, to: 59 });
  expect(visibleAtInterval(v, 60)).toBe(false); // M1 was outside the old range
  expect(visibleAtInterval(v, 300)).toBe(true);
  expect(v.hour).toMatchObject({ on: true, from: 1 }); expect(v.day).toBe(true);
  const hours = visibilityFromSeconds(7200, 14400);
  expect(hours.minute.on).toBe(false); expect(hours.hour).toEqual({ on: true, from: 2, to: 4 }); expect(hours.day).toBe(false);
  expect(visibleAtInterval(hours, 3600)).toBe(false); expect(visibleAtInterval(hours, 14400)).toBe(true);
  const [old] = parseIndicators([{ id: 'x', kind: 'RSI', minTimeframe: 300, maxTimeframe: 86400 }]);
  expect(visibleAtInterval(old.visibility, 60)).toBe(false);
});
