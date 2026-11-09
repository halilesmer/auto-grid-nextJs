import { test, expect } from '@playwright/test';
import { buildSetupSummary, type SummaryContext } from '../../src/lib/setupSummary';
import { defaultZone } from '../../src/utils/zoneHelpers';
import type { ZoneSettings } from '../../src/store/types';

// Saf fonksiyon: çeviri anahtarı olduğu gibi döner, sayı String ile biçimlenir → değerler tam okunur
const ctx: SummaryContext = { t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key), number: (value) => String(value) };

function zone(patch: Partial<ZoneSettings> = {}): ZoneSettings {
  return { ...defaultZone(), symbol: 'USOUSD', ...patch };
}

function summary(patch: Partial<ZoneSettings> = {}) {
  return buildSetupSummary(zone(patch), ctx);
}

function item(patch: Partial<ZoneSettings>, id: string) {
  return summary(patch).find((i) => i.id === id);
}

test('Grid, BUY: Kutu sırası Giriş → Kırılım/Spread → Çıkış ve değerler', { tag: '@ZON-22' }, () => {
  const items = summary();
  expect(items.map((i) => i.id)).toEqual([
    'entry', 'instant', 'byLoss', 'gridStep', 'lot', 'takeProfit', 'stopLoss',
    'trend', 'levels', 'maxPositions', 'spread', 'exit',
  ]);
  // Kutular birbirine karışmaz: giriş, sonra guard, sonra exit
  const boxes = items.map((i) => i.box);
  expect(boxes).toEqual([...boxes].sort((a, b) => ['entry', 'guard', 'exit'].indexOf(a) - ['entry', 'guard', 'exit'].indexOf(b)));
  expect(item({}, 'entry')).toMatchObject({ value: 'zone.summary.value.grid', off: false });
  expect(item({}, 'gridStep')).toMatchObject({ value: '0.05', off: false });
  expect(item({}, 'lot')?.value).toBe('0.01');
  expect(item({}, 'levels')?.value).toBe('5 / 5');
  expect(item({}, 'maxPositions')?.value).toBe('10');
});

test('Açık/kapalı çipler: kapalı olan off=true taşır', { tag: '@ZON-22' }, () => {
  expect(item({ instant_entry: false }, 'instant')).toMatchObject({ value: 'zone.summary.value.off', off: true });
  expect(item({ instant_entry: true }, 'instant')).toMatchObject({ value: 'zone.summary.value.on', off: false });
  expect(item({ is_breakout: false }, 'trend')?.off).toBe(true);
  expect(item({ clear_on_exit: false }, 'exit')).toMatchObject({ value: 'zone.summary.value.off', off: true });
});

test('Zarara göre: grid adımı, kâr al, zarar durdur $ birimine geçer', { tag: '@ZON-22' }, () => {
  const byLoss = { step_by_loss: true, grid_step: 2, take_profit: 3, stop_loss: 0 };
  expect(item(byLoss, 'byLoss')).toMatchObject({ value: 'zone.summary.value.on', off: false });
  expect(item(byLoss, 'gridStep')?.value).toBe('2 $');
  expect(item(byLoss, 'takeProfit')?.value).toBe('3 $');
  expect(item(byLoss, 'stopLoss')?.value).toBe('0 $');
  expect(item({ step_by_loss: false, grid_step: 2 }, 'gridStep')?.value).toBe('2');
});

test('Pullback çipi yalnız trend yönünde açıkken var, $ birimi izler', { tag: '@ZON-22' }, () => {
  expect(item({ is_breakout: false }, 'pullback')).toBeUndefined();
  expect(item({ is_breakout: true, pullback_distance: 0.4 }, 'pullback')?.value).toBe('0.4');
  expect(item({ is_breakout: true, step_by_loss: true, pullback_distance: 4 }, 'pullback')?.value).toBe('4 $');
});

test('SELL tek başına aynı alanları okur; BOTH senkron tek değer gösterir', { tag: '@ZON-22' }, () => {
  expect(item({ order_type: 'SELL', grid_step: 0.2 }, 'gridStep')?.value).toBe('0.2');
  expect(item({ order_type: 'BOTH', sync_buy_sell: true, grid_step: 0.2, sell_grid_step: 0.9 }, 'gridStep')?.value).toBe('0.2');
});

test('BOTH ayrık: BUY ve SELL değerleri bir çipte', { tag: '@ZON-22' }, () => {
  const split = { order_type: 'BOTH', sync_buy_sell: false, is_breakout: true } as const;
  const patch = { ...split, grid_step: 0.1, sell_grid_step: 0.2, lot_size: 0.01, sell_lot_size: 0.02, take_profit: 1, sell_take_profit: 2, stop_loss: 3, sell_stop_loss: 4, pullback_distance: 0.5, sell_pullback_distance: 0.6 };
  expect(item(patch, 'gridStep')?.value).toBe('BUY 0.1 / SELL 0.2');
  expect(item(patch, 'lot')?.value).toBe('BUY 0.01 / SELL 0.02');
  expect(item(patch, 'takeProfit')?.value).toBe('BUY 1 / SELL 2');
  expect(item(patch, 'stopLoss')?.value).toBe('BUY 3 / SELL 4');
  expect(item(patch, 'pullback')?.value).toBe('BUY 0.5 / SELL 0.6');
  expect(item({ ...patch, step_by_loss: true }, 'gridStep')?.value).toBe('BUY 0.1 $ / SELL 0.2 $');
});

test('Spread koruması: kapalı, sabit, göreli, grid', { tag: '@ZON-22' }, () => {
  expect(item({ spread_guard: undefined }, 'spread')).toMatchObject({ value: 'zone.summary.value.off', off: true });
  expect(item({ spread_guard: { enabled: false, mode: 'fixed' } }, 'spread')?.off).toBe(true);
  expect(item({ spread_guard: { enabled: true, mode: 'fixed', max_spread: 0.3 } }, 'spread')).toMatchObject({ value: 'spread.mode.fixed · 0.3', off: false });
  expect(item({ spread_guard: { enabled: true, mode: 'relative', multiplier: 1.5, bootstrap: 'wait' } }, 'spread')?.value).toBe('spread.mode.relative · 1.5');
  expect(item({ spread_guard: { enabled: true, mode: 'grid', grid_percent: 20 } }, 'spread')?.value).toBe('spread.mode.grid · 20');
});

test('Çıkış: yön, hedef, kapsam, tetikleyici; mum kapanışında zaman dilimi', { tag: '@ZON-22' }, () => {
  const exit = {
    clear_on_exit: true,
    clear_exit_side: 'SELL (Aşağı)',
    clear_target_side: 'Sadece BUY İşlemleri',
    clear_scope: 'Sadece Bekleyen Emirler',
    exit_condition: 'Anlık Fiyat',
  };
  expect(item(exit, 'exit')).toMatchObject({
    value: 'zone.summary.exit.side.down · zone.summary.exit.target.buy · zone.summary.exit.scope.pending · zone.summary.exit.trigger.price',
    full: 'zone.exit.side.down · zone.exit.target.buy · zone.exit.scope.pending · zone.exit.trigger.price',
    off: false,
  });
  expect(item({ ...exit, exit_condition: 'Mum Kapanışı', exit_timeframe: 'H1', clear_exit_side: 'Farketmez', clear_target_side: 'Farketmez (Hepsi)', clear_scope: 'Tüm İşlemler' }, 'exit')?.value)
    .toBe('zone.summary.exit.side.any · zone.summary.exit.target.all · zone.summary.exit.scope.all · zone.summary.exit.trigger.candle H1');
});

test('Fraktal: grid alanları yok, fraktal alanları var; Kırılım kutusunda yalnız Spread', { tag: '@ZON-22' }, () => {
  const fractal = { entry_mode: 'fractal', fractal_timeframe: 'H1', fractal_order_mode: 'rebound', fractal_order_count: 3, max_positions: 8 } as const;
  const items = summary(fractal);
  expect(items.map((i) => i.id)).toEqual([
    'entry', 'orderMode', 'timeframe', 'lot', 'orderCount', 'maxPositions', 'nextLoss', 'stopLoss', 'takeProfit', 'spread', 'exit',
  ]);
  expect(items.filter((i) => i.box === 'guard').map((i) => i.id)).toEqual(['spread']);
  expect(items[0]).toMatchObject({ id: 'entry', value: 'zone.summary.value.fractal' });
  expect(item(fractal, 'orderMode')?.value).toBe('zone.fractal.orderMode.rebound');
  expect(item(fractal, 'timeframe')?.value).toBe('H1');
  expect(item(fractal, 'orderCount')?.value).toBe('3');
});

test('Fraktal: BOTH ayrık emir sayısı ve lot, sonraki emir kaybı, SL/TP', { tag: '@ZON-22' }, () => {
  const split = { entry_mode: 'fractal', order_type: 'BOTH', sync_buy_sell: false, lot_size: 0.01, sell_lot_size: 0.03, fractal_order_count: 2, sell_fractal_order_count: 4 } as const;
  expect(item(split, 'lot')?.value).toBe('BUY 0.01 / SELL 0.03');
  expect(item(split, 'orderCount')?.value).toBe('BUY 2 / SELL 4');
  expect(item({ entry_mode: 'fractal', fractal_next_loss: 0 }, 'nextLoss')).toMatchObject({ value: 'zone.summary.value.off', off: true });
  expect(item({ entry_mode: 'fractal', fractal_next_loss: 5, fractal_next_loss_mode: 'money' }, 'nextLoss')).toMatchObject({ value: '5 $', off: false });
  expect(item({ entry_mode: 'fractal', fractal_next_loss: 30, fractal_next_loss_mode: 'pips', fractal_next_loss_unit_version: 1 }, 'nextLoss')?.value).toBe('30 zone.fractal.unitPips');
  // Broker-Ticks und alter Preisabstand (Version 0): Anzeige wie im Formular, umgerechnet in die Einheit des Symbols
  const forex = { ...ctx, distance: { unit: 'pips' as const, size: 0.0001 } };
  const legacy = zone({ entry_mode: 'fractal', fractal_next_loss: 0.001, fractal_next_loss_mode: 'pips', fractal_next_loss_unit_version: 0 });
  expect(buildSetupSummary(legacy, forex).find((i) => i.id === 'nextLoss')?.value).toBe('10 zone.fractal.unitPips');
  const ticks = { ...ctx, distance: { unit: 'ticks' as const, size: 0.01 } };
  const current = zone({ entry_mode: 'fractal', fractal_next_loss: 12, fractal_next_loss_mode: 'pips', fractal_next_loss_unit_version: 1 });
  expect(buildSetupSummary(current, ticks).find((i) => i.id === 'nextLoss')?.value).toBe('12 zone.fractal.unitTicks');
  expect(item({ entry_mode: 'fractal', fractal_use_sl: true, fractal_sl_mode: 'atr' }, 'stopLoss')?.value).toBe('zone.fractal.slMode.atr');
  expect(item({ entry_mode: 'fractal', fractal_use_sl: false }, 'stopLoss')).toMatchObject({ value: 'zone.summary.value.off', off: true });
  expect(item({ entry_mode: 'fractal', fractal_use_sl: true, fractal_tp_by_money: false, fractal_rr: 2 }, 'takeProfit')?.value).toBe('RR 2');
  expect(item({ entry_mode: 'fractal', fractal_use_sl: true, fractal_tp_by_money: true, fractal_tp_money: 10 }, 'takeProfit')?.value).toBe('10 $');
});
