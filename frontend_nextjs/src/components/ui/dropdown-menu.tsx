'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';
import { Tooltip, type HintContent } from './tooltip';

const CloseContext = createContext<() => void>(() => {});

/** Das Panel selbst. Beim Schließen läuft die Ausblend-Animation (~320 ms); in dieser Zeit nimmt es keine Zeigerereignisse mehr an, sonst fängt ein schon geschlossenes Panel Klicks auf darunterliegende Bedienelemente ab (plan 1106-A4.16.2). */
function MenuPanel({ panelRef, popover, className, children }: { panelRef: React.RefObject<HTMLDivElement | null>; popover: boolean; className: string; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div ref={panelRef} popover={popover ? 'manual' : undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn(className, !present && 'pointer-events-none')}>
      {children}
    </motion.div>
  );
}

interface DropdownMenuProps {
  /** Name des Menüs (aria-label des Auslösers). */
  label: string;
  hint: HintContent;
  icon: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  align?: 'left' | 'right';
  side?: 'bottom' | 'top' | 'right';
  /** Klassen des Auslöser-Wrappers (z. B. Reihenfolge/Abstand in einer Leiste). */
  className?: string;
  /** Klassen des aufgeklappten Panels (z. B. Breite). */
  panelClassName?: string;
  /** Panel höher als der freie Platz bis zum Fensterrand: kürzen und innen scrollen (z. B. Zeitraum-Kalender im Querformat des Handys, UI-17 S5). */
  fitHeight?: boolean;
  /** Panel in der obersten Ebene (popover) unter dem Auslöser: für Auslöser in einem Scroll-Container, der ein absolutes Panel abschneiden würde (UI-25). */
  floating?: boolean;
  /** Zusätzliche Attribute des Auslöser-Buttons (z. B. data-testid, Klassen). */
  triggerProps?: Omit<ButtonProps, 'hint' | 'variant' | 'size' | 'onClick' | 'aria-label' | 'aria-expanded' | 'children'> &
    Record<`data-${string}`, string>;
  children: ReactNode;
}

/**
 * Ein Button, der ein kleines Panel mit Aktionen aufklappt; schließt bei Klick außerhalb, Escape oder
 * Auswahl. Die Einträge sind normale Buttons (Tab-Reihenfolge), deshalb bewusst ohne role="menu".
 */
export function DropdownMenu({
  label,
  hint,
  icon,
  variant = 'outline',
  size = 'icon',
  align = 'right',
  side = 'bottom',
  className,
  panelClassName,
  fitHeight = false,
  floating = false,
  triggerProps,
  children,
}: DropdownMenuProps) {
  const popover = side === 'right' || floating;
  const [open, setOpen] = useState(false);
  const [placementRevision, setPlacementRevision] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Panel seitlich in den Bildschirm schieben (schmale Ansicht, Auslöser nah am Rand). `translate`
  // statt `transform`: die Einblend-Animation setzt transform.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.style.translate = '';
    if (side === 'right') {
      const trigger = ref.current?.getBoundingClientRect();
      if (!trigger) return;
      if (!panel.matches(':popover-open')) panel.showPopover();
      panel.style.position = 'fixed'; panel.style.margin = '0'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.maxHeight = `${window.innerHeight - 16}px`; panel.style.overflowY = 'auto';
      panel.style.width = `${Math.min(288, window.innerWidth - trigger.right - 12)}px`;
      panel.style.left = `${trigger.right + 4}px`;
      panel.style.top = `${Math.max(8, Math.min(trigger.top, window.innerHeight - panel.offsetHeight - 8))}px`;
    } else if (floating) {
      const trigger = ref.current?.getBoundingClientRect();
      if (!trigger) return;
      if (!panel.matches(':popover-open')) panel.showPopover();
      panel.style.position = 'fixed'; panel.style.margin = '0'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = `${align === 'right' ? trigger.right - panel.offsetWidth : trigger.left}px`;
      panel.style.top = side === 'top' ? `${trigger.top - panel.offsetHeight - 8}px` : `${trigger.bottom + 8}px`;
    }
    // Panel höher als der Platz zwischen Auslöser und Fensterrand (Handy im Querformat): auf den freien Platz kürzen, innen scrollen (UI-17 S5)
    if (fitHeight && side !== 'right') {
      panel.style.maxHeight = ''; panel.style.overflowY = '';
      const trigger = ref.current?.getBoundingClientRect();
      if (trigger) {
        const free = side === 'top' ? trigger.top - 16 : window.innerHeight - trigger.bottom - 16;
        if (panel.offsetHeight > free && free > 0) { panel.style.maxHeight = `${Math.floor(free)}px`; panel.style.overflowY = 'auto'; }
      }
    }
    const { left, right } = panel.getBoundingClientRect();
    const margin = 8;
    let dx = 0;
    if (right > window.innerWidth - margin) dx = window.innerWidth - margin - right;
    if (left + dx < margin) dx = margin - left;
    if (dx) panel.style.translate = `${Math.round(dx)}px 0`;
  }, [open, side, align, floating, fitHeight, placementRevision]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Im Textfeld und in der Auswahlliste des Panels bleiben Pos1/Ende und Pfeile beim Cursor
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) && (ref.current?.contains(document.activeElement) || panelRef.current?.contains(document.activeElement))) {
        const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let next = (current + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = buttons.length - 1;
        e.preventDefault(); buttons[next]?.focus(); return;
      }
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      setOpen(false);
      // Fokus zurück auf den Auslöser, sonst verliert die Tastatur ihre Position
      ref.current?.querySelector('button')?.focus();
    };
    const onScroll = (event: Event) => { if (popover && !panelRef.current?.contains(event.target as Node)) setPlacementRevision(n => n + 1); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, popover]);

  const panel = <AnimatePresence>
        {open && (
          <MenuPanel panelRef={panelRef} popover={popover} className={cn('absolute z-50 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl', side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2', align === 'right' ? 'right-0' : 'left-0', panelClassName)}>
            <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
          </MenuPanel>
        )}
      </AnimatePresence>;
  return (
    <div className={cn('relative shrink-0', className)} ref={ref}>
      <Button
        {...triggerProps}
        variant={variant}
        size={size}
        onClick={() => setOpen(!open)}
        hint={hint}
        aria-label={label}
        aria-expanded={open}
      >
        {icon}
      </Button>
      {panel}
    </div>
  );
}

/** Schließt das umgebende DropdownMenu (z. B. nach „Übernehmen“ in einem Panel mit Formular). */
export function useDropdownClose() {
  return useContext(CloseContext);
}

/** Gruppe von Einträgen; mehrere Gruppen werden durch eine Linie getrennt. */
export function DropdownMenuGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('border-t border-border p-1.5 first:border-t-0', className)}>{children}</div>;
}

interface DropdownMenuItemProps {
  icon: ReactNode;
  children: ReactNode;
  /** Pflicht (hooks/RULES.md §5); bei deaktiviertem Eintrag auch warum. */
  hint: HintContent;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  'aria-label'?: string;
  'data-testid'?: string;
}

export function DropdownMenuItem({
  icon,
  children,
  hint,
  onSelect,
  disabled = false,
  tone = 'default',
  'aria-label': ariaLabel,
  'data-testid': testId,
}: DropdownMenuItemProps) {
  const close = useContext(CloseContext);
  return (
    <Tooltip content={hint} className="w-full">
      <button
        type="button"
        onClick={() => {
          close();
          onSelect();
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={testId}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40',
          tone === 'danger'
            ? 'text-danger hover:bg-danger/10'
            : 'text-foreground hover:bg-accent [&>svg]:text-muted-foreground',
        )}
      >
        {icon}
        <span className="min-w-0 truncate">{children}</span>
      </button>
    </Tooltip>
  );
}
