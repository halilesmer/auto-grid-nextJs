'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { motion, useDragControls, useMotionValue } from 'motion/react';
import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

/** Nur die Kopfzeile zieht die Karte. Inhalt und Einklappen behalten ihre eigenen Zeigerereignisse. */
export function FormationDetailsPanel({ title, open, onToggle, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const bounds = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const moveBy = useCallback((dx: number, dy: number) => {
    if (!bounds.current || !panel.current) return;
    const area = bounds.current.getBoundingClientRect();
    const card = panel.current.getBoundingClientRect();
    x.set(x.get() + Math.min(Math.max(dx, area.left - card.left), area.right - card.right));
    y.set(y.get() + Math.min(Math.max(dy, area.top - card.top), area.bottom - card.bottom));
  }, [x, y]);

  useEffect(() => {
    // Nach Größenänderung oder Aufklappen darf der Griff nicht außerhalb des sichtbaren Bereichs bleiben.
    const observer = new ResizeObserver(() => moveBy(0, 0));
    if (bounds.current) observer.observe(bounds.current);
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, [moveBy]);

  return (
    <>
      <div ref={bounds} className="pointer-events-none absolute bottom-16 left-[60px] right-16 top-18 lg:top-0" aria-hidden="true" />
      <motion.aside
        ref={panel}
        drag
        dragControls={controls}
        dragListener={false}
        dragConstraints={bounds}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, y }}
        className="absolute bottom-[calc(17%+2rem)] left-[64px] right-16 z-40 overflow-hidden rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur-md min-[900px]:bottom-auto min-[900px]:left-auto min-[900px]:right-20 min-[900px]:top-52 min-[900px]:w-80"
        data-testid="formation-details"
        aria-label={t('formation.details')}
      >
        <div className="flex items-center gap-2 border-b border-border px-2 py-2">
          <Button
            size="sm"
            variant="ghost"
            wrapperClassName="min-w-0 flex-1"
            className="touch-none select-none justify-start overflow-hidden text-foreground cursor-grab active:cursor-grabbing"
            hint={t('formation.details.move.hint')}
            aria-label={t('formation.details.move')}
            data-testid="formation-details-drag"
            onPointerDown={(event) => {
              if (event.button === 0) controls.start(event);
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 50 : 10;
              const deltas: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
              };
              const delta = deltas[event.key];
              if (!delta) return;
              event.preventDefault();
              moveBy(...delta);
            }}
          >
            <GripHorizontal size={14} className="shrink-0 text-muted-foreground" />
            <strong className="truncate text-xs">{title}</strong>
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            hint={t('formation.details.toggle.hint')}
            aria-label={t('formation.details')}
            aria-expanded={open}
            aria-controls="formation-details-content"
            data-testid="formation-details-toggle"
            onClick={onToggle}
          >
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </Button>
        </div>
        <div id="formation-details-content" hidden={!open} className="max-h-[26dvh] overflow-y-auto overscroll-contain min-[900px]:max-h-[min(52dvh,calc(100dvh-17rem))]">
          {children}
        </div>
      </motion.aside>
    </>
  );
}
