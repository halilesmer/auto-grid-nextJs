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

/*
 * Taşınabilir araç grupları (UI-16, 1105-A5.8). Yerleşim tarayıcı başına saklanır (useChartWorkspaceStore.toolbarLayout).
 * Kayıt olmayan grup "oto"dur: geniş kapta üst şeritte, dar kapta alt şeritte, yani bugünkü gibi.
 * Serbest konum grafik alanının oranıdır (0–1), piksel değildir; çizimde kenarlara yaslanır, sığmazsa alt şeride düşer.
 * Düşme yalnız çizimdedir: kayıt değişmez, pencere büyüyünce grup yerine döner.
 */
export const TOOLBAR_GROUPS = ['view', 'indicators', 'edit', 'window'] as const;
export type ToolbarGroupId = typeof TOOLBAR_GROUPS[number];
export type GroupPlacement = { zone: 'top' | 'bottom' } | { zone: 'free'; x: number; y: number };
export type ToolbarLayout = Partial<Record<ToolbarGroupId, GroupPlacement>>;
export interface Box { width: number; height: number }
/** Serbest grubun grafik alanı: kabın ölçüsü ve kenar payları (sol çizim çubuğu, sağ fiyat ekseni). */
export interface FreeArea extends Box { left: number; right: number; top: number; bottom: number }

const ratio = (v: number) => Math.max(0, Math.min(1, v));
export function parseToolbarLayout(value: unknown): ToolbarLayout {
  const out: ToolbarLayout = {};
  if (!value || typeof value !== 'object') return out;
  for (const id of TOOLBAR_GROUPS) {
    const p = (value as Record<string, unknown>)[id] as Partial<{ zone: string; x: unknown; y: unknown }> | undefined;
    if (!p || typeof p !== 'object') continue;
    if (p.zone === 'top' || p.zone === 'bottom') out[id] = { zone: p.zone };
    else if (p.zone === 'free' && typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)) out[id] = { zone: 'free', x: ratio(p.x), y: ratio(p.y) };
  }
  return out;
}
/** Serbest grubun sol üst köşesi (kap pikseli); grup alana sığmıyorsa null (alt şeride düşer). */
export function placeFree(p: { x: number; y: number }, size: Box, area: FreeArea): { left: number; top: number } | null {
  const maxLeft = area.width - area.right - size.width, maxTop = area.height - area.bottom - size.height;
  if (size.width <= 0 || maxLeft < area.left || maxTop < area.top) return null;
  return {
    left: Math.round(Math.min(maxLeft, Math.max(area.left, p.x * area.width))),
    top: Math.round(Math.min(maxTop, Math.max(area.top, p.y * area.height))),
  };
}
/** Bırakılan ya da kaydırılan konumu (kap pikseli) orana çevirir. */
export function toRatio(left: number, top: number, area: Box): { x: number; y: number } {
  return { x: area.width > 0 ? ratio(left / area.width) : 0, y: area.height > 0 ? ratio(top / area.height) : 0 };
}
/** Ok tuşu adımı: alanın %3'ü, Shift ile %10. */
export const nudgeStep = (shift: boolean) => (shift ? 0.1 : 0.03);
