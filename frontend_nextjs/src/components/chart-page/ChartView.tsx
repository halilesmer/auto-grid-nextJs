'use client';

import { useMemo, type ReactNode } from 'react';
import { ChartCore, type ChartCoreProps, type ChartScene } from '@/components/analysis/chart/ChartCore';
import { ContextOverlays, useChartOverlays } from '@/components/chart-workspace/ContextOverlays';
import type { WorkspaceContext } from '@/components/chart-workspace/ChartWorkspace';
import { type Bar } from '@/lib/analysis/candles';
import { rsi, wave } from '@/lib/formation/indicators';
import { RSI_PARAMS } from '@/lib/formation/params';

/** Was ChartView selbst setzt: die gemeinsamen Ebenen und das Layout der Chartseiten */
type OwnProps = 'workspace' | 'systemRsi' | 'systemWave' | 'overlayLayout' | 'workspaceOverlays' | 'renderOverlay' | 'marginsFor';

export interface ChartViewProps extends Omit<ChartCoreProps, OwnProps> {
  workspace: WorkspaceContext;
  /** Geschlossene Kerzen, aus denen System-RSI(7) und Wave 5/35 rechnen; ohne laufende Kerze */
  signalBars: readonly Bar[];
  /** Schalter des Modus im Dialog „Anzeige“, unter den gemeinsamen Ebenen */
  modeOverlays?: ReactNode;
  /** Zeichenfläche des Modus über dem Chart (z. B. die Formationszeichnung) */
  renderOverlay?: (scene: ChartScene) => ReactNode;
}

const RSI_LEVELS = [RSI_PARAMS.overbought, RSI_PARAMS.oversold];
/**
 * Ab lg liegt die Bedienung oben auf dem Chart (ChartPage): die Kerzen beginnen darunter. Darunter steht die Kopfleiste über dem
 * Chart, und nur die Legende braucht oben Platz.
 */
const controlMargins = () => ({ top: window.matchMedia('(min-width: 64rem)').matches ? 0.3 : 0.1, bottom: 0.12 });

const OPTIONS = [
  { key: 'rsi', label: 'cw.layerRsi', hint: 'cw.layerRsi.hint' },
  { key: 'wave', label: 'cw.layerWave', hint: 'cw.layerWave.hint' },
] as const;

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
export function ChartView({ signalBars, modeOverlays, renderOverlay, workspace, ...core }: ChartViewProps) {
  const overlays = useChartOverlays(workspace.key, { rsi: true, wave: true });
  const rsiPoints = useMemo(() => seriesPoints(signalBars, rsi(signalBars)), [signalBars]);
  const wavePoints = useMemo(() => seriesPoints(signalBars, wave(signalBars)), [signalBars]);
  return (
    <ChartCore
      {...core}
      workspace={workspace}
      workspaceOverlays={<div className="grid gap-4"><ContextOverlays contextKey={workspace.key} values={overlays} options={[...OPTIONS]} />{modeOverlays}</div>}
      systemRsi={{ points: rsiPoints, levels: RSI_LEVELS, visible: overlays.rsi }}
      systemWave={{ points: wavePoints, visible: overlays.wave }}
      marginsFor={controlMargins}
      overlayLayout
      renderOverlay={renderOverlay}
    />
  );
}
