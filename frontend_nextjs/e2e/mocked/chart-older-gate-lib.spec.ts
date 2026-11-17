import { expect, test } from '@playwright/test';
import { mayRequestOlder, olderPage, OLDER_PAGE_BARS } from '../../src/lib/analysis/candles';

/**
 * ANA-27: eine ältere Seite geht je Rand einmal los. Im CI (PR 602) ging jede Seite zweimal: zwischen der Antwort (busy frei) und dem
 * Commit sah der Hook noch den alten Rand und plante dieselbe Seite neu (Journal 2026-11-17-formation-scan-status-badge).
 * Der Test spielt die Schritte des Hooks nach, ohne Browser und ohne Zeitablauf.
 */
const M1 = 60;
const START = Date.UTC(2025, 9, 1) / 1000;

test('Zwischen Antwort und Commit geht dieselbe Seite nicht noch einmal los; nach dem Commit kommt die nächste', { tag: '@ANA-27' }, () => {
  let busy = false;
  let pageDoneFor: number | null = null;
  // Stand, den der Aufrufer sieht (latest): linker Rand und „mehr da“
  let loadedFrom = START;
  const may = () => mayRequestOlder({ busy, paused: false, older: 'more', loadedFrom, pageDoneFor });

  expect(may()).toBe(true);
  const first = olderPage(loadedFrom, null, M1, 100_000);
  if ('edge' in first) throw new Error('erwartet eine Seite');
  busy = true;
  expect(may()).toBe(false);

  // Antwort mit Kerzen: die Seite ist geladen, busy wird frei, der Stand hat den neuen Rand noch nicht
  pageDoneFor = first.to;
  busy = false;
  expect(may()).toBe(false);

  // Commit: der Stand hat den neuen Rand; die nächste Seite schließt an die erste an
  loadedFrom = first.from;
  expect(may()).toBe(true);
  const second = olderPage(loadedFrom, null, M1, 100_000 + OLDER_PAGE_BARS);
  if ('edge' in second) throw new Error('erwartet eine Seite');
  expect(second.to).toBe(first.from);
});

test('Ein Fehlschlag sperrt nur während der Pause; danach geht dieselbe Seite wieder los', { tag: '@ANA-27' }, () => {
  const base = { busy: false, older: 'more', loadedFrom: START, pageDoneFor: null };
  // Fehlschlag: keine Kerzen, pageDoneFor bleibt; die Pause sperrt
  expect(mayRequestOlder({ ...base, paused: true })).toBe(false);
  expect(mayRequestOlder({ ...base, paused: false })).toBe(true);
  // Eine früher geladene Seite (anderer Rand) sperrt den jetzigen Rand nicht
  expect(mayRequestOlder({ ...base, paused: false, pageDoneFor: START + OLDER_PAGE_BARS * M1 })).toBe(true);
  // Am Ende des Zeitraums oder der Historie nichts mehr
  expect(mayRequestOlder({ ...base, paused: false, older: 'range' })).toBe(false);
});
