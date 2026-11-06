import { SYSTEM_RSI_ID } from '@/lib/chart-workspace/indicators';
import { orderPanes, presentPanes, SYSTEM_PANE_IDS, type SystemPaneId } from '@/lib/chart-workspace/paneOrder';
import { emptyChartDocument, useChartWorkspaceStore, type ChartDocument } from '@/store/useChartWorkspaceStore';

/**
 * A system layer (RSI(7), Wave 5/35) on or off in a chart document. Off: the pane is gone and takes no room. On: the pane comes back
 * at the bottom, like a new indicator, so the saved order gets the layer at its end. Hiding with the eye is a different state (`systemPanes`).
 */
export function applySystemLayer(doc: ChartDocument, id: SystemPaneId | 'rsi', on: boolean): ChartDocument {
  const next: ChartDocument = { ...doc, overlays: { ...doc.overlays, [id]: on } };
  if (!on || (doc.overlays[id] ?? true)) return next;
  const others = SYSTEM_PANE_IDS.filter(other => other !== id && (doc.overlays[other] ?? true));
  // The RSI layer is an ordinary indicator pane (fixed id); it was off, so the other panes are those without it
  const paneId = id === 'rsi' ? SYSTEM_RSI_ID : id;
  const present = presentPanes(doc.indicators.filter(item => item.id !== SYSTEM_RSI_ID), others);
  return { ...next, paneOrder: [...orderPanes(doc.paneOrder, present), paneId] };
}

export function setSystemLayer(contextKey: string, id: SystemPaneId | 'rsi', on: boolean) {
  const state = useChartWorkspaceStore.getState();
  state.setDocument(contextKey, applySystemLayer(state.documents[contextKey] ?? emptyChartDocument(), id, on));
}
