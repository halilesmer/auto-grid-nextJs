import type { IChartApi } from 'lightweight-charts';
import type { ShotData, ShotRow, ShotState } from './shotData';

const WIDTH = 1200;
const SCALE = 2;
const HEAD = 56;
const FOOT = 36;
const PAD = 24;
const GAP = 32;
const ICON = 16;
const LINE = 17;
const VALUE_WIDTH = 52;
/** Unter dieser Chart-Breite (Handy) steht der Chart links und die Bedingungen rechts, sonst darunter. */
const NARROW_BELOW = 640;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type Ctx = CanvasRenderingContext2D;

/** Farben des aktuellen App-Themes; sie stehen als Hex-Token in globals.css. */
interface Colors {
  card: string;
  foreground: string;
  muted: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
}

function readColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    card: token('--card'),
    foreground: token('--foreground'),
    muted: token('--muted-foreground'),
    border: token('--border'),
    success: token('--success'),
    danger: token('--danger'),
    warning: token('--warning'),
  };
}

const stateColor = (state: ShotState, colors: Colors): string => {
  if (state === 'met' || state === 'clear') return colors.success;
  if (state === 'unmeasurable') return colors.muted;
  return colors.danger;
};

/** Das Overlay malt mit var(--…); als eigenständiges Bild gäbe es dafür keine Werte. */
async function overlayImage(overlay: SVGSVGElement): Promise<HTMLImageElement> {
  const style = getComputedStyle(document.documentElement);
  const resolve = (value: string) => value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => style.getPropertyValue(name).trim());
  const clone = overlay.cloneNode(true) as SVGSVGElement;
  for (const el of clone.querySelectorAll('*')) {
    for (const attr of ['fill', 'stroke']) {
      const value = el.getAttribute(attr);
      if (value?.includes('var(')) el.setAttribute(attr, resolve(value));
    }
  }
  // Das Abblenden beim Überfahren einer Bedingung gehört nicht ins Bild
  for (const group of clone.querySelectorAll('g[data-drawing]')) group.removeAttribute('opacity');
  clone.removeAttribute('style');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('font-family', getComputedStyle(document.body).fontFamily);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ChartPicture {
  canvas: HTMLCanvasElement;
  /** Breite des Charts auf dem Bildschirm in CSS-Pixeln; entscheidet über den Bildaufbau */
  cssWidth: number;
}

/**
 * Kerzen, RSI und Achsen kommen aus takeScreenshot(); die Formationszeichnungen sind ein SVG-Overlay über dem Chart
 * und fehlen dort, deshalb werden sie im selben Koordinatensystem darübergelegt.
 */
export async function captureChart(input: { chart: IChartApi; host: HTMLElement; overlay: SVGSVGElement | null }): Promise<ChartPicture> {
  const { chart, host, overlay } = input;
  const shot = chart.takeScreenshot();
  const ratio = shot.width / host.clientWidth;
  const canvas = document.createElement('canvas');
  canvas.width = shot.width;
  canvas.height = shot.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = readColors().card;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(shot, 0, 0);
  const at = overlay?.getBoundingClientRect();
  // Ohne Größe (Chart noch nicht gezeichnet) lässt sich das Overlay nicht als Bild laden
  if (overlay && at && overlay.style.display !== 'none' && at.width > 0 && at.height > 0) {
    ctx.drawImage(await overlayImage(overlay), (at.left - host.getBoundingClientRect().left) * ratio, 0, at.width * ratio, at.height * ratio);
  }
  return { canvas, cssWidth: host.clientWidth };
}

function drawStateIcon(g: Ctx, input: { state: ShotState; x: number; y: number; color: string }) {
  const { state, x, y, color } = input;
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (state === 'unmeasurable') g.setLineDash([2.5, 2]);
  g.beginPath();
  g.roundRect(x + 0.75, y + 0.75, ICON - 1.5, ICON - 1.5, 4);
  if (state === 'excluded') {
    g.globalAlpha = 0.18;
    g.fill();
    g.globalAlpha = 1;
  }
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 2;
  g.beginPath();
  if (state === 'met' || state === 'clear') {
    g.moveTo(x + 4, y + 8.5);
    g.lineTo(x + 7, y + 11.5);
    g.lineTo(x + 12, y + 5);
  } else if (state === 'excluded') {
    g.moveTo(x + 4.5, y + 4.5);
    g.lineTo(x + 11.5, y + 11.5);
    g.moveTo(x + 11.5, y + 4.5);
    g.lineTo(x + 4.5, y + 11.5);
  } else if (state === 'unmet') {
    g.lineWidth = 1.5;
    g.roundRect(x + 4.5, y + 4.5, 7, 7, 1.5);
  } else {
    g.moveTo(x + 4.5, y + 8);
    g.lineTo(x + 11.5, y + 8);
  }
  g.stroke();
  g.restore();
}

function wrap(g: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return line ? [...lines, line] : lines;
}

interface Flow {
  x: number;
  y: number;
  columns: number;
  columnWidth: number;
}

/** Bedingungen in Spalten setzen; ohne `paint` wird nur die Höhe gemessen. */
function flowRules(g: Ctx, input: { data: ShotData; at: Flow; colors: Colors; paint: boolean }): number {
  const { data, at, colors, paint } = input;
  const textWidth = at.columnWidth - ICON - 8 - VALUE_WIDTH;
  g.font = `600 13px ${FONT}`;
  let top = at.y;
  if (paint) {
    g.textBaseline = 'alphabetic';
    g.fillStyle = colors.foreground;
    g.fillText(data.scores.join('   ·   '), at.x, top + 14);
  }
  top += 30;
  const columnY = Array.from({ length: at.columns }, () => top);
  for (const group of data.groups) {
    // Die erste Gruppe (Pflicht) steht links, die übrigen füllen die kürzere Spalte
    const column = columnY.indexOf(Math.min(...columnY));
    const x = at.x + column * (at.columnWidth + GAP);
    let y = columnY[column];
    if (paint) {
      g.font = `600 11px ${FONT}`;
      g.fillStyle = colors.muted;
      g.fillText(group.title.toUpperCase(), x, y + 11);
    }
    y += 22;
    for (const row of group.rows) {
      g.font = `13px ${FONT}`;
      const lines = wrap(g, `${row.text} (${row.stateLabel})`, textWidth);
      if (paint) paintRow(g, { row, lines, x, y, width: at.columnWidth, colors });
      y += lines.length * LINE + 5;
    }
    columnY[column] = y + 8;
  }
  return Math.max(...columnY) - at.y;
}

function paintRow(g: Ctx, input: { row: ShotRow; lines: string[]; x: number; y: number; width: number; colors: Colors }) {
  const { row, lines, x, y, width, colors } = input;
  drawStateIcon(g, { state: row.state, x, y, color: stateColor(row.state, colors) });
  g.font = `13px ${FONT}`;
  g.fillStyle = colors.foreground;
  lines.forEach((line, i) => g.fillText(line, x + ICON + 8, y + 12 + i * LINE));
  if (row.value) {
    g.fillStyle = colors.muted;
    g.textAlign = 'right';
    g.fillText(row.value, x + width, y + 12);
    g.textAlign = 'left';
  }
}

function paintHeader(g: Ctx, data: ShotData, colors: Colors) {
  g.textBaseline = 'alphabetic';
  g.font = `700 20px ${FONT}`;
  g.fillStyle = colors.foreground;
  g.fillText(data.title, PAD, 35);
  const pillX = PAD + g.measureText(data.title).width + 14;
  g.font = `600 12px ${FONT}`;
  const pillColor = { valid: colors.success, invalid: colors.danger, forming: colors.warning }[data.verdict];
  const pillWidth = g.measureText(data.verdictLabel).width + 20;
  g.save();
  g.globalAlpha = 0.16;
  g.fillStyle = pillColor;
  g.beginPath();
  g.roundRect(pillX, 17, pillWidth, 24, 12);
  g.fill();
  g.restore();
  g.fillStyle = pillColor;
  g.fillText(data.verdictLabel, pillX + 10, 33);
  g.font = `13px ${FONT}`;
  g.fillStyle = colors.muted;
  g.textAlign = 'right';
  g.fillText(data.stamp, WIDTH - PAD, 34);
  g.textAlign = 'left';
}

function paintFooter(g: Ctx, input: { data: ShotData; y: number; colors: Colors }) {
  const { data, y, colors } = input;
  g.font = `12px ${FONT}`;
  g.fillStyle = colors.muted;
  g.fillText(data.footer, PAD, y + 23);
  // Legende von rechts nach links: Symbol und Wort, nie nur Farbe
  let x = WIDTH - PAD;
  for (const item of [...data.legend].reverse()) {
    const width = g.measureText(item.label).width;
    x -= width;
    g.fillStyle = colors.muted;
    g.fillText(item.label, x, y + 23);
    x -= ICON + 6;
    drawStateIcon(g, { state: item.state, x, y: y + 10, color: stateColor(item.state, colors) });
    x -= 20;
  }
}

/** Setzt Kopf, Chart-Bild, Bedingungen und Fußzeile zu einem PNG-Canvas der Breite 1200 CSS-Pixel (doppelte Auflösung) zusammen. */
export function composeShot(input: { picture: ChartPicture; data: ShotData }): HTMLCanvasElement {
  const { picture, data } = input;
  const colors = readColors();
  const narrow = picture.cssWidth < NARROW_BELOW;
  const chartWidth = narrow ? WIDTH / 2 : WIDTH;
  const chartHeight = Math.round((chartWidth * picture.canvas.height) / picture.canvas.width);
  const rules: Flow = narrow
    ? { x: WIDTH / 2 + 20, y: 16, columns: 1, columnWidth: WIDTH / 2 - 40 }
    : { x: PAD, y: chartHeight + 16, columns: 2, columnWidth: (WIDTH - 2 * PAD - GAP) / 2 };

  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d')!;
  const rulesHeight = flowRules(g, { data, at: { ...rules, y: 0 }, colors, paint: false });
  const bodyHeight = narrow ? Math.max(chartHeight, rulesHeight + 32) : chartHeight + rulesHeight + 24;
  const height = HEAD + bodyHeight + FOOT;

  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  g.scale(SCALE, SCALE);
  g.fillStyle = colors.card;
  g.fillRect(0, 0, WIDTH, height);
  paintHeader(g, data, colors);
  g.imageSmoothingQuality = 'high';
  g.drawImage(picture.canvas, 0, HEAD, chartWidth, chartHeight);
  g.translate(0, HEAD);
  flowRules(g, { data, at: rules, colors, paint: true });
  g.translate(0, -HEAD);
  g.strokeStyle = colors.border;
  g.lineWidth = 1;
  g.beginPath();
  for (const y of [HEAD, HEAD + bodyHeight]) {
    g.moveTo(0, y + 0.5);
    g.lineTo(WIDTH, y + 0.5);
  }
  if (narrow) {
    g.moveTo(WIDTH / 2 + 0.5, HEAD);
    g.lineTo(WIDTH / 2 + 0.5, HEAD + bodyHeight);
  }
  g.stroke();
  paintFooter(g, { data, y: HEAD + bodyHeight, colors });
  return canvas;
}

export const shotBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'));
