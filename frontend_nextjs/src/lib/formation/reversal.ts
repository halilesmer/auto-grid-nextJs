/**
 * Vollständige Umkehrprüfung am Formationspunkt (BUT-16, CRB-16, GAR, BAT, CYP, ABCD-20, CDT-13):
 * Struktur des Engulf (SIG-23, SIG-25) mit volumenstarker umschlossener Kerze (SIG-24) und volumenstarken Engulf-Kerzen
 * bei zwei Kerzen (SIG-25), dazu der Ort (SIG-26): ein Docht der Engulf-Kerzen liegt am Formationspunkt.
 * Das Regelbuch nennt keine zeitliche Grenze; geprüft werden alle Kerzen ab der Kerze des Punkts.
 */
import { gapToRect } from './abcd';
import type { ContextTimeframe } from './params';
import { ABCD_PARAMS } from './params';
import { touches, type Env } from './reasons';
import { engulfAt, zoneSideOf } from './sig';
import type { Rect } from './frz';
import type { CheckState, Side } from './types';

export interface ReversalAnchor {
  idx: number;
  price: number;
}

/**
 * Umkehrkerze in Trade-Richtung ab der Kerze von `anchor` (Index in `tf`) in den Zeiteinheiten `scans`.
 * Ort = Band um den Preis des Punkts (`ABCD_PARAMS.nearAtr` × ATR der Formations-Zeiteinheit) und Fraktalzonen der
 * Trade-Seite, die höchstens so weit vom Punkt entfernt liegen. Ohne ATR oder bei unbekannter Volumenstärke nicht messbar.
 */
export function reversalAt(env: Env, tf: ContextTimeframe, side: Side, anchor: ReversalAnchor, scans: readonly ContextTimeframe[]): CheckState {
  const base = env.views.get(tf);
  const atr = base ? (base.atr[anchor.idx] ?? null) : null;
  if (!base || atr === null) return 'unmeasurable';
  const near = ABCD_PARAMS.nearAtr * atr;
  const places: Rect[] = [{ top: anchor.price + near, bottom: anchor.price - near }];
  for (const z of [...env.frz.zones, ...env.frz.reversed]) {
    if (z.side === zoneSideOf(side) && scans.includes(z.tf) && gapToRect(z.rect, anchor.price) <= near) places.push(z.rect);
  }
  const from = base.bars[anchor.idx].time;
  let unknown = false;
  for (const x of scans) {
    const view = env.views.get(x);
    if (!view) continue;
    for (let k = 0; k < view.bars.length; k++) {
      if (view.bars[k].time < from) continue;
      const e = engulfAt(view.bars, view.wide, k, side);
      if (!e) continue;
      const strong = [e.prevWide, ...(e.count === 2 ? [e.engulfWide] : [])];
      if (strong.some((w) => w === false)) continue;
      if (!view.bars.slice(e.prevIdx, e.idx + 1).some((b) => places.some((r) => touches(r, b)))) continue;
      if (strong.some((w) => w === null)) unknown = true;
      else return 'met';
    }
  }
  return unknown ? 'unmeasurable' : 'unmet';
}
