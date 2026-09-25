'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

/**
 * Hinweis-Bausteine (Regel: hooks/RULES.md §5): jede Einstellung, jedes Feld, jeder Button
 * braucht einen erklärenden Hinweis. Text kommt aus i18n (`<label-key>.hint`), nie als Literal.
 *
 * Der Tooltip ist ein Popover im Top-Layer (`popover="manual"`): weder `overflow-hidden`
 * (Zonenkarte) noch `transform`/`backdrop-filter` schneiden ihn ab, und er liegt über den
 * nativen `<dialog>.showModal()`-Dialogen. Deshalb wird er inline gerendert (kein Portal in
 * `document.body`, das läge hinter dem Dialog) und nur solange er offen ist – sonst steht kein
 * Hinweistext im DOM.
 */
export type HintContent = string | ReactElement;

const OPEN_DELAY_MS = 300;
const GAP = 8; // Abstand Anker ↔ Tooltip
const EDGE = 8; // Mindestabstand zum Viewport-Rand

interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content'> {
  content: HintContent;
  side?: 'top' | 'bottom';
  /** Antippen (Touch) schaltet den Tooltip um; für das (i)-Icon, das es auf Touch sonst nicht gäbe. */
  touchToggle?: boolean;
}

export function Tooltip({ content, side = 'top', touchToggle = false, className, children, ...rest }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerTypeRef = useRef('mouse');

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Position: nach dem Einblenden messen, vor dem Paint setzen (kein Flackern)
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const anchor = anchorRef.current;
    if (!open || !tip || !anchor) return;
    try {
      if (typeof tip.showPopover === 'function' && !tip.matches(':popover-open')) tip.showPopover();
    } catch {
      /* ohne Popover-API bleibt es ein normales fixed-Element */
    }
    const a = anchor.getBoundingClientRect();
    const r = tip.getBoundingClientRect();
    let top = side === 'top' ? a.top - r.height - GAP : a.bottom + GAP;
    if (side === 'top' && top < EDGE) top = a.bottom + GAP;
    else if (side === 'bottom' && top + r.height > window.innerHeight - EDGE) top = a.top - r.height - GAP;
    const left = Math.max(EDGE, Math.min(a.left + a.width / 2 - r.width / 2, window.innerWidth - r.width - EDGE));
    tip.style.top = `${Math.max(EDGE, top)}px`;
    tip.style.left = `${left}px`;
  }, [open, side, content]);

  // Solange offen: Escape schließt nur den Tooltip (nicht gleich den Dialog dahinter),
  // Verschieben des Ankers (Scrollen/Größenänderung) schließt ihn, ein Tipp daneben ebenfalls (Touch).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      hide();
    };
    const onOutside = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) hide();
    };
    // Nur Scrollen, das den Anker verschiebt (Seite oder ein Elternteil); ein automatisch
    // scrollendes Log daneben soll den Tooltip nicht schließen
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target === document || (target instanceof Node && target.contains(anchorRef.current))) hide();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  const onPointerEnter = (e: ReactPointerEvent<HTMLSpanElement>) => {
    rest.onPointerEnter?.(e);
    if (e.pointerType === 'touch') return;
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };

  const child = isValidElement<{ 'aria-describedby'?: string }>(children) ? children : null;
  const described = child
    ? cloneElement(child, {
        'aria-describedby': open ? [child.props['aria-describedby'], id].filter(Boolean).join(' ') : child.props['aria-describedby'],
      })
    : children;

  return (
    <span
      {...rest}
      ref={anchorRef}
      data-tooltip-trigger
      className={cn('inline-flex shrink-0', className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={(e) => {
        rest.onPointerLeave?.(e);
        if (pointerTypeRef.current !== 'touch') hide();
      }}
      onPointerDown={(e) => {
        rest.onPointerDown?.(e);
        pointerTypeRef.current = e.pointerType;
        // Klick auf den Button selbst: Tooltip weg (bei Touch-Toggle regelt der Klick das)
        if (!(touchToggle && e.pointerType === 'touch')) hide();
      }}
      onClick={(e) => {
        rest.onClick?.(e);
        if (touchToggle && pointerTypeRef.current === 'touch') setOpen((o) => !o);
      }}
      onFocus={(e) => {
        rest.onFocus?.(e);
        // Nur Tastaturfokus (kein Tooltip nach einem Mausklick)
        let visible = true;
        try {
          visible = (e.target as HTMLElement).matches(':focus-visible');
        } catch {
          /* :focus-visible nicht unterstützt → immer zeigen */
        }
        if (visible) {
          clearTimer();
          setOpen(true);
        }
      }}
      onBlur={(e) => {
        rest.onBlur?.(e);
        hide();
      }}
    >
      {described}
      {open && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          popover="manual"
          className={cn(
            'pointer-events-none fixed inset-auto z-[100] m-0 w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-visible',
            'whitespace-pre-line rounded-md border border-border bg-popover px-2.5 py-1.5 text-left',
            'text-xs font-normal normal-case leading-snug tracking-normal text-popover-foreground',
            'shadow-xl shadow-black/10 dark:shadow-black/50',
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/** Kleines (i)-Icon mit Tooltip; steht hinter dem Label eines Feldes oder Schalters. */
export function InfoHint({ hint, className }: { hint: HintContent; className?: string }) {
  const t = useT();
  return (
    <Tooltip content={hint} touchToggle>
      <span
        role="img"
        tabIndex={0}
        aria-label={t('ui.hint')}
        data-testid="field-hint"
        // Steht oft in einem <label>: ohne das leitet der Klick auf (i) ans Feld/den Schalter weiter
        onClick={(e) => e.preventDefault()}
        className={cn(
          'inline-flex size-4 cursor-help items-center justify-center rounded-full text-muted-foreground/70 transition-colors',
          'hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Info size={12} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

/** Beschriftung + (i)-Hinweis. Der Label-Text bleibt in eigenem <span> (Selektoren der Tests). */
export function FieldLabel({ label, hint, className }: { label: ReactNode; hint: HintContent; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1', className)}>
      <span>{label}</span>
      <InfoHint hint={hint} />
    </span>
  );
}
