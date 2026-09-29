'use client';

import type { ReactNode } from 'react';
import type { ZoneEntryFieldsProps } from './types';
import type { EntryMode, TpMode } from '@/store/types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ENTRY_DEFAULTS, entryOf, parseFloatCustom, usesSignal } from '@/utils/zoneHelpers';
import { useFormat, useT } from '@/i18n';

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

const int = (text: string, min: number) => Math.max(min, parseInt(text, 10) || 0);

/** Einstiegsregel der Zone: Modus, Signal-Indikatoren, Spread-Filter, Limits pro Richtung, Gewinnziel. */
export function ZoneEntryFields({ zone, update, symbolConfig }: ZoneEntryFieldsProps) {
  const t = useT();
  const e = entryOf(zone);
  const signal = usesSignal(zone);
  const isBoth = zone.order_type === 'BOTH' || zone.order_type === 'AUTO';
  const splitSides = isBoth && !zone.sync_buy_sell;

  const setMode = (mode: EntryMode) => {
    // Ältere Zone ohne Einstiegsfelder: Defaults ausdrücklich mitspeichern (Worker liest dieselben)
    for (const [key, value] of Object.entries(ENTRY_DEFAULTS)) {
      if (zone[key as keyof typeof ENTRY_DEFAULTS] === undefined) update(key, value);
    }
    update('entry_mode', mode);
    // AUTO braucht ein Signal: im reinen Grid-Modus nicht wählbar
    if (mode === 'GRID' && zone.order_type === 'AUTO') update('order_type', 'BOTH');
  };

  return (
    <section data-testid="zone-entry" className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <SectionLabel>{t('zone.section.entry')}</SectionLabel>

      <EntrySummary zone={zone} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label={t('zone.entry.mode')} hint={t('zone.entry.mode.hint')}>
          <select value={e.entry_mode} onChange={(ev) => setMode(ev.target.value as EntryMode)} className="input-s">
            <option value="GRID">{t('zone.entry.mode.grid')}</option>
            <option value="GRID_FILTER">{t('zone.entry.mode.filter')}</option>
            <option value="SIGNAL_MARKET">{t('zone.entry.mode.market')}</option>
          </select>
        </InputField>
        <InputField
          label={t('zone.entry.timeframe')}
          hint={signal ? t('zone.entry.timeframe.hint') : t('zone.entry.timeframe.off.hint')}
        >
          <select
            value={e.signal_timeframe}
            onChange={(ev) => update('signal_timeframe', ev.target.value)}
            disabled={!signal}
            className="input-s"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </InputField>
        <InputField label={t('zone.entry.maxBuy')} hint={t('zone.entry.maxBuy.hint')}>
          <NumberInput
            min={0}
            step={1}
            maxDecimals={0}
            value={e.max_buy_positions}
            onChange={(ev) => update('max_buy_positions', int(ev.target.value, 0))}
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.entry.maxSell')} hint={t('zone.entry.maxSell.hint')}>
          <NumberInput
            min={0}
            step={1}
            maxDecimals={0}
            value={e.max_sell_positions}
            onChange={(ev) => update('max_sell_positions', int(ev.target.value, 0))}
            className="input-s"
          />
        </InputField>
      </div>

      {signal && (
        <>
          <div className="h-px bg-border" />
          <IndicatorRow
            toggle={
              <Switch
                checked={e.use_ema}
                onChange={(checked) => update('use_ema', checked)}
                label={t('zone.entry.ema')}
                hint={t('zone.entry.ema.hint')}
              />
            }
          >
            {e.use_ema && (
              <InputField label={t('zone.entry.emaPeriod')} hint={t('zone.entry.emaPeriod.hint')}>
                <NumberInput
                  min={2}
                  step={1}
                  maxDecimals={0}
                  value={e.ema_period}
                  onChange={(ev) => update('ema_period', int(ev.target.value, 2))}
                  className="input-s"
                />
              </InputField>
            )}
          </IndicatorRow>
          <IndicatorRow
            toggle={
              <Switch
                checked={e.use_rsi}
                onChange={(checked) => update('use_rsi', checked)}
                label={t('zone.entry.rsi')}
                hint={t('zone.entry.rsi.hint')}
              />
            }
          >
            {e.use_rsi && (
              <>
                <InputField label={t('zone.entry.rsiPeriod')} hint={t('zone.entry.rsiPeriod.hint')}>
                  <NumberInput
                    min={2}
                    step={1}
                    maxDecimals={0}
                    value={e.rsi_period}
                    onChange={(ev) => update('rsi_period', int(ev.target.value, 2))}
                    className="input-s"
                  />
                </InputField>
                <InputField label={t('zone.entry.rsiBuyBelow')} hint={t('zone.entry.rsiBuyBelow.hint')}>
                  <NumberInput
                    min={0}
                    max={100}
                    step={1}
                    maxDecimals={1}
                    value={e.rsi_buy_below}
                    onChange={(ev) => update('rsi_buy_below', parseFloatCustom(ev.target.value, 1))}
                    className="input-s"
                  />
                </InputField>
                <InputField label={t('zone.entry.rsiSellAbove')} hint={t('zone.entry.rsiSellAbove.hint')}>
                  <NumberInput
                    min={0}
                    max={100}
                    step={1}
                    maxDecimals={1}
                    value={e.rsi_sell_above}
                    onChange={(ev) => update('rsi_sell_above', parseFloatCustom(ev.target.value, 1))}
                    className="input-s"
                  />
                </InputField>
              </>
            )}
          </IndicatorRow>
          <IndicatorRow
            toggle={
              <Switch
                checked={e.use_bollinger}
                onChange={(checked) => update('use_bollinger', checked)}
                label={t('zone.entry.bb')}
                hint={t('zone.entry.bb.hint')}
              />
            }
          >
            {e.use_bollinger && (
              <>
                <InputField label={t('zone.entry.bbPeriod')} hint={t('zone.entry.bbPeriod.hint')}>
                  <NumberInput
                    min={2}
                    step={1}
                    maxDecimals={0}
                    value={e.bb_period}
                    onChange={(ev) => update('bb_period', int(ev.target.value, 2))}
                    className="input-s"
                  />
                </InputField>
                <InputField label={t('zone.entry.bbDeviation')} hint={t('zone.entry.bbDeviation.hint')}>
                  <NumberInput
                    min={0.1}
                    step={0.1}
                    maxDecimals={2}
                    value={e.bb_deviation}
                    onChange={(ev) => update('bb_deviation', parseFloatCustom(ev.target.value, 2))}
                    className="input-s"
                  />
                </InputField>
              </>
            )}
          </IndicatorRow>
        </>
      )}

      <div className="h-px bg-border" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label={t('zone.entry.maxSpread')} hint={t('zone.entry.maxSpread.hint')}>
          <NumberInput
            min={0}
            step={symbolConfig.step}
            maxDecimals={symbolConfig.precision}
            value={e.max_spread}
            onChange={(ev) => update('max_spread', parseFloatCustom(ev.target.value, symbolConfig.precision))}
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.entry.tpMode')} hint={t('zone.entry.tpMode.hint')}>
          <select value={e.tp_mode} onChange={(ev) => update('tp_mode', ev.target.value as TpMode)} className="input-s">
            <option value="PRICE">{t('zone.entry.tpMode.price')}</option>
            <option value="MONEY">{t('zone.entry.tpMode.money')}</option>
          </select>
        </InputField>
        {e.tp_mode === 'MONEY' && (
          <InputField
            label={splitSides ? t('zone.entry.buyTpMoney') : t('zone.entry.tpMoney')}
            hint={splitSides ? t('zone.entry.buyTpMoney.hint') : t('zone.entry.tpMoney.hint')}
          >
            <NumberInput
              min={0}
              step={0.1}
              maxDecimals={2}
              value={e.take_profit_money}
              onChange={(ev) => update('take_profit_money', parseFloatCustom(ev.target.value, 2))}
              className="input-s"
            />
          </InputField>
        )}
        {e.tp_mode === 'MONEY' && splitSides && (
          <InputField label={t('zone.entry.sellTpMoney')} hint={t('zone.entry.sellTpMoney.hint')}>
            <NumberInput
              min={0}
              step={0.1}
              maxDecimals={2}
              value={e.sell_take_profit_money}
              onChange={(ev) => update('sell_take_profit_money', parseFloatCustom(ev.target.value, 2))}
              className="input-s"
            />
          </InputField>
        )}
      </div>
    </section>
  );
}

function IndicatorRow({ toggle, children }: { toggle: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex min-h-9 items-center">{toggle}</div>
      {children}
    </div>
  );
}

/** Klartext der aktiven Regel, live aus den Feldwerten (Worker-Logik: grid_signals.evaluate). */
function EntrySummary({ zone }: Pick<ZoneEntryFieldsProps, 'zone'>) {
  const t = useT();
  const { number } = useFormat();
  const e = entryOf(zone);
  const signal = usesSignal(zone);
  const type = zone.order_type;
  const showBuy = type !== 'SELL';
  const showSell = type !== 'BUY';
  const n = (v: number) => number(v, { maximumFractionDigits: 5 });

  const rules = (side: 'BUY' | 'SELL') => {
    const parts: string[] = [];
    if (e.use_ema) parts.push(t(side === 'BUY' ? 'zone.entry.rule.emaAbove' : 'zone.entry.rule.emaBelow', { period: e.ema_period }));
    if (e.use_rsi)
      parts.push(
        side === 'BUY'
          ? t('zone.entry.rule.rsiBelow', { period: e.rsi_period, value: n(e.rsi_buy_below) })
          : t('zone.entry.rule.rsiAbove', { period: e.rsi_period, value: n(e.rsi_sell_above) }),
      );
    if (e.use_bollinger) parts.push(t(side === 'BUY' ? 'zone.entry.rule.bbLower' : 'zone.entry.rule.bbUpper'));
    return parts.length ? parts.join(t('zone.entry.summary.and')) : t('zone.entry.rule.none');
  };

  const anyIndicator = e.use_ema || e.use_rsi || e.use_bollinger;
  const limit = (v: number) => (v > 0 ? String(v) : String(zone.max_positions || '∞'));
  const lines: string[] = [];
  lines.push(
    t(
      e.entry_mode === 'SIGNAL_MARKET'
        ? 'zone.entry.summary.market'
        : signal
          ? 'zone.entry.summary.filter'
          : 'zone.entry.summary.grid',
    ),
  );
  if (signal) {
    if (showBuy) lines.push(t('zone.entry.summary.buy', { rules: rules('BUY') }));
    if (showSell) lines.push(t('zone.entry.summary.sell', { rules: rules('SELL') }));
    if (type === 'AUTO')
      lines.push(
        t(!anyIndicator ? 'zone.entry.summary.autoNone' : e.use_ema ? 'zone.entry.summary.auto' : 'zone.entry.summary.autoNoEma'),
      );
    if (anyIndicator) lines.push(t('zone.entry.summary.tf', { tf: e.signal_timeframe }));
  }
  lines.push(
    e.tp_mode === 'MONEY'
      ? t('zone.entry.summary.tpMoney', { value: n(e.take_profit_money) })
      : t('zone.entry.summary.tpPrice', { value: n(zone.take_profit) }),
  );
  lines.push(t('zone.entry.summary.limit', { buy: limit(e.max_buy_positions), sell: limit(e.max_sell_positions) }));
  if (e.max_spread > 0) lines.push(t('zone.entry.summary.spread', { value: n(e.max_spread) }));
  lines.push(t('zone.entry.summary.exit'));

  return (
    <div role="note" data-testid="zone-entry-summary" className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
      <p className="text-xs font-semibold text-foreground">{t('zone.entry.summary.title')}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
