'use client';

import { useMemo } from 'react';
import { TIMEFRAME_SEC, type Bar } from '@/lib/analysis/candles';
import { useT } from '@/i18n';
import { formationChartData } from '@/lib/formation/chartData';
import type { FormationBar } from '@/lib/formation/types';
import type { FormationContext } from '@/lib/formation/context';
import { drawingPriceRange } from '@/lib/formation/drawingLayout';
import { FINAL_POINT, type ScanHit } from '@/lib/formation/scan';
import type { ChartPicture } from '@/lib/formation/shotImage';
import type { OverlayLine } from '@/components/analysis/chart/ChartCore';
import { ChartView } from '@/components/chart-page/ChartView';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { isSystemRsi, matchesFormationRsi } from '@/lib/chart-workspace/indicators';
import { RSI_PARAMS } from '@/lib/formation/params';
import { useConnectionStore } from '@/store/useConnectionStore';
import { FormationDrawingsToggle } from '@/components/chart-workspace/FormationDrawingsToggle';
import { useChartOverlays } from '@/components/chart-workspace/ContextOverlays';
import { workspaceKey } from '@/lib/chart-workspace/settings';
import { TrendToggle } from '@/components/chart-workspace/TrendToggle';
import { buildTrendPath, usableTrendSettings } from '@/lib/formation/trdPath';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { FormationLayer } from './FormationLayer';
import { FormationLineTable } from './FormationLineTable';

interface Props {
  accountId: string;
  hit: ScanHit;
  context: FormationContext;
  scanAt: number;
  /** Laufende Kerze mit dem aktuellen Preis, nur zur Anzeige: Suche, RSI und Zeichnungen enden an der letzten geschlossenen Kerze */
  running: Bar | null;
  /** Stand in der Vergangenheit (FRM-38): gestrichelte Linie „Stand“ am Ende der Kerzen */
  asOf?: boolean;
  digits: number | null;
  /** Hervorgehobene Zeichnungen (Hover auf Zeile oder Zeichnung); null: alle gleich */
  active: readonly string[] | null;
  onActive: (ids: string[] | null) => void;
  /** Meldet die Aufnahme des gezeigten Charts (Kerzen samt Zeichnungen) oder null, wenn der Chart abgebaut wird */
  onCapture: (capture: (() => Promise<ChartPicture>) | null) => void;
  /** Unterkante des Kerzen-Bereichs in px ab Oberkante des Charts; die Legende bleibt darüber */
  onPriceBottom: (px: number) => void;
  /** Alle Treffer des Zeitrahmens: ihr erwartetes D erscheint als Abzeichen (A5.6.1); der gewählte Treffer wird voll gezeichnet */
  others?: readonly ScanHit[];
  /** Klick auf ein Abzeichen wählt die Formation */
  onSelectHit?: (hit: ScanHit) => void;
}

const NO_LINES: OverlayLine[] = [];
const NO_BARS: FormationBar[] = [];
const NO_TREND = { segments: [], axis: [] };

/** Kerzen und RSI(7) des gewählten Kandidaten mit den Zeichnungen der Erkennung. */
export function FormationChart({ accountId, hit, context, scanAt, running, asOf, digits, active, onActive, onCapture, onPriceBottom, others, onSelectHit }: Props) {
  const t = useT();
  const source = useConnectionStore(s => s.baseUrl);
  const contextKey = workspaceKey({ source, view: 'formation', account: accountId, symbol: context.symbol });
  const overlays = useChartOverlays(contextKey, { formations: true, rsi: true, wave: true });
  // The formation rules read RSI(7) on close of the chart timeframe: with other settings the RSI pane shows other numbers, so its drawings are hidden
  const rsiMatches = useChartWorkspaceStore(s => {
    const config = s.documents[contextKey]?.indicators.find(isSystemRsi);
    return !config || matchesFormationRsi(config, TIMEFRAME_SEC[hit.tf], RSI_PARAMS.period);
  });
  const view = useMemo(() => context.view(hit.tf, scanAt), [context, hit.tf, scanAt]);
  const bars = view?.bars ?? NO_BARS;
  // Pausen und Datenlücken wie auf /chart (formationChartData)
  const data = useMemo(() => formationChartData(view, TIMEFRAME_SEC[hit.tf]), [view, hit.tf]);
  // Trendzug wie auf /chart (ANA-21), aber aus den Kerzen der Formation: nur geschlossene bis scanAt, ohne laufende Kerze
  const showTrend = useAnalysisPrefsStore(s => s.showTrend);
  const trendSettings = useAnalysisPrefsStore(s => s.trendDraft);
  const trendPath = useMemo(
    () => (showTrend && bars.length > 0 ? { segments: buildTrendPath(hit.tf, bars, usableTrendSettings(trendSettings)), axis: bars.map(b => b.time) } : NO_TREND),
    [showTrend, bars, hit.tf, trendSettings],
  );
  const atr = useMemo(() => [...(view?.atr ?? [])].reverse().find((v): v is number => v !== null && v > 0) ?? null, [view]);
  const priceRange = useMemo(() => drawingPriceRange(hit.candidate), [hit.candidate]);
  const finalName = FINAL_POINT[hit.form];
  return (
    <ChartView
      key={contextKey}
      workspace={{ key: contextKey, symbol: context.symbol, view: 'formation', systemRsi: true, systemWave: true, syncIdentity: { source, account: accountId, symbol: context.symbol } }}
      signalBars={bars}
      timeframe={hit.tf}
      modeTitle={t('cw.layers.formation')}
      viewActions={<FormationDrawingsToggle contextKey={contextKey} visible={overlays.formations} />}
      data={data}
      timeframeSec={TIMEFRAME_SEC[hit.tf]}
      digits={digits}
      viewKey={`${contextKey}|${hit.tf}`}
      band={null}
      modeSettings={<FormationLineTable />}
      lines={NO_LINES}
      live={null}
      until={scanAt}
      runningBar={running}
      priceRange={priceRange}
      trendPath={trendPath}
      toolbarActions={<TrendToggle timeframe={hit.tf} size="xs" />}
      surfaceProps={{ 'data-testid': 'formation-chart', 'data-final-point': hit.candidate.points[finalName] ? 'done' : 'open' }}
      renderOverlay={(scene) => <FormationLayer scene={scene} hit={hit} bars={bars} points={data.points} running={running} asOf={asOf} active={active} onActive={onActive} onCapture={onCapture} onPriceBottom={onPriceBottom} visible={overlays.formations} rsiVisible={overlays.rsi && rsiMatches} waveVisible={overlays.wave} others={others} onSelectHit={onSelectHit} atr={atr} />}
    />
  );
}
