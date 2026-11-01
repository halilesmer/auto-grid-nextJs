/**
 * Crab (CRB) mit Variante Deep Crab: Bausteine über dem XABCD-Kern (xabcd.ts).
 * Hier stehen die Preise, die nur die Crab braucht: das Ziel-D bei 1.618 der Fib X → A jenseits von X,
 * und die Zonen am D ohne die gebrochene X-Zone (CRB-12).
 */
import { gapToRect } from './abcd';
import { CRB_PARAMS, type ContextTimeframe } from './params';
import type { Env } from './reasons';
import { engulfZones, zoneSideOf } from './sig';
import { levelXA, zoneTfCounts, type XabcdShape } from './xabcd';
import type { Rect } from './frz';

/** Preis der Ausdehnung 1.618 der Fib X → A jenseits von X: hier ist die Crab vollendet (CRB-04) */
export const dTargetOfCrab = (s: XabcdShape): number => levelXA(s, 1 + CRB_PARAMS.dExtension);

/**
 * Zonen (Fraktal- und Engulf-Zonen) nahe `price`, die weder erst das D bilden noch die Zone von X sind:
 * das D liegt jenseits von X, die gebrochene X-Zone allein zählt nicht als unverletzte Zone (CRB-12).
 */
export function zonesNearOutsideX(env: Env, tf: ContextTimeframe, s: XabcdShape, price: number, near: number): Rect[] {
  const view = env.views.get(tf)!;
  const tradeZone = zoneSideOf(s.side);
  const dTime = s.d ? view.bars[s.d.idx].time : Infinity;
  const xTime = view.bars[s.x.idx].time;
  const out: Rect[] = [];
  for (const z of [...env.frz.zones, ...env.frz.reversed]) {
    const formedByD = z.fractalTimes.every((ft) => ft >= dTime);
    const isXZone = z.tf === tf && z.fractalTimes.includes(xTime);
    if (z.side === tradeZone && zoneTfCounts(z.tf, tf) && !formedByD && !isXZone && gapToRect(z.rect, price) <= near) out.push(z.rect);
  }
  for (const z of engulfZones(view.bars, view.wide)) {
    const formedByD = s.d !== null && z.idx >= s.d.idx;
    if (z.holds && z.side === s.side && !formedByD && z.idx !== s.x.idx && gapToRect(z.rect, price) <= near) out.push(z.rect);
  }
  return out;
}
