/**
 * D-Pfeil (1124-F2): was der Kurs tun muss, bevor das D einer Harmonik steht.
 * Reine Funktion: Koordinaten kommen als Funktionen herein; das Ergebnis ist ein Modell in Pixeln, das `FormationLayer` zeichnet.
 *
 * Zustände:
 *  - `wait`:    Formation gültig oder im Aufbau, D fehlt. Das D-Niveau ist kräftig, der Pfeil geht vom letzten Schluss zum D-Ring.
 *  - `near`:    wie `wait`, der Rest bis D ist klein: der Ring blinkt (nur ohne reduzierte Bewegung).
 *  - `bBreak`:  die Pflicht „eine Kerze schließt jenseits von B“ fehlt: der Pfeil geht zu B, das D-Niveau ist blass.
 *  - `invalid`: ungültig. Kein D-Pfeil. Ist die B-Tiefe die Ursache, zeigt die Zeichnung am B den Grund (rote Linie, roter Pfeil, Pip).
 * Bei einem gebildeten D (gültig mit Punkt D) und bei allen anderen Urteilen gibt es kein Modell.
 */
import { expectedD } from './drawingLayout';
import { FINAL_POINT, type ScanFormation } from './scan';
import type { Candidate, Side } from './types';

export type DArrowState = 'wait' | 'near' | 'bBreak' | 'invalid';

/** Rest bis zum D (in Pips), ab dem der Ring blinkt */
export const NEAR_PIPS = 5;

/** Kürzester Abstand B ↔ Niveau (px), bei dem ein Pfeil mit Schrift daneben noch lesbar ist */
export const MIN_REASON_ARROW_PX = 30;

/** Regeln einer Formation, an denen der Pfeil hängt; was fehlt, bleibt ohne Zeichnung (bei Ungültig nur der Hinweis) */
interface FormRules {
  /** Pflicht „eine Kerze schließt jenseits von B“ */
  bBreak?: string;
  /** B-Tiefe (Pflicht): Regel, Zeichnung mit dem Fib von X nach A und die Stelle der Stufen in `levels`; `dLevel` ist die Stufe des D-Niveaus */
  bDepth?: { rule: string; drawing: string; level: number; dLevel: number; leg: string };
}

const RULES: Partial<Record<ScanFormation, FormRules>> = {
  BUT: { bBreak: 'BUT-06', bDepth: { rule: 'BUT-02', drawing: 'Z-BUT-01', level: 0, dLevel: 2, leg: 'XA' } },
  CRB: { bBreak: 'CRB-05' },
  CYP: { bBreak: 'CYP-15' },
};

export interface DArrowInput {
  candidate: Candidate;
  form: ScanFormation;
  width: number;
  lastBar: { time: number; close: number };
  barSec: number;
  /** Ein Pip in Preis */
  pip: number;
  x: (time: number) => number | null;
  y: (price: number) => number | null;
  text: (key: string, params?: Record<string, string | number>) => string;
  fmt: (n: number) => string;
  /** Preis-Pips mit einer Nachkommastelle */
  pips: (n: number) => string;
  /** Kurztext der Regel (nie die ID) */
  ruleName: (id: string) => string;
}

export interface DArrowModel {
  state: DArrowState;
  side: Side;
  /** D-Niveau: Linie über den Chart, Beschriftung links */
  level: { y: number; x1: number; x2: number; label: string; strength: 'strong' | 'faint' } | null;
  /** Pfeil vom letzten Schluss zum Ziel (D-Ring oder B) */
  arrow: { x1: number; y1: number; x2: number; y2: number; color: string } | null;
  /** Ring des D (nur `near`: blinkt) */
  ring: { x: number; y: number } | null;
  /** Grund bei Ungültig (B zu flach) */
  reason: {
    lineY: number;
    x1: number;
    x2: number;
    lineLabel: string;
    fill: { y: number; h: number };
    /** Pfeil von B zum Niveau und seine Beschriftung; null, wenn der Abstand für Pfeil und Schrift zu kurz ist (dann steht „n pip eksik“ in `lineLabel`) */
    arrow: { x: number; y1: number; y2: number } | null;
    /** Schrift links vom Pfeil, rechtsbündig bei `x` (rechts vom Pfeil läge sie am Rand des Charts außerhalb) */
    arrowLabel: { x: number; y: number; text: string } | null;
    /** Richtung von B zum Niveau (+1: Niveau liegt unter B auf dem Bildschirm): Schriften stehen auf den Seiten, die der Strecke ausweichen */
    dir: 1 | -1;
    b: { x: number; y: number; label: string };
  } | null;
  pill: { x: number; y: number; main: string; badge: string; color: string };
  /** Trefferfläche des Hovers */
  hit: { x: number; y: number; w: number; h: number };
  tip: { title: string; body: string; meta: string };
}

/** Preis eines Fib-Niveaus der Zeichnung `drawing` (Anker X → A: A + Stufe × (X − A)) */
function fibLevel(c: Candidate, drawing: string, index: number): { price: number; ratio: number } | null {
  const d = c.drawings.find((z) => z.id === drawing);
  const [start, end] = d?.anchors ?? [];
  const ratio = d?.levels?.[index];
  if (!start || !end || ratio === undefined) return null;
  return { price: end.price + ratio * (start.price - end.price), ratio };
}

/** D-Niveau: Fib der Formation (wenn sie eins nennt), sonst Ziellinie, Mitte der D-Zone oder Einstieg */
function dLevelOf(c: Candidate, form: ScanFormation): { price: number; ratio: number | null } | null {
  const rules = RULES[form];
  if (rules?.bDepth) {
    const f = fibLevel(c, rules.bDepth.drawing, rules.bDepth.dLevel);
    if (f) return f;
  }
  const hline = c.drawings.find((d) => d.tool === 'hline')?.anchors[0]?.price;
  const zone = c.drawings.find((d) => d.tool === 'zone')?.anchors;
  const price = hline ?? (zone && zone.length >= 2 ? (zone[0].price + zone[1].price) / 2 : (c.trade?.entry ?? null));
  return price === null || price === undefined ? null : { price, ratio: null };
}

const COLOR = { buy: 'var(--success)', sell: 'var(--danger)', warn: 'var(--warning)', bad: 'var(--danger)', target: 'var(--info)', muted: 'var(--muted-foreground)' } as const;

export function layoutDArrow(input: DArrowInput): DArrowModel | null {
  const { candidate: c, form, width, lastBar, barSec, pip, x, y, text, fmt, pips, ruleName } = input;
  if (FINAL_POINT[form] !== 'D' || pip <= 0) return null;
  const rules = RULES[form];
  const side = c.side;
  const lx0 = x(lastBar.time);
  const ly = y(lastBar.close);
  if (lx0 === null || ly === null) return null;
  const lx = lx0 + 6;
  const dLevel = dLevelOf(c, form);
  const sideWord = text(side === 'buy' ? 'formation.dArrow.buy' : 'formation.dArrow.sell');
  const targetLabel = (ratio: number | null) =>
    ratio !== null && rules?.bDepth ? text('formation.dArrow.targetRatio', { leg: rules.bDepth.leg, ratio: fmt(ratio) }) : text('formation.dArrow.target');
  const levelX1 = (() => {
    const p = c.points.X ?? c.points.A;
    const px = p ? x(p.time) : null;
    return px === null ? 0 : Math.max(0, px);
  })();

  // ---- Ungültig: kein D-Pfeil, der Grund steht dort, wo er entsteht ----
  if (c.verdict === 'invalid') {
    const causes = c.invalidBy ?? [];
    const cause = causes[0];
    const dy = dLevel ? y(dLevel.price) : null;
    const level: DArrowModel['level'] = dLevel && dy !== null ? { y: dy, x1: levelX1, x2: width - 6, label: text('formation.dArrow.notSearched'), strength: 'faint' } : null;
    const depth = rules?.bDepth;
    const need = depth && cause === depth.rule ? fibLevel(c, depth.drawing, depth.level) : null;
    const B = c.points.B;
    const A = c.points.A;
    const bx = B ? x(B.time) : null;
    const by = B ? y(B.price) : null;
    const ay = A ? x(A.time) : null;
    const ny = need ? y(need.price) : null;
    const name = cause ? ruleName(cause) : '';
    const pillY = ly + 22;
    const missing = need && B ? Math.abs(B.price - need.price) / pip : null;
    const rB = depth ? c.checks.find((k) => k.id === depth.rule)?.value : undefined;
    const depthBadge = need && rB !== undefined && depth ? `B ${fmt(rB)} < ${fmt(need.ratio)}` : null;
    const shortName = name.length > 30 ? `${name.slice(0, 29)}…` : name;
    const base = {
      state: 'invalid' as const,
      side,
      level,
      arrow: null,
      ring: null,
      pill: { x: Math.max(2, lx + 4), y: pillY, main: text('formation.dArrow.invalid'), badge: depthBadge ?? shortName, color: COLOR.bad },
    };
    if (need && depth && B && bx !== null && by !== null && ay !== null && ny !== null && missing !== null) {
      const x1 = Math.max(0, ay);
      const right = Math.min(width - 6, lx);
      const gap = Math.abs(ny - by);
      const long = gap >= MIN_REASON_ARROW_PX;
      const dir = ny >= by ? 1 : -1;
      const levelText = text('formation.dArrow.reasonLine', { leg: depth.leg, ratio: fmt(need.ratio), price: fmt(need.price) });
      const missingText = text('formation.dArrow.missing', { pips: pips(missing) });
      return {
        ...base,
        reason: {
          lineY: ny,
          x1,
          x2: right,
          lineLabel: long ? levelText : `${levelText} · ${missingText}`,
          fill: { y: Math.min(by, ny), h: gap },
          arrow: long ? { x: bx + 14, y1: by + dir * 2, y2: ny - dir } : null,
          arrowLabel: long ? { x: bx + 6, y: (by + ny) / 2 + 4, text: missingText } : null,
          dir,
          b: { x: bx, y: by, label: text('formation.dArrow.bAt', { ratio: rB === undefined ? '' : fmt(rB) }).trim() },
        },
        hit: { x: x1, y: Math.min(by, ny) - 24, w: Math.max(40, right - x1), h: Math.abs(ny - by) + 48 },
        tip: {
          title: text('formation.dArrow.tip.invalidDepth.title'),
          body: text('formation.dArrow.tip.invalidDepth.body', { rule: name, leg: depth.leg, ratio: fmt(need.ratio), pips: pips(missing) }),
          meta: text('formation.dArrow.tip.invalidDepth.meta', { b: fmt(B.price), need: fmt(need.price) }),
        },
      };
    }
    return {
      ...base,
      reason: null,
      hit: { x: Math.max(0, lx - 160), y: pillY - 14, w: Math.min(width, 200), h: 28 },
      tip: { title: text('formation.dArrow.tip.invalid.title'), body: text('formation.dArrow.tip.invalid.body', { rule: name || '—' }), meta: text('formation.dArrow.tip.invalid.meta', { close: fmt(lastBar.close) }) },
    };
  }

  // ---- Im Aufbau: ein erwartetes D gibt es nur dann, wenn Niveau und Zeit stehen ----
  if (c.verdict !== 'forming') return null;
  const exp = expectedD(c, form, { time: lastBar.time, step: barSec });
  const price = exp?.price ?? dLevel?.price ?? null;
  if (price === null) return null;
  const ex = exp ? x(exp.time) : null;
  const dx = Math.min(width - 8, Math.max(ex ?? lx0, lx0));
  const dy = y(price);
  if (dy === null) return null;
  const ratio = dLevel && Math.abs(dLevel.price - price) < 1e-9 ? dLevel.ratio : null;
  const breakCheck = rules?.bBreak ? c.checks.find((k) => k.id === rules.bBreak) : undefined;
  const bPending = breakCheck?.state === 'unmet';
  const missingRules = c.checks.filter((k) => k.kind === 'required' && k.state !== 'met').map((k) => ruleName(k.id));
  const remaining = Math.abs(lastBar.close - price) / pip;
  const strongLevelX1 = levelX1;

  if (bPending && c.points.B) {
    const B = c.points.B;
    const by = y(B.price);
    if (by !== null) {
      const above = ly < by;
      const ty = by + (above ? -8 : 8);
      return {
        state: 'bBreak',
        side,
        level: { y: dy, x1: strongLevelX1, x2: width - 6, label: targetLabel(ratio), strength: 'faint' },
        arrow: { x1: lx, y1: ly, x2: dx - 2, y2: ty, color: COLOR.warn },
        ring: null,
        reason: null,
        pill: { x: Math.max(2, dx - 12), y: by + (above ? -26 : 26), main: text('formation.dArrow.bPill', { price: fmt(B.price) }), badge: text('formation.dArrow.bBadge'), color: COLOR.warn },
        hit: { x: Math.max(0, Math.min(lx, dx) - 150), y: Math.min(ly, by) - 44, w: Math.abs(dx - lx) + 170, h: Math.abs(by - ly) + 70 },
        tip: {
          title: text('formation.dArrow.tip.b.title'),
          body: text('formation.dArrow.tip.b.body', { price: fmt(B.price) }),
          meta: text('formation.dArrow.tip.meta', { close: fmt(lastBar.close), pips: pips(Math.abs(lastBar.close - B.price) / pip), missing: missingRules.join(', ') }),
        },
      };
    }
  }

  const near = remaining <= NEAR_PIPS;
  const color = COLOR[side];
  const above = ly < dy;
  const ty = dy + (above ? -8 : 8);
  return {
    state: near ? 'near' : 'wait',
    side,
    level: { y: dy, x1: strongLevelX1, x2: width - 6, label: targetLabel(ratio), strength: 'strong' },
    arrow: { x1: lx, y1: ly, x2: dx - 5, y2: ty, color },
    ring: near ? { x: dx, y: dy } : null,
    reason: null,
    pill: { x: Math.max(2, dx - 14), y: dy + (above ? 26 : -26), main: `${sideWord} ${fmt(price)}`, badge: text('formation.dArrow.badge', { pips: pips(remaining) }), color },
    hit: { x: Math.max(0, Math.min(lx, dx) - 150), y: Math.min(ly, dy) - 44, w: Math.abs(dx - lx) + 170, h: Math.abs(dy - ly) + 70 },
    tip: {
      title: text(near ? 'formation.dArrow.tip.near.title' : 'formation.dArrow.tip.wait.title', { side: sideWord }),
      body: text('formation.dArrow.tip.wait.body', { price: fmt(price), side: sideWord }),
      meta: text('formation.dArrow.tip.meta', { close: fmt(lastBar.close), pips: pips(remaining), missing: missingRules.join(', ') }),
    },
  };
}
