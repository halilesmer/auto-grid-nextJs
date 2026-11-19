'use client';

import { Fragment } from 'react';
import { ArrowDown, ArrowUp, Check, Clock, Info, Minus, RotateCcw, TriangleAlert, Undo2, X } from 'lucide-react';
import { StateIcon, checkRowState } from '@/components/formation/FormationChecklist';
import { InfoHint, Tooltip } from '@/components/ui/tooltip';
import { useFormat, useLocale, useT, type MessageKey } from '@/i18n';
import { ruleText } from '@/lib/formation/ruleTexts';
import type { ScanHit } from '@/lib/formation/scan';
import { CRV_EPS as EPS, outcomesOf, pipSizeOf, realizedOutcomesOf, tradeMetrics } from '@/lib/formation/trade';
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
  const dist = (v: number) =>
    pipSize === null
      ? fmt(v)
      : number(v / pipSize, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const dash = '—';
  const reasonText = (id: string | undefined) => {
    if (!id) return null;
    if (id === 'noRule') return t('formation.trade.reason.noRule');
    if (id === 'noZone') return t('formation.trade.reason.noZone');
    return t('formation.trade.reason.rule');
  };
  // Erken dönüş (1114-A4.5): Einstieg am Engulf-Schluss, Ziele aus Zonen, kein Stand und keine Ergebnisse
  const early = trade.earlyReversal;
  const missedSub =
    trade.missed === undefined
      ? reasonText(trade.reason.entry)
      : t(pipSize === null ? 'formation.trade.missed.price' : 'formation.trade.missed.pips', { n: pipSize === null ? fmt(trade.missed) : dist(trade.missed) });
  const entrySub = early ? t('formation.trade.early.entry') : missedSub;
  const sig29 = trade.sig29 && metrics !== null && metrics.crv <= 1 + EPS ? trade.sig29 : null;
  const hdl02 = metrics !== null && metrics.crv < 1 - EPS;
  const outcomes = outcomesOf(trade, candidate.side);
  const status = trade.status;
  // Tatsächliche Werte (1115-A21.1): nur für den hervorgehobenen Kasten und „TP2 kommt“; blasse Kästen bleiben beim Einstiegswert
  const realized = realizedOutcomesOf(trade, candidate.side, status);
  const stopped = status?.kind === 'stopped';
  // Großes AB=CD-Ziel (1114-A4.3): die Position ist von Anfang an in Drittel geteilt
  const big = trade.tpBig !== undefined;
  const shareText = big ? '⅓' : '½';
  const tp1Taken = status !== undefined && ['tp1', 'tp12', 'tp123', 'breakeven'].includes(status.kind);
  const tp2Taken = status?.kind === 'tp12' || status?.kind === 'tp123' || (status?.kind === 'breakeven' && status.tp2Fill !== undefined);
  const bigTaken = status?.kind === 'tp123';
  const moved = status?.stopMovedIdx !== undefined;
  // Zustand eines Ziels nach dem Einstieg; ohne Status (Einstieg fehlt) keiner
  const stateOf = (f: 'tp1' | 'tp2' | 'tpBig'): 'taken' | 'waiting' | 'missed' | undefined => {
    if (!status) return undefined;
    if ({ tp1: tp1Taken, tp2: tp2Taken, tpBig: bigTaken }[f]) return 'taken';
    if (status.kind === 'open') return undefined;
    return stopped || status.kind === 'breakeven' ? 'missed' : 'waiting';
  };
  // Ergebnis-Kasten des Stands `tp1` hebt „bisher“ hervor und nennt TP2 als offen
  const outcomeView = (key: 'stop' | 'tp1' | 'tp12' | 'tp123') => {
    const base = t(key === 'tp12' && big ? 'formation.trade.outcome.tp12be' : `formation.trade.outcome.${key}`);
    if (!status || status.kind === 'open') return { active: false, dim: false, label: base, actual: false };
    if (big && (status.kind === 'tp1' || status.kind === 'tp12')) {
      // Mit großem Ziel bleibt der Handel nach TP2 offen: „bisher“ steht beim erreichten Weg, der nächste nennt, was noch fehlt
      const sofarKey = status.kind === 'tp1' ? 'tp1' : 'tp12';
      if (key === sofarKey) return { active: true, dim: false, label: t('formation.trade.outcome.sofar'), actual: true };
      if (key === 'tp12') return { active: false, dim: false, label: t('formation.trade.outcome.ifTp2'), actual: true };
      if (key === 'tp123') return { active: false, dim: false, label: t('formation.trade.outcome.ifBig'), actual: true };
      return { active: false, dim: true, label: base, actual: false };
    }
    if (status.kind === 'tp1') {
      if (key === 'tp1')
        return {
          active: true,
          dim: false,
          label: t('formation.trade.outcome.sofar'),
          actual: true,
        };
      if (key === 'tp12')
        return {
          active: false,
          dim: false,
          label: t('formation.trade.outcome.ifTp2'),
          actual: true,
        };
      return { active: false, dim: true, label: base, actual: false };
    }
    const hitKey = { stopped: 'stop', breakeven: status.tp2Fill !== undefined ? 'tp12' : 'tp1', tp12: 'tp12', tp123: 'tp123' }[status.kind];
    return { active: key === hitKey, dim: key !== hitKey, label: base, actual: key === hitKey };
  };
  const rText = (v: number) =>
    number(v, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'always',
    });
  // Abstand zum Einstieg unter dem Wert (Pips; sonst Preisabstand), mit Vorzeichen der Richtung
  const away = (v: number, sign: '+' | '−') =>
    trade.entry === null
      ? null
      : t(pipSize === null ? 'formation.trade.away.price' : 'formation.trade.away.pips', { n: `${sign}${dist(Math.abs(v - trade.entry))}` });
  const crvText = metrics
    ? number(metrics.crv, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : dash;
  const riskShare = metrics ? (1 / (1 + metrics.crv)) * 100 : 0;
  // Wiedereinstieg (1114-A4.4): eigene Werte und eigenes Verhältnis zum einen Ziel; der erste Handel bleibt oben unverändert
  const re = trade.reentry;
  const reMetrics = re ? tradeMetrics({ entry: re.entry, stop: re.stop, tp1: re.target }, candidate.side) : null;
  const re2 = re?.target2 != null ? re.target2 : null;
  const reMetrics2 = re && re2 !== null ? tradeMetrics({ entry: re.entry, stop: re.stop, tp1: re2 }, candidate.side) : null;
  const reCrv2Text = reMetrics2 ? number(reMetrics2.crv, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : dash;
  const reCrvText = reMetrics ? number(reMetrics.crv, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : dash;
  const reAway = (v: number, sign: '+' | '−') =>
    re ? t(pipSize === null ? 'formation.trade.away.price' : 'formation.trade.away.pips', { n: `${sign}${dist(Math.abs(v - re.entry))}` }) : null;

  // C-Bein: eigene Liste und, wenn alle Pflichtzeilen erfüllt sind, eigene Werte und ein eigenes Verhältnis zum Ziel (Level 1)
  const cl = trade.cLeg;
  const clBuy = cl?.side === 'buy';
  const clMetrics = cl && cl.entry !== null ? tradeMetrics({ entry: cl.entry, stop: cl.stop, tp1: cl.target }, cl.side) : null;
  const clCrvText = clMetrics ? number(clMetrics.crv, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : dash;
  const clAway = (v: number, sign: '+' | '−') =>
    cl && cl.entry !== null ? t(pipSize === null ? 'formation.trade.away.price' : 'formation.trade.away.pips', { n: `${sign}${dist(Math.abs(v - cl.entry))}` }) : null;
  // Der Einstieg liegt in der Vergangenheit: C wird erst nach zwei Kerzen rechts erkannt. „Jetzt“ = Schluss der letzten Kerze; jenseits = in Handelsrichtung über den Einstieg hinaus
  const clAge = cl && cl.entry !== null && cl.barsSince !== undefined && cl.lastClose !== undefined && cl.barsSince > 0 ? { n: cl.barsSince, beyond: (cl.lastClose - cl.entry) * (clBuy ? 1 : -1) > 0, gap: Math.abs(cl.lastClose - cl.entry) } : null;
  const clRowValue = (key: string, value: number | string | undefined): string | null => {
    if (value === undefined) return null;
    if (typeof value === 'number') return number(value, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    if (key === 'candle' || key === 'lowerAbcd') return t(`formation.trade.cleg.tf.${value}` as MessageKey);
    return t(`formation.trade.cleg.value.${value}` as MessageKey);
  };
  const clRowLabel = (key: string): MessageKey =>
    (key === 'noDivergence' || key === 'zone' ? `formation.trade.cleg.row.${key}.${clBuy ? 'buy' : 'sell'}` : `formation.trade.cleg.row.${key}`) as MessageKey;
  // C-Bein wartet auf eine Umkehrkerze: alle Pflichtzeilen außer der Kerze sind erfüllt, am C liegt keine Zone, in der tieferen Zeiteinheit gibt es keine Kerze
  const clWaiting =
    !!cl && cl.variant === null && cl.rows.find((r) => r.key === 'zone')?.state === 'unmet' && cl.rows.find((r) => r.key === 'candle')?.state === 'unmet' &&
    cl.rows.filter((r) => r.kind === 'required' && r.key !== 'candle').every((r) => r.state === 'met');

  // Großes Ziel: bis eine Kerze jenseits von A schloss, steht unter dem Wert, was es aktiviert; danach „etkin“
  const bigNote = (() => {
    if (trade.tpBig === undefined || trade.tpBigActivation === undefined || bigTaken || stopped || status?.kind === 'breakeven') return undefined;
    if (status?.bigActive) return t('formation.trade.big.active');
    return t(buy ? 'formation.trade.big.pending.buy' : 'formation.trade.big.pending.sell', { price: fmt(trade.tpBigActivation) });
  })();
  // Titel und Zusatzzeile der Statuszeile: mit großem Ziel bleibt der Handel nach TP1 und TP2 offen, nach TP2 mit Rest am Einstieg
  const statusKey = (sub: boolean) => {
    if (!status) return '';
    const open = big && (status.kind === 'tp1' || status.kind === 'tp12');
    if (status.kind === 'stopped') return sub ? `formation.trade.status.stopped.${status.stopBy ?? 'close'}` : 'formation.trade.status.stopped';
    if (status.kind === 'breakeven' && status.tp2Fill !== undefined) return sub ? 'formation.trade.status.breakeven.sub' : 'formation.trade.status.breakeven12';
    if (open) return sub ? `formation.trade.status.${status.kind}.big.sub` : `formation.trade.status.${status.kind === 'tp12' ? 'tp12.big' : 'tp1'}`;
    // „Seviye 1“ ist ein Begriff von AB=CD; bei Harmoniken liegt der Einstieg am D-Level
    if (status.kind === 'open' && sub && candidate.code !== 'ABCD') return 'formation.trade.status.open.sub.harmonic';
    return `formation.trade.status.${status.kind}${sub ? '.sub' : ''}`;
  };

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
  const target = (
    field: 'tp1' | 'tp2' | 'tp3' | 'tpBig',
    label: string,
    value: number | null,
    o: {
      share?: string;
      wide?: boolean;
      state?: 'taken' | 'waiting' | 'missed';
      hint?: string;
      note?: string;
    } = {},
  ) => (
    <div className={cn('flex min-w-0 flex-col gap-px', o.wide && 'col-span-2')}>
      <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        {label}
        {o.share && <span className="rounded border border-border px-1 text-[10px] font-semibold leading-4">{o.share}</span>}
        <InfoHint hint={t((o.hint ?? `formation.trade.${field}.hint`) as 'formation.trade.tp1.hint')} />
      </span>
      <span data-testid={`trade-${field}`} className={cn('text-[13px] font-medium tabular-nums', value === null ? 'text-muted-foreground' : 'text-success')}>
        {value === null ? dash : `${o.state === 'taken' ? '✓ ' : ''}${fmt(value)}`}
      </span>
      <span data-testid={`trade-${field}-reason`} className="text-[10.5px] tabular-nums text-muted-foreground">
        {value === null ? reasonText(trade.reason.tp1) : <span data-testid={`trade-${field}-distance`}>{away(value, '+')}</span>}
        {value !== null && o.note && <span data-testid={`trade-${field}-note`}>{` · ${o.note}`}</span>}
        {value !== null && o.state && <span data-testid={`trade-${field}-state`}>{` · ${t(`formation.trade.target.${o.state}`)}`}</span>}
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
        <Tooltip content={t(`formation.trade.side.${candidate.side}.hint`)} role="presentation">
          <span className={cn('ml-auto inline-flex cursor-help items-center gap-0.5 text-[11px] font-semibold', buy ? 'text-success' : 'text-danger')}>
            {buy ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
            {t(`formation.trade.side.${candidate.side}`)}
          </span>
        </Tooltip>
      </div>
      {veto && (
        <div data-testid="trade-veto" className="flex items-start gap-2 border-b border-danger/35 bg-danger/12 px-2.5 py-2 text-xs text-danger">
          <X size={14} strokeWidth={3} aria-hidden="true" className="mt-px shrink-0" />
          <span className="flex-1">
            <b>{t('formation.trade.veto.title')}</b> — {t(`formation.trade.veto.${candidate.side}`)}
          </span>
          <InfoHint hint={t('formation.trade.veto.hint')} className="text-danger" />
        </div>
      )}
      {early && (
        <div data-testid="trade-status" data-status="early" className="flex flex-wrap items-center gap-1.5 border-b border-info/35 bg-info/10 px-2.5 py-2">
          <Undo2 size={13} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-info" />
          <span className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-info">{t('formation.trade.early')}</span>
            <span className="text-[11.5px] text-muted-foreground">
              {' · '}
              {t('formation.trade.early.sub', { n: t(pipSize === null ? 'formation.trade.away.price' : 'formation.trade.away.pips', { n: dist(early.gap) }) })}
            </span>
          </span>
          <InfoHint hint={t('formation.trade.early.hint')} />
        </div>
      )}
      {status && (
        <div
          data-testid="trade-status"
          data-status={status.kind}
          className={cn(
            'flex flex-wrap items-center gap-1.5 border-b px-2.5 py-2',
            status.kind === 'stopped' && 'border-danger/35 bg-danger/12',
            (status.kind === 'tp1' || status.kind === 'tp12' || status.kind === 'tp123' || status.kind === 'breakeven') && 'border-success/35 bg-success/12',
            status.kind === 'open' && 'border-border bg-muted/40',
          )}
        >
          {status.kind === 'open' && <Clock size={13} aria-hidden="true" className="shrink-0 text-info" />}
          {status.kind === 'stopped' && <X size={13} strokeWidth={3} aria-hidden="true" className="shrink-0 text-danger" />}
          {status.kind === 'breakeven' && <Minus size={13} strokeWidth={3} aria-hidden="true" className="shrink-0 text-success" />}
          {(status.kind === 'tp1' || status.kind === 'tp12' || status.kind === 'tp123') && <Check size={13} strokeWidth={3} aria-hidden="true" className="shrink-0 text-success" />}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'text-xs font-semibold',
                status.kind === 'stopped' && 'text-danger',
                status.kind !== 'open' && status.kind !== 'stopped' && 'text-success',
              )}
            >
              {t(statusKey(false) as 'formation.trade.status.tp1')}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {' · '}
              {t(statusKey(true) as 'formation.trade.status.tp1.sub')}
            </span>
          </span>
          <InfoHint hint={t(big ? 'formation.trade.status.big.hint' : 'formation.trade.status.hint')} />
        </div>
      )}
      <div className={cn(veto && 'opacity-70')} data-testid="trade-values">
        <div className={cn('grid grid-cols-2 gap-x-3 gap-y-2 px-2.5 py-2.5', stopped && 'opacity-70')}>
          {entryCell(entrySub)}
          <div className="flex min-w-0 flex-col gap-px">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {t(moved ? 'formation.trade.stop.breakeven' : 'formation.trade.stop')}
              <InfoHint hint={t(moved ? 'formation.trade.stop.breakeven.hint' : 'formation.trade.stop.hint')} />
            </span>
            <span
              data-testid="trade-stop"
              className={cn('text-[13px] font-medium tabular-nums', trade.stop === null ? 'text-muted-foreground' : !moved && 'text-danger')}
            >
              {trade.stop === null ? dash : fmt(moved && status ? status.stopNow : trade.stop)}
            </span>
            {trade.stop === null && (
              <span data-testid="trade-stop-reason" className="text-[10.5px] text-muted-foreground">
                {reasonText(trade.reason.stop)}
              </span>
            )}
            {trade.stop !== null && moved && (
              <span data-testid="trade-stop-moved" className="text-[10.5px] tabular-nums text-muted-foreground">
                <s>{fmt(trade.stop)}</s>
                {` · ${t('formation.trade.stop.moved')}`}
              </span>
            )}
            {trade.stop !== null && !moved && (
              <span className="text-[10.5px] tabular-nums text-muted-foreground">
                <span data-testid="trade-stop-distance">{away(trade.stop, '−')}</span>
                {early && <span data-testid="trade-stop-zone">{` · ${t(buy ? 'formation.trade.early.stop.below' : 'formation.trade.early.stop.above')}`}</span>}
                {trade.emergencyStop !== null && (
                  <>
                    {' · '}
                    <span data-testid="trade-stop-emergency">
                      {t('formation.trade.emergency', {
                        price: fmt(trade.emergencyStop),
                      })}
                    </span>
                  </>
                )}
              </span>
            )}
          </div>
          {target('tp1', early ? t('formation.trade.early.target1') : t('formation.trade.tp1'), trade.tp1, {
            share: trade.tp2 !== undefined ? shareText : undefined,
            state: stateOf('tp1'),
            ...(early ? { hint: 'formation.trade.early.target1.hint', note: t('formation.trade.early.target1.sub') } : {}),
          })}
          {early?.target2 != null &&
            target('tp2', t('formation.trade.early.target2'), early.target2, {
              hint: 'formation.trade.early.target2.hint',
              note: t(buy ? 'formation.trade.early.target2.high' : 'formation.trade.early.target2.low'),
            })}
          {trade.tp2 !== undefined &&
            target('tp2', t('formation.trade.tp2'), trade.tp2, {
              share: shareText,
              state: stateOf('tp2'),
            })}
          {trade.tpBig !== undefined &&
            target('tpBig', t('formation.trade.tpBig'), trade.tpBig, {
              share: shareText,
              wide: true,
              state: stateOf('tpBig'),
              note: bigNote,
            })}
          {trade.tp3 !== undefined &&
            target('tp3', t(big ? 'formation.trade.tp4' : 'formation.trade.tp3'), trade.tp3, { wide: true })}
        </div>
        {early && (
          <div
            data-testid="trade-early-note"
            className="mx-2.5 mb-2 flex items-start gap-1.5 rounded-lg border border-info/35 bg-info/10 px-2 py-1.5 text-[11.5px]"
          >
            <Info size={13} aria-hidden="true" className="mt-px shrink-0 text-info" />
            <span className="flex-1">{t('formation.trade.early.note')}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5 border-t border-border px-2.5 py-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {t(early ? 'formation.trade.early.crv' : 'formation.trade.crv')}
            <InfoHint hint={t('formation.trade.crv.hint')} />
          </span>
          <span data-testid="trade-crv" className={cn('text-[15px] font-semibold tabular-nums', !metrics && 'text-muted-foreground', hdl02 && 'text-warning')}>
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
      {early && (
        <div data-testid="trade-early-footer" className="border-t border-border px-2.5 py-2 text-[10.5px] text-muted-foreground">
          {t('formation.trade.early.footer')}
        </div>
      )}
      {outcomes && (
        <div data-testid="trade-outcomes" className="flex flex-col gap-1.5 border-t border-border px-2.5 py-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {t('formation.trade.outcome.title')}
            <InfoHint hint={t(big ? 'formation.trade.outcome.big.hint' : 'formation.trade.outcome.hint')} />
          </span>
          <div className={cn('grid gap-1.5', outcomes.tp123 === undefined ? 'grid-cols-3' : 'grid-cols-2')}>
            {(
              [
                ['stop', outcomes.stop, 'text-danger'],
                ['tp1', outcomes.tp1, 'text-success'],
                ['tp12', outcomes.tp12, 'text-success'],
                ...(outcomes.tp123 === undefined ? [] : ([['tp123', outcomes.tp123, 'text-success']] as const)),
              ] as const
            ).map(([key, v, tone]) => {
              // Tatsächliches Ergebnis: der Kasten wird hervorgehoben, die übrigen blass und durchgestrichen (nicht nur Farbe)
              const { active, dim, label, actual } = outcomeView(key);
              const shown = actual && realized ? (realized[key] ?? v) : v;
              // Plan-Zeile (nur Kästen mit tatsächlichem Wert; der Stop bleibt immer −1): das Ziel kann sich nach dem Einstieg verschoben haben
              const showPlan = actual && realized !== null && key !== 'stop';
              const conditional = actual && !active;
              const conditionalKind = key === 'tp123' ? 'ifBig' : 'ifTp2';
              const hintKind = conditional ? conditionalKind : 'actual';
              const box = (
                <div
                  data-testid={`trade-outcome-${key}`}
                  data-active={active ? 'true' : 'false'}
                  tabIndex={showPlan ? 0 : undefined}
                  role={showPlan ? 'group' : undefined}
                  className={cn(
                    'flex min-w-0 flex-col gap-px rounded-lg border px-1.5 py-1',
                    showPlan && 'w-full flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && key === 'stop' && 'border-danger/50',
                    active && key !== 'stop' && 'border-success/50',
                    !active && 'border-border',
                    dim && 'opacity-45',
                  )}
                >
                  <span className="text-[10.5px] leading-tight text-muted-foreground">{label}</span>
                  <span className={cn('text-[13px] font-medium tabular-nums', tone, dim && 'line-through')}>{rText(shown)}</span>
                  {showPlan && (
                    <span data-testid={`trade-outcome-plan-${key}`} className="text-[10.5px] leading-tight tabular-nums text-muted-foreground/80">
                      {t('formation.trade.outcome.plan', { value: rText(v) })}
                    </span>
                  )}
                </div>
              );
              if (!showPlan) return <Fragment key={key}>{box}</Fragment>;
              const hint = [
                t(`formation.trade.outcome.diff.${hintKind}` as MessageKey, { value: rText(shown) }),
                t('formation.trade.outcome.diff.plan', { value: rText(v) }),
                t('formation.trade.outcome.diff.drift'),
              ].join('\n');
              return (
                <Tooltip key={key} content={hint} className="min-w-0 shrink">
                  {box}
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}
      {re && (
        <div data-testid="trade-reentry" className="border-t border-border">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-info/35 bg-info/10 px-2.5 py-2">
            <RotateCcw size={13} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-info" />
            <span className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-info">{t('formation.trade.reentry.title')}</span>
              <span className="text-[11.5px] text-muted-foreground">{` · ${t('formation.trade.reentry.sub')}`}</span>
            </span>
            <InfoHint hint={t('formation.trade.reentry.hint')} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-2.5 py-2.5">
            <div className="flex min-w-0 flex-col gap-px">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {t('formation.trade.entry')}
                <InfoHint hint={t('formation.trade.reentry.entry.hint')} />
              </span>
              <span data-testid="trade-reentry-entry" className="text-[13px] font-medium tabular-nums">
                {fmt(re.entry)}
              </span>
              <span className="text-[10.5px] text-muted-foreground">{t(buy ? 'formation.trade.reentry.entry.buy' : 'formation.trade.reentry.entry.sell')}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-px">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {t('formation.trade.stop')}
                <InfoHint hint={t('formation.trade.reentry.stop.hint')} />
              </span>
              <span data-testid="trade-reentry-stop" className="text-[13px] font-medium tabular-nums text-danger">
                {fmt(re.stop)}
              </span>
              <span className="text-[10.5px] tabular-nums text-muted-foreground">
                {reAway(re.stop, '−')}
                {` · ${t(buy ? 'formation.trade.reentry.stop.buy' : 'formation.trade.reentry.stop.sell')}`}
                {re.emergencyStop !== null && ` · ${t('formation.trade.emergency', { price: fmt(re.emergencyStop) })}`}
              </span>
            </div>
            <div className={cn('flex min-w-0 flex-col gap-px', re2 === null && 'col-span-2')}>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {t(re2 === null ? 'formation.trade.reentry.target' : 'formation.trade.reentry.target1')}
                <InfoHint hint={t('formation.trade.reentry.target.hint')} />
              </span>
              <span data-testid="trade-reentry-target" className={cn('text-[13px] font-medium tabular-nums', re.target === null ? 'text-muted-foreground' : 'text-success')}>
                {re.target === null ? dash : fmt(re.target)}
              </span>
              <span className="text-[10.5px] tabular-nums text-muted-foreground">
                {re.target === null ? reasonText('noZone') : `${reAway(re.target, '+')} · ${t(buy ? 'formation.trade.reentry.target.buy' : 'formation.trade.reentry.target.sell')}`}
              </span>
            </div>
            {re2 !== null && (
              <div className="flex min-w-0 flex-col gap-px">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {t('formation.trade.reentry.target2')}
                  <InfoHint hint={t('formation.trade.reentry.target2.hint')} />
                </span>
                <span data-testid="trade-reentry-target2" className="text-[13px] font-medium tabular-nums text-success">
                  {fmt(re2)}
                </span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground">{`${reAway(re2, '+')} · ${t(buy ? 'formation.trade.reentry.target2.buy' : 'formation.trade.reentry.target2.sell')}`}</span>
              </div>
            )}
          </div>
          <div className="mx-2.5 mb-2 flex items-start gap-1.5 rounded-lg border border-info/35 bg-info/10 px-2 py-1.5 text-[11.5px]">
            <Info size={13} aria-hidden="true" className="mt-px shrink-0 text-info" />
            <span className="flex-1">{t(buy ? 'formation.trade.reentry.note.buy' : 'formation.trade.reentry.note.sell')}</span>
          </div>
          <div className="flex items-center gap-2.5 border-t border-border px-2.5 py-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {t(re2 === null ? 'formation.trade.reentry.crv' : 'formation.trade.reentry.crv1')}
              <InfoHint hint={t('formation.trade.reentry.crv.hint')} />
            </span>
            <span data-testid="trade-reentry-crv" className={cn('text-[15px] font-semibold tabular-nums', !reMetrics && 'text-muted-foreground')}>
              {reCrvText}
            </span>
            {reMetrics ? (
              <span role="img" aria-label={t('formation.trade.ratio', { n: reCrvText })} className="flex h-1.5 flex-1 overflow-hidden rounded-[3px] bg-muted">
                <span className="block h-full bg-danger" style={{ width: `${(1 / (1 + reMetrics.crv)) * 100}%` }} />
                <span className="block h-full bg-success" style={{ width: `${100 - (1 / (1 + reMetrics.crv)) * 100}%` }} />
              </span>
            ) : (
              <span className="flex-1 text-right text-[10.5px] text-muted-foreground">{t('formation.trade.reentry.crv.missing')}</span>
            )}
          </div>
          {re2 !== null && (
            <div className="flex items-center gap-2.5 px-2.5 pb-2">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {t('formation.trade.reentry.crv2')}
                <InfoHint hint={t('formation.trade.reentry.crv2.hint')} />
              </span>
              <span data-testid="trade-reentry-crv2" className={cn('text-[13px] font-medium tabular-nums', !reMetrics2 && 'text-muted-foreground')}>
                {reCrv2Text}
              </span>
            </div>
          )}
          <div className="border-t border-border px-2.5 py-2 text-[10.5px] text-muted-foreground">{t(re2 === null ? 'formation.trade.reentry.footer' : 'formation.trade.reentry.footer2')}</div>
        </div>
      )}
      {trade.reentryTp1Only && (
        <div
          data-testid="trade-reentry-warning"
          className="mx-2.5 mb-2 flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/10 px-2 py-1.5 text-[11.5px] text-warning"
        >
          <TriangleAlert size={13} aria-hidden="true" className="mt-px shrink-0" />
          <span className="flex-1">{t('formation.trade.reentry.warning')}</span>
          <InfoHint hint={t('formation.trade.reentry.warning.hint')} className="text-warning" />
        </div>
      )}
      {cl && (
        <div data-testid="trade-cleg" data-variant={cl.variant ?? 'none'} className="border-t border-border">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-info/35 bg-info/10 px-2.5 py-2">
            <Undo2 size={13} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-info" />
            <span className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-info">{t('formation.trade.cleg.title')}</span>
              <span className="text-[11.5px] text-muted-foreground">{` · ${t('formation.trade.cleg.sub')}`}</span>
            </span>
            <span data-testid="trade-cleg-dir" className={cn('text-xs font-semibold', clBuy ? 'text-success' : 'text-danger')}>
              {t(clBuy ? 'formation.trade.cleg.dir.buy' : 'formation.trade.cleg.dir.sell')}
            </span>
            <InfoHint hint={t('formation.trade.cleg.hint')} />
          </div>
          {(['required', 'bonus'] as const).map((kind) => {
            const rows = cl.rows.filter((r) => r.kind === kind);
            const met = rows.filter((r) => r.state === 'met').length;
            return (
              <div key={kind} data-testid={`trade-cleg-group-${kind}`} data-count={`${met}/${rows.length}`}>
                <h4 className="flex items-center gap-1 px-2.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {`${t(`formation.group.${kind}` as MessageKey)} ${met}/${rows.length}`}
                  {kind === 'required' && <InfoHint hint={t('formation.trade.cleg.group.hint')} />}
                </h4>
                {rows.map((r) => {
                  const value = r.state === 'unmeasurable' ? null : clRowValue(r.key, r.value);
                  return (
                    <div
                      key={r.key}
                      data-testid={`trade-cleg-row-${r.key}`}
                      data-state={r.state}
                      className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-1"
                    >
                      <StateIcon state={r.state} />
                      <span className={cn('flex min-w-0 items-center gap-1 text-xs', r.state === 'unmeasurable' && 'text-muted-foreground')}>
                        {t(clRowLabel(r.key))}
                        <InfoHint hint={t(`formation.trade.cleg.row.${r.key}.hint` as MessageKey)} />
                      </span>
                      {value !== null && (
                        <span data-testid={`trade-cleg-value-${r.key}`} className="text-xs tabular-nums text-foreground/80">
                          {value}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {clWaiting && (
            <div data-testid="trade-cleg-waiting" className="mx-2.5 my-2 flex items-start gap-1.5 rounded-lg border border-info/35 bg-info/10 px-2 py-1.5 text-[11.5px]">
              <Clock size={13} aria-hidden="true" className="mt-px shrink-0 text-info" />
              <span className="flex-1">{t('formation.trade.cleg.waiting')}</span>
            </div>
          )}
          {cl.variant !== null && cl.entry !== null && cl.stop !== null && cl.target !== null && (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border px-2.5 py-2.5">
                <div className="flex min-w-0 flex-col gap-px">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {t('formation.trade.entry')}
                    <InfoHint hint={t('formation.trade.cleg.entry.hint')} />
                  </span>
                  <span data-testid="trade-cleg-entry" className="text-[13px] font-medium tabular-nums">
                    {fmt(cl.entry)}
                  </span>
                  {clAge && (
                    <Tooltip content={t('formation.trade.cleg.past.hint')} className="self-start">
                      <span data-testid="trade-cleg-past" tabIndex={0} className="w-fit rounded-md bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">
                        {t(clAge.n === 1 ? 'formation.trade.cleg.past.one' : 'formation.trade.cleg.past.many', { n: String(clAge.n) })}
                      </span>
                    </Tooltip>
                  )}
                  <span className="text-[10.5px] text-muted-foreground">
                    {t(cl.variant === 'candle' ? 'formation.trade.cleg.entry.candle' : (`formation.trade.cleg.entry.zone.${clBuy ? 'buy' : 'sell'}` as MessageKey))}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-px">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {t('formation.trade.stop')}
                    <InfoHint hint={t('formation.trade.cleg.stop.hint')} />
                  </span>
                  <span data-testid="trade-cleg-stop" className="text-[13px] font-medium tabular-nums text-danger">
                    {fmt(cl.stop)}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">
                    {clAway(cl.stop, '−')}
                    {` · ${t(`formation.trade.cleg.stop.${cl.variant}.${clBuy ? 'buy' : 'sell'}` as MessageKey)}`}
                    {cl.emergencyStop !== null && ` · ${t('formation.trade.emergency', { price: fmt(cl.emergencyStop) })}`}
                  </span>
                </div>
                {clAge && (
                  <p data-testid="trade-cleg-past-gap" data-side={clAge.beyond ? 'beyond' : 'behind'} className="col-span-2 text-[10.5px] tabular-nums text-muted-foreground/80">
                    {t(clAge.beyond ? 'formation.trade.cleg.past.beyond' : 'formation.trade.cleg.past.behind', {
                      d: t(pipSize === null ? 'formation.trade.away.price' : 'formation.trade.away.pips', { n: dist(clAge.gap) }),
                    })}
                  </p>
                )}
                <div className="col-span-2 flex min-w-0 flex-col gap-px">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {t('formation.trade.reentry.target')}
                    <InfoHint hint={t('formation.trade.cleg.target.hint')} />
                  </span>
                  <span data-testid="trade-cleg-target" className="text-[13px] font-medium tabular-nums text-success">
                    {fmt(cl.target)}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">{`${clAway(cl.target, '+')} · ${t('formation.trade.cleg.target.sub')}`}</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 border-t border-border px-2.5 py-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t('formation.trade.reentry.crv')}
                  <InfoHint hint={t('formation.trade.reentry.crv.hint')} />
                </span>
                <span data-testid="trade-cleg-crv" className={cn('text-[15px] font-semibold tabular-nums', !clMetrics && 'text-muted-foreground')}>
                  {clCrvText}
                </span>
                {clMetrics ? (
                  <span role="img" aria-label={t('formation.trade.ratio', { n: clCrvText })} className="flex h-1.5 flex-1 overflow-hidden rounded-[3px] bg-muted">
                    <span className="block h-full bg-danger" style={{ width: `${(1 / (1 + clMetrics.crv)) * 100}%` }} />
                    <span className="block h-full bg-success" style={{ width: `${100 - (1 / (1 + clMetrics.crv)) * 100}%` }} />
                  </span>
                ) : (
                  <span className="flex-1 text-right text-[10.5px] text-muted-foreground">{t('formation.trade.reentry.crv.missing')}</span>
                )}
              </div>
            </>
          )}
          <div data-testid="trade-cleg-footer" className="border-t border-border px-2.5 py-2 text-[10.5px] text-muted-foreground">{t('formation.trade.cleg.footer')}</div>
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
        <div
          data-testid="trade-sig29"
          data-state={checkRowState(sig29)}
          className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2 border-t border-border px-2.5 py-1.5"
        >
          <StateIcon state={checkRowState(sig29)} />
          <span className="min-w-0 text-xs">{ruleText(locale, sig29.id) ?? sig29.id}</span>
          {sig29.value !== undefined && (
            <span className="text-xs tabular-nums text-foreground/80">{number(sig29.value, { maximumFractionDigits: 2 })}</span>
          )}
        </div>
      )}
    </section>
  );
}
