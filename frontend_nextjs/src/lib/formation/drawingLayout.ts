/**
 * Zeichnungen der Erkennung (`Drawing`) → SVG-Bausteine für das Overlay über dem Chart.
 * Reine Funktion: Koordinaten kommen als Funktionen herein (Zeit → x, Preis → y, RSI → y), Texte als Funktion.
 * Jede Gruppe trägt die Zeichnungs-ID und die Bedingungs-IDs, damit der Hover Zeile ↔ Zeichnung koppeln kann.
 */
import { FINAL_POINT, type ScanFormation } from './scan';
import type { Candidate, Drawing } from './types';

export type Tone = 'side' | 'ratio' | 'target' | 'zone' | 'mark' | 'text';

export type Prim =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; tone: Tone; dashed?: boolean; width?: number; dotted?: boolean }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; tone: Tone; dashed?: boolean }
  | { kind: 'circle'; x: number; y: number; r: number; tone: Tone; open?: boolean }
  | { kind: 'text'; x: number; y: number; text: string; tone: Tone; anchor?: 'start' | 'end'; bold?: boolean };

export interface DrawingGroup {
  id: string;
  rules: string[];
  prims: Prim[];
}

export interface LayoutInput {
  candidate: Candidate;
  form: ScanFormation;
  /** Rechte Kante des Zeichenbereichs (ohne Preisachse) */
  width: number;
  /** Letzte geschlossene Kerze: Ziel des gestrichelten Weges bei einer Formation im Aufbau */
  lastBar: { time: number; close: number };
  x: (time: number) => number | null;
  y: (price: number) => number | null;
  /** RSI-Wert → y im RSI-Pane (null: Pane nicht vorhanden) */
  yRsi: (value: number) => number | null;
  text: (key: string, params?: Record<string, string | number>) => string;
  fmt: (n: number) => string;
}

/** Zonen im RSI-Pane: ihre „Preise“ sind RSI-Werte */
const RSI_ZONES = new Set(['Z-CDT-04']);

const pointName = (c: Candidate, time: number, price: number): string | null =>
  Object.entries(c.points).find(([, a]) => a.time === time && a.price === price)?.[0] ?? null;

export function layoutDrawings(input: LayoutInput): DrawingGroup[] {
  const { candidate, form, width, lastBar, x, y, yRsi, text, fmt } = input;
  const forming = candidate.verdict === 'forming' && candidate.points[FINAL_POINT[form]] === undefined;
  const out: DrawingGroup[] = [];

  for (const d of candidate.drawings) {
    const prims = primsOf(d);
    if (prims.length > 0) out.push({ id: d.id, rules: d.rules, prims });
  }
  return out;

  function primsOf(d: Drawing): Prim[] {
    const pts = d.anchors.map((a) => ({ a, px: x(a.time), py: y(a.price) }));
    const right = (px: number) => Math.min(width, Math.max(px, 0));
    const prims: Prim[] = [];
    switch (d.tool) {
      case 'zigzag': {
        const ok = pts.filter((p): p is typeof p & { px: number; py: number } => p.px !== null && p.py !== null);
        for (let i = 1; i < ok.length; i++) prims.push({ kind: 'line', x1: ok[i - 1].px, y1: ok[i - 1].py, x2: ok[i].px, y2: ok[i].py, tone: 'side', width: 2.2 });
        const high = (i: number) => (i > 0 ? ok[i].py < ok[i - 1].py : ok.length > 1 && ok[0].py < ok[1].py);
        ok.forEach((p, i) => {
          prims.push({ kind: 'circle', x: p.px, y: p.py, r: 4, tone: 'text' });
          const name = pointName(candidate, p.a.time, p.a.price);
          if (name) prims.push({ kind: 'text', x: p.px - 4, y: p.py + (high(i) ? -9 : 17), text: name, tone: 'text', bold: true });
        });
        const last = ok[ok.length - 1];
        const ly = y(lastBar.close);
        if (forming && last && ly !== null) {
          const lx = x(lastBar.time);
          if (lx !== null) {
            prims.push({ kind: 'line', x1: last.px, y1: last.py, x2: lx, y2: ly, tone: 'side', dashed: true, width: 2 });
            prims.push({ kind: 'circle', x: lx, y: ly, r: 5, tone: 'side', open: true });
            prims.push({ kind: 'text', x: lx - 4, y: ly + (ly > last.py ? 17 : -9), text: `${FINAL_POINT[form]}?`, tone: 'side', bold: true });
          }
        }
        return prims;
      }
      case 'fib':
      case 'fibExt': {
        const [start, end] = pts;
        if (!start || !end || end.px === null || !d.levels) return prims;
        for (const level of d.levels) {
          const price = end.a.price + level * (start.a.price - end.a.price);
          const py = y(price);
          if (py === null) continue;
          const tone: Tone = d.rules.length === 0 ? 'target' : 'ratio';
          prims.push({ kind: 'line', x1: right(Math.min(end.px, start.px ?? end.px)), y1: py, x2: width - 6, y2: py, tone, dotted: true });
          prims.push({ kind: 'text', x: width - 6, y: py - 4, text: fmt(level), tone, anchor: 'end' });
        }
        return prims;
      }
      case 'hline': {
        const p = pts[0];
        if (!p || p.px === null || p.py === null) return prims;
        prims.push({ kind: 'line', x1: right(p.px), y1: p.py, x2: width - 6, y2: p.py, tone: 'target', dotted: true });
        return prims;
      }
      case 'zone': {
        const [p0, p1] = pts;
        if (!p0 || !p1) return prims;
        const rsi = RSI_ZONES.has(d.id);
        const py = (price: number) => (rsi ? yRsi(price) : y(price));
        const ya = py(p0.a.price);
        const yb = py(p1.a.price);
        if (p0.px === null || ya === null || yb === null) return prims;
        const x2 = p1.px === null || p1.a.time >= lastBar.time ? width : p1.px;
        const x1 = Math.max(0, p0.px);
        prims.push({ kind: 'rect', x: x1, y: Math.min(ya, yb), w: Math.max(0, x2 - x1), h: Math.max(2, Math.abs(ya - yb)), tone: rsi ? 'mark' : 'zone', dashed: true });
        if (!rsi) prims.push({ kind: 'text', x: x1 + 6, y: Math.min(ya, yb) + 12, text: text(forming ? 'formation.draw.zonePossible' : 'formation.draw.zone'), tone: 'zone' });
        return prims;
      }
      case 'trendline': {
        const [p0, p1] = pts;
        if (!p0 || !p1 || p0.px === null || p0.py === null || p1.px === null || p1.py === null) return prims;
        prims.push({ kind: 'line', x1: p0.px, y1: p0.py, x2: p1.px, y2: p1.py, tone: 'ratio', width: 2 });
        return prims;
      }
      case 'label': {
        const [p0, p1] = pts;
        if (!p0 || p0.py === null) return prims;
        const key = p1 ? 'formation.draw.stop' : 'formation.draw.levelOne';
        prims.push({ kind: 'text', x: width - 6, y: p0.py - 4, text: text(key), tone: 'target', anchor: 'end' });
        if (p1 && p1.py !== null) prims.push({ kind: 'text', x: width - 6, y: p1.py - 4, text: text('formation.draw.target'), tone: 'target', anchor: 'end' });
        return prims;
      }
      case 'marker': {
        const final = candidate.points[FINAL_POINT[form]];
        if (!final || forming) return prims;
        const px = x(final.time);
        const py = y(final.price);
        if (px === null || py === null) return prims;
        prims.push({ kind: 'rect', x: px - 9, y: py - 9, w: 18, h: 18, tone: 'mark' });
        return prims;
      }
      case 'rsi': {
        for (const p of pts) {
          const ry = yRsi(p.a.price);
          if (p.px !== null && ry !== null) prims.push({ kind: 'circle', x: p.px, y: ry, r: 5, tone: 'mark', open: true });
        }
        return prims;
      }
      default:
        return prims;
    }
  }
}
