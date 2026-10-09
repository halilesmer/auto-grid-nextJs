'use client';

import { FlaskConical } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { Switch } from '@/components/ui/switch';
import { useFormat, useT, type MessageKey } from '@/i18n';
import type { FillModel } from '@/lib/backtest/broker/pathBroker';
import type { CommissionProposal } from '@/lib/backtest/commission';
import type { PathChoice } from '@/lib/backtest/protocol';
import type { CsvImport } from '@/services/csvImportApi';

import { DATA_TIMEFRAMES, type DataTimeframe, type RunSettingsValue } from '@/lib/backtest/runSettings';

const SPREAD_MODES = ['candle', 'fixed', 'max'] as const;
const FILLS = ['gap', 'parity'] as const;
const PATHS = ['auto', 'lowFirst', 'highFirst', 'both'] as const;

interface RunSettingsProps {
  value: RunSettingsValue;
  onChange: (value: RunSettingsValue) => void;
  /** Wählbare CSV-Importe: abgeschlossen, Symbol des Setups, Zeitrahmen aus DATA_TIMEFRAMES */
  csvImports: CsvImport[];
  /** Gewählter Import aus `csvImports`; null = MT5-Server (auch wenn die gemerkte ID nicht mehr wählbar ist) */
  csvImport: CsvImport | null;
  /** Vorschlag für die Kommission aus dem Deal-Archiv; undefined = wird geladen, null = keiner */
  proposal: CommissionProposal | null | undefined;
  /** Kommission, die der Lauf verwendet (Eingabe oder Vorschlag) */
  commission: number;
  currency: string | null;
  running: boolean;
  /** Warum der Start nicht geht (Tooltip des Knopfs); null = er geht */
  blockedHint: string | null;
  onRun: () => void;
  onCancel: () => void;
  progress: { phase: 'load' | 'run'; fraction: number } | null;
}

/** Karte mit den Einstellungen eines Laufs (BKT-06) und den Knöpfen Starten/Abbrechen */
export function RunSettings({
  value,
  onChange,
  csvImports,
  csvImport,
  proposal,
  commission,
  currency,
  running,
  blockedHint,
  onRun,
  onCancel,
  progress,
}: RunSettingsProps) {
  const t = useT();
  const fmt = useFormat();
  const set = <K extends keyof RunSettingsValue>(key: K, next: RunSettingsValue[K]) => onChange({ ...value, [key]: next });
  const money = (v: number) => `${fmt.number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;

  return (
    <Card data-testid="backtest-settings">
      <CardHeader icon={<FlaskConical size={16} />} title={t('backtest.settings.title')} />
      <div className="space-y-4 px-5 pb-5 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InputField label={t('backtest.field.data')} hint={t('backtest.field.data.hint')}>
            <select
              value={csvImport?.import_id ?? ''}
              onChange={(e) => set('csvImportId', e.target.value || null)}
              disabled={running}
              className="input-s"
              data-testid="bt-data-source"
            >
              <option value="">{t('backtest.data.mt5')}</option>
              {csvImports.map((item) => (
                <option key={item.import_id} value={item.import_id}>
                  {t('backtest.data.csv', {
                    symbol: item.symbol,
                    tf: item.timeframe,
                    from: item.first_t === null ? '—' : fmt.mt5DateTime(item.first_t),
                    to: item.last_t === null ? '—' : fmt.mt5DateTime(item.last_t),
                  })}
                </option>
              ))}
            </select>
          </InputField>
          <InputField label={t('backtest.field.timeframe')} hint={t(csvImport ? 'backtest.field.timeframe.csv.hint' : 'backtest.field.timeframe.hint')}>
            {/* Ein CSV-Import hat genau einen Zeitrahmen: er bestimmt die Auflösung */}
            <select
              value={csvImport?.timeframe ?? value.timeframe}
              onChange={(e) => set('timeframe', e.target.value as DataTimeframe)}
              disabled={running || csvImport !== null}
              className="input-s"
              data-testid="bt-timeframe"
            >
              {DATA_TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </InputField>
          <InputField label={t('backtest.field.spread')} hint={t('backtest.field.spread.hint')}>
            <select
              value={value.spreadMode}
              onChange={(e) => set('spreadMode', e.target.value as RunSettingsValue['spreadMode'])}
              disabled={running}
              className="input-s"
              data-testid="bt-spread"
            >
              {SPREAD_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`backtest.spread.${mode}` as MessageKey)}
                </option>
              ))}
            </select>
          </InputField>
          {value.spreadMode !== 'candle' && (
            <InputField label={t('backtest.field.spreadPoints')} hint={t('backtest.field.spreadPoints.hint')}>
              <NumberInput
                min={0}
                step={1}
                maxDecimals={1}
                value={value.spreadPoints}
                onChange={(e) => set('spreadPoints', Math.max(0, Number(e.target.value) || 0))}
                disabled={running}
                className="input-s"
                data-testid="bt-spread-points"
              />
            </InputField>
          )}
          <InputField label={t('backtest.field.capital')} hint={t('backtest.field.capital.hint')}>
            <NumberInput
              min={0}
              step={100}
              maxDecimals={2}
              value={value.startCapital}
              onChange={(e) => set('startCapital', Math.max(0, Number(e.target.value) || 0))}
              disabled={running}
              className="input-s"
              data-testid="bt-capital"
            />
          </InputField>
          <InputField label={t('backtest.field.fill')} hint={t('backtest.field.fill.hint')}>
            <select
              value={value.fill}
              onChange={(e) => set('fill', e.target.value as FillModel)}
              disabled={running}
              className="input-s"
              data-testid="bt-fill"
            >
              {FILLS.map((fill) => (
                <option key={fill} value={fill}>
                  {t(`backtest.fill.${fill}` as MessageKey)}
                </option>
              ))}
            </select>
          </InputField>
          <InputField label={t('backtest.field.path')} hint={t('backtest.field.path.hint')}>
            <select
              value={value.path}
              onChange={(e) => set('path', e.target.value as PathChoice)}
              disabled={running}
              className="input-s"
              data-testid="bt-path"
            >
              {PATHS.map((path) => (
                <option key={path} value={path}>
                  {t(`backtest.path.${path}` as MessageKey)}
                </option>
              ))}
            </select>
          </InputField>
          <InputField label={t('backtest.field.commission')} hint={t('backtest.field.commission.hint')}>
            <NumberInput
              min={0}
              step={0.1}
              maxDecimals={4}
              value={commission}
              onChange={(e) => set('commission', Math.max(0, Number(e.target.value) || 0))}
              disabled={running}
              className="input-s"
              data-testid="bt-commission"
            />
          </InputField>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="bt-commission-proposal">
          {proposal === undefined && <span>{t('backtest.commission.loading')}</span>}
          {proposal === null && <span>{t('backtest.commission.none')}</span>}
          {proposal && (
            <>
              <span>
                {t('backtest.commission.proposal', {
                  perLot: money(proposal.perLot),
                  positions: proposal.positions,
                  lots: fmt.number(proposal.lots, { maximumFractionDigits: 2 }),
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={running || value.commission === proposal.perLot}
                onClick={() => set('commission', proposal.perLot)}
                hint={t('backtest.commission.use.hint')}
                data-testid="bt-commission-use"
              >
                {t('backtest.commission.use')}
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Switch
            checked={value.swapEnabled}
            onChange={(checked) => set('swapEnabled', checked)}
            disabled={running}
            label={t('backtest.field.swap')}
            hint={t('backtest.field.swap.hint')}
          />
          <Switch
            checked={value.slFirst}
            onChange={(checked) => set('slFirst', checked)}
            disabled={running}
            label={t('backtest.field.slFirst')}
            hint={t('backtest.field.slFirst.hint')}
          />
          <Switch
            checked={value.closeAtEnd}
            onChange={(checked) => set('closeAtEnd', checked)}
            disabled={running}
            label={t('backtest.field.closeAtEnd')}
            hint={t('backtest.field.closeAtEnd.hint')}
          />
          <Switch
            checked={value.approximate}
            onChange={(checked) => set('approximate', checked)}
            disabled={running}
            label={t('backtest.field.approximate')}
            hint={t('backtest.field.approximate.hint')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <Button variant="secondary" onClick={onCancel} hint={t('backtest.cancel.hint')} data-testid="bt-cancel">
              {t('backtest.cancel')}
            </Button>
          ) : (
            <Button variant="primary" onClick={onRun} disabled={blockedHint !== null} hint={blockedHint ?? t('backtest.run.hint')} data-testid="bt-run">
              <FlaskConical size={14} className="mr-1.5" />
              {t('backtest.run')}
            </Button>
          )}
          {running && progress && (
            <div className="min-w-0 flex-1 basis-48" data-testid="bt-progress">
              <p className="text-xs tabular-nums text-muted-foreground">
                {t(progress.phase === 'load' ? 'backtest.progress.load' : 'backtest.progress.run', { pct: Math.round(progress.fraction * 100) })}
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-accent">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
