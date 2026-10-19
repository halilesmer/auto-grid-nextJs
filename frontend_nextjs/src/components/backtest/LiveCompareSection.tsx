'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { Switch } from '@/components/ui/switch';
import { useDealsHistory } from '@/hooks/useDealsHistory';
import { useFormat, useT } from '@/i18n';
import { APP_VERSION } from '@/app/version';
import { getApiErrorMessage, isAbortError } from '@/lib/apiError';
import { pairTrades } from '@/lib/analysis/tradePairing';
import {
  buildSymbolRows, DEFAULT_TOLERANCE, flatZone, type CollectedRun, type Report, type ReportSummary, type Tolerance,
} from '@/lib/backtest/liveCompare';
import * as api from '@/services/backtestReportApi';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useBacktestStore } from '@/store/useBacktestStore';
import { useLiveCompareStore } from '@/store/useLiveCompareStore';
import { ReportTable } from './ReportTable';

/** Fertige Läufe der Setups dieses Kontos, die der Vergleich verwenden kann; `skipped`: Läufe, die er nicht verwendet */
function collectable(accountId: string) {
  const { setups, runs } = useBacktestStore.getState();
  const found: CollectedRun[] = [];
  let skipped = 0;
  for (const setup of setups) {
    const run = runs[setup.id];
    if (run?.status !== 'done' || !run.context || !run.results?.[0]) continue;
    const { params } = run.context;
    const magic = (run.context.params.zone as { magic?: unknown }).magic;
    // Nur gespeicherte Zonen des Kontos mit MT5-Kerzen: ein Entwurf oder CSV-Lauf sagt nichts über den Live-Handel
    // Der Einstiegsvergleich zählt M1-Kerzen: gröbere Datenkerzen verteilen den Einstieg innerhalb der Kerze
    if (params.accountId !== accountId || run.context.unsaved || params.source || typeof magic !== 'number'
      || params.dataTimeframe !== 'M1' || found.some((item) => item.magic === magic)) {
      skipped += 1;
      continue;
    }
    const spread = typeof params.symbol.spread === 'number' ? params.symbol.spread : 0;
    found.push({
      magic, symbol: params.symbol.name.toUpperCase().trim(), zone: { ...params.zone }, trades: run.results[0].trades,
      openPositions: run.results[0].summary.openPositions, spreadPrice: spread * params.symbol.point,
      commissionPerLot: params.commissionPerLot,
      form: setup.form, from: params.from, to: params.to, currency: run.context.currency,
    });
  }
  return { found, skipped };
}

function SavedReports({ accountId, reload, onOpen, onDeleted }: {
  accountId: string; reload: number; onOpen: (report: Report) => void; onDeleted: (id: string) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const apiKey = useConnectionStore((s) => s.apiKey);
  const owner = useAuthStore((s) => s.me?.id);
  const scope = `${baseUrl}|${apiKey}|${owner}`;
  const [state, setState] = useState<{ scope: string; items: ReportSummary[]; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.listReports(controller.signal).then((items) => {
      if (!controller.signal.aborted) setState({ scope, items, error: null });
    }).catch(async (err) => {
      if (isAbortError(err)) return;
      const message = await getApiErrorMessage(err, t('backtest.live.failed'));
      if (!controller.signal.aborted) setState({ scope, items: [], error: message });
    });
    return () => controller.abort();
  }, [scope, attempt, reload, t]);

  const ready = state?.scope === scope;
  const items = ready ? state.items : [];
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(await getApiErrorMessage(err, t('backtest.live.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="lc-saved">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('backtest.live.saved.title')}</h3>
        <Button size="sm" variant="ghost" disabled={busy} hint={t('backtest.live.saved.reload.hint')} onClick={() => setAttempt((n) => n + 1)}>
          {t('backtest.live.saved.reload')}
        </Button>
      </div>
      {ready && state.error && <Alert tone="danger" title={state.error} />}
      {error && <Alert tone="danger" title={error} />}
      {ready && !state.error && items.length === 0 && <p className="text-sm text-muted-foreground">{t('backtest.live.saved.empty')}</p>}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 rounded-lg border border-border p-3" data-testid="lc-saved-item">
            <p className="break-words font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {fmt.mt5DateTime(item.periodFrom)} – {fmt.mt5DateTime(item.periodTo)} · {t('backtest.live.saved.passed', { passed: item.passedCount, total: item.symbolCount })} · v{item.workerVersion}
              {item.accountId !== accountId ? ` · ${item.accountId}` : ''}
            </p>
            {item.note && <p className="break-words text-xs">{item.note}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} hint={t('backtest.live.saved.open.hint')}
                onClick={() => void run(async () => onOpen(await api.getReport(item.id)))}>{t('backtest.live.saved.open')}</Button>
              <Button size="sm" variant="danger" disabled={busy} hint={t('backtest.live.saved.delete.hint')} onClick={() => setDeleteTarget(item)}>
                {t('backtest.live.saved.delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmModal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} loading={busy}
        title={t('backtest.live.saved.delete')} message={t('backtest.live.saved.deleteMessage', { name: deleteTarget?.name ?? '' })}
        confirmHint={t('backtest.live.saved.delete.hint')} onConfirm={() => run(async () => {
          if (!deleteTarget) return;
          await api.deleteReport(deleteTarget.id);
          onDeleted(deleteTarget.id);
          setDeleteTarget(null);
          setState((old) => (old ? { ...old, items: old.items.filter((i) => i.id !== deleteTarget.id) } : old));
        })} />
    </div>
  );
}

function OpenedReport({ report, onClose }: { report: Report; onClose: () => void }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <div className="space-y-3 rounded-lg border border-border p-3" data-testid="lc-opened">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold">{report.name}</h3>
          <p className="text-xs text-muted-foreground">
            {fmt.mt5DateTime(report.periodFrom)} – {fmt.mt5DateTime(report.periodTo)} · {t('backtest.live.opened.meta', {
              account: report.accountId, version: report.workerVersion, app: report.appVersion,
            })}
          </p>
        </div>
        <Button size="sm" variant="ghost" hint={t('backtest.live.opened.close.hint')} onClick={onClose}>{t('backtest.live.opened.close')}</Button>
      </div>
      {report.note && <p className="break-words text-sm">{report.note}</p>}
      <p className="text-xs text-muted-foreground" data-testid="lc-opened-tolerance">
        {t('backtest.live.tolerance.used', {
          count: t(report.tolerance.sameTradeCount ? 'backtest.live.on' : 'backtest.live.off'),
          candle: t(report.tolerance.entrySameCandle ? 'backtest.live.on' : 'backtest.live.off'),
          spread: fmt.number(report.tolerance.priceSpreadFactor), profit: fmt.number(report.tolerance.profitPercent),
        })} · {t('backtest.live.opened.zones', { count: report.zones.length })}
      </p>
      {(report.archiveGaps?.length ?? 0) > 0 && (
        <div data-testid="lc-opened-gaps"><Alert tone="warning" title={t('backtest.live.missing', { count: report.archiveGaps?.length ?? 0 })} /></div>
      )}
      <ReportTable rows={report.symbols} currency={report.currency} />
    </div>
  );
}

/**
 * BKT-14: Live-Handel gegen Backtest. Ablauf: Setups der Seite rechnen lassen → „Läufe übernehmen“ → die Live-Trades
 * des Zeitraums kommen aus dem Deal-Archiv → Tabelle je Symbol → Speichern. Gespeicherte Berichte lassen sich öffnen
 * (nur lesen) und löschen. Der Worker rechnet nichts nach, er speichert das Ergebnis des Browsers.
 */
export function LiveCompareSection({ accountId, offsetSec }: { accountId: string; offsetSec: number | null }) {
  const t = useT();
  const fmt = useFormat();
  const storeAccount = useLiveCompareStore((s) => s.accountId);
  const collectedMap = useLiveCompareStore((s) => s.runs);
  const [tolerance, setTolerance] = useState<Tolerance>(DEFAULT_TOLERANCE);
  const [skipped, setSkipped] = useState(0);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [opened, setOpened] = useState<Report | null>(null);
  const creation = useRef<{ fingerprint: string; requestId: string } | null>(null);

  useEffect(() => { useLiveCompareStore.getState().clearUnless(accountId); }, [accountId]);
  const collected = useMemo(() => (storeAccount === accountId ? Object.values(collectedMap) : []), [storeAccount, accountId, collectedMap]);
  const periods = new Set(collected.map((run) => `${run.from}|${run.to}`));
  const mixedPeriod = periods.size > 1;
  // Der Bericht hält eine Lauf-Einstellung: unterschiedliche Formulare ließen sich nicht richtig dokumentieren
  const mixedForm = new Set(collected.map((run) => JSON.stringify(run.form))).size > 1;
  const period = collected.length > 0 && !mixedPeriod ? { from: collected[0].from, to: collected[0].to } : null;
  const deals = useDealsHistory(period ? { accountId, ...period } : null, false);

  const live = useMemo(() => {
    if (!deals.data) return null;
    const result = pairTrades(deals.data.deals, deals.data.zones, offsetSec);
    return { trades: result.trades, entries: result.entries };
  }, [deals.data, offsetSec]);
  const rows = useMemo(() => (live ? buildSymbolRows(collected, live, tolerance) : null), [live, collected, tolerance]);
  const currency = collected[0]?.currency ?? null;
  const canSave = Boolean(rows && period && name.trim() && name.trim().length <= 80 && !mixedPeriod && !mixedForm);

  const collect = () => {
    const { found, skipped: ignored } = collectable(accountId);
    useLiveCompareStore.getState().collect(accountId, found);
    setSkipped(ignored);
    setSaved(false);
  };

  const save = async () => {
    if (!rows || !period || !canSave || saving) return;
    const content = {
      appVersion: APP_VERSION, currency, tolerance, run: { ...collected[0].form, csvImportId: null },
      zones: collected.map((run) => flatZone(run.zone)), symbols: rows,
      archiveGaps: (deals.data?.missing ?? []).map((gap) => ({ start: gap.from, end: gap.to, reason: gap.reason.slice(0, 40) })),
    };
    const fingerprint = JSON.stringify({ accountId, name: name.trim(), note, period, content });
    if (creation.current?.fingerprint !== fingerprint) creation.current = { fingerprint, requestId: crypto.randomUUID() };
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveReport({
        ...content, requestId: creation.current.requestId, name: name.trim(), note, accountId, periodFrom: period.from, periodTo: period.to,
      });
      setSaved(true);
      setName('');
      setNote('');
      setReload((n) => n + 1);
    } catch (error) {
      setSaveError(await getApiErrorMessage(error, t('backtest.live.failed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4" data-testid="bt-live">
      <div>
        <h2 className="text-lg font-semibold">{t('backtest.live.title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('backtest.live.intro')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="lc-tolerance">
        <Switch label={t('backtest.live.tol.count')} hint={t('backtest.live.tol.count.hint')} checked={tolerance.sameTradeCount}
          onChange={(sameTradeCount) => setTolerance({ ...tolerance, sameTradeCount })} />
        <Switch label={t('backtest.live.tol.candle')} hint={t('backtest.live.tol.candle.hint')} checked={tolerance.entrySameCandle}
          onChange={(entrySameCandle) => setTolerance({ ...tolerance, entrySameCandle })} />
        <InputField label={t('backtest.live.tol.spread')} hint={t('backtest.live.tol.spread.hint')}>
          <NumberInput className="input-s" min={0} max={100} step={0.1} maxDecimals={2} value={tolerance.priceSpreadFactor}
            onChange={(e) => setTolerance({ ...tolerance, priceSpreadFactor: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
        </InputField>
        <InputField label={t('backtest.live.tol.profit')} hint={t('backtest.live.tol.profit.hint')}>
          <NumberInput className="input-s" min={0} max={1000} step={1} maxDecimals={2} value={tolerance.profitPercent}
            onChange={(e) => setTolerance({ ...tolerance, profitPercent: Math.min(1000, Math.max(0, Number(e.target.value) || 0)) })} />
        </InputField>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" hint={t('backtest.live.collect.hint')} onClick={collect} data-testid="lc-collect">{t('backtest.live.collect')}</Button>
        {collected.length > 0 && (
          <Button variant="ghost" hint={t('backtest.live.clear.hint')} onClick={() => collected.forEach((run) => useLiveCompareStore.getState().remove(run.magic))}>
            {t('backtest.live.clear')}
          </Button>
        )}
      </div>
      {skipped > 0 && <Alert tone="warning" title={t('backtest.live.skipped', { count: skipped })} />}
      {collected.length === 0 && <p className="text-sm text-muted-foreground" data-testid="lc-none">{t('backtest.live.none')}</p>}
      {collected.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="lc-collected">
          {collected.map((run) => (
            <li key={run.magic} className="rounded-md border border-border px-2 py-1 text-xs" data-magic={run.magic}>
              {run.symbol} · {run.magic} · {t('backtest.live.collected.trades', { count: run.trades.length })}
            </li>
          ))}
        </ul>
      )}
      {mixedPeriod && <Alert tone="warning" title={t('backtest.live.mixed')} />}
      {mixedForm && <Alert tone="warning" title={t('backtest.live.mixedForm')} />}
      {period && <p className="text-xs text-muted-foreground">{t('backtest.live.period', { from: fmt.mt5DateTime(period.from), to: fmt.mt5DateTime(period.to) })}</p>}
      {period && deals.loading && <p className="text-sm text-muted-foreground">{t('backtest.live.loading')}</p>}
      {deals.error && <Alert tone="danger" title={deals.error} />}
      {deals.data && deals.data.missing.length > 0 && <Alert tone="warning" title={t('backtest.live.missing', { count: deals.data.missing.length })} />}
      {rows && <ReportTable rows={rows} currency={currency} />}

      {rows && (
        <div className="space-y-3 rounded-lg border border-border p-3" data-testid="lc-save">
          <InputField label={t('backtest.live.name')} hint={t('backtest.live.name.hint')}>
            <input className="input-s" value={name} maxLength={80} disabled={saving} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </InputField>
          <InputField label={t('backtest.live.note')} hint={t('backtest.live.note.hint')}>
            <textarea className="input-s min-h-16" value={note} maxLength={1000} disabled={saving} onChange={(e) => setNote(e.target.value)} />
          </InputField>
          <Button variant="primary" loading={saving} disabled={!canSave} hint={t(canSave ? 'backtest.live.save.hint' : 'backtest.live.save.off.hint')}
            onClick={() => void save()} data-testid="lc-save-button">{t('backtest.live.save')}</Button>
          {saved && <Alert tone="info" title={t('backtest.live.saved.ok')} />}
          {saveError && <Alert tone="danger" title={saveError} />}
        </div>
      )}

      {opened && <OpenedReport report={opened} onClose={() => setOpened(null)} />}
      <SavedReports accountId={accountId} reload={reload} onOpen={setOpened}
        onDeleted={(id) => setOpened((old) => (old?.id === id ? null : old))} />
    </section>
  );
}
