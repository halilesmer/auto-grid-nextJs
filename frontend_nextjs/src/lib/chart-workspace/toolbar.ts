import { OVERLAY_SPECS, type DrawingKind } from 'lightweight-charts-drawing';

export const DRAWING_TOOLS = (Object.keys(OVERLAY_SPECS) as DrawingKind[]).filter(k => !['anchored-vwap', 'fixed-range-volume-profile', 'anchored-volume-profile'].includes(k));
export const TOOL_GROUPS = ['lines', 'fib', 'patterns', 'projections', 'shapes', 'text', 'symbols'] as const;
export type ToolGroup = typeof TOOL_GROUPS[number];
export type CursorMode = 'crosshair' | 'dot' | 'arrow';
export type ChartGesture = 'measure' | 'zoom' | null;
export function toolGroup(kind: DrawingKind): ToolGroup {
  if (/fib|gann/.test(kind)) return 'fib';
  if (/elliott|pattern|cypher|head-and-shoulders/.test(kind)) return 'patterns';
  if (/position|range|info-line|trend-angle|regression|ghost-feed/.test(kind)) return 'projections';
  if (/font-icon|arrow-mark|flag-mark/.test(kind)) return 'symbols';
  if (/text|note|pin|comment|signpost|callout|table|image/.test(kind)) return 'text';
  if (/rectangle|circle|ellipse|triangle|curve|arc|sector|brush|path|polyline|highlighter/.test(kind)) return 'shapes';
  return 'lines';
}
export interface ToolbarPreferences {
  lastTools: Partial<Record<ToolGroup, DrawingKind>>;
  cursor: CursorMode;
  magnetStrength: 'weak' | 'strong';
  locked: boolean;
  indicatorsHidden: boolean;
}
export const defaultToolbar = (): ToolbarPreferences => ({ lastTools: {}, cursor: 'crosshair', magnetStrength: 'weak', locked: false, indicatorsHidden: false });
export function parseToolbar(value: unknown): ToolbarPreferences {
  const out = defaultToolbar();
  if (!value || typeof value !== 'object') return out;
  const v = value as Partial<ToolbarPreferences>;
  if (v.cursor === 'dot' || v.cursor === 'arrow') out.cursor = v.cursor;
  if (v.magnetStrength === 'strong') out.magnetStrength = 'strong';
  out.locked = v.locked === true; out.indicatorsHidden = v.indicatorsHidden === true;
  for (const group of TOOL_GROUPS) {
    const kind = v.lastTools?.[group];
    if (kind && DRAWING_TOOLS.includes(kind) && toolGroup(kind) === group) out.lastTools[group] = kind;
  }
  return out;
}
