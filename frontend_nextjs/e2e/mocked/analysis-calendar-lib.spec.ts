/**
 * W1 and MN candles for the free chart, built from D1 candles in the browser (1107-A4.2).
 * ANA-26 W1 und MN im freien Chart
 */
import { expect, test } from '@playwright/test';
import {
  barEnd,
  calendarFromDaily,
  liveCalendarBar,
  monthStart,
  monthlyFromDaily,
  weekStart,
  weeklyFromDaily,
} from '../../src/lib/analysis/calendarBars';
import { CHART_TIMEFRAMES, dataTimeframeOf, isChartTimeframe, TIMEFRAMES } from '../../src/lib/analysis/candles';
import { timeframeAllowed, timeframeParam } from '../../src/lib/chart/mode';
import { weeklyFromDaily as formationWeekly } from '../../src/lib/formation/weekly';

const ana = (name: string, fn: () => void) => test(name, { tag: '@ANA-26' }, fn);
const DAY = 86400;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;
const bar = (time: number, o: number, h: number, l: number, c: number) => ({ time, open: o, high: h, low: l, close: c });

ana('Zeitrahmenlisten: Frei kennt W1 und MN, Setup nicht; beide holen D1', () => {
  expect(CHART_TIMEFRAMES).toEqual([...TIMEFRAMES, 'W1', 'MN']);
  expect(isChartTimeframe('MN')).toBe(true);
  expect(isChartTimeframe('M2')).toBe(false);
  expect(dataTimeframeOf('W1')).toBe('D1');
  expect(dataTimeframeOf('MN')).toBe('D1');
  expect(dataTimeframeOf('H4')).toBe('H4');
});

ana('Adresse: ?tf=W1|MN gilt nur im freien Modus', () => {
  expect(timeframeParam('free', 'W1')).toBe('W1');
  expect(timeframeParam('free', 'MN')).toBe('MN');
  expect(timeframeParam('setup', 'MN')).toBe('M15');
  expect(timeframeParam('formation', 'W1')).toBe('H4');
  expect(timeframeAllowed('free', 'W1')).toBe(true);
  expect(timeframeAllowed('setup', 'W1')).toBe(false);
});

ana('Wochenbeginn Sonntag 00:00, Monatsbeginn am 1. um 00:00', () => {
  expect(weekStart(utc(2024, 1, 10))).toBe(utc(2024, 1, 7));
  expect(weekStart(utc(2024, 1, 7))).toBe(utc(2024, 1, 7));
  expect(monthStart(utc(2024, 2, 29) + 3600)).toBe(utc(2024, 2, 1));
  expect(monthStart(utc(2024, 3, 1))).toBe(utc(2024, 3, 1));
  expect(monthStart(utc(2023, 12, 31) + DAY - 1)).toBe(utc(2023, 12, 1));
});

ana('barEnd: Woche 7 Tage, Monat bis zum nächsten Monatsersten, sonst Zeitrahmen', () => {
  expect(barEnd('W1', utc(2024, 1, 7))).toBe(utc(2024, 1, 14));
  expect(barEnd('MN', utc(2024, 2, 1))).toBe(utc(2024, 3, 1));
  expect(barEnd('MN', utc(2024, 12, 1))).toBe(utc(2025, 1, 1));
  expect(barEnd('M15', 1000)).toBe(1900);
});

ana('Monatskerzen aus D1: Open erster, Close letzter Tag, High/Low über den Monat', () => {
  const days = [
    bar(utc(2024, 1, 30), 10, 12, 9, 11),
    bar(utc(2024, 1, 31), 11, 15, 10, 14),
    bar(utc(2024, 2, 1), 14, 20, 13, 19),
    bar(utc(2024, 2, 2), 19, 21, 8, 18),
  ];
  expect(monthlyFromDaily(days)).toEqual([
    bar(utc(2024, 1, 1), 10, 15, 9, 14),
    bar(utc(2024, 2, 1), 14, 21, 8, 18),
  ]);
});

ana('Eine Lücke in den D1-Kerzen setzt gapBefore auf die Folgeperiode', () => {
  const days = [bar(utc(2024, 1, 31), 1, 2, 1, 2), bar(utc(2024, 2, 5), 2, 3, 2, 3)];
  const out = monthlyFromDaily(days, [{ from: utc(2024, 2, 1), to: utc(2024, 2, 5) }]);
  expect(out[1].gapBefore).toBe(true);
});

ana('Formation: weeklyFromDaily bleibt dieselbe Funktion wie in der Bibliothek', () => {
  expect(formationWeekly).toBe(weeklyFromDaily);
});

ana('Halbe erste Periode fällt weg, wenn der Anfang später als der Periodenbeginn liegt', () => {
  // 2024-01-10 (Mittwoch) bis 2024-01-24: die Woche ab Sonntag 7.1. ist am Anfang angeschnitten
  const days = [];
  for (let t = utc(2024, 1, 10); t <= utc(2024, 1, 24); t += DAY) days.push(bar(t, 1, 2, 1, 2));
  const weeks = calendarFromDaily('W1', days, [], utc(2024, 1, 10));
  expect(weeks.map((w) => w.time)).toEqual([utc(2024, 1, 14), utc(2024, 1, 21)]);
  // geladen ab dem Periodenbeginn: nichts fällt weg
  expect(calendarFromDaily('W1', days, [], utc(2024, 1, 7)).length).toBe(3);
  // ohne bekannten Anfang bleibt alles
  expect(calendarFromDaily('W1', days, [], null).length).toBe(3);
});

ana('Die laufende D1-Kerze gehört zur letzten Woche und zum letzten Monat', () => {
  const days = [
    bar(utc(2024, 1, 8), 10, 12, 9, 11),
    bar(utc(2024, 1, 9), 11, 13, 10, 12), // laufende D1-Kerze (liveFrom)
  ];
  const w = calendarFromDaily('W1', days, [], null);
  const m = calendarFromDaily('MN', days, [], null);
  expect(w).toHaveLength(1);
  expect(m).toHaveLength(1);
  expect(w[0]).toMatchObject({ time: utc(2024, 1, 7), open: 10, high: 13, low: 9, close: 12 });
  expect(m[0].time).toBe(utc(2024, 1, 1));
  // Der Live-Preis ändert nur die Kerze der laufenden Periode
  const now = utc(2024, 1, 9) + 3600;
  expect(liveCalendarBar('W1', w.at(-1) ?? null, 14, now)).toMatchObject({ time: utc(2024, 1, 7), high: 14, close: 14, open: 10 });
  expect(liveCalendarBar('MN', m.at(-1) ?? null, 8, now)).toMatchObject({ low: 8, close: 8 });
  // eine andere Periode (Markt hat gerade eine neue Woche begonnen): keine Änderung
  expect(liveCalendarBar('W1', w.at(-1) ?? null, 14, utc(2024, 1, 15))).toBeNull();
});
