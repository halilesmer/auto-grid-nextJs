/**
 * Gemeinsame Bausteine der Tests für T618, ENC und KEI (Linienformationen).
 * `lineRows(punkte)` setzt 40 flache Vorlaufkerzen (Wave und ATR brauchen Anlauf) vor die Wendepunkte; der k-te Wendepunkt liegt bei
 * 8 Kerzen je Zug auf Index `at(k)` = 42 + 8k. `buy = true` spiegelt die Reihe an der Achse 400 und wählt die Gegenseite der Dochtspitzen.
 */
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import type { Anchor, Candidate, CheckState } from '../../src/lib/formation/types';
import { H1, H4, barsOf, mirror, plain, zig, type Row } from './formation-rows';

export const U: CheckState = 'unmeasurable';
export const M: CheckState = 'met';
export const N: CheckState = 'unmet';

export const AXIS = 400;
export const LEAD = 40;
export const LEG = 8;

export const lineRows = (points: number[], legs: number | number[] = LEG, tail = 3, lead = LEAD): Row[] => [
  ...Array.from({ length: lead }, () => plain(points[0] + 2.2, points[0] + 2.2)),
  ...zig(points, legs, tail),
];
/** Kerzenindex des k-ten Wendepunkts bei gleichmäßigen Zügen */
export const at = (k: number, lead = LEAD, leg = LEG): number => lead + 2 + leg * k;

export const ctxOf = (rows: Row[], extra: { H1?: Row[] } = {}): FormationContext => {
  const input: ContextInput = { H4: barsOf(rows, H4) };
  if (extra.H1) input.H1 = barsOf(extra.H1, H1);
  return new FormationContext('TEST', input);
};

/** Dochtspitze der Kerze `idx`: Hoch oder Tief; beim Kauf (gespiegelte Reihe) die Gegenseite */
export const tip = (rows: Row[], idx: number, high: boolean, buy: boolean): Anchor => ({ time: idx * H4, price: high !== buy ? rows[idx][1] : rows[idx][2] });

/** Aufwärts- bzw. Abwärtstrend in H1 (kleine Wellen, steigende Tiefs), lang genug für die Reihen der Formationen */
export const trendH1 = (up: boolean): Row[] => {
  const pts = Array.from({ length: 26 }, (_, i) => 100 + 5 * i + (i % 2 === 1 ? 9 : 0));
  const rows = zig(pts, 16, 30);
  return up ? rows : mirror(rows, AXIS);
};

export const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
export const state = (c: Candidate, id: string): CheckState => find(c, id).state;
export const statesOf = (c: Candidate) => c.checks.map((x) => [x.id, x.state]);
