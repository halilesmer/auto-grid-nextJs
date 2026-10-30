'use client';

import type { ReactNode } from 'react';
import { Activity, ArrowDown, ArrowUp, ArrowUpRight, Brush, ChartNoAxesCombined, ChevronRight, Circle, Crosshair, Eye, Image, Link, LockKeyhole, Magnet, Maximize, Minus, MousePointer2, Pencil, Plus, RectangleHorizontal, Ruler, Smile, Square, Star, TextCursor, Trash2, Triangle, Type, UnlockKeyhole, Waves, type LucideIcon } from 'lucide-react';
import { OVERLAY_SPECS, type DrawingKind, type MagnetMode } from 'lightweight-charts-drawing';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem, useDropdownClose } from '@/components/ui/dropdown-menu';
import { useT, type MessageKey } from '@/i18n';
import { DRAWING_TOOLS, TOOL_GROUPS, toolGroup, type ChartGesture, type CursorMode, type ToolbarPreferences, type ToolGroup } from '@/lib/chart-workspace/toolbar';

const DEFAULT_TOOL: Record<ToolGroup, DrawingKind> = { lines: 'trend-line', fib: 'fib-retracement', patterns: 'xabcd-pattern', projections: 'long-position', shapes: 'brush', text: 'text', symbols: 'font-icon' };
const GROUP_ICON: Record<ToolGroup, LucideIcon> = { lines: ArrowUpRight, fib: ChartNoAxesCombined, patterns: Activity, projections: RectangleHorizontal, shapes: Brush, text: Type, symbols: Smile };
export function ToolIcon({ kind }: { kind: DrawingKind }) {
  const group = toolGroup(kind);
  let path: string | null = null;
  let nodes: [number, number][] = [];
  if (kind === 'trend-line' || kind === 'ray' || kind === 'extended-line') { path = 'M4 20 20 4'; nodes = [[4, 20], [20, 4]]; }
  if (/channel|pitchfork|pitchfan/.test(kind)) path = 'M3 18 16 5M7 22 20 9M3 10 10 3';
  if (group === 'fib') {
    path = 'M3 4h18M3 10h18M3 16h18M3 22h18';
    if (/fan/.test(kind)) path = 'M3 21 21 3M3 21 21 10M3 21h18M3 21 14 3';
    if (/box|square/.test(kind)) path = 'M3 3h18v18H3zM3 3 21 21M3 21 21 3M3 12h18M12 3v18';
    if (/circle|arc|spiral/.test(kind)) path = 'M3 21a18 18 0 0 1 18-18M3 21A12 12 0 0 1 15 9M3 21a6 6 0 0 1 6-6';
    if (/retracement/.test(kind)) nodes = [[21, 10], [3, 22]];
  }
  if (group === 'patterns') { path = 'M4 21 7 4 12 12 19 5 22 19 12 12 4 21'; nodes = [[4,21],[7,4],[12,12],[19,5],[22,19]]; }
  if (group === 'projections') path = 'M3 4h18M3 15h18M3 21h18M10 7v5h4';
  if (path) return <svg width="24" height="24" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-tool-icon={kind}><path d={path} />{nodes.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.8" className="fill-card" />)}</svg>;
  let Icon: LucideIcon = GROUP_ICON[group];
  if (/horizontal/.test(kind)) Icon = Minus;
  if (/vertical/.test(kind)) Icon = TextCursor;
  if (/rectangle|box|square/.test(kind)) Icon = Square;
  if (/circle|ellipse/.test(kind)) Icon = Circle;
  if (/triangle/.test(kind)) Icon = Triangle;
  if (/elliott|sine/.test(kind)) Icon = Waves;
  if (/arrow-mark-up/.test(kind)) Icon = ArrowUp;
  if (/arrow-mark-down/.test(kind)) Icon = ArrowDown;
  if (kind === 'image') Icon = Image;
  return <Icon size={22} strokeWidth={1.5} data-tool-icon={kind} />;
}
const toolKey = (kind: DrawingKind) => `cw.tool.${kind}` as MessageKey;
const GROUP_KEY: Record<ToolGroup, MessageKey> = { lines: 'cw.rail.lines', fib: 'cw.rail.fib', patterns: 'cw.rail.patterns', projections: 'cw.rail.projections', shapes: 'cw.rail.shapes', text: 'cw.rail.text', symbols: 'cw.rail.symbols' };
interface Props {
  tool: DrawingKind | null; gesture: ChartGesture; preferences: ToolbarPreferences; magnet: MagnetMode; keepDrawing: boolean; drawingsVisible: boolean;
  favorites: string[]; linked: boolean; linkAvailable: boolean; selected: boolean; canResetZoom: boolean;
  arm: (kind: DrawingKind | null, glyph?: string) => void;
  setGesture: (mode: ChartGesture) => void; resetZoom: () => void;
  setPreferences: (patch: Partial<ToolbarPreferences>) => void;
  setMagnet: (mode: MagnetMode) => void; setKeepDrawing: () => void;
  setVisibility: (target: 'drawings' | 'indicators' | 'all') => void;
  setLinked: () => void; remove: (target: 'selected' | 'drawings' | 'indicators') => void;
  setFavorites: (values: string[]) => void;
}
function ToolEntry({ kind, favorite, arm, toggle }: { kind: DrawingKind; favorite: boolean; arm: Props['arm']; toggle: () => void }) {
  const t = useT(), close = useDropdownClose();
  return <div className="flex items-center gap-1">
    <Button wrapperClassName="min-w-0 flex-1" className="h-10 min-w-0 flex-1 justify-start px-2 text-xs" variant="ghost" hint={t('cw.placeTool.hint', { tool: t(toolKey(kind)), n: OVERLAY_SPECS[kind].pointCount })} onClick={() => { close(); arm(kind); }} data-testid={`tool-${kind}`}><ToolIcon kind={kind} /><span className="truncate">{t(toolKey(kind))}</span></Button>
    <Button size="icon-sm" variant="ghost" hint={t('cw.favorite.hint')} aria-label={`${t('cw.favorite')}: ${t(toolKey(kind))}`} aria-pressed={favorite} onClick={toggle}><Star size={15} className={favorite ? 'fill-primary text-primary' : ''} /></Button>
  </div>;
}
export function DrawingToolbar(p: Props) {
  const t = useT();
  const control = (name: MessageKey, icon: ReactNode, onClick: () => void, active = false, disabled = false) => <Button size="icon" className="size-10 sm:size-10" variant={active ? 'secondary' : 'ghost'} aria-label={t(name)} hint={t(`${name}.hint` as MessageKey)} aria-pressed={active} disabled={disabled} onClick={onClick}>{icon}</Button>;
  const menu = (name: MessageKey, icon: ReactNode, children: ReactNode, small = false) => <DropdownMenu label={t(name)} hint={t(`${name}.hint` as MessageKey)} icon={icon} side="right" size="icon" variant="ghost" triggerProps={{ className: small ? 'h-10 w-2 rounded-none px-0 sm:h-10 sm:w-2' : 'size-10 sm:size-10' }} panelClassName="p-1">{children}</DropdownMenu>;
  const item = (name: MessageKey, icon: ReactNode, action: () => void, disabled = false) => <DropdownMenuItem hint={t(`${name}.hint` as MessageKey)} icon={icon} onSelect={action} disabled={disabled}>{t(name)}</DropdownMenuItem>;
  let cursorIcon = <Crosshair size={24} strokeWidth={1.5} />;
  if (p.preferences.cursor === 'arrow') cursorIcon = <MousePointer2 size={24} strokeWidth={1.5} />;
  if (p.preferences.cursor === 'dot') cursorIcon = <Circle size={8} className="fill-current" />;
  return <aside aria-label={t('cw.tools')} data-testid="drawing-toolbar" className="relative z-20 flex min-h-0 w-[52px] shrink-0 flex-col border-r border-border bg-card">
    <div className="flex min-h-0 max-h-[calc(100dvh-100px)] flex-1 flex-col items-center gap-1 overflow-y-auto py-2 [scrollbar-width:none]">
      <div className="flex w-[52px] shrink-0 items-center pl-1">
        {control('cw.selection', cursorIcon, () => { p.setGesture(null); p.arm(null); }, !p.tool && !p.gesture)}
        {menu('cw.rail.cursor', <ChevronRight size={10} />, <DropdownMenuGroup>{(['crosshair', 'dot', 'arrow'] as CursorMode[]).map(mode => <div key={mode}>{item(`cw.rail.${mode}` as MessageKey, mode === 'arrow' ? <MousePointer2 size={18} /> : <Crosshair size={18} />, () => { p.setPreferences({ cursor: mode }); p.arm(null); p.setGesture(null); })}</div>)}</DropdownMenuGroup>, true)}
      </div>
      {TOOL_GROUPS.map(group => {
        const kinds = DRAWING_TOOLS.filter(k => toolGroup(k) === group), kind = p.preferences.lastTools[group] ?? DEFAULT_TOOL[group];
        const activate = (value: DrawingKind | null, glyph?: string) => { p.setGesture(null); p.arm(value, glyph); };
        return <div key={group} className="flex w-[52px] shrink-0 items-center pl-1" data-tool-group={group}>
          {control(GROUP_KEY[group], <ToolIcon kind={kind} />, () => activate(kind), p.tool !== null && toolGroup(p.tool) === group)}
          {menu(`${GROUP_KEY[group]}Menu` as MessageKey, <ChevronRight size={10} />, <><div className="px-2 py-2 text-xs font-semibold">{t(GROUP_KEY[group])}</div>{kinds.map(k => <ToolEntry key={k} kind={k} arm={activate} favorite={p.favorites.includes(k)} toggle={() => p.setFavorites(p.favorites.includes(k) ? p.favorites.filter(v => v !== k) : [...p.favorites, k])} />)}{group === 'symbols' && <div className="flex flex-wrap border-t border-border pt-2">{['★', '✓', '⚑', '😀', '🚀', '🐂', '🐻'].map(glyph => <Button key={glyph} size="icon" hint={t('cw.rail.glyph.hint')} aria-label={`${t('cw.rail.glyph')} ${glyph}`} onClick={() => activate('font-icon', glyph)}>{glyph}</Button>)}</div>}</>, true)}
        </div>;
      })}
      <div className="my-1 w-10 border-t border-border" />
      {control('cw.rail.measure', <Ruler size={24} strokeWidth={1.5} />, () => { p.arm(null); p.setGesture(p.gesture === 'measure' ? null : 'measure'); }, p.gesture === 'measure')}
      {menu('cw.rail.zoom', <Maximize size={23} strokeWidth={1.5} />, <DropdownMenuGroup>{item('cw.rail.zoomArea', <Maximize size={18} />, () => { p.arm(null); p.setGesture('zoom'); })}{item('cw.rail.zoomReset', <Plus size={18} />, p.resetZoom, !p.canResetZoom)}</DropdownMenuGroup>)}
      <div className="my-1 w-10 border-t border-border" />
      <div className="flex w-[52px] shrink-0 items-center pl-1">{control('cw.magnet', <Magnet size={24} strokeWidth={1.5} />, () => p.setMagnet(p.magnet === 'off' ? p.preferences.magnetStrength : 'off'), p.magnet !== 'off')}{menu('cw.rail.magnetMenu', <ChevronRight size={10} />, <DropdownMenuGroup>{(['off', 'weak', 'strong'] as MagnetMode[]).map(mode => <div key={mode}>{item(`cw.${mode}` as MessageKey, <Magnet size={18} />, () => { if (mode !== 'off') p.setPreferences({ magnetStrength: mode }); p.setMagnet(mode); })}</div>)}</DropdownMenuGroup>, true)}</div>
      {control('cw.keepDrawing', <Pencil size={24} strokeWidth={1.5} />, p.setKeepDrawing, p.keepDrawing)}
      {control('cw.rail.lockAll', p.preferences.locked ? <LockKeyhole size={24} strokeWidth={1.5} /> : <UnlockKeyhole size={24} strokeWidth={1.5} />, () => p.setPreferences({ locked: !p.preferences.locked }), p.preferences.locked)}
      {menu('cw.rail.visibility', <Eye size={24} strokeWidth={1.5} />, <DropdownMenuGroup>{item('cw.rail.drawingsVisibility', <Pencil size={18} />, () => p.setVisibility('drawings'))}{item('cw.rail.indicatorsVisibility', <Activity size={18} />, () => p.setVisibility('indicators'))}{item('cw.rail.allVisibility', <Eye size={18} />, () => p.setVisibility('all'))}</DropdownMenuGroup>)}
      {control('cw.rail.link', <Link size={24} strokeWidth={1.5} />, p.setLinked, p.linked, !p.linkAvailable)}
      <div className="my-1 w-10 border-t border-border" />
      {menu('cw.rail.trash', <Trash2 size={24} strokeWidth={1.5} />, <DropdownMenuGroup>{item('cw.rail.removeSelected', <Pencil size={18} />, () => p.remove('selected'), p.preferences.locked || !p.selected)}{item('cw.rail.removeDrawings', <Trash2 size={18} />, () => p.remove('drawings'), p.preferences.locked)}{item('cw.rail.removeIndicators', <Activity size={18} />, () => p.remove('indicators'))}</DropdownMenuGroup>)}
      <div className="min-h-4 flex-1" />
    </div>
    <div className="flex justify-center border-t border-border py-2">{menu('cw.rail.favorites', <Star size={24} strokeWidth={1.5} />, <div className="flex flex-wrap gap-1" data-testid="drawing-favorites">{p.favorites.filter(k => DRAWING_TOOLS.includes(k as DrawingKind)).map(k => <Button key={k} size="icon" hint={t('cw.placeTool.hint', { tool: t(toolKey(k as DrawingKind)), n: OVERLAY_SPECS[k as DrawingKind].pointCount })} aria-label={t(toolKey(k as DrawingKind))} onClick={() => { p.setGesture(null); p.arm(k as DrawingKind); }}><ToolIcon kind={k as DrawingKind} /></Button>)}</div>)}</div>
  </aside>;
}
