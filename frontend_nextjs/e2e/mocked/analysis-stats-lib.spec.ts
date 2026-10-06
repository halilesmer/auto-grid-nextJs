/**
 * Reine Rechenfälle (von Hand nachgerechnet) für den Statistik-Tab: Kennzahlen, Aufteilung je Zone/
 * Wochentag/Stunde, Kurven (realisiert, Drawdown, Kontostand rückwärts).
 * ANA-09 Statistik-Tab
 * ANA-12 MFE/MAE aus M1-Kerzen
 */
import { expect, test } from '@playwright/test';
import { balanceCurve, drawdownCurve, realizedCurve } from '../../src/lib/analysis/curves';
import { breakdown, groupKey, inScope } from '../../src/lib/analysis/groupings';
import type { Bar } from '../../src/lib/analysis/candles';
import { excursion, isFinal, m1Spans, type M1Data } from '../../src/lib/analysis/excursions';
import { computeStats } from '../../src/lib/analysis/stats';
import { pairTrades, type Deal, type Trade, type ZoneRegistryEntry } from '../../src/lib/analysis/tradePairing';

const H = 3600;
const T0 = 1_790_000_000;
const OFFSET = 3 * H;
const REGISTRY: ZoneRegistryEntry[] = [
  { magic: 200001, zone_id: 'z1', symbol: 'USOUSD', label: 'Z1', created_at: T0, deleted_at: null },
];
/** Donnerstag 00:00 (MT5-Zeit), nach dem Registereintrag */
const THU = 1_790_208_000;

let ticket = 1;
function deal(p: Partial<Deal> & Pick<Deal, 'position_id' | 'time' | 'type' | 'entry'>): Deal {
  const t = ticket++;
  return {
    ticket: t,
    order: t,
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

/**
 * A: Fraktal, TP, Netto 10 − 0,5 − 0,5 = 9 · B: früheres Zusatz-Setup 2, −4 · C: Grid ohne Fraktal, TP, +3 ·
 * D: früheres Zusatz-Setup 7, +2 · E: manuell, −1
 */
function sample() {
  const deals = [
    deal({ position_id: 1, time: THU + 1 * H, type: 0, entry: 0, commission: -0.5, comment: 'AutoGrid_Z1_FD1790000000' }),
    deal({ position_id: 1, time: THU + 2 * H, type: 1, entry: 1, profit: 10, commission: -0.5, reason: 5 }),
    deal({ position_id: 2, time: THU + 3 * H, type: 1, entry: 0, comment: 'AutoGrid_Z1_F2U1790000000' }),
    deal({ position_id: 2, time: THU + 4 * H, type: 0, entry: 1, profit: -4 }),
    deal({ position_id: 3, time: THU + 5 * H, type: 0, entry: 0, comment: 'AutoGrid_Z1_B' }),
    deal({ position_id: 3, time: THU + 6 * H, type: 1, entry: 1, profit: 3, reason: 5 }),
    deal({ position_id: 4, time: THU + 7 * H, type: 0, entry: 0, comment: 'AutoGrid_Z1_F7D1790000000' }),
    deal({ position_id: 4, time: THU + 8 * H, type: 1, entry: 1, profit: 2 }),
    deal({ position_id: 5, time: THU + 9 * H, type: 0, entry: 0, magic: 0 }),
    deal({ position_id: 5, time: THU + 10 * H, type: 1, entry: 1, magic: 0, profit: -1 }),
  ];
  return pairTrades(deals, REGISTRY, OFFSET).trades;
}

test.describe('ANA-09 Statistik-Rechnung', () => {
  test('Kennzahlen: Netto, Trefferquote, Profitfaktor, Zyklen, max. Drawdown', { tag: '@ANA-09' }, () => {
    const s = computeStats(sample());
    expect(s.trades).toBe(5);
    expect(s.positions).toBe(5);
    expect([s.wins, s.losses, s.flat]).toEqual([3, 2, 0]);
    expect(s.winRate).toBeCloseTo(0.6);
    expect(s.net).toBeCloseTo(9);
    expect(s.grossProfit).toBeCloseTo(14);
    expect(s.grossLoss).toBeCloseTo(-5);
    expect(s.profitFactor).toBeCloseTo(2.8);
    expect(s.avg).toBeCloseTo(1.8);
    expect(s.best).toBeCloseTo(9);
    expect(s.worst).toBeCloseTo(-4);
    expect(s.cycles).toBe(2);
    // Kurve 9, 5, 8, 10, 9: größter Rückgang 9 → 5
    expect(s.maxDrawdown).toBeCloseTo(4);
  });

  test('Profitfaktor ohne Verlust ist „—“ (null), leere Auswahl ohne Quote', { tag: '@ANA-09' }, () => {
    const s = computeStats(sample().slice(0, 1));
    expect(s.profitFactor).toBeNull();
    expect(s.winRate).toBe(1);
    const empty = computeStats([]);
    expect(empty.winRate).toBeNull();
    expect(empty.avg).toBeNull();
    expect(empty.maxDrawdown).toBe(0);
  });

  test('Teilschließung: zwei Trades, eine Position', { tag: '@ANA-09' }, () => {
    const trades = pairTrades(
      [
        deal({ position_id: 9, time: THU + H, type: 0, entry: 0, volume: 0.2 }),
        deal({ position_id: 9, time: THU + 2 * H, type: 1, entry: 1, profit: 1 }),
        deal({ position_id: 9, time: THU + 3 * H, type: 1, entry: 1, profit: 2 }),
      ],
      REGISTRY,
      OFFSET,
    ).trades;
    const s = computeStats(trades);
    expect([s.trades, s.positions]).toEqual([2, 1]);
  });

  test('Je Zone: Zone, manuell', { tag: '@ANA-09' }, () => {
    expect(breakdown(sample(), 'zone').map((g) => [g.key, g.stats.trades])).toEqual([
      ['z:200001', 4],
      ['manual', 1],
    ]);
  });

  test('Umfang: Konto, Zone; „Zone unbekannt“ zählt zu keiner Zone', { tag: '@ANA-09' }, () => {
    const trades = sample();
    expect(trades.filter((tr) => inScope(tr, { kind: 'account' }))).toHaveLength(5);
    expect(trades.filter((tr) => inScope(tr, { kind: 'zone', magic: 200001 }))).toHaveLength(4);
    // Vor dem Registereintrag eröffnet → unbekannt
    const early = pairTrades(
      [
        deal({ position_id: 8, time: T0 + OFFSET - H, type: 0, entry: 0, comment: 'AutoGrid_Z1_FU1' }),
        deal({ position_id: 8, time: T0 + OFFSET + H, type: 1, entry: 1, profit: 1 }),
      ],
      REGISTRY,
      OFFSET,
    ).trades;
    expect(inScope(early[0], { kind: 'zone', magic: 200001 })).toBe(false);
    expect(groupKey(early[0], 'zone')).toBe('unknown');
  });

  test('Wochentag und Stunde nach Schließzeit (MT5)', { tag: '@ANA-09' }, () => {
    const tr = sample()[0];
    expect(groupKey(tr, 'weekday')).toBe('4');
    expect(groupKey(tr, 'hour')).toBe('2');
    expect(breakdown(sample(), 'hour').map((g) => g.key)).toEqual(['2', '4', '6', '8', '10']);
  });

  test('Realisierte Kurve und Drawdown', { tag: '@ANA-09' }, () => {
    const from = THU;
    const curve = realizedCurve(sample(), from);
    expect(curve.map((p) => p.value)).toEqual([0, 9, 5, 8, 10, 9].map((v) => expect.closeTo(v, 6)));
    expect(curve[0].time).toBe(from);
    expect(drawdownCurve(curve).map((p) => p.value)).toEqual([0, 0, -4, -1, 0, -1].map((v) => expect.closeTo(v, 6)));
  });

  test('Zeitraum „alles“ (from = 0): Kurve beginnt beim ersten Trade, nicht 1970', { tag: '@ANA-09' }, () => {
    const trades = sample();
    expect(realizedCurve(trades, 0)[0]).toEqual({ time: trades[0].exitTime - 1, value: 0 });
    const b = balanceCurve([deal({ position_id: 0, time: THU, type: 2, entry: 0, profit: 50 })], 50, { from: 0, to: THU + 86400 }, 0, THU + H);
    expect(b.ok && b.points[0]).toEqual({ time: THU - 1, value: 0 });
  });

  test('Kontostand rückwärts; Lücke oder Zeitraum nicht bis jetzt → aus mit Grund', { tag: '@ANA-09' }, () => {
    const deals = [
      deal({ position_id: 0, time: THU + H, type: 2, entry: 0, profit: 1000, magic: 0, symbol: '' }),
      deal({ position_id: 7, time: THU + 2 * H, type: 0, entry: 0, commission: -1 }),
      deal({ position_id: 7, time: THU + 3 * H, type: 1, entry: 1, profit: 100, commission: -2 }),
    ];
    const range = { from: THU, to: THU + 86400 };
    const now = THU + 5 * H;
    const b = balanceCurve(deals, 1100, range, 0, now);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.points.map((p) => p.value)).toEqual([3, 1003, 1002, 1100].map((v) => expect.closeTo(v, 6)));
    expect(balanceCurve(deals, 1100, range, 1, now)).toEqual({ ok: false, reason: 'missing' });
    expect(balanceCurve(deals, 1100, range, 0, range.to + 1)).toEqual({ ok: false, reason: 'notToNow' });
    expect(balanceCurve(deals, null, range, 0, now)).toEqual({ ok: false, reason: 'noBalance' });
  });
});

/** Trade mit den Feldern, die MFE/MAE braucht (Zeiten MT5-Sekunden, Volumen 0,1 → 1 Preiseinheit = 10) */
function trade(p: Partial<Trade> & Pick<Trade, 'side' | 'entryTime' | 'entryPrice' | 'exitTime' | 'exitPrice' | 'profit'>): Trade {
  return {
    id: `${p.exitTime}`,
    positionId: 1,
    symbol: 'USOUSD',
    volume: 0.1,
    exitTicket: 1,
    exitReason: null,
    commission: 0,
    fee: 0,
    swap: 0,
    net: p.profit,
    partial: false,
    reversal: false,
    closeBy: false,
    magic: 200001,
    zone: { kind: 'unknown', magic: 200001 },
    fractal: null,
    ...p,
  };
}

const bar = (time: number, high: number, low: number): Bar => ({ time, open: low, high, low, close: high });
/**
 * Einstiegskerze E (Extreme 101/99 dürfen nicht zählen), vier Zwischenkerzen E+1…E+4 min, Ausstiegskerze
 * E+5 min (Extreme 102/98 dürfen nicht zählen). point 0,01.
 */
function m1(p: Partial<M1Data> = {}): M1Data {
  return {
    bars: [
      bar(THU, 101, 99),
      bar(THU + 60, 100.3, 99.9),
      bar(THU + 120, 100.5, 99.95),
      bar(THU + 180, 100.1, 99.7),
      bar(THU + 240, 100.25, 99.8),
      bar(THU + 300, 102, 98),
    ],
    spread: [9, 2, 2, 5, 2, 9],
    missing: [],
    from: THU,
    to: THU + 360,
    point: 0.01,
    ...p,
  };
}
const BUY = { side: 'buy', entryTime: THU + 30, entryPrice: 100, exitTime: THU + 310, exitPrice: 100.2, profit: 2 } as const;
const SELL = { side: 'sell', entryTime: THU + 30, entryPrice: 100, exitTime: THU + 310, exitPrice: 99.8, profit: 2 } as const;

test.describe('ANA-12 MFE/MAE-Rechnung', () => {
  test('BUY: nur Zwischenkerzen zählen; MFE 50 Punkte / 5,00, MAE 30 Punkte / 3,00', { tag: '@ANA-12' }, () => {
    const r = excursion(trade(BUY), m1());
    if (!r.ok) throw new Error(r.reason);
    expect(r.mfe).toBeCloseTo(0.5, 9);
    expect(r.mae).toBeCloseTo(0.3, 9);
    expect(r.mfePts).toBeCloseTo(50, 6);
    expect(r.maePts).toBeCloseTo(30, 6);
    expect(r.mfeMoney).toBeCloseTo(5, 6);
    expect(r.maeMoney).toBeCloseTo(3, 6);
  });

  test('SELL: Ask = Bid + Spread; MFE 25 Punkte (Tief 99,70 + 5), MAE 52 Punkte (Hoch 100,50 + 2)', { tag: '@ANA-12' }, () => {
    const r = excursion(trade(SELL), m1());
    if (!r.ok) throw new Error(r.reason);
    expect(r.mfePts).toBeCloseTo(25, 6);
    expect(r.maePts).toBeCloseTo(52, 6);
    expect(r.mfeMoney).toBeCloseTo(2.5, 6);
    expect(r.maeMoney).toBeCloseTo(5.2, 6);
  });

  test('Ein- und Ausstieg in derselben Kerze: nur die Preise, Randkerze zählt nicht', { tag: '@ANA-12' }, () => {
    const r = excursion(trade({ side: 'buy', entryTime: THU + 10, entryPrice: 100, exitTime: THU + 50, exitPrice: 99.9, profit: -1 }), m1());
    if (!r.ok) throw new Error(r.reason);
    expect(r.mfePts).toBe(0);
    expect(r.maePts).toBeCloseTo(10, 6);
    expect(r.maeMoney).toBeCloseTo(1, 6);
  });

  test('Marktpause (Kerzen fehlen ohne missing) ist berechenbar', { tag: '@ANA-12' }, () => {
    const data = m1();
    const keep = [0, 1, 4, 5];
    const r = excursion(trade(BUY), { ...data, bars: keep.map((i) => data.bars[i]), spread: keep.map((i) => data.spread[i]) });
    if (!r.ok) throw new Error(r.reason);
    expect(r.mfePts).toBeCloseTo(30, 6);
    expect(r.maePts).toBeCloseTo(20, 6);
  });

  test('Nicht berechenbar, nie 0: Lücke, kein Einstieg, kein Spread (SELL), nicht geladen, kein point', { tag: '@ANA-12' }, () => {
    const gap = m1({ missing: [{ from: THU + 120, to: THU + 180, reason: 'unavailable', checked_at: null }] });
    expect(excursion(trade(BUY), gap)).toEqual({ ok: false, reason: 'missing' });
    expect(excursion(trade({ ...BUY, entryTime: null, entryPrice: null }), m1())).toEqual({ ok: false, reason: 'noEntry' });
    expect(excursion(trade(SELL), m1({ spread: [9, 2, null, 5, 2, 9] }))).toEqual({ ok: false, reason: 'noSpread' });
    expect(excursion(trade(BUY), m1({ spread: [9, 2, null, 5, 2, 9] })).ok).toBe(true);
    expect(excursion(trade(BUY), m1({ from: THU + 120 }))).toEqual({ ok: false, reason: 'notLoaded' });
    expect(excursion(trade(BUY), null)).toEqual({ ok: false, reason: 'notLoaded' });
    expect(excursion(trade(BUY), m1({ point: null }))).toEqual({ ok: false, reason: 'noPoint' });
  });

  test('Ausstieg = Einstieg: Punkte ja, Geld nicht ableitbar (null)', { tag: '@ANA-12' }, () => {
    const r = excursion(trade({ ...BUY, exitPrice: 100, profit: 0 }), m1());
    if (!r.ok) throw new Error(r.reason);
    expect(r.mfePts).toBeCloseTo(50, 6);
    expect(r.mfeMoney).toBeNull();
    expect(r.maeMoney).toBeNull();
  });

  test('Ladespanne je Symbol: neueste Trades zuerst, gekappt bei der Obergrenze', { tag: '@ANA-12' }, () => {
    const newest = trade({ ...BUY, entryTime: THU + 6000, exitTime: THU + 6310 });
    const old = trade({ ...BUY, entryTime: THU, exitTime: THU + 310 });
    const sameBar = trade({ ...BUY, entryTime: THU + 9000, exitTime: THU + 9030 });
    expect(m1Spans([old, newest, sameBar], 10)).toEqual(new Map([['USOUSD', { from: THU + 6060, to: THU + 6300, capped: true }]]));
    expect(m1Spans([old, newest], 200)).toEqual(new Map([['USOUSD', { from: THU + 60, to: THU + 6300, capped: false }]]));
  });

  test('Übergroßer neuester Trade blockiert ältere nicht; er selbst ist endgültig „zu lang“', { tag: '@ANA-12' }, () => {
    const huge = trade({ ...BUY, entryTime: THU + 10_000, exitTime: THU + 10_000 + 200 * 60 });
    const old = trade({ ...BUY, entryTime: THU, exitTime: THU + 310 });
    expect(m1Spans([huge, old], 100)).toEqual(new Map([['USOUSD', { from: THU + 60, to: THU + 300, capped: false }]]));
    const long = trade({ ...BUY, entryTime: THU, exitTime: THU + 100_002 * 60 });
    const r = excursion(long, m1());
    expect(r).toEqual({ ok: false, reason: 'tooLong' });
    expect(isFinal(r)).toBe(true);
  });

  test('Lücke nur „busy“/„error“: vorläufig (Knopf erneut); „unavailable“: endgültig', { tag: '@ANA-12' }, () => {
    const busy = excursion(trade(BUY), m1({ missing: [{ from: THU + 120, to: THU + 180, reason: 'busy', checked_at: null }] }));
    expect(busy).toEqual({ ok: false, reason: 'busy' });
    expect(isFinal(busy)).toBe(false);
    const mixed = excursion(
      trade(BUY),
      m1({
        missing: [
          { from: THU + 60, to: THU + 120, reason: 'error', checked_at: null },
          { from: THU + 180, to: THU + 240, reason: 'unavailable', checked_at: null },
        ],
      }),
    );
    expect(mixed).toEqual({ ok: false, reason: 'missing' });
    expect(isFinal(mixed)).toBe(true);
    expect(isFinal(excursion(trade(BUY), null))).toBe(false);
  });
});
