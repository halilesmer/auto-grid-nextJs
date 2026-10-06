/**
 * Reine Rechenfälle (von Hand nachgerechnet) für den Statistik-Tab: Kennzahlen, Aufteilung je Zone/Setup/
 * Wochentag/Stunde, Kurven (realisiert, Drawdown, Kontostand rückwärts).
 * ANA-09 Statistik-Tab
 */
import { expect, test } from '@playwright/test';
import { balanceCurve, drawdownCurve, realizedCurve } from '../../src/lib/analysis/curves';
import { breakdown, groupKey, inScope } from '../../src/lib/analysis/groupings';
import { computeStats } from '../../src/lib/analysis/stats';
import { pairTrades, type Deal, type ZoneRegistryEntry } from '../../src/lib/analysis/tradePairing';

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
 * A: Setup 1, TP, Netto 10 − 0,5 − 0,5 = 9 · B: Setup 2, −4 · C: Grid ohne Fraktal, TP, +3 ·
 * D: Setup 7 (nicht mehr in den Einstellungen), +2 · E: manuell, −1
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

  test('Je Setup: Setup 1, 2, gelöschtes 7, ohne Setup, manuell', { tag: '@ANA-09' }, () => {
    const groups = breakdown(sample(), 'setup');
    expect(groups.map((g) => g.key)).toEqual(['s:200001:1', 's:200001:2', 's:200001:7', 's:200001:none', 'manual']);
    expect(groups.map((g) => g.stats.net)).toEqual([9, -4, 2, 3, -1].map((v) => expect.closeTo(v, 6)));
    expect(breakdown(sample(), 'zone').map((g) => [g.key, g.stats.trades])).toEqual([
      ['z:200001', 4],
      ['manual', 1],
    ]);
  });

  test('Umfang: Konto, Zone, Setup; „Zone unbekannt“ zählt zu keiner Zone', { tag: '@ANA-09' }, () => {
    const trades = sample();
    expect(trades.filter((tr) => inScope(tr, { kind: 'account' }))).toHaveLength(5);
    expect(trades.filter((tr) => inScope(tr, { kind: 'zone', magic: 200001 }))).toHaveLength(4);
    expect(trades.filter((tr) => inScope(tr, { kind: 'setup', magic: 200001, sid: 2 })).map((tr) => tr.net)).toEqual([-4]);
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
    expect(groupKey(early[0], 'setup')).toBe('unknown');
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
