'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, ScrollText } from 'lucide-react';

import { CurveChart } from '@/components/analysis/stats/CurveChart';
import { StatsKpis, signTone } from '@/components/analysis/stats/StatsKpis';
import { Alert } from '@/components/ui/alert';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { InfoHint } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { drawdownCurve } from '@/lib/analysis/curves';
import { computeStats } from '@/lib/analysis/stats';
import type { RunResult } from '@/lib/backtest/runner';
import { cn } from '@/lib/utils';
import type { RunContext } from '@/store/useBacktestStore';
import { useRunText } from './runText';

/** Mehr Zeilen je Code zeigt der Hinweisblock nicht; der Rest steht im Protokoll */
const NOTES_PER_CODE = 5;

type CurveKind = 'equity' | 'drawdown';

const LEVEL_TONE = { ERROR: 'text-danger', WARN: 'text-warning', INFO: 'text-muted-foreground' } as const;

function SummaryTile({ id, label, value, tone, sub }: { id: string; label: MessageKey; value: string; tone?: number | null; sub?: string }) {
  const t = useT();
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5" data-testid={`bt-sum-${id}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{t(label)}</span>
        <InfoHint hint={t(`${label}.hint` as MessageKey)} />
      </div>
      <div className={cn('mt-1 truncate font-mono text-base font-semibold tabular-nums', signTone(tone))} data-testid={`bt-sum-${id}-value`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate font-mono text-xs tabular-nums text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * Hinweise zum Ergebnis (BKT-10): sie stehen immer über dem Ergebnis und lassen sich nicht ausblenden. Die
 * `run.*`-Zeilen des Laufprotokolls (Modellgrenzen, Datenlücken) sind dieselben Meldungen wie im Protokoll; dazu
 * kommen zwei Hinweise, die nur die Seite kennt (grobe Auflösung, Grid-Abstand kleiner als die Kerzenspanne).
 */
function RunNotes({ result, context }: { result: RunResult; context: RunContext }) {
  const t = useT();
  const fmt = useFormat();
  const text = useRunText();
  const { zone, symbol, dataTimeframe } = context.params;

  const logLines = result.log.lines;
  const lines = useMemo(() => {
    const shown: Record<string, number> = {};
    const hidden: Record<string, number> = {};
    const out: typeof logLines = [];
    for (const line of logLines) {
      if (!line.code.startsWith('run.')) continue;
      shown[line.code] = (shown[line.code] ?? 0) + 1;
      if (shown[line.code] <= NOTES_PER_CODE) out.push(line);
      else hidden[line.code] = (hidden[line.code] ?? 0) + 1;
    }
    return { out, more: Object.values(hidden).reduce((a, b) => a + b, 0) };
  }, [logLines]);

  // Grid-Abstand in Preis nur im Grid-Modus mit festem Abstand (bei Fraktal oder Abstand nach Verlust gibt es ihn nicht)
  const gridStep = useMemo(() => {
    if (zone.entry_mode === 'fractal' || zone.step_by_loss) return null;
    const steps = [Number(zone.grid_step)];
    if (zone.sync_buy_sell === false && zone.order_type === 'BOTH') steps.push(Number(zone.sell_grid_step));
    const valid = steps.filter((s) => Number.isFinite(s) && s > 0);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [zone]);
  const unsure = gridStep !== null && result.avgRange > 0 && gridStep < result.avgRange;
  const digits = symbol.digits;

  return (
    <Alert tone="warning" title={t('backtest.notes.title')}>
      <ul className="list-disc space-y-1 pl-4 text-xs" data-testid="bt-notes">
        {lines.out.map((line, i) => (
          <li key={`${line.code}-${i}`} data-code={line.code}>
            {text.log(line.code, line.params)}
          </li>
        ))}
        {lines.more > 0 && <li>{t('backtest.notes.more', { count: lines.more })}</li>}
        {dataTimeframe !== 'M1' && <li data-code="coarse">{t('backtest.notes.coarse', { tf: dataTimeframe })}</li>}
        {unsure && gridStep !== null && (
          <li data-code="unsure">
            {t('backtest.notes.unsure', { step: fmt.price(gridStep, digits), range: fmt.price(result.avgRange, digits) })}
          </li>
        )}
      </ul>
    </Alert>
  );
}

function RunLogView({ result }: { result: RunResult }) {
  const t = useT();
  const text = useRunText();
  const [onlyWarn, setOnlyWarn] = useState(false);
  const lines = onlyWarn ? result.log.lines.filter((l) => l.level !== 'INFO') : result.log.lines;
  return (
    <Card data-testid="bt-log">
      <CardHeader icon={<ScrollText size={16} />} title={t('backtest.log.title')} />
      <div className="space-y-3 px-5 pb-5 pt-4">
        <Switch checked={onlyWarn} onChange={setOnlyWarn} label={t('backtest.log.onlyWarn')} hint={t('backtest.log.onlyWarn.hint')} />
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('backtest.log.empty')}</p>
        ) : (
          <ul className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs" data-testid="bt-log-lines">
            {lines.map((line, i) => (
              <li key={i} className="flex gap-2" data-code={line.code} data-level={line.level}>
                <span className={cn('w-14 shrink-0', LEVEL_TONE[line.level])}>
                  {t(`backtest.log.level.${line.level}` as MessageKey)}
                </span>
                {line.time !== undefined && <span className="shrink-0 text-muted-foreground">{text.time(line.time)}</span>}
                <span className="min-w-0 break-words">{text.log(line.code, line.params)}</span>
              </li>
            ))}
          </ul>
        )}
        {result.log.dropped > 0 && <p className="mt-2 text-xs text-muted-foreground">{t('backtest.log.dropped', { count: result.log.dropped })}</p>}
      </div>
    </Card>
  );
}

function RunColumn({ result, context, title }: { result: RunResult; context: RunContext; title: ReactNode }) {
  const t = useT();
  const fmt = useFormat();
  const [curve, setCurve] = useState<CurveKind>('equity');
  const stats = useMemo(() => computeStats(result.trades), [result.trades]);
  const drawdown = useMemo(() => drawdownCurve(result.equity), [result.equity]);
  const { summary } = result;
  const currency = context.currency;
  const money = (v: number, signed = false) =>
    `${signed && v > 0 ? '+' : ''}${fmt.number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
  const curveTabs = (['equity', 'drawdown'] as const).map((k) => ({ id: k, label: t(`backtest.curve.${k}`), hint: t(`backtest.curve.${k}.hint`) }));

  return (
    <div className="min-w-0 space-y-4" data-testid="bt-result-column" data-path={result.path}>
      {title}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <SummaryTile id="realized" label="backtest.summary.realized" value={money(summary.realized, true)} tone={summary.realized} />
        <SummaryTile id="open" label="backtest.summary.open" value={money(summary.openResult, true)} tone={summary.openResult} />
        <SummaryTile id="end-equity" label="backtest.summary.endEquity" value={money(summary.endEquity)} />
        <SummaryTile id="open-positions" label="backtest.summary.openPositions" value={fmt.number(summary.openPositions)} />
        <SummaryTile id="max-drawdown" label="backtest.summary.maxDrawdown" value={money(summary.maxDrawdown > 0 ? -summary.maxDrawdown : 0)} tone={-summary.maxDrawdown} />
        <SummaryTile id="commission" label="backtest.summary.commission" value={money(summary.commission, true)} tone={summary.commission} />
        <SummaryTile id="swap" label="backtest.summary.swap" value={money(summary.swap, true)} tone={summary.swap} />
        <SummaryTile id="spread" label="backtest.summary.spread" value={money(summary.spreadInfo)} />
      </div>
      {summary.closedAtEnd && <p className="text-xs text-muted-foreground">{t('backtest.summary.closedAtEnd')}</p>}

      <StatsKpis stats={stats} currency={currency} />
      {stats.trades === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="bt-no-trades">
          {t('backtest.result.noTrades')}
        </p>
      )}

      <Card data-testid="bt-curves">
        <CardHeader icon={<BarChart3 size={16} />} title={t('analysis.stats.curves')} />
        <div className="space-y-3 px-5 pb-5 pt-4">
          <div className="overflow-x-auto">
            <AnimatedTabs tabs={curveTabs} activeTab={curve} onChange={(id) => setCurve(id as CurveKind)} layoutId={`bt-curve-${result.path}`} variant="segment" />
          </div>
          <CurveChart
            points={curve === 'equity' ? result.equity : drawdown}
            base={curve === 'equity' ? summary.startCapital : 0}
            testId={`bt-curve-${curve}-${result.path}`}
          />
        </div>
      </Card>

      <RunLogView result={result} />
    </div>
  );
}

/** Ergebnis eines Laufs (BKT-06): bei „beide Wege“ zwei Spalten nebeneinander (Spanne), sonst eine */
export function RunResultView({ results, context }: { results: RunResult[]; context: RunContext }) {
  const t = useT();
  const fmt = useFormat();
  const { params } = context;
  const both = results.length > 1;
  return (
    <section className="space-y-4" data-testid="bt-result">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('backtest.result.title')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground" data-testid="bt-result-meta">
          {t('backtest.result.meta', {
            symbol: params.symbol.name,
            from: fmt.mt5DateTime(params.from),
            to: fmt.mt5DateTime(params.to),
            tf: params.dataTimeframe,
            candles: fmt.number(results[0].candles),
          })}
        </p>
      </div>
      {context.unsaved && (
        <p className="text-xs text-warning" data-testid="bt-result-unsaved">
          {t('backtest.source.unsaved')}
        </p>
      )}
      <RunNotes result={results[0]} context={context} />
      {both && <p className="text-sm text-muted-foreground">{t('backtest.result.pair')}</p>}
      <div className={cn('grid gap-6', both && 'xl:grid-cols-2')}>
        {results.map((result) => (
          <RunColumn
            key={result.path}
            result={result}
            context={context}
            title={
              <Badge tone="info" hint={t(`backtest.result.path.${result.path}.hint` as MessageKey)}>
                {t(`backtest.result.path.${result.path}` as MessageKey)}
              </Badge>
            }
          />
        ))}
      </div>
    </section>
  );
}
