import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { DrawingPriority } from '@/lib/chart-workspace/hover';

const NONE = (): DrawingPriority => ({ toolActive: false, drawingHovered: false });

/**
 * Zustand der Zeichenwerkzeuge für Teile im Inneren des Arbeitsbereichs (Plan 1105-A7, S4): ein aktives Werkzeug und eine
 * Zeichnung unter der Maus haben Vorrang vor dem Linienmenü. Der Arbeitsbereich besitzt den DrawingManager; wer außerhalb
 * liegt, liest nie ein Werkzeug (`NONE`).
 */
export const DrawingPriorityContext = createContext<() => DrawingPriority>(NONE);

export const useDrawingPriority = () => useContext(DrawingPriorityContext);

/** So lange nach einem Druck bei aktivem Zeichenwerkzeug öffnet kein Linienmenü (länger als ein Doppelklick) */
export const TOOL_GRACE_MS = 600;

/**
 * Der erste Klick eines Doppelklicks setzt den Punkt des Werkzeugs und beendet es; beim `dblclick` ist es schon nicht mehr aktiv.
 * Darum merkt sich ein Druck bei aktivem Werkzeug dieses für `TOOL_GRACE_MS`. Beide Linienmenüs (Indikator, Trend) nutzen diese Regel.
 * Gibt eine Funktion zurück: „Werkzeug wurde eben noch benutzt“.
 */
export function useToolGrace(host: HTMLElement | null, isToolActive: () => boolean): () => boolean {
  const active = useRef(isToolActive), downAt = useRef(-Infinity);
  useEffect(() => { active.current = isToolActive; }, [isToolActive]);
  useEffect(() => {
    if (!host) return;
    const onDown = () => { if (active.current()) downAt.current = performance.now(); };
    host.addEventListener('pointerdown', onDown, true);
    return () => host.removeEventListener('pointerdown', onDown, true);
  }, [host]);
  return useCallback(() => performance.now() - downAt.current < TOOL_GRACE_MS, []);
}
