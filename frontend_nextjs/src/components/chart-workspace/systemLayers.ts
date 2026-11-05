import { orderPanes, presentPanes, SYSTEM_PANE_IDS, type SystemPaneId } from '@/lib/chart-workspace/paneOrder';
import { emptyChartDocument, useChartWorkspaceStore, type ChartDocument } from '@/store/useChartWorkspaceStore';

/**
 * A system layer (RSI(7), Wave 5/35) on or off in a chart document. Off: the pane is gone and takes no room. On: the pane comes back
 * at the bottom, like a new indicator, so the saved order gets the layer at its end. Hiding with the eye is a different state (`systemPanes`).
 */
export function applySystemLayer(doc: ChartDocument, id: SystemPaneId, on: boolean): ChartDocument {
  const next: ChartDocument = { ...doc, overlays: { ...doc.overlays, [id]: on } };
  if (!on || (doc.overlays[id] ?? true)) return next;
  const others = SYSTEM_PANE_IDS.filter(other => other !== id && (doc.overlays[other] ?? true));
  return { ...next, paneOrder: [...orderPanes(doc.paneOrder, presentPanes(doc.indicators, others)), id] };
}

export function setSystemLayer(contextKey: string, id: SystemPaneId, on: boolean) {
  const state = useChartWorkspaceStore.getState();
  state.setDocument(contextKey, applySystemLayer(state.documents[contextKey] ?? emptyChartDocument(), id, on));
}
