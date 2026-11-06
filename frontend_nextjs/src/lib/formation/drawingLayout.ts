/**
 * Zeichnungen der Erkennung (`Drawing`) → SVG-Bausteine für das Overlay über dem Chart.
 * Reine Funktion: Koordinaten kommen als Funktionen herein (Zeit → x, Preis → y, RSI → y), Texte als Funktion.
 * Jede Gruppe trägt die Zeichnungs-ID und die Bedingungs-IDs, damit der Hover Zeile ↔ Zeichnung koppeln kann.
 */
import { FINAL_POINT, type ScanFormation } from './scan';
import type { Anchor, Candidate, Drawing } from './types';
import type { FormationLineRole } from './lineStyle';

export type Tone = 'side' | 'ratio' | 'target' | 'zone' | 'mark' | 'text';

export type Prim =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; tone: Tone; role: FormationLineRole; dashed?: boolean; width?: number; dotted?: boolean }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; tone: Tone; role?: FormationLineRole; dashed?: boolean }
  | { kind: 'circle'; x: number; y: number; r: number; tone: Tone; open?: boolean }
  | { kind: 'text'; x: number; y: number; text: string; tone: Tone; anchor?: 'start' | 'end'; bold?: boolean };

export interface DrawingGroup {
  id: string;
  rules: string[];
  /** price: Kerzen-Pane (außerhalb des Preisbereichs abgeschnitten), rsi: RSI-Pane */
  pane: 'price' | 'rsi' | 'wave';
  prims: Prim[];
}

export interface LayoutInput {
  candidate: Candidate;
  form: ScanFormation;
  /** Rechte Kante des Zeichenbereichs (ohne Preisachse) */
  width: number;
  /** Letzte geschlossene Kerze: Ziel des gestrichelten Weges bei einer Formation im Aufbau */
  lastBar: { time: number; close: number };
  /** Dauer einer Kerze in Sekunden: ein D, dessen Zeit schon vergangen ist, rückt eine Kerze hinter die letzte Kerze (R1-07) */
  barSec?: number;
  /** Stapel der Abzeichen am rechten Rand (Kanten): die Preisschrift des erwarteten D weicht ihm nach links aus (R1-08) */
  stack?: { left: number; top: number; bottom: number } | null;
  x: (time: number) => number | null;
  y: (price: number) => number | null;
  /** RSI-Wert → y im RSI-Pane (null: Pane nicht vorhanden) */
  yRsi: (value: number) => number | null;
  /** Wave-Wert → y im Wave-Pane (null: Pane nicht vorhanden); noch ohne Zeichnung, die Divergenzlinie folgt (FRM-36) */
  yWave: (value: number) => number | null;
  text: (key: string, params?: Record<string, string | number>) => string;
  fmt: (n: number) => string;
}

/** Zonen im RSI-Pane: ihre „Preise“ sind RSI-Werte */
const RSI_ZONES = new Set(['Z-CDT-04']);

/** Preis eines Fib-Levels: zwei Anker → Ende + Level × (Start − Ende); mit drittem Anker C (fibExt) → C + Level × (B − A) */
const fibLevelPrice = ([start, end, from]: [Anchor, Anchor, Anchor?], level: number): number =>
  from ? from.price + level * (end.price - start.price) : end.price + level * (start.price - end.price);

/** Zeichnet die Erkennung einen Zickzack? Dieselbe Quelle wie `primsOf`; die Legende zeigt die Zickzack-Zeile nur dann */
export const drawsZigzag = (c: Candidate): boolean => c.drawings.some((d) => d.tool === 'zigzag');

/**
 * Erwartetes D einer Formation im Aufbau (A5.5): Preis = Zielniveau (Linie „Level 1“, sonst Mitte der D-Zone, sonst Einstieg),
 * Zeit = C plus die Dauer von AB (liegt rechts der letzten Kerze). Null, wenn die Formation kein D hat, fertig ist oder das Niveau fehlt.
 */
export function expectedD(c: Candidate, form: ScanFormation, after?: { time: number; step: number }): { time: number; price: number } | null {
  // Wie beim Zeichnen: ein gemessenes D zählt erst, wenn es im Zickzack steht (Ziel erreicht)
  const d = c.points.D;
  const reached = d !== undefined && c.drawings.some((x) => x.tool === 'zigzag' && x.anchors.some((a) => a.time === d.time && a.price === d.price));
  if (FINAL_POINT[form] !== 'D' || c.verdict !== 'forming' || reached) return null;
  const { A, B, C } = c.points;
  if (!A || !B || !C) return null;
  const hline = c.drawings.find((d) => d.tool === 'hline')?.anchors[0]?.price;
  const zone = c.drawings.find((d) => d.tool === 'zone')?.anchors;
  const price = hline ?? (zone && zone.length >= 2 ? (zone[0].price + zone[1].price) / 2 : (c.trade?.entry ?? null));
  if (price === null || price === undefined) return null;
  const time = C.time + Math.max(0, B.time - A.time);
  // Abgelaufene Zeit (R1-07): das D steht frühestens eine Kerze hinter der letzten Kerze, nie zwischen geschlossenen Kerzen
  return { time: after ? Math.max(time, after.time + after.step) : time, price };
}

const pointName = (c: Candidate, time: number, price: number): string | null =>
  Object.entries(c.points).find(([, a]) => a.time === time && a.price === price)?.[0] ?? null;

export function layoutDrawings(input: LayoutInput): DrawingGroup[] {
  const { candidate, form, width, lastBar, barSec, stack, x, y, yRsi, text, fmt } = input;
  const final = candidate.points[FINAL_POINT[form]];
  // „Im Aufbau“ mit offenem Endpunkt: der Endpunkt fehlt oder ist noch nicht Teil des Zickzacks (Ziel nicht erreicht)
  const zigzag = candidate.drawings.find((d) => d.tool === 'zigzag');
  const reached = final !== undefined && zigzag !== undefined && zigzag.anchors.some((a) => a.time === final.time && a.price === final.price);
  const forming = candidate.verdict === 'forming' && !reached;
  const out: DrawingGroup[] = [];

  for (const d of candidate.drawings) {
    const prims = primsOf(d);
    if (prims.length > 0) out.push({ id: d.id, rules: d.rules, pane: d.tool === 'rsi' || RSI_ZONES.has(d.id) ? 'rsi' : 'price', prims });
  }
  return separateLabels(mergeLabels(out));

  /** Beschriftung der Zone: erste Stelle (links/rechts, innen/außen), an der sie keinen Formationspunkt verdeckt */
  function zoneLabelSpot(label: string, z: { x1: number; x2: number; top: number; bottom: number }) {
    const w = label.length * 6;
    const dots = [...Object.values(candidate.points), ...(candidate.heldPoint ? [candidate.heldPoint] : [])].flatMap((a) => {
      const px = x(a.time);
      const py = y(a.price);
      return px === null || py === null ? [] : [{ px, py }];
    });
    const covers = (left: number, baseline: number) => dots.some((p) => p.px > left - 8 && p.px < left + w + 8 && p.py > baseline - 22 && p.py < baseline + 10);
    const spots = [
      { x: z.x1 + 6, y: z.top + 12, anchor: 'start' as const },
      { x: z.x2 - 6, y: z.top + 12, anchor: 'end' as const },
      { x: z.x1 + 6, y: z.top - 4, anchor: 'start' as const },
      { x: z.x2 - 6, y: z.bottom + 14, anchor: 'end' as const },
      { x: z.x1 + 6, y: z.bottom + 14, anchor: 'start' as const },
    ];
    return spots.find((sp) => !covers(sp.anchor === 'start' ? sp.x : sp.x - w, sp.y)) ?? spots[0];
  }

  function primsOf(d: Drawing): Prim[] {
    const pts = d.anchors.map((a) => ({ a, px: x(a.time), py: y(a.price) }));
    const right = (px: number) => Math.min(width, Math.max(px, 0));
    const prims: Prim[] = [];
    switch (d.tool) {
      case 'zigzag': {
        const ok = pts.filter((p): p is typeof p & { px: number; py: number } => p.px !== null && p.py !== null);
        for (let i = 1; i < ok.length; i++) prims.push({ kind: 'line', x1: ok[i - 1].px, y1: ok[i - 1].py, x2: ok[i].px, y2: ok[i].py, tone: 'side', role: 'zigzag', width: 2.2 });
        const high = (i: number) => (i > 0 ? ok[i].py < ok[i - 1].py : ok.length > 1 && ok[0].py < ok[1].py);
        ok.forEach((p, i) => {
          prims.push({ kind: 'circle', x: p.px, y: p.py, r: 4, tone: 'text' });
          const name = pointName(candidate, p.a.time, p.a.price);
          if (name) prims.push({ kind: 'text', x: p.px - 4, y: p.py + (high(i) ? -9 : 17), text: name, tone: 'text', bold: true });
        });
        const last = ok[ok.length - 1];
        // Ziel des offenen Weges: der noch nicht erreichte Endpunkt, sonst die letzte Kerze
        const lx = final ? x(final.time) : x(lastBar.time);
        const ly = final ? y(final.price) : y(lastBar.close);
        // Gemessener, aber vom Urteil gehaltener Endpunkt: wie ein bestätigter Punkt an der Bruchkerze (durchgezogen, Name ohne „?“);
        // ein Zug, der die Bruchkerze schon enthält (Zielweg), zeichnet nichts dazu
        const held = candidate.heldPoint;
        if (forming && held) {
          const hx = x(held.time);
          const hy = y(held.price);
          if (last && hx !== null && hy !== null && !ok.some((p) => p.a.time === held.time)) {
            // Der Strich geht nur von einem gemessenen Punkt aus (nicht von einer Zielprojektion wie beim Mast der Trendfortsetzung)
            if (pointName(candidate, last.a.time, last.a.price)) prims.push({ kind: 'line', x1: last.px, y1: last.py, x2: hx, y2: hy, tone: 'side', role: 'zigzag', width: 2.2 });
            prims.push({ kind: 'circle', x: hx, y: hy, r: 4, tone: 'text' });
            prims.push({ kind: 'text', x: hx - 4, y: hy + (hy > last.py ? 17 : -9), text: FINAL_POINT[form], tone: 'text', bold: true });
          }
          return prims;
        }
        // Erwartetes D (A5.5): gestrichelter Weg von C zum Zielniveau, in der Zukunft rechts der letzten Kerze (am Rand abgeschnitten)
        const exp = forming ? expectedD(candidate, form, barSec ? { time: lastBar.time, step: barSec } : undefined) : null;
        const ex = exp ? x(exp.time) : null;
        const ey = exp ? y(exp.price) : null;
        if (forming && last && exp && ex !== null && ey !== null) {
          const dx = Math.min(width - 8, Math.max(ex, last.px));
          prims.push({ kind: 'line', x1: last.px, y1: last.py, x2: dx, y2: ey, tone: 'side', role: 'expected', dashed: true, width: 2 });
          prims.push({ kind: 'circle', x: dx, y: ey, r: 5, tone: 'side', open: true });
          // Name unter/über dem Ring, Preis auf der anderen Seite am rechten Rand; nahe am Rand steht der Name links vom Ring
          const below = ey > last.py;
          const edge = dx > width - 40;
          prims.push({ kind: 'text', x: edge ? dx - 8 : dx - 4, y: ey + (below ? 17 : -9), text: `${FINAL_POINT[form]}?`, tone: 'side', bold: true, ...(edge ? { anchor: 'end' as const } : {}) });
          // Der Stapel der Abzeichen sitzt am rechten Rand: schneidet die Preisschrift ihn, steht sie links davon (R1-08)
          const priceY = ey + (below ? -9 : 17);
          const hitsStack = stack != null && priceY - 12 < stack.bottom && priceY + 4 > stack.top;
          prims.push({ kind: 'text', x: hitsStack ? Math.min(width - 4, stack.left - 6) : width - 4, y: priceY, text: fmt(exp.price), tone: 'side', anchor: 'end', bold: true });
        } else if (forming && last && ly !== null) {
          if (lx !== null) {
            prims.push({ kind: 'line', x1: last.px, y1: last.py, x2: lx, y2: ly, tone: 'side', role: 'expected', dashed: true, width: 2 });
            prims.push({ kind: 'circle', x: lx, y: ly, r: 5, tone: 'side', open: true });
            prims.push({ kind: 'text', x: lx - 4, y: ly + (ly > last.py ? 17 : -9), text: `${FINAL_POINT[form]}?`, tone: 'side', bold: true });
          }
        }
        return prims;
      }
      case 'fib':
      case 'fibExt': {
        const [start, end] = pts;
        const from = d.tool === 'fibExt' ? pts[2] : undefined;
        if (!start || !end || end.px === null || !d.levels) return prims;
        const leg = [pointName(candidate, start.a.time, start.a.price), pointName(candidate, end.a.time, end.a.price)];
        const legName = leg[0] && leg[1] ? `${leg[0]}${leg[1]} ` : '';
        // Mit drittem Anker C beginnt die Linie bei C (fehlt dessen Pixelwert, bei B), sonst an der Strecke
        const lineStart = from ? (from.px ?? end.px) : Math.min(end.px, start.px ?? end.px);
        for (const level of d.levels) {
          const price = fibLevelPrice([start.a, end.a, from?.a], level);
          const py = y(price);
          if (py === null) continue;
          const tone: Tone = d.rules.length === 0 ? 'target' : 'ratio';
          prims.push({ kind: 'line', x1: right(lineStart), y1: py, x2: width - 6, y2: py, tone, role: tone === 'target' ? 'target' : 'ratio', dotted: true });
          prims.push({ kind: 'text', x: width - 6, y: py - 4, text: `${legName}${fmt(level)}`, tone, anchor: 'end' });
        }
        return prims;
      }
      case 'hline': {
        const p = pts[0];
        if (!p || p.px === null || p.py === null) return prims;
        prims.push({ kind: 'line', x1: right(p.px), y1: p.py, x2: width - 6, y2: p.py, tone: 'target', role: 'target', dotted: true });
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
        prims.push({ kind: 'rect', x: x1, y: Math.min(ya, yb), w: Math.max(0, x2 - x1), h: Math.max(2, Math.abs(ya - yb)), tone: rsi ? 'mark' : 'zone', ...(rsi ? {} : { role: 'zone' as const }), dashed: true });
        if (!rsi) {
          const label = text(forming ? 'formation.draw.zonePossible' : 'formation.draw.zone');
          const place = zoneLabelSpot(label, { x1, x2, top: Math.min(ya, yb), bottom: Math.max(ya, yb) });
          prims.push({ kind: 'text', x: place.x, y: place.y, text: label, tone: 'zone', anchor: place.anchor });
        }
        return prims;
      }
      case 'trendline': {
        const [p0, p1] = pts;
        if (!p0 || !p1 || p0.px === null || p0.py === null || p1.px === null || p1.py === null) return prims;
        prims.push({ kind: 'line', x1: p0.px, y1: p0.py, x2: p1.px, y2: p1.py, tone: 'ratio', role: 'neck', width: 2 });
        return prims;
      }
      case 'label': {
        const [p0, p1] = pts;
        if (!p0 || p0.py === null) return prims;
        const single = d.label ? (`formation.draw.${d.label}` as const) : 'formation.draw.levelOne';
        const key = p1 ? 'formation.draw.stop' : single;
        prims.push({ kind: 'text', x: width - 6, y: p0.py - 4, text: text(key), tone: 'target', anchor: 'end' });
        if (p1 && p1.py !== null) prims.push({ kind: 'text', x: width - 6, y: p1.py - 4, text: text('formation.draw.target'), tone: 'target', anchor: 'end' });
        return prims;
      }
      case 'marker': {
        // Z-LIB-07 trägt seinen eigenen Anker (Kerze, die das Ziel erreicht); die Marker der anderen Formationen sitzen am Endpunkt
        const at = form === 'LIB' ? d.anchors[0] : candidate.points[FINAL_POINT[form]];
        if (!at || forming) return prims;
        const px = x(at.time);
        const py = y(at.price);
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

/** Gleiche Beschriftung auf gleicher Höhe (zwei Zeichnungen, ein Level) nur einmal; die Linien bleiben */
function mergeLabels(groups: DrawingGroup[]): DrawingGroup[] {
  const seen = new Set<string>();
  return groups.map((g) => ({
    ...g,
    prims: g.prims.filter((p) => {
      if (p.kind !== 'text' || p.anchor !== 'end') return true;
      const key = `${p.text}|${Math.round(p.y / 3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  }));
}

const LABEL_GAP = 12;

/** Rechts ausgerichtete Beschriftungen, die näher als LABEL_GAP beieinander liegen, werden senkrecht auseinandergeschoben (von oben nach unten) */
function separateLabels(groups: DrawingGroup[]): DrawingGroup[] {
  const labels = groups.flatMap((g) => g.prims.filter((p): p is Extract<Prim, { kind: 'text' }> => p.kind === 'text' && p.anchor === 'end'));
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < LABEL_GAP) labels[i].y = labels[i - 1].y + LABEL_GAP;
  }
  return groups;
}

/** Preisspanne aller Zeichnungen im Kerzen-Pane (Zonen, Linien, Verhältnis-Level); der Chart weitet seine Preisachse darauf aus */
export function drawingPriceRange(candidate: Candidate): { min: number; max: number } | null {
  const prices: number[] = [];
  for (const d of candidate.drawings) {
    if (d.tool === 'rsi' || RSI_ZONES.has(d.id) || d.tool === 'wave') continue;
    if (d.tool === 'fib' || d.tool === 'fibExt') {
      const [start, end] = d.anchors;
      const from = d.tool === 'fibExt' ? d.anchors[2] : undefined;
      if (start && end) for (const level of d.levels ?? []) prices.push(fibLevelPrice([start, end, from], level));
    } else {
      prices.push(...d.anchors.map((a) => a.price));
    }
  }
  return prices.length === 0 ? null : { min: Math.min(...prices), max: Math.max(...prices) };
}

// ---------- Abzeichen am erwarteten D (A5.6, A5.6.1) ----------

export interface DItem {
  /** Schlüssel zum Auswählen (Formation und Zeitrahmen) */
  id: string;
  form: ScanFormation;
  candidate: Candidate;
}

export interface DBadge {
  id: string;
  selected: boolean;
  status: 'forming' | 'valid';
  /** Lage des D-Rings (Mitte) */
  x: number;
  y: number;
  /** Abzeichen: Text, linke obere Ecke und Größe */
  label: string;
  bx: number;
  by: number;
  w: number;
  h: number;
}

export interface DBand {
  x: number;
  top: number;
  bottom: number;
  label: string;
}

export interface DLayout {
  badges: DBadge[];
  /** Blasse Ringe der nicht gewählten Formationen */
  rings: { id: string; x: number; y: number }[];
  bands: DBand[];
}

export interface DLayoutInput {
  items: DItem[];
  selectedId: string | null;
  width: number;
  /** Höhe des Zeichenbereichs (Kerzen-Pane): der Stapel der Abzeichen bleibt darin (R1-08) */
  height: number;
  /** Zeit der letzten Kerze und Kerzendauer: ein vergangenes D rückt dahinter (R1-07) */
  lastTime: number;
  barSec: number;
  /** Letzter Schlusskurs: bestimmt die Reihenfolge im Stapel (nächstes D oben) */
  close: number;
  /** ATR der letzten Kerze: D-Niveaus näher als 1,5 ATR bilden ein Band; null: keine Bänder */
  atr: number | null;
  x: (time: number) => number | null;
  y: (price: number) => number | null;
  text: LayoutInput['text'];
  fmt: (n: number) => string;
}

const BADGE_H = 20;
const BADGE_GAP = 4;
export const BAND_ATR = 1.5;

export function layoutExpectedD(input: DLayoutInput): DLayout {
  const { items, selectedId, width, height, lastTime, barSec, close, atr, x, y, text, fmt } = input;
  const found = items.flatMap((it) => {
    const c = it.candidate;
    const name = text(`formation.form.${it.form}`);
    let at: { time: number; price: number } | null = null;
    let status: DBadge['status'] = 'forming';
    if (c.verdict === 'forming') at = expectedD(c, it.form, { time: lastTime, step: barSec });
    else if (c.verdict === 'valid' && c.points.D) {
      at = c.points.D;
      status = 'valid';
    }
    if (!at) return [];
    // Fehlt der Pixelwert der D-Zeit (Zeit nicht abbildbar), sitzt das Abzeichen an der letzten Kerze wie der Ring in layoutDrawings (R1-07)
    const px = x(at.time) ?? (status === 'forming' ? x(lastTime) : null);
    const py = y(at.price);
    if (px === null || py === null) return [];
    const label = status === 'valid' ? `${name} ✓` : `${name} · ${text('formation.verdict.forming')}`;
    return [{ id: it.id, selected: it.id === selectedId, status, price: at.price, x: Math.min(width - 8, px), y: py, label, w: label.length * 6.6 + 16 }];
  });
  found.sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close));

  // Der Stapel beginnt am nächsten D, rutscht aber nach oben, damit der letzte Eintrag noch im Zeichenbereich steht
  const stackTop = Math.max(2, Math.min(found[0] ? found[0].y - BADGE_H / 2 : 2, height - found.length * (BADGE_H + BADGE_GAP)));
  const badges: DBadge[] = found.map((f, i) => {
    let bx: number;
    let by: number;
    if (found.length === 1) {
      bx = f.x + 12 + f.w > width ? Math.max(2, f.x - 12 - f.w) : f.x + 12;
      by = Math.max(2, f.y - BADGE_H / 2);
    } else {
      // Ein Stapel am rechten Rand, das nächste D oben
      bx = Math.max(2, width - f.w - 6);
      by = stackTop + i * (BADGE_H + BADGE_GAP);
    }
    return { id: f.id, selected: f.selected, status: f.status, x: f.x, y: f.y, label: f.label, bx, by, w: f.w, h: BADGE_H };
  });
  const rings = found.filter((f) => !f.selected).map((f) => ({ id: f.id, x: f.x, y: f.y }));

  const bands: DBand[] = [];
  if (atr !== null && atr > 0) {
    const sorted = [...found].filter((f) => f.status === 'forming').sort((a, b) => a.price - b.price);
    let group: typeof sorted = [];
    const flush = () => {
      if (group.length >= 2) {
        const lo = group[0];
        const hi = group[group.length - 1];
        const ys = group.map((g) => g.y);
        bands.push({
          x: Math.max(0, Math.min(...group.map((g) => g.x)) - 24),
          top: Math.min(...ys) - 6,
          bottom: Math.max(...ys) + 6,
          label: `${text('formation.expectedD.band')} ${fmt(lo.price)} – ${fmt(hi.price)}`,
        });
      }
      group = [];
    };
    for (const f of sorted) {
      if (group.length > 0 && f.price - group[group.length - 1].price >= BAND_ATR * atr) flush();
      group.push(f);
    }
    flush();
  }
  return { badges, rings, bands };
}
