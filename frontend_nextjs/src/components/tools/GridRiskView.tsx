'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ShieldCheck, XOctagon } from 'lucide-react';
import { useAccounts } from '@/components/account/hooks';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { FieldLabel, Tooltip } from '@/components/ui/tooltip';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { getApiErrorMessage, isAbortError } from '@/lib/apiError';
import {
  calcGridRisk,
  DEFAULT_STOP_OUT_PCT,
  SWAP_MODE_DISABLED,
  SWAP_MODE_POINTS,
  type GridLevel,
  type LevelStatus,
} from '@/lib/tools/gridRisk';
import { cn } from '@/lib/utils';
import { fetchCalcContext, type CalcContext } from '@/services/marketApi';
import { useAccountStore } from '@/store';

type Key = 'p0' | 'floor' | 'lot' | 'step' | 'capital' | 'contract' | 'leverage' | 'swap' | 'days' | 'marginLot';
type Overrides = Partial<Record<Key, number>>;

const STATUS_TONE: Record<LevelStatus, { box: string; text: string; bar: string; stroke: string; Icon: typeof Check }> = {
  safe: { box: 'border-success/30 bg-success/[0.07]', text: 'text-success', bar: 'bg-success', stroke: 'stroke-success', Icon: ShieldCheck },
  marginCall: { box: 'border-warning/30 bg-warning/[0.07]', text: 'text-warning', bar: 'bg-warning', stroke: 'stroke-warning', Icon: AlertTriangle },
  stopOut: { box: 'border-danger/30 bg-danger/[0.07]', text: 'text-danger', bar: 'bg-danger', stroke: 'stroke-danger', Icon: XOctagon },
};
const STATUS_KEY: Record<LevelStatus, MessageKey> = {
  safe: 'tools.status.safe',
  marginCall: 'tools.status.marginCall',
  stopOut: 'tools.status.stopOut',
};

/** Vorzeichen-Zeichen für Geld und Punkte: Minus als echtes Minuszeichen. */
function signOf(v: number, plus: boolean): string {
  if (v < 0) return '−';
  return plus && v > 0 ? '+' : '';
}
function signTone(v: number): 'text-success' | 'text-danger' | undefined {
  if (v === 0) return undefined;
  return v > 0 ? 'text-success' : 'text-danger';
}
const SWAP_CHIP_TONE = ['danger', undefined, 'success'] as const;
const ERR_TITLE = { invalid: 'tools.err.invalid', floorAbovePrice: 'tools.err.floor', tooManyLevels: 'tools.err.many' } as const;

const round = (v: number, digits: number) => Number(v.toFixed(Math.max(0, Math.min(10, digits))));

/** Kleine Kopf-/Karten-Bausteine, damit die Seite nur Tokens benutzt. */
function Chip({ label, children, tone }: { label: string; children: ReactNode; tone?: 'success' | 'danger' }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}{' '}
      <b className={cn('font-semibold text-foreground', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger')}>{children}</b>
    </span>
  );
}

interface NumCtx {
  t: ReturnType<typeof useT>;
  val: (k: Key) => number;
  setVal: (k: Key, v: number) => void;
  resetVal: (k: Key) => void;
  over: Overrides;
  auto: Record<Key, number>;
}

/** Zahlenfeld mit „Zurück zum Kontowert“; bewusst außerhalb der Seite, damit es beim Tippen nicht neu eingehängt wird. */
function Num({ c, k, label, hintKey, resettable = false, decimals, shown, onInput, suffix, className }: {
  c: NumCtx; k: Key; label: MessageKey; hintKey: MessageKey; resettable?: boolean; decimals?: number; shown?: number; onInput?: (v: number) => void; suffix?: ReactNode; className?: string;
}) {
  const { t, val, setVal, resetVal, over, auto } = c;
  const changed = k in over && over[k] !== auto[k];
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <InputField label={t(label)} hint={t(hintKey)}>
        <div className="flex items-center gap-1.5">
          <NumberInput
            step="any"
            data-testid={`grid-risk-${k}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={shown ?? val(k)}
            maxDecimals={decimals}
            onChange={(e) => {
              const v = e.target.value === '' ? NaN : Number(e.target.value.replace(',', '.'));
              if (onInput) onInput(v); else setVal(k, v);
            }}
          />
          {suffix}
        </div>
      </InputField>
      {resettable && changed && (
        <Button variant="ghost" size="sm" className="self-start px-1 text-xs" hint={t('tools.reset.hint')} onClick={() => resetVal(k)} data-testid={`grid-risk-reset-${k}`}>
          {t('tools.resetAccount')}
        </Button>
      )}
    </div>
  );
}

export default function GridRiskView() {
  const t = useT();
  const fmt = useFormat();
  const { fetchAccounts } = useAccounts();
  const accounts = useAccountStore((s) => s.accounts);
  const accountId = useAccountStore((s) => s.selectedAccount);
  const symbolDetails = useSymbolDetails(accountId);
  const [symbol, setSymbol] = useState('');
  const symbolRef = useRef('');
  const [ctx, setCtx] = useState<{ key: string; data: CalcContext } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [over, setOver] = useState<Overrides>({});
  const [stepCent, setStepCent] = useState(false);

  useEffect(() => {
    if (accounts.length === 0) fetchAccounts();
  }, [accounts.length, fetchAccounts]);

  const info = symbol ? symbolDetails[symbol] : undefined;
  const key = `${accountId}|${symbol}`;

  // Konto/Symbol-Daten (nur lesend). Bei Symbolwechsel gilt der alte Kontext nie (key).
  useEffect(() => {
    if (!accountId || !info) return;
    const controller = new AbortController();
    fetchCalcContext(accountId, symbol, controller.signal)
      .then((data) => {
        setCtx({ key, data });
        setLoadError(null);
      })
      .catch(async (err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        setLoadError(await getApiErrorMessage(err, t('tools.loadFailed')));
      });
    return () => controller.abort();
    // t ist stabil pro Sprache; key deckt Konto und Symbol ab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, symbol, !!info, refresh]);

  const data = ctx && ctx.key === key ? ctx.data : null;
  const digits = info?.digits ?? 2;
  const point = info?.point ?? 0.01;
  const tickSize = info?.trade_tick_size ?? point;
  const tickValue = info?.trade_tick_value_profit ?? info?.trade_tick_value ?? 0;
  const swapMode = info?.swap_mode ?? null;
  const swapSupported = swapMode === SWAP_MODE_POINTS || swapMode === SWAP_MODE_DISABLED;
  const currency = data?.currency ?? '';

  // Automatische Werte; jeder Wert kann überschrieben werden (`over`).
  const auto = useMemo(() => {
    const p0 = data?.ask || data?.bid || 0;
    return {
      p0: p0 ? round(p0, digits) : 0,
      floor: p0 ? round(p0 * 0.8, digits) : 0,
      lot: info?.volume_min ?? 0.01,
      step: p0 ? round(p0 / 200, digits) : 0,
      capital: data?.balance ?? 0,
      contract: info?.trade_contract_size ?? 100,
      leverage: data?.leverage || 100,
      swap: swapMode === SWAP_MODE_POINTS ? (info?.swap_long ?? 0) : 0,
      days: 30,
      marginLot: data?.margin_per_lot ?? 0,
    } satisfies Record<Key, number>;
  }, [data, info, digits, swapMode]);

  const val = (k: Key) => (k in over ? (over[k] as number) : auto[k]);
  const setVal = (k: Key, v: number) => setOver((o) => ({ ...o, [k]: v }));
  const resetVal = (k: Key) => setOver((o) => { const n = { ...o }; delete n[k]; return n; });
  // Gleiches Symbol (Auswahl nach dem Tippen) ändert nichts: sonst gingen geholte Werte und eigene Eingaben verloren
  const changeSymbol = useCallback((next: string) => {
    if (next === symbolRef.current) return;
    symbolRef.current = next;
    setSymbol(next); setOver({}); setLoadError(null);
  }, []);

  // Cent-Umschalter: der angezeigte Wert ist 100× der Preisabstand
  const stepPrice = val('step');
  const stepShown = stepCent ? round(stepPrice * 100, 4) : stepPrice;

  const stopOutPct = data?.margin_so_mode === 0 && data.margin_so_so ? data.margin_so_so : null;
  const marginLot = val('marginLot') > 0 ? val('marginLot') : null;
  let marginPrice: number | null = null;
  if (marginLot && data) marginPrice = marginLot === data.margin_per_lot ? data.margin_price : auto.p0;

  const result = useMemo(
    () =>
      calcGridRisk({
        capital: val('capital'), p0: val('p0'), floor: val('floor'), step: stepPrice, lot: val('lot'),
        contractSize: val('contract'), leverage: val('leverage'), digits, point, tickValue, tickSize,
        swapPoints: val('swap'), days: val('days'), marginPerLot: marginLot, marginPrice, stopOutPct,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [over, auto, stepPrice, digits, point, tickValue, tickSize, marginLot, marginPrice, stopOutPct],
  );

  const money = (v: number, signed = false) => {
    const abs = fmt.number(Math.abs(v), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = signOf(v, signed);
    return `${sign}${abs}${currency ? ` ${currency}` : ''}`;
  };
  const price = (v: number) => fmt.price(v, digits);

  const c: NumCtx = { t, val, setVal, resetVal, over, auto };
  const symbolList = Object.keys(symbolDetails);
  const tone = result.ok ? STATUS_TONE[result.status] : STATUS_TONE.stopOut;
  const swapChip = swapMode === SWAP_MODE_POINTS && info?.swap_long != null ? info.swap_long : null;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 md:px-8" data-testid="grid-risk-page">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('tools.eyebrow')}</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{t('tools.gridRisk.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('tools.gridRisk.subtitle')}</p>
      </header>

      {!accountId && <Alert tone="info">{t('tools.noAccount')}</Alert>}
      {loadError && <Alert tone="warning" title={t('tools.loadFailed')}>{loadError}</Alert>}

      <div className="flex flex-wrap items-start gap-4">
        <Card className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 p-4 lg:max-w-[400px]">
          <h2 className="text-sm font-semibold">{t('tools.params.title')}</h2>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel label={t('tools.symbol')} hint={t('tools.symbol.hint')} className="text-xs font-medium text-muted-foreground" />
            {accountId && symbolList.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('tools.symbols.loading')}</p>
            ) : (
              <SymbolAutoComplete value={symbol} onChange={changeSymbol} symbolDetails={symbolDetails} aria-label={t('tools.symbol')} />
            )}
            {info && data && (
              <div className="flex flex-wrap gap-1.5" data-testid="grid-risk-chips">
                <Chip label={t('tools.chip.contract')}>{fmt.number(auto.contract)}</Chip>
                <Chip label={t('tools.chip.swap')} tone={swapChip == null ? undefined : SWAP_CHIP_TONE[Math.sign(swapChip) + 1]}>
                  {swapChip == null ? t('tools.chip.swapOther') : `${signOf(swapChip, true)}${t('tools.chip.swapUnit', { value: fmt.number(Math.abs(swapChip), { maximumFractionDigits: 2 }) })}`}
                </Chip>
                {info.swap_rollover3days != null && <Chip label={t('tools.chip.triple')}>{t(`tools.day.${info.swap_rollover3days}` as MessageKey)}</Chip>}
                <Chip label={t('tools.chip.minLot')}>{fmt.number(info.volume_min, { maximumFractionDigits: 4 })}</Chip>
                {auto.marginLot > 0 && <Chip label={t('tools.chip.margin')}>{money(auto.marginLot)}</Chip>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Num c={c} k="p0" label="tools.p0" hintKey="tools.p0.hint" resettable decimals={digits}
              suffix={<Button variant="outline" size="sm" hint={t('tools.live.hint')} disabled={!accountId || !info} onClick={() => { resetVal('p0'); setRefresh((n) => n + 1); }} data-testid="grid-risk-live">{t('tools.live')}</Button>} />
            <Num c={c} k="floor" label="tools.floor" hintKey="tools.floor.hint" decimals={digits} />
            <Num c={c} k="lot" label="tools.lot" hintKey="tools.lot.hint" decimals={4} />
            <Num c={c} k="step" label="tools.step" hintKey="tools.step.hint" className="col-span-2" shown={stepShown} decimals={stepCent ? Math.max(0, digits - 2) : digits}
              onInput={(v) => setVal('step', stepCent ? v / 100 : v)}
              suffix={
                <span className="flex shrink-0 rounded-md bg-muted p-0.5 text-[11px]">
                  <Button variant={stepCent ? 'secondary' : 'ghost'} size="sm" className="h-6 px-1.5 text-[11px]" hint={t('tools.step.cent.hint')} onClick={() => setStepCent(true)} aria-pressed={stepCent}>{t('tools.step.cent')}</Button>
                  <Button variant={stepCent ? 'ghost' : 'secondary'} size="sm" className="h-6 px-1.5 text-[11px]" hint={t('tools.step.price.hint')} onClick={() => setStepCent(false)} aria-pressed={!stepCent}>{t('tools.step.price')}</Button>
                </span>
              } />
          </div>

          <Num c={c} k="capital" label="tools.capital" hintKey="tools.capital.hint" resettable decimals={2}
            suffix={<Button variant="outline" size="sm" hint={t('tools.useBalance.hint')} disabled={!data} onClick={() => resetVal('capital')}>{t('tools.useBalance')}</Button>} />

          <details open className="border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-semibold">{t('tools.values')}</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Num c={c} k="contract" label="tools.contract" hintKey="tools.contract.hint" resettable />
              <Num c={c} k="leverage" label="tools.leverage" hintKey="tools.leverage.hint" resettable decimals={0} />
              <Num c={c} k="swap" label="tools.swap" hintKey="tools.swap.hint" resettable decimals={4} />
              <Num c={c} k="days" label="tools.days" hintKey="tools.days.hint" decimals={0} />
              <Num c={c} k="marginLot" label="tools.marginLot" hintKey="tools.marginLot.hint" resettable decimals={2} />
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{t('tools.valuesNote')}</p>
          </details>

          {data && result.ok && result.marginApproximated && <Alert tone="warning">{t('tools.warn.marginApprox')}</Alert>}
          {info && !swapSupported && <Alert tone="warning">{t('tools.warn.swapManual', { mode: String(swapMode ?? '?') })}</Alert>}
          {data && stopOutPct == null && <Alert tone="info">{t('tools.warn.stopOutDefault', { value: String(DEFAULT_STOP_OUT_PCT) })}</Alert>}
        </Card>

        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3" data-testid="grid-risk-results">
          {renderBody()}
        </section>
      </div>
    </main>
  );

  function renderBody() {
    if (!data) return <Card className="p-6 text-sm text-muted-foreground">{accountId ? t('tools.symbols.loading') : t('tools.noAccount')}</Card>;
    if (!result.ok) {
      return (
        <Alert tone={result.error === 'tooManyLevels' ? 'warning' : 'danger'} title={t(ERR_TITLE[result.error])}>
          {result.error === 'invalid' && t('tools.err.invalid.text')}
          {result.error === 'floorAbovePrice' && t('tools.err.floor.text')}
          {result.error === 'tooManyLevels' && t('tools.err.many.text', { count: fmt.number(result.count ?? 0), max: fmt.number(2000) })}
        </Alert>
      );
    }
    return renderResults();
  }

  function renderResults() {
    if (!result.ok) return null;
    const r = result;
    const swapPos = r.last.swap >= 0;
    const mcLevel = r.firstMarginCall;
    const soLevel = r.firstStopOut;
    const levelPct = r.last.marginLevel == null ? '—' : fmt.number(r.last.marginLevel, { maximumFractionDigits: 0 });
    const minLevel = Math.min(...r.levels.map((l) => l.marginLevel ?? Infinity));
    const mc = mcLevel as GridLevel;
    const so = soLevel as GridLevel;
    const texts: Record<LevelStatus, string> = {
      safe: t('tools.status.safe.text', { floor: price(val('floor')), free: money(r.last.remaining), level: fmt.number(Number.isFinite(minLevel) ? minLevel : 0, { maximumFractionDigits: 0 }) }),
      marginCall: mc ? t('tools.status.marginCall.text', { price: price(mc.price), n: mc.index, level: levelPct }) : '',
      stopOut: so ? t('tools.status.stopOut.text', { price: price(so.price), n: so.index, so: fmt.number(r.stopOutPct, { maximumFractionDigits: 1 }), mcPrice: price(mc.price) }) : '',
    };
    const text = texts[r.status];
    const usage = Math.max(0, Math.min(100, r.usagePct));
    const kpis: { label: MessageKey; value: string; sub: string; cls?: string }[] = [
      { label: 'tools.kpi.levels', value: fmt.number(r.count), sub: t('tools.kpi.levels.sub', { lots: fmt.number(r.totalLots, { maximumFractionDigits: 4 }), units: fmt.number(r.totalLots * val('contract')) }) },
      { label: 'tools.kpi.avg', value: price(r.avgPrice), sub: t('tools.kpi.avg.sub', { gap: price(val('p0') - r.avgPrice) }) },
      { label: 'tools.kpi.loss', value: money(-r.last.loss), sub: t('tools.kpi.loss.sub', { price: price(r.last.price) }), cls: r.last.loss > 0 ? 'text-danger' : undefined },
      { label: 'tools.kpi.margin', value: money(r.last.margin), sub: t('tools.kpi.margin.sub', { leverage: fmt.number(val('leverage')) }) },
      { label: 'tools.kpi.swap', value: money(r.last.swap, true), sub: t(swapPos ? 'tools.kpi.swap.income' : 'tools.kpi.swap.cost', { days: fmt.number(val('days')) }), cls: signTone(r.last.swap) },
    ];
    return (
      <>
        <div className={cn('flex items-start gap-3 rounded-xl border p-4', tone.box)} data-testid="grid-risk-status" data-status={r.status}>
          <tone.Icon size={20} className={cn('mt-0.5 shrink-0', tone.text)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip content={t('tools.status.hint')}><span className="text-sm font-semibold">{t(STATUS_KEY[r.status])}</span></Tooltip>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', tone.text, 'bg-background/60')}>{t(`${STATUS_KEY[r.status]}.badge` as MessageKey)}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {kpis.map((k) => (
            <Tooltip key={k.label} content={t('tools.kpi.hint')} className="block">
              <Card className="min-w-0 p-3" data-testid={`grid-risk-${k.label.replace('tools.kpi.', 'kpi-')}`}>
                <div className="text-[11px] text-muted-foreground">{t(k.label)}</div>
                <div className={cn('mt-1 truncate text-lg font-semibold tabular-nums', k.cls)}>{k.value}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{k.sub}</div>
              </Card>
            </Tooltip>
          ))}
        </div>

        <Card className="p-3.5">
          <Tooltip content={t('tools.usage.hint')} className="block">
            <div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{t('tools.usage.title')}</span><span className="font-semibold tabular-nums" data-testid="grid-risk-usage-pct">{fmt.number(r.usagePct, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usage)}>
              <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${usage}%` }} data-testid="grid-risk-usage-bar" />
            </div>
          </Tooltip>
          <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-muted-foreground tabular-nums"><span>{t('tools.usage.load', { value: money(r.last.load) })}</span><span>{t('tools.usage.rest', { value: money(r.last.remaining) })}</span></div>
        </Card>

        {renderCurve(r.levels, val('capital'), tone.stroke)}
        {renderTable(r.levels)}
      </>
    );
  }

  function renderCurve(levels: GridLevel[], capital: number, stroke: string) {
    const W = 800, H = 200, L = 52, R = 10, T = 14, B = 24;
    const max = Math.max(capital * 1.25, levels[levels.length - 1].load * 1.1, 1);
    const x = (i: number) => L + (levels.length > 1 ? (i / (levels.length - 1)) * (W - L - R) : 0);
    const y = (v: number) => T + (H - T - B) * (1 - Math.max(0, v) / max);
    const stepN = Math.max(1, Math.ceil(levels.length / 300));
    const pts = levels.filter((_, i) => i % stepN === 0 || i === levels.length - 1).map((l) => `${x(l.index - 1)},${y(l.load)}`);
    const first = levels[0], last = levels[levels.length - 1];
    return (
      <Card className="p-3.5">
        <Tooltip content={t('tools.curve.hint')} className="block">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold">{t('tools.curve.title')}</h3>
            <span className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className={cn('h-0.5 w-3', STATUS_TONE[result.ok ? result.status : 'safe'].bar)} />{t('tools.curve.load')}</span>
              <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-muted-foreground" />{t('tools.curve.capital')}</span>
            </span>
          </div>
        </Tooltip>
        <svg role="img" aria-label={t('tools.curve.alt', { from: price(first.price), to: price(last.price), start: money(first.load), end: money(last.load), capital: money(capital) })} viewBox={`0 0 ${W} ${H}`} width="100%" height={200} preserveAspectRatio="none" className="mt-2 block">
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={L} x2={W - R} y1={y(capital)} y2={y(capital)} className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
          <polyline points={pts.join(' ')} fill="none" className={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums"><span>{price(first.price)}</span><span>{t('tools.curve.capital')} {money(capital)}</span><span>{price(last.price)}</span></div>
      </Card>
    );
  }

  function renderTable(levels: GridLevel[]) {
    const cols: { k: MessageKey; left?: boolean }[] = [
      { k: 'tools.col.n', left: true }, { k: 'tools.col.price' }, { k: 'tools.col.open' }, { k: 'tools.col.lots' }, { k: 'tools.col.loss' },
      { k: 'tools.col.swap' }, { k: 'tools.col.margin' }, { k: 'tools.col.load' }, { k: 'tools.col.rest' }, { k: 'tools.col.level' }, { k: 'tools.col.status', left: true },
    ];
    return (
      <Card className="overflow-hidden" data-testid="grid-risk-table">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-3">
          <Tooltip content={t('tools.table.hint')}><h3 className="text-[13px] font-semibold">{t('tools.table.title')}</h3></Tooltip>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t('tools.table.count', { count: fmt.number(levels.length) })}</span>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>{cols.map((c) => <th key={c.k} className={cn('whitespace-nowrap px-3.5 py-2 font-medium', c.left ? 'text-left' : 'text-right')}>{t(c.k)}</th>)}</tr>
            </thead>
            <tbody>
              {levels.map((l) => {
                const s = STATUS_TONE[l.status];
                const Icon = s.Icon;
                return (
                  <tr key={l.index} className={cn('border-t border-border/60 text-right', l.status !== 'safe' && (l.status === 'stopOut' ? 'bg-danger/[0.05]' : 'bg-warning/[0.05]'))}>
                    <td className="px-3.5 py-2 text-left text-muted-foreground">{l.index}</td>
                    <td className="px-3.5 py-2">{price(l.price)}</td>
                    <td className="px-3.5 py-2">{l.openPositions}</td>
                    <td className="px-3.5 py-2">{fmt.number(l.totalLots, { maximumFractionDigits: 4 })}</td>
                    <td className={cn('px-3.5 py-2', l.loss > 0 && 'text-danger')}>{money(-l.loss)}</td>
                    <td className={cn('px-3.5 py-2', l.swap > 0 && 'text-success', l.swap < 0 && 'text-danger')}>{money(l.swap, true)}</td>
                    <td className="px-3.5 py-2">{money(l.margin)}</td>
                    <td className="px-3.5 py-2 font-semibold">{money(l.load)}</td>
                    <td className="px-3.5 py-2">{money(l.remaining)}</td>
                    <td className="px-3.5 py-2">{l.marginLevel == null ? '—' : `${fmt.number(l.marginLevel, { maximumFractionDigits: 0 })}%`}</td>
                    <td className="px-3.5 py-2 text-left"><span className={cn('inline-flex items-center gap-1', s.text)}><Icon size={12} />{t(STATUS_KEY[l.status])}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
}
