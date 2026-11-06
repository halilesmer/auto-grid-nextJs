'use client';

import { useMemo, type ReactNode } from 'react';
import { ChartCore, type ChartCoreProps, type ChartScene } from '@/components/analysis/chart/ChartCore';
import { useChartOverlays } from '@/components/chart-workspace/ContextOverlays';
import type { WorkspaceContext } from '@/components/chart-workspace/ChartWorkspace';
import { wave } from '@/lib/formation/indicators';
import type { Bar, Timeframe } from '@/lib/analysis/candles';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { LayersMenu } from './LayersMenu';

/** Was ChartView selbst setzt: die gemeinsamen Ebenen und das Layout der Chartseiten */
type OwnProps = 'workspace' | 'systemWave' | 'overlayLayout' | 'workspaceOverlays' | 'renderOverlay' | 'marginsFor' | 'showPauses' | 'showGaps';

export interface ChartViewProps extends Omit<ChartCoreProps, OwnProps> {
  workspace: WorkspaceContext;
  /** Geschlossene Kerzen, aus denen Wave 5/35 rechnet; ohne laufende Kerze */
  signalBars: readonly Bar[];
  /** Zeitrahmen des Charts: der Schalter Trendzug im Menü „Ebenen“ gilt nur, wo es einen Trendzug gibt */
  timeframe: Timeframe;
  /** Schalter des Modus im Menü „Ebenen“, unter den gemeinsamen Ebenen; `modeTitle` ist ihre Überschrift */
  modeLayers?: ReactNode;
  modeTitle?: string;
  /** Zeichenfläche des Modus über dem Chart (z. B. die Formationszeichnung) */
  renderOverlay?: (scene: ChartScene) => ReactNode;
  /** Einstellungen des Modus im Abschnitt „Auto Grid katmanları“ der Chart-Einstellungen (z. B. Tabelle der Formationslinien) */
  modeSettings?: ReactNode;
}

/**
 * Ab lg liegt die Bedienung oben auf dem Chart (ChartPage): die Kerzen beginnen darunter. Darunter steht die Kopfleiste über dem
 * Chart, und nur die Legende braucht oben Platz.
 */
const controlMargins = () => ({ top: window.matchMedia('(min-width: 64rem)').matches ? 0.3 : 0.1, bottom: 0.12 });

function seriesPoints(bars: readonly Bar[], values: (number | null)[]) {
  return bars.flatMap((b, i) => {
    const value = values[i];
    return value == null ? [] : [{ time: b.time, value }];
  });
}

/**
 * Die eine Hülle um ChartCore für alle Chartseiten (Plan „Ein Chart im System“, Journal 2026-11-03). Sie trägt die
 * Ebenen, die jeder Chart zeigt: System-RSI(7) und Wave 5/35 aus denselben Kerzen wie der Chart. Der Modus liefert
 * nur seine Daten, seine Schalter und seine Zeichenfläche.
 */
export function ChartView({ signalBars, timeframe, modeLayers, modeTitle, renderOverlay, modeSettings, workspace, toolbarActions, ...core }: ChartViewProps) {
  const overlays = useChartOverlays(workspace.key, { rsi: true, wave: true });
  const showPauses = useAnalysisPrefsStore(s => s.showPauses), showGaps = useAnalysisPrefsStore(s => s.showGaps);
  const wavePoints = useMemo(() => seriesPoints(signalBars, wave(signalBars)), [signalBars]);
  return (
    <ChartCore
      {...core}
      workspace={{ ...workspace, systemRsi: true }}
      showPauses={showPauses}
      showGaps={showGaps}
      toolbarActions={<>{toolbarActions}<LayersMenu contextKey={workspace.key} timeframe={timeframe} rsi={overlays.rsi} wave={overlays.wave} modeTitle={modeTitle}>{modeLayers}</LayersMenu></>}
      systemWave={{ points: wavePoints, visible: overlays.wave }}
      marginsFor={controlMargins}
      overlayLayout
      renderOverlay={renderOverlay}
      workspaceOverlays={modeSettings}
    />
  );
}
