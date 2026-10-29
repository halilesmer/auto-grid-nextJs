/**
 * Cypher (CYP): Bausteine für die Maße der Cypher über dem XABCD-Kern (xabcd.ts).
 * Der Kern liefert X, A, B, C und D; hier stehen die Verhältnisse, die nur die Cypher braucht:
 * die Ausdehnung von C jenseits von A, der Rücklauf auf der Fib X → C und die Rückprojektion der Strecke B → C.
 */
import { closesBeyond, outward } from './frz';
import { CYP_PARAMS } from './params';
import { levelXA, type XabcdShape } from './xabcd';
import type { Anchor, FormationBar } from './types';

/** Ausdehnung von C jenseits von A als Anteil von X → A (0.272 = Level 1.272); null bei Länge 0 */
export const extensionOfC = (s: XabcdShape): number | null =>
  s.len === 0 ? null : (outward(s.cs, s.c.price) - outward(s.cs, s.a.price)) / s.len;

/** Strecke X → C */
export const lenXC = (s: XabcdShape): number => Math.abs(s.c.price - s.x.price);

/** Anteil der Strecke X → C, den ein Preis von C aus Richtung X zurückläuft (C = 0, X = 1); null bei Länge 0 */
export const retraceXC = (s: XabcdShape, price: number): number | null => {
  const len = lenXC(s);
  return len === 0 ? null : (outward(s.cs, s.c.price) - outward(s.cs, price)) / len;
};

/** Preis des Levels der Fib X → C (C = 0, X = 1) */
export const levelXC = (s: XabcdShape, level: number): number => s.c.price + level * (s.x.price - s.c.price);

/** Einstiegspreis der Cypher aus den Punkten X und C (CYP-07): das Level 0.786 der Fib X → C */
export const entryOfCypher = (x: Anchor, c: Anchor): number => c.price + CYP_PARAMS.dLevel * (x.price - c.price);

/** Preis der Rückprojektion der Strecke B → C um `ratio` jenseits von B (CYP-12: 1.272) */
export const levelBC = (s: XabcdShape, ratio: number): number => s.c.price + ratio * (s.b.price - s.c.price);

/** CYP-15: eine Kerze zwischen A und B schließt jenseits des Levels 0.618 der Fib X → A, von A aus gegen X gemessen (Docht darüber ist erlaubt) */
export function closedBeyondBLimit(bars: readonly FormationBar[], s: XabcdShape): boolean {
  const limit = levelXA(s, CYP_PARAMS.bExclude);
  for (let k = s.a.idx + 1; k <= s.b.idx; k++) if (closesBeyond(bars[k], limit, s.es)) return true;
  return false;
}

/** CYP-11: eine Kerze zwischen B und C schließt jenseits der Ausdehnung 1.414 der Fib X → A (Docht darüber ist erlaubt) */
export function closedBeyondCLimit(bars: readonly FormationBar[], s: XabcdShape): boolean {
  const limit = levelXA(s, -CYP_PARAMS.cExclude);
  for (let k = s.b.idx + 1; k <= s.c.idx; k++) if (closesBeyond(bars[k], limit, s.cs)) return true;
  return false;
}
