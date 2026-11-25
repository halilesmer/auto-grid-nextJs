/**
 * Etiket ayırma (1124-F11.1): die Schriften am D (Abzeichen, „D?“-Abzeichen, Niveau-Schrift, Grund) überdecken sich nicht.
 * Feste Schriften (Grund an B und Linie, Ring) bleiben stehen; Abzeichen, D?-Abzeichen und Niveau-Schrift rutschen senkrecht auf die nächste freie Stelle.
 * Reine Funktion: die Breiten der Schriften sind Schätzungen (Zeichenzahl × Breite), bewusst großzügig.
 */
import type { DBadge } from './drawingLayout';
import type { DArrowModel } from './dArrow';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Breite eines Zeichens der 11-px-Schrift (px), bewusst etwas über dem Messwert (~5,5–6,4) */
export const CHAR_PX = 6.4;
/** Mindestabstand zwischen zwei Etiketten (px) */
const GAP = 3;
/** Schrifthöhe über und unter der Grundlinie (px): Oberkante −11, Höhe 14 */
const TEXT_TOP = 11;
const TEXT_H = 14;

export const pillWidth = (pill: { main: string; badge: string }) => (pill.main.length + pill.badge.length) * CHAR_PX + 30;

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

const textRect = (x: number, baseline: number, text: string, anchor: 'start' | 'end'): Rect => {
  const w = text.length * CHAR_PX;
  return { x: anchor === 'end' ? x - w : x, y: baseline - TEXT_TOP, w, h: TEXT_H };
};

/** Kleinste Verschiebung (0, +s, −s, +2s, …) in senkrechter Richtung, bei der `r` weder Hindernisse trifft noch den Zeichenbereich verlässt; 0, wenn es keine gibt */
export function freeShift(r: Rect, obstacles: readonly Rect[], height: number, step: number): number {
  const ok = (dy: number) => r.y + dy >= 2 && r.y + dy + r.h <= height - 2 && !obstacles.some((o) => overlaps({ ...r, y: r.y + dy }, o));
  if (ok(0)) return 0;
  for (let k = 1; k * step <= height; k++) {
    if (ok(k * step)) return k * step;
    if (ok(-k * step)) return -k * step;
  }
  return 0;
}

export interface Separated {
  model: DArrowModel;
  badges: DBadge[];
}

/** Verschiebt Abzeichen, D?-Abzeichen und Niveau-Schrift, bis keine Schrift mehr eine andere überdeckt */
export function separateLabels(model: DArrowModel, badges: readonly DBadge[], height: number): Separated {
  const fixed: Rect[] = [];
  const { reason, ring, level } = model;
  if (reason) {
    fixed.push(textRect(reason.x2, reason.lineY + (reason.dir > 0 ? 14 : -6), reason.lineLabel, 'end'));
    if (reason.arrow && reason.arrowLabel) fixed.push(textRect(reason.arrowLabel.x, reason.arrowLabel.y, reason.arrowLabel.text, 'end'));
    fixed.push(textRect(reason.b.x + 10, reason.b.y + (reason.dir > 0 ? -9 : 17), reason.b.label, 'start'));
  }
  if (ring) fixed.push({ x: ring.x - 9, y: ring.y - 9, w: 18, h: 18 });

  const out = badges.map((b) => ({ ...b }));
  const rectOf = (b: DBadge): Rect => ({ x: b.bx, y: b.by, w: b.w, h: b.h });
  out.forEach((b, i) => {
    const others = out.filter((_, j) => j !== i).map(rectOf);
    b.by += freeShift(rectOf(b), [...fixed, ...others], height, 12);
  });
  const badgeRects = out.map(rectOf);

  const w = pillWidth(model.pill);
  const pillX = Math.max(2, model.pill.x - w);
  const pillRect: Rect = { x: pillX, y: model.pill.y - 11, w, h: 22 };
  const levelRect: Rect | null = level ? textRect(level.x1 + 6, level.y - 6, level.label, 'start') : null;
  const pillDy = freeShift(pillRect, [...fixed, ...badgeRects, ...(levelRect ? [levelRect] : [])], height, 12);
  const pillMoved = { ...pillRect, y: pillRect.y + pillDy };
  const levelDy = levelRect ? freeShift(levelRect, [...fixed, ...badgeRects, pillMoved], height, 14) : 0;

  return {
    model: {
      ...model,
      pill: { ...model.pill, y: model.pill.y + pillDy },
      level: level ? { ...level, labelDy: levelDy } : null,
    },
    badges: out,
  };
}
