'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Tooltip, type HintContent } from './tooltip';

const CloseContext = createContext<() => void>(() => {});
const EDGE = 8; // Mindestabstand zum Bildschirmrand

interface ContextMenuProps {
  /** Position des Zeigers (Viewport-Koordinaten, clientX/clientY) */
  x: number;
  y: number;
  /** Name des Menüs (aria-label) */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Menü an der Zeigerposition (Rechtsklick, Doppelklick, Langdruck). Schließt bei Escape, Klick außerhalb, Scrollen
 * und Größenänderung; am Bildschirmrand rutscht es hinein. Pfeiltasten wechseln zwischen den Knöpfen. Es liegt in
 * `document.body`, damit weder `transform` noch `overflow` eines Vorfahren die feste Position stören.
 */
export function ContextMenu({ x, y, label, onClose, children, className, 'data-testid': testId }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Nach dem Rendern messen und vor dem Paint in den sichtbaren Bereich schieben
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))}px`;
  }, [x, y, children]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const inside = (target: EventTarget | null) => target instanceof Node && !!ref.current?.contains(target);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next = (current + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = buttons.length - 1;
      e.preventDefault();
      buttons[next]?.focus();
    };
    const onDown = (e: Event) => { if (!inside(e.target)) onClose(); };
    const onScroll = (e: Event) => { if (!inside(e.target)) onClose(); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      data-testid={testId}
      className={cn('fixed z-[60] max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-sm shadow-2xl outline-none', className)}
      style={{ left: x, top: y }}
      onContextMenu={e => e.preventDefault()}
    >
      <CloseContext.Provider value={onClose}>{children}</CloseContext.Provider>
    </div>,
    document.body,
  );
}

/** Kopfzeile eines Menüs (kein Knopf) */
export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</div>;
}

export function ContextMenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-border" />;
}

interface ContextMenuItemProps {
  children: ReactNode;
  /** Pflicht (hooks/RULES.md §5) */
  hint: HintContent;
  onSelect: () => void;
  /** Menü nach der Wahl offen lassen (z. B. „Varsayılana dön“, deren Wirkung man sehen will) */
  keepOpen?: boolean;
  tone?: 'default' | 'danger';
}

/** Eintrag im Aussehen von `DropdownMenuItem`, als `menuitem` */
export function ContextMenuItem({ children, hint, onSelect, keepOpen = false, tone = 'default' }: ContextMenuItemProps) {
  const close = useContext(CloseContext);
  return (
    <Tooltip content={hint} className="w-full">
      <button
        type="button"
        role="menuitem"
        onClick={() => { if (!keepOpen) close(); onSelect(); }}
        className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition', tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-foreground hover:bg-accent')}
      >
        <span className="min-w-0 truncate">{children}</span>
      </button>
    </Tooltip>
  );
}
