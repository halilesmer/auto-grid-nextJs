/**
 * Reine Rechenfälle (von Hand nachgerechnet) für die Kostenwerte des Backtests (B1):
 * Kommissions-Vorschlag je Lot aus dem Deal-Archiv, Kostenfelder der Symbolliste im Mock-Worker.
 * BKT-04 Backtest-Rechner mit Kosten
 */
import { expect, test } from '@playwright/test';
import { proposeCommission } from '../../src/lib/backtest/commission';
import type { Deal } from '../../src/lib/analysis/tradePairing';
import { defaultState } from '../fixtures/data';

const T0 = 1_790_000_000;
let ticket = 1;
function deal(p: Partial<Deal> & Pick<Deal, 'position_id' | 'type' | 'entry' | 'volume' | 'commission'>): Deal {
  const t = ticket++;
  return {
    ticket: t,
    order: t,
    time: T0 + t * 60,
    time_msc: (T0 + t * 60) * 1000,
    magic: 200001,
    symbol: 'XAUUSD',
    price: 2650,
    profit: 0,
    swap: 0,
    fee: 0,
    comment: '',
    reason: 3,
    ...p,
  };
}

/** Zwei ganz geschlossene Positionen, 7,00 je Lot (hin und zurück, je 3,50 bei Ein- und Ausstieg). */
const CLOSED: Deal[] = [
  // Position 1: 0,10 Lot; 0,35 + 0,35 = 0,70 → 7,00 je Lot
  deal({ position_id: 1, type: 0, entry: 0, volume: 0.1, commission: -0.35 }),
  deal({ position_id: 1, type: 1, entry: 1, volume: 0.1, commission: -0.35 }),
  // Position 2: 0,30 Lot in zwei Teilschließungen; 1,05 + 0,70 + 0,35 = 2,10 → 7,00 je Lot
  deal({ position_id: 2, type: 1, entry: 0, volume: 0.3, commission: -1.05 }),
  deal({ position_id: 2, type: 0, entry: 1, volume: 0.2, commission: -0.7 }),
  deal({ position_id: 2, type: 0, entry: 1, volume: 0.1, commission: -0.35 }),
];

test.describe('Kommissions-Vorschlag je Lot', () => {
  test('geschlossene Positionen: −Σ Kommission ÷ Σ Volumen (2,80 ÷ 0,40 = 7,00)', { tag: '@BKT-04' }, () => {
    const p = proposeCommission(CLOSED, 'XAUUSD');
    expect(p).not.toBeNull();
    expect(p!.perLot).toBeCloseTo(7, 9);
    expect(p!.positions).toBe(2);
    expect(p!.lots).toBeCloseTo(0.4, 9);
  });

  test('offene, teilweise geschlossene, Umkehr-, fremde Symbol- und Kontodeals zählen nicht', { tag: '@BKT-04' }, () => {
    const noise: Deal[] = [
      // offen: nur Einstieg (die Ausstiegskommission fehlt noch)
      deal({ position_id: 3, type: 0, entry: 0, volume: 0.5, commission: -1.75 }),
      // teilweise geschlossen: 0,20 rein, 0,10 raus
      deal({ position_id: 4, type: 0, entry: 0, volume: 0.2, commission: -0.7 }),
      deal({ position_id: 4, type: 1, entry: 1, volume: 0.1, commission: -0.35 }),
      // Umkehr (Netting)
      deal({ position_id: 5, type: 0, entry: 0, volume: 0.1, commission: -9 }),
      deal({ position_id: 5, type: 1, entry: 2, volume: 0.2, commission: -9 }),
      deal({ position_id: 5, type: 0, entry: 1, volume: 0.1, commission: -9 }),
      // anderes Symbol
      deal({ position_id: 6, symbol: 'EURUSD', type: 0, entry: 0, volume: 1, commission: -5 }),
      deal({ position_id: 6, symbol: 'EURUSD', type: 1, entry: 1, volume: 1, commission: -5 }),
      // Einzahlung (DEAL_TYPE_BALANCE)
      deal({ position_id: 0, symbol: '', type: 2, entry: 0, volume: 0, commission: -99, profit: 500 }),
    ];
    const p = proposeCommission([...noise, ...CLOSED], 'XAUUSD');
    expect(p!.perLot).toBeCloseTo(7, 9);
    expect(p!.positions).toBe(2);
    expect(p!.lots).toBeCloseTo(0.4, 9);
  });

  test('Gebühr (fee) ist keine Kommission und zählt nicht', { tag: '@BKT-04' }, () => {
    const p = proposeCommission(
      [
        deal({ position_id: 10, type: 0, entry: 0, volume: 0.1, commission: -0.35, fee: -2 }),
        deal({ position_id: 10, type: 1, entry: 1, volume: 0.1, commission: -0.35, fee: -2 }),
      ],
      'XAUUSD',
    );
    expect(p!.perLot).toBeCloseTo(7, 9);
  });

  test('Close-By und Ausstieg ohne Einstieg im Archiv zählen nicht; Symbol ohne Groß-/Kleinschreibung', { tag: '@BKT-04' }, () => {
    const p = proposeCommission(
      [
        // Close-By: zwei Positionen gegeneinander geschlossen, Kommission nur auf einer
        deal({ position_id: 11, type: 0, entry: 0, volume: 0.1, commission: -0.35 }),
        deal({ position_id: 12, type: 1, entry: 0, volume: 0.1, commission: -0.35 }),
        deal({ position_id: 11, type: 1, entry: 3, volume: 0.1, commission: -0.7 }),
        deal({ position_id: 12, type: 0, entry: 3, volume: 0.1, commission: 0 }),
        // nur der Ausstieg ist im Archiv
        deal({ position_id: 13, type: 1, entry: 1, volume: 0.1, commission: -5 }),
        // ohne Positionsnummer
        deal({ position_id: 0, type: 0, entry: 0, volume: 0.1, commission: -5 }),
        deal({ position_id: 0, type: 1, entry: 1, volume: 0.1, commission: -5 }),
        ...CLOSED,
      ],
      'xauusd',
    );
    expect(p!.perLot).toBeCloseTo(7, 9);
    expect(p!.positions).toBe(2);
  });

  test('Broker bucht nur beim Einstieg: 1,00 ÷ 0,20 = 5,00 je Lot hin und zurück', { tag: '@BKT-04' }, () => {
    const p = proposeCommission(
      [
        deal({ position_id: 7, type: 0, entry: 0, volume: 0.2, commission: -1 }),
        deal({ position_id: 7, type: 1, entry: 1, volume: 0.2, commission: 0 }),
      ],
      'XAUUSD',
    );
    expect(p!.perLot).toBeCloseTo(5, 9);
  });

  test('ohne Kommission 0 (nicht −0); ohne geschlossene Position null', { tag: '@BKT-04' }, () => {
    const free = proposeCommission(
      [
        deal({ position_id: 8, type: 0, entry: 0, volume: 0.1, commission: 0 }),
        deal({ position_id: 8, type: 1, entry: 1, volume: 0.1, commission: null }),
      ],
      'XAUUSD',
    );
    expect(Object.is(free!.perLot, 0)).toBe(true);
    expect(proposeCommission([deal({ position_id: 9, type: 0, entry: 0, volume: 0.1, commission: -1 })], 'XAUUSD')).toBeNull();
    expect(proposeCommission(CLOSED, 'USOUSD')).toBeNull();
  });
});

test('Mock-Daten: jedes Symbol hat alle Kostenfelder (wie mt5_helpers.SYMBOL_COST_FIELDS)', { tag: '@BKT-04' }, () => {
  const fields = [
    'trade_calc_mode', 'trade_tick_value_profit', 'trade_tick_value_loss', 'currency_profit', 'swap_mode',
    'swap_long', 'swap_short', 'swap_rollover3days', 'spread', 'trade_stops_level',
  ] as const;
  for (const sym of defaultState().symbols) {
    for (const f of fields) expect(sym[f], `${sym.name}.${f}`).not.toBeUndefined();
  }
});
