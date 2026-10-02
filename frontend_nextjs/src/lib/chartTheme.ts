/**
 * Farben für lightweight-charts aus den Theme-Tokens (src/app/globals.css). Der Chart zeichnet in
 * <canvas> und kennt keine Tailwind-Klassen: die Werte werden zur Laufzeit gelesen und bei jedem
 * Theme-Wechsel neu gesetzt.
 */
export interface ChartColors {
  text: string;
  grid: string;
  border: string;
  crosshair: string;
  crosshairLabel: string;
  up: string;
  down: string;
  primary: string;
  info: string;
  warning: string;
  muted: string;
}

const FALLBACK: Record<string, string> = {
  '--muted-foreground': '#6a6a70',
  '--border': '#e0e0e3',
  '--primary': '#c9632b',
  '--success': '#16895c',
  '--danger': '#d93a3a',
  '--info': '#2f7aa3',
  '--warning': '#b87a12',
};

/** "#rrggbb" + Deckkraft → rgba(); andere Formate unverändert. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function readChartColors(): ChartColors {
  const style = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const token = (name: string) => style?.getPropertyValue(name).trim() || FALLBACK[name];
  const muted = token('--muted-foreground');
  const primary = token('--primary');
  return {
    text: muted,
    grid: withAlpha(token('--border'), 0.55),
    border: token('--border'),
    crosshair: withAlpha(primary, 0.45),
    crosshairLabel: primary,
    up: token('--success'),
    down: token('--danger'),
    primary,
    info: token('--info'),
    warning: token('--warning'),
    muted,
  };
}
