'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';
import { Tooltip, type HintContent } from './tooltip';

const CloseContext = createContext<() => void>(() => {});

interface DropdownMenuProps {
  /** Name des Menüs (aria-label des Auslösers). */
  label: string;
  hint: HintContent;
  icon: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  align?: 'left' | 'right';
  /** Klassen des Auslöser-Wrappers (z. B. Reihenfolge/Abstand in einer Leiste). */
  className?: string;
  /** Klassen des aufgeklappten Panels (z. B. Breite). */
  panelClassName?: string;
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
  className,
  panelClassName,
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Panel seitlich in den Bildschirm schieben (schmale Ansicht, Auslöser nah am Rand). `translate`
  // statt `transform`: die Einblend-Animation setzt transform.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.style.translate = '';
    const { left, right } = panel.getBoundingClientRect();
    const margin = 8;
    let dx = 0;
    if (right > window.innerWidth - margin) dx = window.innerWidth - margin - right;
    if (left + dx < margin) dx = margin - left;
    if (dx) panel.style.translate = `${Math.round(dx)}px 0`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Fokus zurück auf den Auslöser, sonst verliert die Tastatur ihre Position
      ref.current?.querySelector('button')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={cn('relative shrink-0', className)} ref={ref}>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(!open)}
        hint={hint}
        aria-label={label}
        aria-expanded={open}
      >
        {icon}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/15 dark:shadow-black/60',
              align === 'right' ? 'right-0' : 'left-0',
              panelClassName,
            )}
          >
            <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
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
}

export function DropdownMenuItem({
  icon,
  children,
  hint,
  onSelect,
  disabled = false,
  tone = 'default',
  'aria-label': ariaLabel,
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
