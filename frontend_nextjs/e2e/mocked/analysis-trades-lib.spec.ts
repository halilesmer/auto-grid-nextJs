/**
 * Reine Rechenfälle (von Hand nachgerechnet) für die Trade-Zuordnung und die Fraktale (Schritt 5):
 * Teilschließung, Umkehr-Position, Close By, „Zone unbekannt“, Fraktal-Regel wie der Bot.
 * ANA-08 Pfeile/Fraktale/Trade-Archiv
 */
import { expect, test } from '@playwright/test';
import { findFractals } from '../../src/lib/analysis/fractals';
import { belongsToZoneView, matchZone, pairTrades, type Deal, type ZoneRegistryEntry } from '../../src/lib/analysis/tradePairing';

const H = 3600;
/** Register seit T0 (echte Zeit); Broker UTC+3 */
const T0 = 1_790_000_000;
const OFFSET = 3 * H;
const REGISTRY: ZoneRegistryEntry[] = [
  { magic: 200001, zone_id: 'z1', symbol: 'USOUSD', label: 'Z1', created_at: T0, deleted_at: null },
];

let ticket = 1;
function deal(p: Partial<Deal> & Pick<Deal, 'time' | 'type' | 'entry'>): Deal {
  const t = ticket++;
  return {
    ticket: t,
    order: t,
    position_id: 1,
    time_msc: p.time * 1000,
    magic: 200001,
    symbol: 'USOUSD',
    volume: 0.1,
    price: 100,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    comment: '',
    reason: 3,
    ...p,
  };
}
/** MT5-Zeit nach dem Registereintrag */
const after = (h: number) => T0 + OFFSET + h * H;

test.describe('ANA-08 Trade-Zuordnung', () => {
  test('Kauf: ein Ausstieg = ein Trade, Netto = Gewinn + Kommission + Swap + Gebühr', { tag: '@ANA-08' }, () => {
    const r = pairTrades(
      [
        deal({ time: after(1), type: 0, entry: 0, price: 100, commission: -0.7 }),
        deal({ time: after(2), type: 1, entry: 1, price: 101, profit: 10, commission: -0.7, swap: -0.2, fee: -0.1, reason: 5 }),
      ],
      REGISTRY,
      OFFSET,
    );
    expect(r.trades).toHaveLength(1);
    const tr = r.trades[0];
    expect(tr).toMatchObject({ side: 'buy', volume: 0.1, entryPrice: 100, exitPrice: 101, partial: false, reversal: false, exitReason: 5 });
    expect(tr.commission).toBeCloseTo(-1.4);
    expect(tr.net).toBeCloseTo(10 - 1.4 - 0.2 - 0.1);
    expect(tr.zone).toEqual({ kind: 'zone', magic: 200001, label: 'Z1' });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].closed).toBe(true);
  });

  test('Teilschließung: jeder Ausstieg ein Trade, Einstiegskosten nach Volumen, Durchschnittspreis', { tag: '@ANA-08' }, () => {
    const r = pairTrades(
      [
        deal({ time: after(1), type: 1, entry: 0, volume: 0.1, price: 100, commission: -1 }),
        deal({ time: after(2), type: 1, entry: 0, volume: 0.2, price: 103, commission: -2 }),
        deal({ time: after(3), type: 0, entry: 1, volume: 0.1, price: 99, profit: 3 }),
        deal({ time: after(4), type: 0, entry: 1, volume: 0.2, price: 98, profit: 8, commission: -0.5 }),
      ],
      REGISTRY,
      OFFSET,
    );
    expect(r.trades).toHaveLength(2);
    const [a, b] = r.trades;
    // Durchschnitt (0,1 × 100 + 0,2 × 103) / 0,3 = 102
    expect(a.side).toBe('sell');
    expect(a.entryPrice).toBeCloseTo(102);
    expect(b.entryPrice).toBeCloseTo(102);
    // Einstiegskosten −3 auf 0,3 Lot: 1/3 und 2/3
    expect(a.commission).toBeCloseTo(-1);
    expect(b.commission).toBeCloseTo(-2.5);
    expect(a.partial).toBe(true);
    expect(b.partial).toBe(true);
    expect(a.volume + b.volume).toBeCloseTo(0.3);
    expect(a.entryTime).toBe(after(1));
  });

  test('Umkehr (INOUT): Schließen + neue Gegenposition, Kosten des Deals nach Volumen geteilt', { tag: '@ANA-08' }, () => {
    const r = pairTrades(
      [
        deal({ time: after(1), type: 0, entry: 0, volume: 0.1, price: 100 }),
        // Verkauf 0,3: schließt 0,1 Kauf, eröffnet 0,2 Verkauf; Kommission −3 → −1 / −2
        deal({ time: after(2), type: 1, entry: 2, volume: 0.3, price: 101, profit: 10, commission: -3 }),
        deal({ time: after(3), type: 0, entry: 1, volume: 0.2, price: 100.5, profit: 10, commission: -1 }),
      ],
      REGISTRY,
      OFFSET,
    );
    expect(r.trades).toHaveLength(2);
    const [closeBuy, closeSell] = r.trades;
    expect(closeBuy).toMatchObject({ side: 'buy', volume: 0.1, entryPrice: 100, exitPrice: 101, reversal: true, profit: 10 });
    expect(closeBuy.commission).toBeCloseTo(-1);
    expect(closeSell).toMatchObject({ side: 'sell', entryPrice: 101, exitPrice: 100.5, reversal: false, entryTime: after(2) });
    expect(closeSell.volume).toBeCloseTo(0.2);
    expect(closeSell.commission).toBeCloseTo(-3);
    // Zwei Einstiege: der ursprüngliche Kauf und der Verkauf aus der Umkehr
    expect(r.entries.map((e) => [e.side, e.reversal])).toEqual([
      ['buy', false],
      ['sell', true],
    ]);
    expect(r.entries[1].volume).toBeCloseTo(0.2);
  });

  test('Close By wird gekennzeichnet; Ausstieg ohne Einstieg: Seite aus dem Ausstieg, Zone unbekannt', { tag: '@ANA-08' }, () => {
    const r = pairTrades(
      [
        deal({ position_id: 7, time: after(1), type: 0, entry: 0 }),
        deal({ position_id: 7, time: after(2), type: 1, entry: 3, profit: 2 }),
        deal({ position_id: 8, time: after(3), type: 0, entry: 1, profit: -4 }),
      ],
      REGISTRY,
      OFFSET,
    );
    expect(r.trades[0]).toMatchObject({ closeBy: true, side: 'buy' });
    expect(r.trades[1]).toMatchObject({ entryTime: null, entryPrice: null, side: 'sell', net: -4 });
    expect(r.trades[1].zone.kind).toBe('unknown');
  });

  test('Fehlende Einstiege: Umkehr ohne Einstieg und zu großer Ausstieg werden nicht geraten', { tag: '@ANA-08' }, () => {
    const r = pairTrades(
      [
        // Umkehr, deren Einstieg nicht im Archiv ist: Aufteilung unbekannt → ein Ausstieg ohne Einstieg
        deal({ position_id: 21, time: after(1), type: 1, entry: 2, volume: 0.3, profit: 5 }),
        deal({ position_id: 21, time: after(2), type: 0, entry: 1, volume: 0.2, profit: 1 }),
        // 0,1 eröffnet, 0,3 geschlossen (frühere Einstiege fehlen)
        deal({ position_id: 22, time: after(1), type: 0, entry: 0, volume: 0.1, price: 100 }),
        deal({ position_id: 22, time: after(2), type: 1, entry: 1, volume: 0.3, price: 101, profit: 3 }),
      ],
      REGISTRY,
      OFFSET,
    );
    const p21 = r.trades.filter((tr) => tr.positionId === 21);
    expect(p21.map((tr) => [tr.reversal, tr.entryTime, tr.volume])).toEqual([
      [true, null, 0.3],
      [false, null, 0.2],
    ]);
    expect(r.entries.filter((e) => e.positionId === 21)).toEqual([]);
    const p22 = r.trades.find((tr) => tr.positionId === 22)!;
    expect(p22).toMatchObject({ entryPrice: null, entryTime: null, volume: 0.3 });
    expect(p22.zone.kind).toBe('unknown');
  });

  test('Einstieg gilt erst nach vollständiger Schließung als geschlossen', { tag: '@ANA-08' }, () => {
    const open = pairTrades(
      [
        deal({ position_id: 31, time: after(1), type: 0, entry: 0, volume: 0.2 }),
        deal({ position_id: 31, time: after(2), type: 1, entry: 1, volume: 0.1 }),
      ],
      REGISTRY,
      OFFSET,
    );
    expect(open.entries[0].closed).toBe(false);
    expect(open.trades[0].partial).toBe(true);
  });

  test('„Zone unbekannt“: vor dem Register oder nicht im Register; nie geraten', { tag: '@ANA-08' }, () => {
    const reg = new Map(REGISTRY.map((z) => [z.magic, z]));
    // Einstieg 1 h vor dem Registereintrag (MT5-Zeit = UTC + 3 h)
    expect(matchZone(200001, T0 + OFFSET - H, reg, OFFSET).kind).toBe('unknown');
    expect(matchZone(200001, T0 + OFFSET + 60, reg, OFFSET).kind).toBe('zone');
    // Abstand unbekannt: mit dem größten möglichen gerechnet (UTC+14), lieber unbekannt
    expect(matchZone(200001, T0 + OFFSET + 60, reg, null).kind).toBe('unknown');
    expect(matchZone(200001, T0 + 15 * H, reg, null).kind).toBe('zone');
    expect(matchZone(200002, after(1), reg, OFFSET)).toEqual({ kind: 'unknown', magic: 200002 });
    expect(matchZone(200001, null, reg, OFFSET).kind).toBe('unknown');
    expect(matchZone(0, after(1), reg, OFFSET)).toEqual({ kind: 'manual' });
    expect(matchZone(123, after(1), reg, OFFSET)).toEqual({ kind: 'other', magic: 123 });

    // Ein- und Auszahlungen sind keine Trades, Magic 200000 ist ausgeschlossen
    const r = pairTrades(
      [
        deal({ position_id: 0, time: after(1), type: 2, entry: 0, profit: 1000 }),
        deal({ position_id: 3, time: after(1), type: 0, entry: 0, magic: 200000 }),
        deal({ position_id: 3, time: after(2), type: 1, entry: 1, magic: 200000 }),
      ],
      REGISTRY,
      OFFSET,
    );
    expect(r).toMatchObject({ trades: [], entries: [], nonTrade: 1, excluded: 2 });
  });

  test('Chart der Zone: eigene Zone und „Zone unbekannt“ desselben Symbols, sonst nichts', { tag: '@ANA-08' }, () => {
    expect(belongsToZoneView({ symbol: 'usousd', zone: { kind: 'zone', magic: 200001, label: null } }, 'USOUSD', 200001)).toBe(true);
    expect(belongsToZoneView({ symbol: 'USOUSD', zone: { kind: 'zone', magic: 200002, label: null } }, 'USOUSD', 200001)).toBe(false);
    expect(belongsToZoneView({ symbol: 'USOUSD', zone: { kind: 'unknown', magic: 200002 } }, 'USOUSD', 200001)).toBe(true);
    expect(belongsToZoneView({ symbol: 'XAUUSD', zone: { kind: 'unknown', magic: 200001 } }, 'USOUSD', 200001)).toBe(false);
    expect(belongsToZoneView({ symbol: 'USOUSD', zone: { kind: 'manual' } }, 'USOUSD', 200001)).toBe(false);
  });
});

test.describe('ANA-08 Fraktale', () => {
  const bar = (time: number, high: number, low: number) => ({ time, open: low, high, low, close: high });

  test('Wie der Bot: Hoch > zwei rechts, >= zwei links; laufende Kerze und Datenlücken zählen nicht', { tag: '@ANA-08' }, () => {
    const highs = [1, 2, 5, 3, 2, 2, 4, 4, 3, 1];
    const lows = [0.5, 0.4, 0.3, 0.6, 0.2, 0.7, 0.8, 0.9, 0.95, 0.1];
    const bars = highs.map((h, i) => bar(i * 60, h, lows[i]));
    const f = findFractals(bars, [], null);
    // Oben: Kerze 2 (5) und Kerze 7 (4, links gleich hoch zählt: >=); Kerze 6 nicht (rechts gleich hoch: > verlangt).
    // Unten: Kerze 4 (0,2)
    expect(f).toEqual([
      { time: 120, price: 5, side: 'U' },
      { time: 240, price: 0.2, side: 'D' },
      { time: 420, price: 4, side: 'U' },
    ]);
    // Laufende Kerze (ab 240) zählt nicht: Kerze 2 hätte rechts nur noch eine geschlossene Kerze
    expect(findFractals(bars.slice(0, 5), [], 240)).toEqual([]);
    // Fehlender Bereich zwischen Kerze 3 und 4: kein Fraktal über die Lücke
    // (Kerze 2 und 4 brauchen Nachbarn auf der anderen Seite; Kerze 7 liegt ganz dahinter und bleibt)
    expect(findFractals(bars, [{ from: 190, to: 230, reason: 'unavailable', checked_at: null }], null)).toEqual([
      { time: 420, price: 4, side: 'U' },
    ]);
  });
});
