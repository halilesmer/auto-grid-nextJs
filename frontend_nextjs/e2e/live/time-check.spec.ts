/**
 * Live, nur lesend (ANA-13): Zeit-Check des echten Workers für das DEMO-Testkonto.
 *
 * GET /api/market/{id}/time-check meldet Brokerzeit, VPS-UTC, die letzten M1-Kerzen, den letzten
 * Deal, das Kontomodell und die Symbolart. Der Test prüft, dass diese Werte zusammenpassen, und
 * schreibt sie als Annotation in den Bericht: Zeit und Ticket des letzten Deals werden danach von
 * Hand mit dem MT5-Terminal (Werkzeuge → Historie) verglichen (docs/analyse-regeln.md, Schritt 0).
 */
import { expect, test } from './live';

interface TimeCheck {
  symbol: string;
  vps_utc: number;
  vps_tz_offset_sec: number;
  tick: { time: number; time_msc: number; bid: number; ask: number } | null;
  broker_offset: { raw_sec: number; offset_sec: number; offset_hours: number; reliable: boolean; source_symbol: string } | null;
  rates_m1: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  last_deal: { ticket: number; time: number; time_msc: number; symbol: string; type: number; entry: number; time_msc_matches_time: boolean } | null;
  deals_lookback_days: number;
  deals_in_lookback: number;
  errors: string[];
  account: { login: number; server: string; currency: string; margin_mode: number; margin_mode_name: string };
  symbol_info: { trade_calc_mode: number; trade_calc_mode_name: string; swap_rollover3days_name: string | null; currency_profit: string };
  backtest_support: { account_hedging: boolean; calc_mode_supported: boolean };
}

/** Brokerzeit (Sekunden) lesbar, ohne Zeitzonen-Umrechnung: so zeigt MT5 sie an. */
const brokerTime = (sec: number) => new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19);

test('Zeit-Check: Brokerzeit, Kerzen, letzter Deal und Kontomodell passen zusammen', { tag: '@ANA-13' }, async ({ api, account }) => {
  const zones = (await api.settings(account.id)).ZONES ?? [];
  test.skip(zones.length === 0, 'Testkonto hat keine Zone (Symbol für den Check fehlt)');
  const { status, body: check } = await api.fetch<TimeCheck>(
    `/market/${account.id}/time-check?symbol=${encodeURIComponent(zones[0].symbol)}`,
  );
  test.skip(status === 403, 'NEXT_PUBLIC_WORKER_API_KEY ist kein Admin-Schlüssel');
  expect(status, `MT5 im Worker erreichbar (503 = Verbindung fehlgeschlagen, 409 = Konto gerade belegt): ${JSON.stringify(check)}`).toBe(200);

  expect(check.account.login).toBe(Number(account.id));
  expect(['hedging', 'netting', 'exchange']).toContain(check.account.margin_mode_name);
  expect(check.errors, 'MT5-Abfragen ohne Fehler').toEqual([]);
  expect(check.tick, 'Symbol hat einen Tick').not.toBeNull();
  expect(check.rates_m1.length, 'M1-Kerzen aus copy_rates_range').toBeGreaterThan(0);

  const last = check.rates_m1[check.rates_m1.length - 1];
  // Kerzen und Tick haben dieselbe Zeitbasis: die Kerzen werden vor dem Tick gelesen, die letzte
  // Kerze liegt also nie nach ihm
  expect(last.time).toBeLessThanOrEqual(check.tick!.time);
  if (check.broker_offset?.reliable && check.broker_offset.source_symbol === check.symbol) {
    // Markt dieses Symbols läuft: die letzte Kerze ist die laufende (oder die gerade geschlossene)
    expect(check.tick!.time - last.time).toBeLessThan(120);
  }
  if (check.last_deal) {
    expect(check.last_deal.time_msc_matches_time, 'time_msc passt zu time').toBe(true);
  }

  const lines = [
    `Konto ${check.account.login} @ ${check.account.server} (${check.account.currency}), Modell: ${check.account.margin_mode_name}`,
    `Symbol ${check.symbol}: ${check.symbol_info.trade_calc_mode_name}, Gewinnwährung ${check.symbol_info.currency_profit}, Dreifach-Swap ${check.symbol_info.swap_rollover3days_name ?? '–'}`,
    `Backtest möglich: Hedging ${check.backtest_support.account_hedging ? 'ja' : 'nein'}, Symbolart ${check.backtest_support.calc_mode_supported ? 'ja' : 'nein'}`,
    `Tick (Brokerzeit): ${brokerTime(check.tick!.time)} | VPS-UTC: ${brokerTime(Math.floor(check.vps_utc))} | VPS-Zeitzone: UTC${check.vps_tz_offset_sec >= 0 ? '+' : ''}${check.vps_tz_offset_sec / 3600}`,
    check.broker_offset
      ? `Broker-Abstand: UTC${check.broker_offset.offset_hours >= 0 ? '+' : ''}${check.broker_offset.offset_hours} (aus ${check.broker_offset.source_symbol}, roh ${check.broker_offset.raw_sec} s, ${check.broker_offset.reliable ? 'verlässlich' : 'NICHT verlässlich – Markt zu?'})`
      : 'Broker-Abstand: kein Tick',
    `Letzte M1-Kerzen (Brokerzeit): ${check.rates_m1.map((b) => brokerTime(b.time).slice(11, 16)).join(', ')}`,
    check.last_deal
      ? `Letzter Deal #${check.last_deal.ticket} ${check.last_deal.symbol} um ${brokerTime(check.last_deal.time)} (Brokerzeit) – mit MT5 → Historie vergleichen`
      : `Kein Trade-Deal in den letzten ${check.deals_lookback_days} Tagen (${check.deals_in_lookback} Deals insgesamt)`,
  ];
  for (const line of lines) test.info().annotations.push({ type: 'Zeit-Check', description: line });
  console.log(`\nZeit-Check ${account.id}:\n  ${lines.join('\n  ')}`);
});
