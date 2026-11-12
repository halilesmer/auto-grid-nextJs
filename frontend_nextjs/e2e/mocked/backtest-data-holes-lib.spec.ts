/**
 * Unerklärte Datenlücken im Backtest-Protokoll (BKT-27): Kerzen enden vor TO oder fehlen mitten in der Handelszeit.
 * Zeiten: Montag 2026-01-05 00:00 UTC = 1 767 571 200.
 */
import { expect, test } from '@playwright/test';
import { limitHoleNotes, unexplainedHoles } from '../../src/lib/backtest/candles/dataHoles';
import { parseTradeSessions } from '../../src/lib/backtest/broker/tradeSessions';

const MON = 1_767_571_200;
const H = 3600;
const M1 = 60;

/** Minutenkerzen von a bis b (ohne b) */
function bars(a: number, b: number): number[] {
  const out: number[] = [];
  for (let time = a; time < b; time += M1) out.push(time);
  return out;
}

test.describe('BKT-27 unerklärte Datenlücken', { tag: '@BKT-27' }, () => {
  test('Daten enden 5 Stunden vor TO: eine Meldung', () => {
    const t = bars(MON + 9 * H, MON + 10 * H);
    const notes = unexplainedHoles(t, M1, MON + 9 * H, MON + 15 * H, null, [], 'XAUUSD');
    expect(notes).toHaveLength(1);
    expect(notes[0].code).toBe('run.dataEndsEarly');
    expect(notes[0].params).toMatchObject({ symbol: 'XAUUSD', last: MON + 10 * H - M1, minutes: 300 });
  });

  test('Wochenende ohne Kerzen: keine Meldung', () => {
    const fri = MON + 4 * 86_400;
    const t = [...bars(fri + 20 * H, fri + 24 * H), ...bars(MON + 7 * 86_400, MON + 7 * 86_400 + H)];
    expect(unexplainedHoles(t, M1, fri + 20 * H, MON + 7 * 86_400 + H, null, [], 'XAUUSD')).toEqual([]);
  });

  test('Lücke mitten im Tag mit Sitzungsplan: Meldung nur für die offene Zeit', () => {
    const open = Array.from({ length: 7 }, () => [[0, 86_400]] as [number, number][]);
    open[1] = [[0, 10 * H], [12 * H, 86_400]]; // Montag: Pause 10:00–12:00
    const sessions = parseTradeSessions(open);
    const t = [...bars(MON + 8 * H, MON + 10 * H), ...bars(MON + 14 * H, MON + 15 * H)];
    const notes = unexplainedHoles(t, M1, MON + 8 * H, MON + 15 * H, sessions, [], 'XAUUSD');
    expect(notes).toHaveLength(1);
    expect(notes[0].code).toBe('run.dataHole');
    expect(notes[0].params).toMatchObject({ from: MON + 10 * H, to: MON + 14 * H, minutes: 120 });
  });

  test('Bereich schon in missing: keine doppelte Meldung', () => {
    const t = bars(MON + 9 * H, MON + 10 * H);
    const missing = [{ from: MON + 10 * H, to: MON + 15 * H, reason: 'syncing', checked_at: null }];
    expect(unexplainedHoles(t, M1, MON + 9 * H, MON + 15 * H, null, missing, 'XAUUSD')).toEqual([]);
  });

  test('unter der Schwelle von 30 Minuten: keine Meldung', () => {
    const t = bars(MON + 9 * H, MON + 10 * H);
    expect(unexplainedHoles(t, M1, MON + 9 * H, MON + 10 * H + 20 * M1, null, [], 'XAUUSD')).toEqual([]);
  });

  test('höchstens drei Zeilen, der Rest als Zählzeile', () => {
    const note = { code: 'run.dataHole' as const, params: { symbol: 'X' } };
    const limited = limitHoleNotes([note, note, note, note, note]);
    expect(limited).toHaveLength(4);
    expect(limited[3]).toEqual({ code: 'run.dataHoleMore', params: { more: 2 } });
  });
});

test.describe('BKT-27 syncing neu anfragen', { tag: '@BKT-27' }, () => {
  test('syncing wird bis zu dreimal neu geholt, dann bleibt es sichtbar', async () => {
    const { loadRates } = await import('../../src/lib/backtest/candles/loadRates');
    let calls = 0;
    const fetchJson = async () => {
      calls += 1;
      const done = calls >= 3;
      return {
        t: [0, 60], o: [1, 1], h: [1, 1], l: [1, 1], c: [1, 1], next_from: null,
        missing: done ? [] : [{ from: 120, to: 180, reason: 'syncing', checked_at: null }],
      };
    };
    const rates = await loadRates({ fetchJson, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 0, to: 180, syncPauseMs: 0 });
    expect(calls).toBe(3);
    expect(rates.missing).toEqual([]);
    calls = -100; // nie fertig: 1 + 3 Abrufe
    let total = 0;
    const stuck = async () => {
      total += 1;
      return { t: [0], o: [1], h: [1], l: [1], c: [1], next_from: null, missing: [{ from: 60, to: 120, reason: 'syncing', checked_at: null }] };
    };
    const again = await loadRates({ fetchJson: stuck, accountId: 'a', symbol: 'X', timeframe: 'M1', from: 0, to: 120, syncPauseMs: 0 });
    expect(total).toBe(4);
    expect(again.missing).toHaveLength(1);
  });
});
