/**
 * Stil der Formationslinien (Plan 1105-A7/A8, S1): je Rolle Farbe, Typ, Dicke und Sichtbarkeit.
 * Leere Farbe heißt Themefarbe der Rolle (bei den Trendrollen: Kerzenfarbe). Reine Daten, ohne React.
 */
export const FORMATION_LINE_ROLES = ['trendUp', 'trendDown', 'zigzag', 'expected', 'neck', 'ratio', 'target', 'zone'] as const;
export type FormationLineRole = (typeof FORMATION_LINE_ROLES)[number];

export type LineKind = 'solid' | 'dashed' | 'dotted';
export type LineWidth = 1 | 2 | 3 | 4;

export interface LineStyleSpec {
  /** Leer: Farbe der Rolle (Themefarbe oder Kerzenfarbe) */
  color: string;
  style: LineKind;
  width: LineWidth;
  visible: boolean;
}

export type FormationStyle = Record<FormationLineRole, LineStyleSpec>;

const GRAY = 'var(--muted-foreground)';

/** Vorgabe (A8): Zickzack, erwartetes D, Boyun- und Kanallinien grau; Trend wie bisher in der Kerzenfarbe, durchgezogen */
export const DEFAULT_FORMATION_STYLE: FormationStyle = {
  trendUp: { color: '', style: 'solid', width: 2, visible: true },
  trendDown: { color: '', style: 'solid', width: 2, visible: true },
  zigzag: { color: GRAY, style: 'dashed', width: 2, visible: true },
  expected: { color: GRAY, style: 'dotted', width: 2, visible: true },
  neck: { color: GRAY, style: 'dashed', width: 2, visible: true },
  ratio: { color: '', style: 'dotted', width: 1, visible: true },
  target: { color: '', style: 'dotted', width: 1, visible: true },
  zone: { color: '', style: 'dashed', width: 1, visible: true },
};

/** SVG-/Canvas-Strichmuster des Typs; durchgezogen: keines */
const DASH: Record<LineKind, string | undefined> = { solid: undefined, dashed: '6 4', dotted: '2 4' };
export const dashOf = (style: LineKind): string | undefined => DASH[style];

/** Dasselbe als Zahlenliste für `context.setLineDash` */
export const dashArrayOf = (style: LineKind): number[] => dashOf(style)?.split(' ').map(Number) ?? [];

// Nur Farben, die kein Markup ins Attribut tragen: Hex, var(--name), rgb()/hsl()
const COLOR = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\)|(rgb|hsl)a?\([0-9 ,.%/]+\))$/i;

function sanitizeSpec(raw: unknown, base: LineStyleSpec): LineStyleSpec {
  const r = (raw ?? {}) as Partial<Record<keyof LineStyleSpec, unknown>>;
  return {
    color: typeof r.color === 'string' && (r.color === '' || COLOR.test(r.color)) ? r.color : base.color,
    style: r.style === 'solid' || r.style === 'dashed' || r.style === 'dotted' ? r.style : base.style,
    width: r.width === 1 || r.width === 2 || r.width === 3 || r.width === 4 ? r.width : base.width,
    visible: typeof r.visible === 'boolean' ? r.visible : base.visible,
  };
}

/** Alter oder kaputter Speicherstand: jedes fehlende oder ungültige Feld fällt auf die Vorgabe */
export function sanitizeFormationStyle(raw: unknown): FormationStyle {
  const r = (raw ?? {}) as Partial<Record<FormationLineRole, unknown>>;
  const out = {} as FormationStyle;
  for (const role of FORMATION_LINE_ROLES) out[role] = sanitizeSpec(r[role], DEFAULT_FORMATION_STYLE[role]);
  return out;
}
