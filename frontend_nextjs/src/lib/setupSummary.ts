/**
 * Setup özeti (ZON-22, plan 1108-A5 K3): kayıtlı bir setup'ın tek satırlık çip listesi.
 * Saf fonksiyon: çeviri ve sayı biçimi dışarıdan gelir (`SummaryContext`), böylece birim testi
 * dil ve React olmadan çalışır. Çip sırası üç kutuyla aynıdır: Giriş → Kırılım/Pullback + Spread → Çıkış.
 */
import type { MessageKey, Params } from '@/i18n';
import { migrateFractalDistance } from '@/lib/symbolDistance';
import type { ZoneSettings } from '@/store/types';

export type SummaryBox = 'entry' | 'guard' | 'exit';

export type SummaryId =
  | 'entry' | 'instant' | 'byLoss' | 'gridStep' | 'lot' | 'takeProfit' | 'stopLoss'
  | 'trend' | 'pullback' | 'levels' | 'maxPositions' | 'spread' | 'exit'
  | 'orderMode' | 'timeframe' | 'orderCount' | 'nextLoss';

export interface SummaryItem {
  id: SummaryId;
  box: SummaryBox;
  /** Çevrilmiş etiket (`zone.summary.<id>`) */
  label: string;
  value: string;
  /** Kapalı seçenek: çip soluk ve kesik çizgili gösterilir */
  off: boolean;
}

export interface SummaryContext {
  t: (key: MessageKey, params?: Params) => string;
  number: (value: number) => string;
  /** Einheit und Größe des Fraktal-Abstands des Symbols (distanceUnitOf); ohne Angabe bleibt der Wert unverändert */
  distance?: { unit: 'pips' | 'ticks' | null; size: number | null };
}

/** Çıkış alanlarının worker değerleri (çevrilmez) → i18n anahtarı. Bilinmeyen değer olduğu gibi gösterilir. */
const EXIT_SIDE: Record<string, MessageKey> = {
  Farketmez: 'zone.exit.side.any',
  'BUY (Yukarı)': 'zone.exit.side.up',
  'SELL (Aşağı)': 'zone.exit.side.down',
};
const EXIT_TARGET: Record<string, MessageKey> = {
  'Farketmez (Hepsi)': 'zone.exit.target.all',
  'Sadece BUY İşlemleri': 'zone.exit.target.buy',
  'Sadece SELL İşlemleri': 'zone.exit.target.sell',
};
const EXIT_SCOPE: Record<string, MessageKey> = {
  'Sadece Bekleyen Emirler': 'zone.exit.scope.pending',
  'Tüm İşlemler': 'zone.exit.scope.all',
};
const EXIT_TRIGGER: Record<string, MessageKey> = {
  'Anlık Fiyat': 'zone.exit.trigger.price',
  'Mum Kapanışı': 'zone.exit.trigger.candle',
};

const SL_MODE: Record<string, MessageKey> = {
  atr: 'zone.fractal.slMode.atr',
  sar: 'zone.fractal.slMode.sar',
  opposite_fractal: 'zone.fractal.slMode.opposite',
  buffer: 'zone.fractal.slMode.buffer',
};

export function buildSetupSummary(zone: ZoneSettings, ctx: SummaryContext): SummaryItem[] {
  const { t, number } = ctx;
  const isFractal = zone.entry_mode === 'fractal';
  const split = zone.order_type === 'BOTH' && !zone.sync_buy_sell;
  const byLoss = !!zone.step_by_loss;
  const items: SummaryItem[] = [];

  const add = (id: SummaryId, box: SummaryBox, value: string, off = false) =>
    items.push({ id, box, label: t(`zone.summary.${id}` as MessageKey), value, off });
  const onOff = (id: SummaryId, box: SummaryBox, on: boolean) =>
    add(id, box, t(on ? 'zone.summary.value.on' : 'zone.summary.value.off'), !on);

  /** BOTH ayrık: iki taraf tek çipte; aksi halde tek değer */
  const sides = (buy: string, sell: string) => (split ? `BUY ${buy} / SELL ${sell}` : buy);
  const dist = (n: number) => (byLoss ? `${number(n)} $` : number(n));

  // --- Giriş ---
  add('entry', 'entry', t(isFractal ? 'zone.summary.value.fractal' : 'zone.summary.value.grid'));
  if (isFractal) {
    add('orderMode', 'entry', t(zone.fractal_order_mode === 'rebound' ? 'zone.fractal.orderMode.rebound' : 'zone.fractal.orderMode.breakout'));
    add('timeframe', 'entry', zone.fractal_timeframe ?? 'H4');
    add('lot', 'entry', sides(number(zone.lot_size), number(zone.sell_lot_size)));
    const buyCount = zone.fractal_order_count ?? 1;
    add('orderCount', 'entry', sides(number(buyCount), number(zone.sell_fractal_order_count ?? buyCount)));
    add('maxPositions', 'entry', number(zone.max_positions));
    // Wie das Formular: alte Preisabstände (Version 0) werden in Pips/Ticks umgerechnet gezeigt
    const nextLoss = migrateFractalDistance(zone, ctx.distance?.size ?? null).fractal_next_loss ?? 0;
    if (nextLoss > 0) {
      const unit = ctx.distance?.unit === 'ticks' ? t('zone.fractal.unitTicks') : t('zone.fractal.unitPips');
      add('nextLoss', 'entry', zone.fractal_next_loss_mode === 'pips' ? `${number(nextLoss)} ${unit}` : `${number(nextLoss)} $`);
    } else add('nextLoss', 'entry', t('zone.summary.value.off'), true);
    if (zone.fractal_use_sl ?? true) {
      const mode = zone.fractal_sl_mode ?? 'atr';
      add('stopLoss', 'entry', SL_MODE[mode] ? t(SL_MODE[mode]) : mode);
      add('takeProfit', 'entry', zone.fractal_tp_by_money ? `${number(zone.fractal_tp_money ?? 10)} $` : `RR ${number(zone.fractal_rr ?? 2)}`);
    } else {
      add('stopLoss', 'entry', t('zone.summary.value.off'), true);
      // SL yokken TP her zaman para tutarıdır (ZoneFractalFields: tpByMoney = !useSl || …)
      add('takeProfit', 'entry', `${number(zone.fractal_tp_money ?? 10)} $`);
    }
  } else {
    onOff('instant', 'entry', !!zone.instant_entry);
    onOff('byLoss', 'entry', byLoss);
    add('gridStep', 'entry', sides(dist(zone.grid_step), dist(zone.sell_grid_step)));
    add('lot', 'entry', sides(number(zone.lot_size), number(zone.sell_lot_size)));
    add('takeProfit', 'entry', sides(dist(zone.take_profit), dist(zone.sell_take_profit)));
    add('stopLoss', 'entry', sides(dist(zone.stop_loss), dist(zone.sell_stop_loss)));

    // --- Kırılım ve Pullback ---
    onOff('trend', 'guard', zone.is_breakout);
    if (zone.is_breakout) add('pullback', 'guard', sides(dist(zone.pullback_distance), dist(zone.sell_pullback_distance)));
    add('levels', 'guard', `${number(zone.levels_below)} / ${number(zone.levels_above)}`);
    add('maxPositions', 'guard', number(zone.max_positions));
  }

  // --- Spread koruması ---
  const guard = zone.spread_guard;
  if (guard?.enabled) {
    const limit = { fixed: guard.max_spread, relative: guard.multiplier, grid: guard.grid_percent }[guard.mode];
    const mode = t(`spread.mode.${guard.mode}` as MessageKey);
    add('spread', 'guard', limit === undefined ? mode : `${mode} · ${number(limit)}`);
  } else {
    add('spread', 'guard', t('zone.summary.value.off'), true);
  }

  // --- Bölgeden çıkış ---
  if (zone.clear_on_exit) {
    const pick = (map: Record<string, MessageKey>, raw: string) => (map[raw] ? t(map[raw]) : raw);
    const candle = zone.exit_condition === 'Mum Kapanışı';
    const trigger = pick(EXIT_TRIGGER, zone.exit_condition);
    add('exit', 'exit', [
      pick(EXIT_SIDE, zone.clear_exit_side),
      pick(EXIT_TARGET, zone.clear_target_side),
      pick(EXIT_SCOPE, zone.clear_scope),
      candle ? `${trigger} ${zone.exit_timeframe}` : trigger,
    ].join(' · '));
  } else {
    add('exit', 'exit', t('zone.summary.value.off'), true);
  }

  return items;
}
