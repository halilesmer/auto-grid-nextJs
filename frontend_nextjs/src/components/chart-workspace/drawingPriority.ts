import { createContext, useContext } from 'react';
import type { DrawingPriority } from '@/lib/chart-workspace/hover';

const NONE = (): DrawingPriority => ({ toolActive: false, drawingHovered: false });

/**
 * Zustand der Zeichenwerkzeuge für Teile im Inneren des Arbeitsbereichs (Plan 1105-A7, S4): ein aktives Werkzeug und eine
 * Zeichnung unter der Maus haben Vorrang vor dem Linienmenü. Der Arbeitsbereich besitzt den DrawingManager; wer außerhalb
 * liegt, liest nie ein Werkzeug (`NONE`).
 */
export const DrawingPriorityContext = createContext<() => DrawingPriority>(NONE);

export const useDrawingPriority = () => useContext(DrawingPriorityContext);
