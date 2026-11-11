'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpToLine, Check, ChevronDown, ChevronRight, ChevronUp, Copy, Eye, EyeOff, Layers, ListTree, Lock, LockOpen, Settings2, Trash2 } from 'lucide-react';
import type { Drawing, DrawingManager } from 'lightweight-charts-drawing';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { FIB_KIND, normalizeFibStyle, presetFibStyle, fibStyleEqual } from '@/lib/chart-workspace/fibStyle';
import { randomId } from '@/lib/randomId';
import { cn } from '@/lib/utils';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { SaveTemplateModal } from './FibSettingsDialog';

const k = (key: string) => `ctx.${key}` as MessageKey;

export interface DrawingContextMenuProps {
  /** Çizim: sağ tıkta fare altındaki, S7'de yüzen çubuğun "…" düğmesinde seçili olan */
  drawing: Drawing;
  /** Ekran konumu (viewport, px) */
  position: { x: number; y: number };
  manager: DrawingManager;
  /** Araç çubuğunda tüm çizimler kilitli (çalışma alanı kilidi) */
  allLocked: boolean;
  onClose: () => void;
  /** Her değişiklikten sonra tek geri alma adımı yazar */
  onChange: () => void;
  onOpenSettings: (drawing: Drawing, tab?: 'style' | 'coords' | 'vis') => void;
  onOpenTree: (drawing: Drawing) => void;
}

function step(key: string, i: number, n: number) {
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return (i + (key === 'ArrowUp' ? -1 : 1) + n) % n;
}

interface Entry { id: string; label: string; hint: string; icon: ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean; sub?: Entry[]; shortcut?: string; testId: string }

/** Çizim sağ tık menüsü (plan 1110-A4.9, UI-28). Alarm, Kopyala ve Senkronize et satırları bilerek yok. */
export function DrawingContextMenu({ drawing, position, manager, allLocked, onClose, onChange, onOpenSettings, onOpenTree }: DrawingContextMenuProps) {
  const t = useT(), id = useId();
  const templates = useChartWorkspaceStore(s => s.drawingTemplates[FIB_KIND]);
  const store = useChartWorkspaceStore.getState;
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [place, setPlace] = useState(position);
  const isFib = drawing.kind === FIB_KIND;
  const frozen = allLocked || !!drawing.locked;
  const frozenHint = allLocked ? t(k('allLocked')) : t(k('locked'));
  const fresh = () => manager.get(drawing.id) ?? drawing;
  const done = (change: () => void) => () => { change(); onChange(); onClose(); };

  const move = (to: 'front' | 'back' | 'forward' | 'backward') => {
    if (to === 'front') { manager.bringToFront(drawing.id); return; }
    if (to === 'back') { manager.sendToBack(drawing.id); return; }
    const ids = manager.drawings().map(d => d.id), i = ids.indexOf(drawing.id), j = to === 'forward' ? i + 1 : i - 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Sıra = çizim sırası: değişen yerden sona kadar hepsini sırayla öne al
    for (const x of ids.slice(Math.min(i, j))) manager.bringToFront(x);
  };

  const user = templates ?? {};
  const currentStyle = isFib ? normalizeFibStyle(drawing.style) : null;
  const active = (s: ReturnType<typeof normalizeFibStyle>) => !!currentStyle && fibStyleEqual(currentStyle, s);
  const apply = (s: ReturnType<typeof normalizeFibStyle>) => done(() => manager.update({ ...fresh(), style: { ...fresh().style, ...s } } as Drawing));
  const templateEntries: Entry[] = isFib ? [
    { id: 'tpl-preset', testId: 'ctx-template-preset', label: t('fib.presetName'), hint: t(k('applyTemplate.hint')), icon: <Check size={14} className={active(presetFibStyle()) ? '' : 'opacity-0'} />, disabled: frozen, onSelect: apply(presetFibStyle()) },
    ...Object.keys(user).sort((a, b) => a.localeCompare(b, 'tr')).map(n => ({ id: `tpl-${n}`, testId: 'ctx-template-user', label: n, hint: t(k('applyTemplate.hint')), icon: <Check size={14} className={active(normalizeFibStyle(user[n])) ? '' : 'opacity-0'} />, disabled: frozen, onSelect: apply(normalizeFibStyle(user[n])) })),
    { id: 'tpl-save', testId: 'ctx-template-save', label: t(k('saveTemplate')), hint: t(k('saveTemplate.hint')), icon: <Copy size={14} />, onSelect: () => setSaving(true) },
  ] : [];

  const entries: Entry[] = [
    ...(isFib ? [{ id: 'template', testId: 'ctx-template', label: t(k('template')), hint: t(k('template.hint')), icon: <Layers size={16} />, sub: templateEntries }] : []),
    { id: 'order', testId: 'ctx-order', label: t(k('order')), hint: t(k('order.hint')), icon: <ArrowUpToLine size={16} />, disabled: frozen, sub: [
      { id: 'front', testId: 'ctx-front', label: t(k('front')), hint: t(k('front.hint')), icon: <ArrowUpToLine size={14} />, onSelect: done(() => move('front')) },
      { id: 'forward', testId: 'ctx-forward', label: t(k('forward')), hint: t(k('forward.hint')), icon: <ChevronUp size={14} />, onSelect: done(() => move('forward')) },
      { id: 'backward', testId: 'ctx-backward', label: t(k('backward')), hint: t(k('backward.hint')), icon: <ChevronDown size={14} />, onSelect: done(() => move('backward')) },
      { id: 'back', testId: 'ctx-back', label: t(k('back')), hint: t(k('back.hint')), icon: <ArrowDownToLine size={14} />, onSelect: done(() => move('back')) },
    ] },
    { id: 'visibility', testId: 'ctx-visibility', label: t(k('visibility')), hint: isFib ? t(k('visibility.hint')) : t(k('visibility.other')), icon: <Eye size={16} />, disabled: !isFib, onSelect: () => { onClose(); onOpenSettings(fresh(), 'vis'); } },
    { id: 'tree', testId: 'ctx-tree', label: t(k('tree')), hint: t(k('tree.hint')), icon: <ListTree size={16} />, onSelect: () => { onClose(); onOpenTree(fresh()); } },
    { id: 'clone', testId: 'ctx-clone', label: t(k('clone')), hint: frozen ? frozenHint : t(k('clone.hint')), icon: <Copy size={16} />, disabled: allLocked, onSelect: done(() => { const id2 = manager.add({ ...fresh(), id: randomId(), locked: false } as Drawing); manager.select([id2]); }) },
    { id: 'lock', testId: 'ctx-lock', label: t(k(drawing.locked ? 'unlock' : 'lock')), hint: allLocked ? frozenHint : t(k(drawing.locked ? 'unlock.hint' : 'lock.hint')), icon: drawing.locked ? <LockOpen size={16} /> : <Lock size={16} />, disabled: allLocked, onSelect: done(() => manager.update({ ...fresh(), locked: !drawing.locked } as Drawing)) },
    { id: 'hide', testId: 'ctx-hide', label: t(k('hide')), hint: frozen ? frozenHint : t(k('hide.hint')), icon: <EyeOff size={16} />, disabled: frozen, onSelect: done(() => { manager.setHidden(drawing.id, true); manager.select([]); }) },
    { id: 'remove', testId: 'ctx-remove', label: t(k('remove')), hint: frozen ? frozenHint : t(k('remove.hint')), icon: <Trash2 size={16} />, disabled: frozen, danger: true, shortcut: '⌫', onSelect: done(() => manager.remove(drawing.id)) },
    { id: 'settings', testId: 'ctx-settings', label: t(k('settings')), hint: t(k('settings.hint')), icon: <Settings2 size={16} />, onSelect: () => { onClose(); if (isFib) onOpenSettings(fresh()); else onOpenTree(fresh()); } },
  ];

  // Ekran dışına taşmasın
  useLayoutEffect(() => {
    const el = panel.current; if (!el) return;
    const r = el.getBoundingClientRect(), m = 8;
    setPlace({ x: Math.max(m, Math.min(position.x, window.innerWidth - r.width - m)), y: Math.max(m, Math.min(position.y, window.innerHeight - r.height - m)) });
  }, [position, open]);
  useEffect(() => { panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, []);
  useEffect(() => {
    if (saving) return;
    const down = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []), i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault(); if (!buttons.length) return;
        buttons[step(e.key, i, buttons.length)]?.focus();
      }
      if (e.key === 'ArrowRight' && (document.activeElement as HTMLElement | null)?.getAttribute('aria-haspopup')) (document.activeElement as HTMLElement).click();
    };
    const blur = () => onClose();
    document.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true); window.addEventListener('blur', blur); window.addEventListener('resize', blur);
    return () => { document.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); window.removeEventListener('resize', blur); };
  }, [saving, onClose]);

  if (saving) return <SaveTemplateModal id={id} names={Object.keys(user)} onClose={onClose} onSave={n => { store().saveDrawingTemplate(n, normalizeFibStyle(fresh().style)); onClose(); }} />;

  const row = (e: Entry, nested = false): ReactNode => <div key={e.id}>
    <Tooltip content={e.hint} className="w-full">
      <button type="button" role="menuitem" data-testid={e.testId} disabled={e.disabled} aria-haspopup={e.sub ? 'menu' : undefined} aria-expanded={e.sub ? open === e.id : undefined}
        className={cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40', e.danger ? 'text-danger hover:bg-danger/10 focus-visible:bg-danger/10' : 'text-foreground hover:bg-accent [&>svg]:text-muted-foreground', nested && 'pl-8')}
        onClick={() => { if (e.sub) setOpen(open === e.id ? null : e.id); else e.onSelect?.(); }}>
        {e.icon}<span className="min-w-0 flex-1 truncate">{e.label}</span>
        {e.shortcut && <span className="text-xs text-muted-foreground">{e.shortcut}</span>}
        {e.sub && <ChevronRight size={14} className={cn('transition', open === e.id && 'rotate-90')} aria-hidden="true" />}
      </button>
    </Tooltip>
    {e.sub && open === e.id && <div role="menu" data-testid={`${e.testId}-list`}>{e.sub.map(s => row(s, true))}</div>}
  </div>;

  return <div ref={panel} role="menu" aria-label={t(k('menu'))} data-testid="drawing-context-menu" style={{ left: place.x, top: place.y }}
    className="fixed z-[70] max-h-[calc(100dvh-16px)] w-64 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-2xl"
    onContextMenu={e => e.preventDefault()}>
    {entries.map(e => row(e))}
  </div>;
}
