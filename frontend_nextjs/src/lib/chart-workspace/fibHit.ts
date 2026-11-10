import { fibLevelAt, type Coords, type Drawing, type DrawingManager } from 'lightweight-charts-drawing';

/**
 * lightweight-charts-drawing 0.6.2–0.9.0 tests a click on a Fib retracement / trend-based Fib
 * extension only against the box between its handles. Levels outside the 0–1 band (−0.272, 1.618 …)
 * could not be selected, so Delete did nothing for them. `fibLevelAt` already knows every level line
 * (extended x range included). We call it as a fallback after the library's own `hitTopmost`.
 * Pure wrapper around private members: if they are gone after an upgrade, we do nothing and warn once.
 */
type Pt = { x: number; y: number };
type HitResult = { drawing: Drawing; mode: { hit: 'body' }; pts: Pt[] };
interface ManagerInternals {
  list: Drawing[];
  coords: Coords | null;
  paneSize(): { w: number; h: number };
  shown(d: Drawing): boolean;
  hitTopmost(p: Pt): unknown;
}

const FIB_KINDS = new Set(['fib-retracement', 'trend-based-fib-extension']);

function internalsOf(m: unknown): ManagerInternals | null {
  const x = m as Partial<ManagerInternals> | null;
  if (!x || !Array.isArray(x.list) || !x.coords || typeof x.paneSize !== 'function' || typeof x.shown !== 'function' || typeof x.hitTopmost !== 'function') return null;
  return x as ManagerInternals;
}

export function isFibHitPatchable(m: unknown): boolean {
  return internalsOf(m) !== null;
}

export function extendFibHit(manager: DrawingManager): boolean {
  const m = internalsOf(manager);
  if (!m) {
    console.warn('[fibHit] DrawingManager internals changed — Fib level hit test patch skipped');
    return false;
  }
  const original = m.hitTopmost.bind(m);
  m.hitTopmost = (p: Pt) => {
    const hit = original(p);
    if (hit) return hit;
    const { w, h } = m.paneSize();
    const coords = m.coords;
    if (!coords || p.x < 0 || p.x > w || p.y < 0 || p.y > h) return null;
    for (let i = m.list.length - 1; i >= 0; i--) {
      const d = m.list[i];
      if (!FIB_KINDS.has(d.kind) || !m.shown(d)) continue;
      const pts: Pt[] = [];
      for (const q of d.points) {
        const x = coords.timeToX(q.time), y = coords.priceToY(q.price);
        if (x == null || y == null) { pts.length = 0; break; }
        pts.push({ x, y });
      }
      if (!pts.length || !fibLevelAt(d, pts, p, w, coords)) continue;
      const r: HitResult = { drawing: d, mode: { hit: 'body' }, pts };
      return r;
    }
    return null;
  };
  return true;
}
