'use client';

import { ArrowDown, ArrowUp, TriangleAlert, X } from 'lucide-react';
import { StateIcon, checkRowState } from '@/components/formation/FormationChecklist';
import { InfoHint } from '@/components/ui/tooltip';
import { useFormat, useLocale, useT } from '@/i18n';
import { ruleText } from '@/lib/formation/ruleTexts';
import type { ScanHit } from '@/lib/formation/scan';
import { CRV_EPS as EPS, outcomesOf, pipSizeOf, tradeMetrics } from '@/lib/formation/trade';
import { cn } from '@/lib/utils';

/**
 * Handelsblock des gewählten Kandidaten (A40.3): Einstieg, Stop mit Not-SL, TP1 (bei AB=CD TP2, TP3 und die Ergebnisse in R, 1114-A4.2) mit Abstand zum Einstieg und CRV.
 * Reine Anzeige, keine Order. Ein erfülltes Veto (A40.2) legt einen Streifen darüber und blasst die Werte ab; das Urteil bleibt.
 * Fehlende Werte stehen als „—“, darunter der Grund.
 */
export function FormationTrade({ hit, digits }: { hit: ScanHit; digits: number | null }) {
  const t = useT();
  const locale = useLocale();
  const { number, price } = useFormat();
  const { candidate } = hit;
  const trade = candidate.trade;
  if (!trade) return null;
  const buy = candidate.side === 'buy';
  const metrics = tradeMetrics(trade, candidate.side);
  const veto = candidate.checks.find((c) => c.veto && c.state === 'met');
  const fmt = (v: number) => (digits === null ? number(v, { maximumFractionDigits: 5 }) : price(v, digits));
  // Pip nur bei 3 oder 5 Nachkommastellen (pip = 10 × Punkt); sonst der Preisabstand selbst
  const pipSize = pipSizeOf(digits);
  const dist = (v: number) => (pipSize === null ? fmt(v) : number(v / pipSize, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const dash = '—';
  const reasonText = (id: string | undefined) => {
    if (!id) return null;
    if (id === 'noRule') return t('formation.trade.reason.noRule');
    return t('formation.trade.reason.rule');
  };
  const entrySub =
    trade.missed === undefined
      ? reasonText(trade.reason.entry)
      : t(pipSize === null ? 'formation.trade.missed.price' : 'formation.trade.missed.pips', { n: pipSize === null ? fmt(trade.missed) : dist(trade.missed) });
  const sig29 = trade.sig29 && metrics !== null && metrics.crv <= 1 + EPS ? trade.sig29 : null;
  const hdl02 = metrics !== null && metrics.crv < 1 - EPS;
  const outcomes = outcomesOf(trade, candidate.side);
  const rText = (v: number) => number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
  // Abstand zum Einstieg unter dem Wert (Pips; sonst Preisabstand), mit Vorzeichen der Richtung
  const away = (v: number, sign: '+' | '−') =>
    trade.entry === null ? null : t(pipSize === null ? 'formation.trade.away.price' : 'formation.trade.away.pips', { n: `${sign}${dist(Math.abs(v - trade.entry))}` });
  const crvText = metrics ? number(metrics.crv, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : dash;
  const riskShare = metrics ? (1 / (1 + metrics.crv)) * 100 : 0;

  const entryCell = (sub: string | null) => (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {t('formation.trade.entry')}
        <InfoHint hint={t('formation.trade.entry.hint')} />
      </span>
      <span data-testid="trade-entry" className={cn('text-[13px] font-medium tabular-nums', trade.entry === null && 'text-muted-foreground')}>
        {trade.entry === null ? dash : fmt(trade.entry)}
      </span>
      {sub && (
        <span data-testid="trade-entry-reason" className="text-[10.5px] tabular-nums text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  );
  // Ziel mit Abstand zum Einstieg darunter; fehlt der Wert, steht der Grund (reason) dort
  const target = (field: 'tp1' | 'tp2' | 'tp3', label: string, value: number | null, o: { share?: boolean; wide?: boolean } = {}) => (
    <div className={cn('flex min-w-0 flex-col gap-px', o.wide && 'col-span-2')}>
      <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        {label}
        {o.share && <span className="rounded border border-border px-1 text-[10px] font-semibold leading-4">½</span>}
        <InfoHint hint={t(`formation.trade.${field}.hint`)} />
      </span>
      <span data-testid={`trade-${field}`} className={cn('text-[13px] font-medium tabular-nums', value === null ? 'text-muted-foreground' : 'text-success')}>
        {value === null ? dash : fmt(value)}
      </span>
      <span data-testid={`trade-${field}-reason`} className="text-[10.5px] tabular-nums text-muted-foreground">
        {value === null ? reasonText(trade.reason.tp1) : <span data-testid={`trade-${field}-distance`}>{away(value, '+')}</span>}
      </span>
    </div>
  );

  return (
    <section
      aria-label={`${t('formation.trade.title')}, ${t('formation.trade.disclaimer').replace(/^·\s*/, '')}`}
      data-testid="trade-block"
      data-side={candidate.side}
      data-veto={veto ? 'true' : 'false'}
      className="mx-3 mb-2.5 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
        <span className="text-xs font-semibold">{t('formation.trade.title')}</span>
        <span className="text-[11px] text-muted-foreground">{t('formation.trade.disclaimer')}</span>
        <InfoHint hint={t('formation.trade.title.hint')} />
        <span className={cn('ml-auto inline-flex items-center gap-0.5 text-[11px] font-semibold', buy ? 'text-success' : 'text-danger')}>
          {buy ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
          {t(`formation.trade.side.${candidate.side}`)}
        </span>
      </div>
      {veto && (
        <div
          data-testid="trade-veto"
          className="flex items-start gap-2 border-b border-danger/35 bg-danger/12 px-2.5 py-2 text-xs text-danger"
        >
          <X size={14} strokeWidth={3} aria-hidden="true" className="mt-px shrink-0" />
          <span className="flex-1">
            <b>{t('formation.trade.veto.title')}</b> — {t(`formation.trade.veto.${candidate.side}`)}
          </span>
          <InfoHint hint={t('formation.trade.veto.hint')} className="text-danger" />
        </div>
      )}
      <div className={cn(veto && 'opacity-70')} data-testid="trade-values">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-2.5 py-2.5">
          {entryCell(entrySub)}
          <div className="flex min-w-0 flex-col gap-px">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {t('formation.trade.stop')}
              <InfoHint hint={t('formation.trade.stop.hint')} />
            </span>
            <span data-testid="trade-stop" className={cn('text-[13px] font-medium tabular-nums', trade.stop === null ? 'text-muted-foreground' : 'text-danger')}>
              {trade.stop === null ? dash : fmt(trade.stop)}
            </span>
            {trade.stop === null ? (
              <span data-testid="trade-stop-reason" className="text-[10.5px] text-muted-foreground">{reasonText(trade.reason.stop)}</span>
            ) : (
              <span className="text-[10.5px] tabular-nums text-muted-foreground">
                <span data-testid="trade-stop-distance">{away(trade.stop, '−')}</span>
                {trade.emergencyStop !== null && (
                  <>
                    {' · '}
                    <span data-testid="trade-stop-emergency">{t('formation.trade.emergency', { price: fmt(trade.emergencyStop) })}</span>
                  </>
                )}
              </span>
            )}
          </div>
          {target('tp1', t('formation.trade.tp1'), trade.tp1, { share: trade.tp2 !== undefined })}
          {trade.tp2 !== undefined && target('tp2', t('formation.trade.tp2'), trade.tp2, { share: true })}
          {trade.tp3 !== undefined && target('tp3', t('formation.trade.tp3'), trade.tp3, { wide: true })}
        </div>
        <div className="flex items-center gap-2.5 border-t border-border px-2.5 py-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {t('formation.trade.crv')}
            <InfoHint hint={t('formation.trade.crv.hint')} />
          </span>
          <span
            data-testid="trade-crv"
            className={cn('text-[15px] font-semibold tabular-nums', !metrics && 'text-muted-foreground', hdl02 && 'text-warning')}
          >
            {crvText}
          </span>
          {metrics ? (
            <span role="img" aria-label={t('formation.trade.ratio', { n: crvText })} className="flex h-1.5 flex-1 overflow-hidden rounded-[3px] bg-muted">
              <span className="block h-full bg-danger" style={{ width: `${riskShare}%` }} />
              <span className="block h-full bg-success" style={{ width: `${100 - riskShare}%` }} />
            </span>
          ) : (
            <span className="flex-1 text-right text-[10.5px] text-muted-foreground">{t('formation.trade.crv.missing')}</span>
          )}
        </div>
        {metrics && (
          <div className="flex justify-between px-2.5 pb-2 text-[10.5px] tabular-nums text-muted-foreground">
            <span>{t('formation.trade.risk1')}</span>
            <span>{t('formation.trade.reward', { n: crvText })}</span>
          </div>
        )}
      </div>
      {outcomes && (
        <div data-testid="trade-outcomes" className="flex flex-col gap-1.5 border-t border-border px-2.5 py-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {t('formation.trade.outcome.title')}
            <InfoHint hint={t('formation.trade.outcome.hint')} />
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['stop', outcomes.stop, 'text-danger'],
                ['tp1', outcomes.tp1, 'text-success'],
                ['tp12', outcomes.tp12, 'text-success'],
              ] as const
            ).map(([key, v, tone]) => (
              <div key={key} data-testid={`trade-outcome-${key}`} className="flex min-w-0 flex-col gap-px rounded-lg border border-border px-1.5 py-1">
                <span className="text-[10.5px] leading-tight text-muted-foreground">{t(`formation.trade.outcome.${key}`)}</span>
                <span className={cn('text-[13px] font-medium tabular-nums', tone)}>{rText(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {trade.tp1StrongZone && (
        <div
          data-testid="trade-strong-zone"
          className="mx-2.5 mb-2 flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/10 px-2 py-1.5 text-[11.5px] text-warning"
        >
          <TriangleAlert size={13} aria-hidden="true" className="mt-px shrink-0" />
          <span className="flex-1">{t('formation.trade.strongZone')}</span>
          <InfoHint hint={t('formation.trade.strongZone.hint')} className="text-warning" />
        </div>
      )}
      {hdl02 && (
        <div
          data-testid="trade-hdl02"
          className="mx-2.5 mb-2 flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/10 px-2 py-1.5 text-[11.5px] text-warning"
        >
          <TriangleAlert size={13} aria-hidden="true" className="mt-px shrink-0" />
          <span>{t('formation.trade.hdl02')}</span>
        </div>
      )}
      {sig29 && (
        <div data-testid="trade-sig29" data-state={checkRowState(sig29)} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2 border-t border-border px-2.5 py-1.5">
          <StateIcon state={checkRowState(sig29)} />
          <span className="min-w-0 text-xs">{ruleText(locale, sig29.id) ?? sig29.id}</span>
          <span className="flex flex-col items-end text-[11px] tabular-nums text-muted-foreground">
            <span>{sig29.id}</span>
            {sig29.value !== undefined && <span className="text-xs text-foreground/80">{number(sig29.value, { maximumFractionDigits: 2 })}</span>}
          </span>
        </div>
      )}
    </section>
  );
}
