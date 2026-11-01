/**
 * Meldungsverlauf des Formationsalarms ohne Browser (alarmHistory.ts, alarmStore.ts `parseStored`).
 * FRM-32 Meldungsverlauf im Glocken-Menü
 */
import { test, expect } from '@playwright/test';
import type { AlarmNotice } from '../../src/lib/formation/alarm';
import { appendHistory, HISTORY_LIMIT, historyEntries, withoutHistory } from '../../src/lib/formation/alarmHistory';
import { DEFAULTS, parseStored } from '../../src/lib/formation/alarmStore';

const frm = (name: string, body: () => void) => test(name, { tag: '@FRM-32' }, body);

const notice = (n: number, events: AlarmNotice['events'] = ['valid']): AlarmNotice => ({ key: `EURUSD|GAR|H4|buy|${n}`, symbol: 'EURUSD', form: 'GAR', tf: 'H4', side: 'buy', events });

frm('Jeder Treffer einer Sammelmeldung wird ein eigener Eintrag mit Art und Zeit', () => {
  const list = historyEntries([notice(1), notice(2, ['target']), notice(3, ['valid', 'target']), notice(4)], 5000, 'since');
  expect(list).toHaveLength(4);
  expect(list.map((x) => x.batch)).toEqual(['since', 'since', 'since', 'since']);
  expect(list.every((x) => x.at === 5000)).toBe(true);
  expect(list[2]).toMatchObject({ symbol: 'EURUSD', form: 'GAR', tf: 'H4', side: 'buy', events: ['valid', 'target'] });
  expect(new Set(list.map((x) => x.id)).size).toBe(4);
});

frm('Neue Einträge stehen oben, über der Grenze fallen die ältesten heraus', () => {
  let history = appendHistory([], historyEntries([notice(0)], 1, 'single'));
  for (let i = 1; i <= HISTORY_LIMIT + 5; i++) history = appendHistory(history, historyEntries([notice(i)], i + 1, 'single'));
  expect(history).toHaveLength(HISTORY_LIMIT);
  expect(history[0].key).toBe(`EURUSD|GAR|H4|buy|${HISTORY_LIMIT + 5}`);
  expect(history.some((x) => x.key.endsWith('|0'))).toBe(false);
});

frm('Alte gespeicherte Daten ohne Verlauf bleiben lesbar', () => {
  const old = JSON.stringify({ prefs: { events: { valid: true, target: false }, forms: ['GAR'], system: true, sound: false }, enabled: ['a|EURUSD'], favoritesEnabled: ['a'], memory: { 'a|EURUSD': { k: { valid: true, target: false } } } });
  const stored = parseStored(old);
  expect(stored.history).toEqual({});
  expect(stored.enabled).toEqual(['a|EURUSD']);
  expect(stored.memory['a|EURUSD']).toEqual({ k: { valid: true, target: false } });
});

frm('Ungültige Einträge im Speicher fallen weg, gültige bleiben', () => {
  const entry = historyEntries([notice(1)], 10, 'single')[0];
  const raw = JSON.stringify({ history: { a: [entry, { id: 5 }, null, { ...entry, id: 'x', events: ['kaputt'] }, { ...entry, id: 'y', side: 'sideways' }], b: 'kein Array' } });
  const stored = parseStored(raw);
  expect(stored.history.a).toEqual([entry]);
  expect(stored.history.b).toBeUndefined();
});

frm('Verlauf löschen verändert den gemerkten Stand nicht und betrifft nur das Konto', () => {
  const entry = historyEntries([notice(1)], 10, 'single');
  const stored = { ...DEFAULTS, memory: { 'a|EURUSD': { k: { valid: true, target: true } } }, history: { a: entry, b: entry } };
  const next = withoutHistory(stored, 'a');
  expect(next.memory).toBe(stored.memory);
  expect(next.history).toEqual({ b: entry });
});
