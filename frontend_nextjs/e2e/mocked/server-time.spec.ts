/**
 * ANA-10 · Zeitmodell (src/lib/serverTime.ts) ohne Browser: Tagesgrenzen in Brokerzeit,
 * Jahres- und Monatswechsel, Schaltjahr, Sommerzeit der Browser-Zeitzone (docs/analyse-regeln.md §1).
 */
import { expect, test } from '@playwright/test';
import {
  brokerToday,
  dayToPickerDate,
  parseDayInput,
  pickerDateToDay,
  presetRange,
  rangeBounds,
} from '../../src/lib/serverTime';

const H = 3600;

test.describe('ANA-10 Zeitmodell', () => {
  test('„Heute“ ist der Brokertag, nicht der Tag in UTC oder im Browser', { tag: '@ANA-10' }, () => {
    const now = Date.parse('2026-12-31T22:30:00Z');
    expect(brokerToday(3 * H, now)).toBe('2027-01-01'); // UTC+3: schon Neujahr
    expect(brokerToday(0, now)).toBe('2026-12-31');
    expect(brokerToday(-5 * H, Date.parse('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
  });

  test('Vorauswahlen über Jahres- und Monatsgrenzen', { tag: '@ANA-10' }, () => {
    expect(presetRange('thisYear', '2027-01-01')).toEqual({ from: '2027-01-01', to: '2027-01-01' });
    expect(presetRange('lastYear', '2027-01-01')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('lastMonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(presetRange('lastMonth', '2028-03-31')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(presetRange('thisMonth', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' });
    expect(presetRange('thisWeek', '2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-01' }); // Fr → Mo
    expect(presetRange('thisWeek', '2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-05' }); // Montag
    expect(presetRange('thisWeek', '2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-04' }); // Sonntag
    expect(presetRange('last7', '2026-03-03')).toEqual({ from: '2026-02-25', to: '2026-03-03' });
    expect(presetRange('last30', '2026-10-01')).toEqual({ from: '2026-09-02', to: '2026-10-01' });
    expect(presetRange('last12Months', '2026-10-01')).toEqual({ from: '2025-10-02', to: '2026-10-01' });
    expect(presetRange('last12Months', '2028-02-29')).toEqual({ from: '2027-03-01', to: '2028-02-29' }); // Schalttag
    expect(presetRange('all', '2026-10-01')).toEqual({ from: null, to: null });
  });

  test('Zeiträume sind halb offen in MT5-Sekunden, ohne 23:59:59', { tag: '@ANA-10' }, () => {
    const bounds = rangeBounds({ from: '2026-10-24', to: '2026-10-25' });
    expect(bounds.from).toBe(Date.UTC(2026, 9, 24) / 1000);
    // Bis Beginn des Folgetages; die Sommerzeit-Umstellung am 25.10. verschiebt nichts
    expect(bounds.to).toBe(Date.UTC(2026, 9, 26) / 1000);
    expect(bounds.to! - bounds.from!).toBe(2 * 86400);
    expect(rangeBounds({ from: null, to: null })).toEqual({ from: null, to: null });
  });

  test('Eingabe TT.MM.JJ', { tag: '@ANA-10' }, () => {
    expect(parseDayInput('01.09.26')).toBe('2026-09-01');
    expect(parseDayInput(' 1.9.2026 ')).toBe('2026-09-01');
    expect(parseDayInput('29.02.28')).toBe('2028-02-29');
    expect(parseDayInput('29.02.26')).toBeNull();
    expect(parseDayInput('31.04.26')).toBeNull();
    expect(parseDayInput('2026-09-01')).toBeNull();
  });

  test('Kalendertage überstehen die Sommerzeit der Browser-Zeitzone', { tag: '@ANA-10' }, () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      for (const day of ['2026-03-29', '2026-10-25', '2026-12-31', '2027-01-01']) {
        expect(pickerDateToDay(dayToPickerDate(day))).toBe(day);
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
