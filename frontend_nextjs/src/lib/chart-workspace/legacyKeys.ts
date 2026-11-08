import type { ChartDocument } from '@/store/useChartWorkspaceStore';
import { workspaceKey } from './settings';

/**
 * One storage key for the one chart (plan 1107-A21.6). The chart used three keys per product: Free (`analysis`, mode `free`),
 * Setup (`analysis`, mode `setup`) and Formation (`formation`). The new key is `chart`. On the first open the drawings of the old
 * keys merge into it; the old keys stay as they are.
 */
export const CHART_VIEW = 'chart';

export function chartWorkspaceKey(context: { source: string; account: string; symbol: string }): string {
  return workspaceKey({ ...context, view: CHART_VIEW });
}

/** The old keys of a product, in the order of the indicator rule: Free, Setup, Formation. The symbol may be upper case (Setup) or the broker name (Free) */
export function legacyWorkspaceKeys(context: { source: string; account: string; symbol: string }): string[] {
  const names = [...new Set([context.symbol, context.symbol.toUpperCase()])];
  return names.flatMap((symbol) => [
    workspaceKey({ ...context, symbol, view: 'analysis', mode: 'free' }),
    workspaceKey({ ...context, symbol, view: 'analysis', mode: 'setup' }),
    workspaceKey({ ...context, symbol, view: 'formation' }),
  ]).sort((a, b) => rank(a) - rank(b));
}

const rank = (key: string): number => {
  try {
    const [, view, mode] = JSON.parse(key) as [string, string, string];
    if (view === 'analysis' && mode === 'free') return 0;
    if (view === 'analysis') return 1;
    return 2;
  } catch {
    return 3;
  }
};

function drawingsOf(doc: ChartDocument): { id?: unknown }[] {
  try {
    const parsed: unknown = JSON.parse(doc.drawings);
    return Array.isArray(parsed) ? (parsed as { id?: unknown }[]) : [];
  } catch {
    return [];
  }
}

const hasData = (doc: ChartDocument) => doc.indicators.length > 0 || Object.keys(doc.overlays).length > 0 || doc.alarms.length > 0 || doc.appearance !== undefined || doc.paneOrder !== undefined || doc.systemPanes !== undefined;

/**
 * The new document from the old ones (given in the order Free, Setup, Formation). Drawings and images merge, one copy per drawing id
 * (the first copy stays). The indicator settings (indicators, layers, alarms, look, pane order) come from the first document that has any.
 * `visibleTime` is not taken over: the chart aligns its view by itself. Returns null when no old document exists.
 */
export function mergeLegacyDocuments(docs: readonly ChartDocument[]): ChartDocument | null {
  if (docs.length === 0) return null;
  const seen = new Set<unknown>();
  const drawings: { id?: unknown }[] = [];
  for (const doc of docs) {
    for (const drawing of drawingsOf(doc)) {
      if (drawing && typeof drawing === 'object' && 'id' in drawing && drawing.id !== undefined) {
        if (seen.has(drawing.id)) continue;
        seen.add(drawing.id);
      }
      drawings.push(drawing);
    }
  }
  const source = docs.find(hasData) ?? docs[0];
  const images = Object.assign({}, ...[...docs].reverse().map((doc) => doc.images));
  return {
    drawings: JSON.stringify(drawings),
    indicators: source.indicators,
    images,
    overlays: source.overlays,
    alarms: source.alarms,
    ...(source.appearance === undefined ? {} : { appearance: source.appearance }),
    ...(source.paneOrder === undefined ? {} : { paneOrder: source.paneOrder }),
    ...(source.systemPanes === undefined ? {} : { systemPanes: source.systemPanes }),
  };
}

/**
 * The shared drawing set (`@linked:…`, `links` of the store) for the new key (plan 1107-A21.16). The first old key that has a link wins
 * (order Free, Setup, Formation). An existing link of the new key stays: this returns null then, and also when no old key has one.
 */
export function legacyLinkFor(links: Readonly<Record<string, string>>, newKey: string, oldKeys: readonly string[]): string | null {
  if (links[newKey]) return null;
  for (const key of oldKeys) if (links[key]) return links[key];
  return null;
}

/**
 * The own documents of the old keys for the merge. A key with a link keeps its live drawings in the shared set; its own copy is the state
 * from the time of linking and would bring back deleted drawings. So its own drawings are dropped here (the shared set is joined by `setLinked`).
 */
export function legacyDocumentsForMerge(documents: Readonly<Record<string, ChartDocument>>, links: Readonly<Record<string, string>>, oldKeys: readonly string[]): ChartDocument[] {
  return oldKeys.flatMap((key) => (documents[key] ? [links[key] ? { ...documents[key], drawings: '[]' } : documents[key]] : []));
}
