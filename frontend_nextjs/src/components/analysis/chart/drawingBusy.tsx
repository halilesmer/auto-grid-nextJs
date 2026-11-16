'use client';

import { useEffect, type RefObject } from 'react';
import { useDrawingPriority } from '@/components/chart-workspace/drawingPriority';

/**
 * Tracks whether the main button (or a finger) is pressed on `host`. A press ends on release, on `pointercancel`, when a move
 * shows that no button is held any more, on the context menu (it can swallow the release) and when the window loses focus.
 * A right click does not count: it draws nothing.
 */
export function watchPointerPressed(host: HTMLElement): { pressed: () => boolean; dispose: () => void } {
  const down = new Set<number>();
  const onDown = (e: PointerEvent) => { if (e.button === 0) down.add(e.pointerId); };
  const onEnd = (e: PointerEvent) => { down.delete(e.pointerId); };
  const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse' && e.buttons === 0) down.delete(e.pointerId); };
  const onClear = () => down.clear();
  host.addEventListener('pointerdown', onDown, true);
  host.addEventListener('contextmenu', onClear, true);
  window.addEventListener('pointerup', onEnd, true);
  window.addEventListener('pointercancel', onEnd, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('blur', onClear);
  return {
    pressed: () => down.size > 0,
    dispose: () => {
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('contextmenu', onClear, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('blur', onClear);
    },
  };
}

/**
 * The drawing tool state lives in the workspace context, below `ChartCore`. This component sits inside the workspace and hands the
 * tool state to `ChartCore` through `toolRef`.
 */
export function DrawingToolBridge({ toolRef }: { toolRef: RefObject<() => boolean> }) {
  const priority = useDrawingPriority();
  useEffect(() => {
    toolRef.current = () => priority().toolActive;
    return () => { toolRef.current = () => false; };
  }, [priority, toolRef]);
  return null;
}
