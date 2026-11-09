/**
 * URL model of the one chart without modes (plan 1107-A21, step U4-3).
 * UI-22 One chart without modes
 */
import { expect, test } from '@playwright/test';
import { CHART_TIMEFRAMES } from '../../src/lib/analysis/candles';
import { DEFAULT_CHART_RANGE, DEFAULT_CHART_TF, buildChartUrl, hasFormations, parseChartUrl } from '../../src/lib/chart/chartUrl';

const ui = (name: string, fn: () => void) => test(name, { tag: '@UI-22' }, fn);
const p = (q: string) => new URLSearchParams(q);
const zoneSymbol = (id: string) => (id === 'z1' ? 'EURUSD' : null);

ui('Defaults: empty URL gives H4, range All, no symbol', () => {
  const r = parseChartUrl(p(''));
  expect(r).toEqual({ account: null, symbol: null, zone: null, tf: 'H4', form: null, at: null, range: { preset: 'all' } });
  expect(DEFAULT_CHART_TF).toBe('H4');
  expect(DEFAULT_CHART_RANGE).toEqual({ preset: 'all' });
});

ui('All nine timeframes are accepted', () => {
  expect(CHART_TIMEFRAMES).toHaveLength(9);
  for (const tf of CHART_TIMEFRAMES) expect(parseChartUrl(p(`tf=${tf}`)).tf).toBe(tf);
});

ui('Invalid tf falls back to H4', () => {
  expect(parseChartUrl(p('tf=M2')).tf).toBe('H4');
  expect(parseChartUrl(p('tf=h1')).tf).toBe('H4');
  expect(parseChartUrl(p('tf=')).tf).toBe('H4');
});

// Moved from analysis-calendar-lib.spec.ts (ANA-26, `timeframeParam` / `timeframeAllowed` of the removed lib/chart/mode.ts)
ui('W1 and MN are valid for every old mode link; only D1, H4, H1, M15 have formations', () => {
  for (const mode of ['formation', 'setup', 'free']) {
    expect(parseChartUrl(p(`mode=${mode}&tf=W1`)).tf).toBe('W1');
    expect(parseChartUrl(p(`mode=${mode}&tf=MN`)).tf).toBe('MN');
    expect(parseChartUrl(p(`mode=${mode}&tf=M2`)).tf).toBe('H4');
  }
  expect(hasFormations('W1')).toBe(false);
  expect(hasFormations('M5')).toBe(false);
  expect(hasFormations('H4')).toBe(true);
});

ui('Old links: mode is ignored (formation, setup, free)', () => {
  expect(parseChartUrl(p('mode=formation&symbol=EURUSD&tf=H1&form=abc&at=2026-11-01T10:00'))).toMatchObject({
    symbol: 'EURUSD', tf: 'H1', form: 'abc', at: '2026-11-01T10:00',
  });
  expect(parseChartUrl(p('mode=setup&account=a1&zone=z1&tf=M5'), zoneSymbol)).toMatchObject({ account: 'a1', zone: 'z1', symbol: 'EURUSD', tf: 'M5' });
  expect(parseChartUrl(p('mode=free&symbol=XAUUSD&tf=W1'))).toMatchObject({ symbol: 'XAUUSD', tf: 'W1', zone: null });
  expect(parseChartUrl(p('mode=bogus'))).toEqual(parseChartUrl(p('')));
});

ui('Zone without symbol takes the symbol of the zone; explicit symbol wins', () => {
  expect(parseChartUrl(p('zone=z1'), zoneSymbol).symbol).toBe('EURUSD');
  expect(parseChartUrl(p('zone=z1&symbol=GBPUSD'), zoneSymbol).symbol).toBe('GBPUSD');
  expect(parseChartUrl(p('zone=unknown'), zoneSymbol).symbol).toBeNull();
  expect(parseChartUrl(p('zone=z1')).symbol).toBeNull();
});

ui('tab is no longer part of the model (UI-23): read ignores it, every write removes it', () => {
  expect('tab' in parseChartUrl(p('tab=stats'))).toBe(false);
  expect(buildChartUrl(p('tab=stats&symbol=EURUSD'), {}).toString()).toBe('symbol=EURUSD');
});

ui('Range: preset, custom days, invalid falls back to All', () => {
  expect(parseChartUrl(p('range=last30')).range).toEqual({ preset: 'last30' });
  expect(parseChartUrl(p('range=nope')).range).toEqual({ preset: 'all' });
  expect(parseChartUrl(p('from=2026-10-01&to=2026-10-31')).range).toEqual({ custom: { from: '2026-10-01', to: '2026-10-31' } });
  expect(parseChartUrl(p('from=2026-10-31&to=2026-10-01')).range).toEqual({ preset: 'all' });
});

ui('Write: default values leave the URL', () => {
  const out = buildChartUrl(p('symbol=EURUSD&tf=M5&range=last7'), { tf: 'H4', range: DEFAULT_CHART_RANGE });
  expect(out.toString()).toBe('symbol=EURUSD');
});

ui('Write: every write removes mode', () => {
  expect(buildChartUrl(p('mode=free&symbol=EURUSD'), { tf: 'M5' }).toString()).toBe('symbol=EURUSD&tf=M5');
  expect(buildChartUrl(p('mode=setup'), {}).has('mode')).toBe(false);
});

ui('Write: timeframe without formations removes form and at', () => {
  const base = 'symbol=EURUSD&tf=H4&form=abc&at=2026-11-01T10:00';
  const m5 = buildChartUrl(p(base), { tf: 'M5' });
  expect(m5.has('form')).toBe(false);
  expect(m5.has('at')).toBe(false);
  expect(m5.get('tf')).toBe('M5');
  for (const tf of ['D1', 'H1', 'M15'] as const) {
    const o = buildChartUrl(p(base), { tf });
    expect(o.get('form')).toBe('abc');
    expect(o.get('at')).toBe('2026-11-01T10:00');
  }
  // Exactly D1, H4, H1, M15 keep them; the other five timeframes drop them
  const kept = CHART_TIMEFRAMES.filter((tf) => buildChartUrl(p(base), { tf }).has('form'));
  expect(kept.sort()).toEqual(['D1', 'H1', 'H4', 'M15']);
  // W1 / MN also drop them; unchanged tf on an off-formation chart cannot hold them
  expect(buildChartUrl(p(base), { tf: 'MN' }).has('at')).toBe(false);
  expect(buildChartUrl(p('tf=M5'), { at: '2026-11-01T10:00' }).has('at')).toBe(false);
});

ui('Write: null clears a field; custom range replaces preset', () => {
  expect(buildChartUrl(p('symbol=EURUSD&zone=z1'), { zone: null }).toString()).toBe('symbol=EURUSD');
  const r = buildChartUrl(p('range=last7'), { range: { custom: { from: '2026-10-01', to: '2026-10-31' } } });
  expect(r.has('range')).toBe(false);
  expect(r.get('from')).toBe('2026-10-01');
  expect(buildChartUrl(r, { range: { preset: 'last90' } }).toString()).toBe('range=last90');
});

ui('Write: untouched default values of an old link also leave the URL', () => {
  expect(buildChartUrl(p('tf=H4&range=all&tab=chart'), { symbol: 'X' }).toString()).toBe('symbol=X');
});

ui('Write does not change the input', () => {
  const src = p('mode=free&tf=M5');
  buildChartUrl(src, { tf: 'H4' });
  expect(src.toString()).toBe('mode=free&tf=M5');
});
