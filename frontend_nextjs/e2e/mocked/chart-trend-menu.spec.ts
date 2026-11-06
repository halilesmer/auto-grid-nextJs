/**
 * Trendlinie anklicken (ANA-25, Plan 1105-A7, Schritt S4): Rechtsklick und Doppelklick auf die Linie öffnen das Menü
 * (Farbe aufwärts und abwärts, Typ, Dicke, Zurücksetzen, Trend-Einstellungen). Die Linie ist Canvas; ihre Dicke und ihren
 * Typ zeigen `data-trend-width` und `data-trend-style` am Chart, die sichtbaren Schenkel `data-trend-segments`.
 * Echte Kerzen: EURCAD D1 (trd-up-d1-01, sechs Schenkel).
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { parseFixture } from '../../src/lib/formation/fixture';
import { groupZones, makeZone } from '../fixtures/data';
import { named, seedFixtureTrend, trendOf } from '../fixtures/formation-trend';
import { nearestDistance } from '../../src/lib/chart/trendHit';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test, type MockWorker } from '../fixtures/test';

const bars = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/trd-up-d1-01.json', 'utf-8'))).bars;
const D1_SERIES = bars.map((b) => [b.time, b.open, b.high, b.low, b.close]);
const PREFS_KEY = 'grid-robot-analysis-prefs';

const chart = (page: Page) => page.getByTestId('analysis-chart');
const menu = (page: Page) => page.getByTestId('trend-menu');

/** Trend an, nur wenn noch nichts gespeichert ist (ein Neuladen darf den gespeicherten Stil nicht überschreiben) */
async function open(page: Page, worker: MockWorker) {
  await page.addInitScript((key) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ state: { showTrend: true }, version: 0 })); }, PREFS_KEY);
  worker.state.ratesSeries = { D1: D1_SERIES };
  await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=D1&range=all`);
  await expect(chart(page)).toHaveAttribute('data-bars', String(bars.length));
  await expect(chart(page)).toHaveAttribute('data-trend', '6');
  await expect(chart(page)).toHaveAttribute('data-trend-segments', /\d/);
}

type Segment = { x1: number; y1: number; x2: number; y2: number };

/** Sichtbare Schenkel der Linie in Seitenkoordinaten (das Attribut zählt Pixel ab Chart-Rand) */
async function segments(page: Page): Promise<Segment[]> {
  const box = (await chart(page).boundingBox())!;
  return (await chart(page).getAttribute('data-trend-segments'))!.split(';').map((s) => {
    const [x1, y1, x2, y2] = s.split(',').map(Number);
    return { x1: box.x + x1, y1: box.y + y1, x2: box.x + x2, y2: box.y + y2 };
  });
}
/** Ob der Chart selbst unter dem Punkt liegt und nicht eine Karte, ein Hinweis oder die Werkzeugleiste davor */
const free = (page: Page, p: { x: number; y: number }) =>
  // Auch die Nachbarpunkte (±2 px) müssen der Chart sein: an der Kante einer Karte trifft `elementFromPoint` den Chart, das contextmenu aber die Karte (S4: Karte endet bei y = 288,5)
  page.evaluate(([x, y]) => {
    const chart = document.querySelector('[data-testid="analysis-chart"]')!;
    return [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => chart.contains(document.elementFromPoint(x + dx, y + dy)));
  }, [p.x, p.y]);

/** Ein Punkt auf der Linie in Seitenkoordinaten: der erste Punkt eines Schenkels, den nichts verdeckt (über der Linie liegt oft ein Hinweis) */
async function onLine(page: Page) {
  for (const s of await segments(page)) {
    for (const t of [0.5, 0.3, 0.7, 0.2, 0.8]) {
      const p = { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t };
      if (await free(page, p)) return p;
    }
  }
  throw new Error('Kein freier Punkt auf der Trendlinie');
}
/** Ein Punkt weit weg von jeder Linie (mehr als 40 px), im freien Chart */
async function offLine(page: Page) {
  const box = (await chart(page).boundingBox())!, segs = await segments(page);
  for (let x = box.x + 60; x < box.x + box.width - 80; x += 70) {
    for (let y = box.y + box.height - 60; y > box.y + 120; y -= 50) {
      const p = { x, y };
      if (nearestDistance(segs, x, y) > 40 && (await free(page, p))) return p;
    }
  }
  throw new Error('Kein freier Punkt abseits der Trendlinie');
}

async function rightClick(page: Page, at?: { x: number; y: number }) {
  const p = at ?? (await onLine(page));
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
}
async function doubleClick(page: Page, at?: { x: number; y: number }) {
  const p = at ?? (await onLine(page));
  await page.mouse.move(p.x, p.y);
  await page.mouse.dblclick(p.x, p.y);
}

async function setLineMenu(page: Page, mode: string) {
  await page.getByTestId('workspace-settings').click();
  const dialog = page.getByTestId('chart-workspace-settings');
  await dialog.getByRole('button', { name: msg('cw.canvas'), exact: true }).click();
  await dialog.getByLabel(msg('cw.lineMenu'), { exact: true }).selectOption(mode);
  await dialog.getByRole('button', { name: msg('cw.apply'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe('ANA-25 Trendlinie: Menü per Rechtsklick und Doppelklick', () => {
  test('Rechtsklick auf die Linie öffnet das Menü: Dicke 3 und Typ kesik gelten für beide Richtungen, Escape schließt, Stil bleibt nach dem Neuladen', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    await expect(chart(page)).toHaveAttribute('data-trend-width', '2');
    await expect(chart(page)).toHaveAttribute('data-trend-style', 'solid');
    await expect(menu(page)).toHaveCount(0);
    await rightClick(page);
    await expect(menu(page)).toBeVisible();
    await expect(menu(page)).toHaveAttribute('role', 'menu');
    await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 3 }), exact: true }).click();
    await expect(chart(page)).toHaveAttribute('data-trend-width', '3');
    await expect(chart(page)).toHaveAttribute('data-trend-width-down', '3');
    await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.type.dashed'), exact: true }).click();
    await expect(chart(page)).toHaveAttribute('data-trend-style', 'dashed');
    await expect(chart(page)).toHaveAttribute('data-trend-style-down', 'dashed');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);

    await page.reload();
    await expect(chart(page)).toHaveAttribute('data-trend', '6');
    await expect(chart(page)).toHaveAttribute('data-trend-width', '3');
    await expect(chart(page)).toHaveAttribute('data-trend-style', 'dashed');
  });

  test('Die Farbe gilt je Richtung: „Yukarı rengi“ ändert nur die Aufwärts-, „Aşağı rengi“ nur die Abwärtsfarbe', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    await rightClick(page);
    const up = menu(page).getByRole('group', { name: msg('trendLine.up'), exact: true });
    const down = menu(page).getByRole('group', { name: msg('trendLine.down'), exact: true });
    await up.getByRole('menuitemradio', { name: msg('lineStyle.color.blue'), exact: true }).click();
    await expect(chart(page)).toHaveAttribute('data-trend-color', '#2a6df4,');
    await down.getByRole('menuitemradio', { name: msg('lineStyle.color.purple'), exact: true }).click();
    await expect(chart(page)).toHaveAttribute('data-trend-color', '#2a6df4,#8b5cf6');
    // Die Abwärtsgruppe hat nur die Farbe, nicht Typ und Dicke (die gelten für beide)
    await expect(down.getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 3 }), exact: true })).toHaveCount(0);
  });

  for (const theme of ['light', 'dark']) {
    test(`Graue Trendlinie (var(--muted-foreground)) wird gezeichnet, nicht in der Saumfarbe versteckt (${theme})`, { tag: '@ANA-25' }, async ({ page, worker }) => {
      await page.addInitScript(([key, value]) => {
        localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 }));
        localStorage.setItem(key, JSON.stringify({ state: { showTrend: true, formationStyle: { trendUp: { color: 'var(--muted-foreground)' }, trendDown: { color: 'var(--muted-foreground)' } } }, version: 1 }));
      }, [PREFS_KEY, theme]);
      worker.state.ratesSeries = { D1: D1_SERIES };
      await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=D1&range=all`);
      await expect(chart(page)).toHaveAttribute('data-trend', '6');
      await expect(chart(page)).toHaveAttribute('data-trend-segments', /\d/);
      const expected = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim());
      expect(expected).toMatch(/^#/);
      const box = (await chart(page).boundingBox())!;
      // Mittelpunkte aller sichtbaren Schenkel: auf mindestens einem trägt die Leinwand die Linienfarbe (Saum wäre die Panelfarbe)
      const points = (await segments(page)).map((s) => ({ x: (s.x1 + s.x2) / 2 - box.x, y: (s.y1 + s.y2) / 2 - box.y }));
      const hit = await page.evaluate(([pts, hex]) => {
        const want = [1, 3, 5].map((i) => parseInt((hex as string).slice(i, i + 2), 16));
        const host = document.querySelector('[data-testid="analysis-chart"]')!;
        const hostBox = host.getBoundingClientRect();
        const seen: string[] = [];
        for (const canvas of Array.from(host.querySelectorAll('canvas'))) {
          const r = canvas.getBoundingClientRect(), ctx = canvas.getContext('2d');
          if (!ctx) continue;
          const kx = canvas.width / r.width, ky = canvas.height / r.height;
          for (const p of pts as { x: number; y: number }[]) {
            const cx = Math.round((hostBox.left + p.x - r.left) * kx), cy = Math.round((hostBox.top + p.y - r.top) * ky);
            if (cx < 2 || cy < 2 || cx >= canvas.width - 2 || cy >= canvas.height - 2) continue;
            const d = ctx.getImageData(cx - 2, cy - 2, 5, 5).data;
            seen.push(`${canvas.width}x${canvas.height}@${cx},${cy}:${d[48]},${d[49]},${d[50]},${d[51]}`);
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && Math.abs(d[i] - want[0]) < 12 && Math.abs(d[i + 1] - want[1]) < 12 && Math.abs(d[i + 2] - want[2]) < 12) return 'ok';
          }
        }
        return seen.join(' | ');
      }, [points, expected] as const);
      expect(hit, `erwartet ${expected}`).toBe('ok');
    });
  }

  test('„Varsayılana dön“ stellt Farbe, Typ und Dicke beider Richtungen her und lässt das Menü offen', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    await rightClick(page);
    await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 4 }), exact: true }).click();
    await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.type.dotted'), exact: true }).click();
    await expect(chart(page)).toHaveAttribute('data-trend-width', '4');
    await menu(page).getByRole('menuitem', { name: msg('trendLine.reset'), exact: true }).click();
    await expect(chart(page)).toHaveAttribute('data-trend-width', '2');
    await expect(chart(page)).toHaveAttribute('data-trend-width-down', '2');
    await expect(chart(page)).toHaveAttribute('data-trend-style', 'solid');
    await expect(chart(page)).toHaveAttribute('data-trend-color', ',');
    await expect(menu(page)).toBeVisible();
  });

  test('Doppelklick öffnet dasselbe Menü; ein Klick außerhalb schließt es', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    await doubleClick(page);
    await expect(menu(page)).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(menu(page)).toHaveCount(0);
  });

  test('Fern von der Linie öffnet Rechtsklick und Doppelklick kein Menü (das Browsermenü bleibt)', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    // Der Browser öffnet sein Menü nur, wenn die Seite das contextmenu-Ereignis nicht abbricht: je Ereignis `defaultPrevented` festhalten
    await page.evaluate(() => {
      const seen: boolean[] = [];
      (window as unknown as { __prevented: boolean[] }).__prevented = seen;
      document.addEventListener('contextmenu', (e) => seen.push(e.defaultPrevented));
    });
    const away = await offLine(page);
    await rightClick(page, away);
    await expect(menu(page)).toHaveCount(0);
    await doubleClick(page, away);
    await expect(menu(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented)).toEqual([false]);
    // Auf der Linie dagegen bricht die Seite es ab
    await rightClick(page);
    await expect(menu(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented)).toEqual([false, true]);
  });

  test('Einstellung „Çizgi menüsü“: nur Rechtsklick, nur Doppelklick, aus; bleibt nach dem Neuladen', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    await setLineMenu(page, 'right');
    await doubleClick(page);
    await expect(menu(page)).toHaveCount(0);
    await rightClick(page);
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await setLineMenu(page, 'double');
    await rightClick(page);
    await expect(menu(page)).toHaveCount(0);
    await doubleClick(page);
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await setLineMenu(page, 'off');
    await rightClick(page);
    await expect(menu(page)).toHaveCount(0);
    await doubleClick(page);
    await expect(menu(page)).toHaveCount(0);
  });

  test('Trend und Indikatorlinie überlagern sich: die Indikatorlinie (EMA) gewinnt, nur die Linie allein öffnet das Trendmenü', { tag: '@ANA-25' }, async ({ page, worker }) => {
    test.setTimeout(180_000);
    await open(page, worker);
    const context = (await page.getByTestId('chart-workspace').getAttribute('data-context'))!;
    await page.evaluate(([key, ctx]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, documents: { [ctx]: { drawings: '[]', indicators: [{ id: 'ema-over-trend', kind: 'EMA', period: 5, visible: true }] } } }));
    }, ['grid-robot-chart-workspaces-v1', context]);
    await page.reload();
    await expect(chart(page)).toHaveAttribute('data-trend', '6');
    await expect(chart(page)).toHaveAttribute('data-trend-segments', /\d/);
    const row = page.locator('[data-indicator-row="EMA"]');
    await expect(row).toHaveCount(1);
    const segs = await segments(page);
    // Punkt, an dem die EMA-Linie unter dem Zeiger liegt (Fadenkreuz meldet sie) und die Trendlinie höchstens 4 px entfernt ist
    let both: { x: number; y: number } | null = null;
    search: for (const s of segs) {
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
        for (let dy = -4; dy <= 4; dy++) {
          const p = { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t + dy };
          if (nearestDistance(segs, p.x, p.y) > 4 || !(await free(page, p))) continue;
          await page.mouse.move(p.x, p.y);
          await page.waitForTimeout(30);
          if ((await row.getAttribute('data-emphasis')) === 'hover') { both = p; break search; }
        }
      }
    }
    expect(both, 'Kein Punkt, an dem EMA-Linie und Trendlinie zusammenfallen').not.toBeNull();
    await page.mouse.click(both!.x, both!.y, { button: 'right' });
    await expect(page.getByTestId('indicator-line-menu')).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Auf der Trendlinie ohne EMA darunter bleibt das Trendmenü erreichbar
    let alone: { x: number; y: number } | null = null;
    for (const s of segs) {
      for (const t of [0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6]) {
        const p = { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t };
        if (!(await free(page, p))) continue;
        await page.mouse.move(p.x, p.y);
        await page.waitForTimeout(40);
        if ((await row.getAttribute('data-emphasis')) !== 'hover') { alone = p; break; }
      }
      if (alone) break;
    }
    expect(alone, 'Kein Punkt nur auf der Trendlinie').not.toBeNull();
    await page.mouse.click(alone!.x, alone!.y, { button: 'right' });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByTestId('indicator-line-menu')).toHaveCount(0);
  });

  test('„Çizgi menüsü: Kapalı“: auf der Trendlinie kein Handzeiger', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    const on = await onLine(page);
    const cursorAt = (p: { x: number; y: number }) => page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)!).cursor, [p.x, p.y]);
    await page.mouse.move(on.x - 30, on.y);
    await page.mouse.move(on.x, on.y, { steps: 4 });
    await expect.poll(() => cursorAt(on)).toBe('pointer');
    await setLineMenu(page, 'off');
    await page.mouse.move(on.x - 30, on.y);
    await page.mouse.move(on.x, on.y, { steps: 4 });
    await expect.poll(() => cursorAt(on)).not.toBe('pointer');
    // „nur Doppelklick“ lässt die Linie treffbar (Hand)
    await setLineMenu(page, 'double');
    await page.mouse.move(on.x - 30, on.y);
    await page.mouse.move(on.x, on.y, { steps: 4 });
    await expect.poll(() => cursorAt(on)).toBe('pointer');
  });

  test('„Trend ayarları…“ öffnet das Panel der Trend-Einstellungen', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    await rightClick(page);
    await menu(page).getByRole('menuitem', { name: msg('trendLine.settings'), exact: true }).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByTestId('trend-settings-panel')).toBeVisible();
  });

  test('Bei aktivem Zeichenwerkzeug öffnet kein Menü', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
    await page.getByTestId('tool-horizontal-line').click();
    await rightClick(page);
    await expect(menu(page)).toHaveCount(0);
    await doubleClick(page);
    await expect(menu(page)).toHaveCount(0);
  });

  test('Der Zeiger wird auf der Linie zur Hand und daneben nicht', { tag: '@ANA-25' }, async ({ page, worker }) => {
    await open(page, worker);
    // Der Zeiger, den der Chart unter dem Mauszeiger setzt (vererbt: das Element unter dem Punkt trägt ihn oder sein Vorfahr)
    const cursorAt = (p: { x: number; y: number }) => page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)!).cursor, [p.x, p.y]);
    const on = await onLine(page);
    await page.mouse.move(on.x - 30, on.y);
    await page.mouse.move(on.x, on.y, { steps: 4 });
    await expect.poll(() => cursorAt(on)).toBe('pointer');
    const away = await offLine(page);
    await page.mouse.move(away.x, away.y, { steps: 4 });
    await expect.poll(() => cursorAt(away)).not.toBe('pointer');
  });

  test('Ohne Trendlinie (Button aus) gibt es keinen Treffer und kein Menü', { tag: '@ANA-25' }, async ({ page, worker }) => {
    worker.state.ratesSeries = { D1: D1_SERIES };
    await page.goto(`/chart?account=${DEMO_ID}&symbol=EURUSD&tf=D1&range=all`);
    await expect(chart(page)).toHaveAttribute('data-trend', '0');
    const box = (await chart(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await expect(menu(page)).toHaveCount(0);
  });

  test('Auch im Modus Formation: auf einem von der Formations-Zeichnung unverdeckten Punkt der Linie öffnet der Rechtsklick das Trendmenü', { tag: '@ANA-25' }, async ({ page, worker }) => {
    const gar = 'e2e/fixtures/formation/gar-buy-h4-01.json';
    const garBars = named(gar, parseFixture(JSON.parse(readFileSync(gar, 'utf-8')))).bars;
    const forming = 1761192000;
    worker.state.settings[DEMO_ID] = { LOOP_INTERVAL_SECONDS: 2, SYMBOLS: groupZones([makeZone({ symbol: 'EURUSD' })]) };
    const rows = garBars.filter(b => b.time + 14400 <= forming).map(b => [b.time, b.open, b.high, b.low, b.close]);
    const last = rows[rows.length - 1];
    worker.state.ratesSeries = { D1: [], H4: rows, H1: [], M15: [[forming - 900, last[4], last[4], last[4], last[4]]] };
    await seedFixtureTrend(page, trendOf(garBars), true);
    await page.goto(`/chart?mode=formation&account=${DEMO_ID}&zone=${ZONE_ID}&form=ABCD`);
    await expect(page.getByTestId('formation-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
    await page.getByTestId('trend-toggle').click();
    await expect(chart(page)).toHaveAttribute('data-trend-segments', /\d/);
    await rightClick(page);
    await expect(menu(page)).toBeVisible();
    await menu(page).getByRole('menuitemradio', { name: msg('lineStyle.width.option', { n: 4 }), exact: true }).click();
    await expect(chart(page)).toHaveAttribute('data-trend-width', '4');
  });

  for (const theme of ['light', 'dark']) {
    test(`Menü im Bild (${theme})`, { tag: '@ANA-25' }, async ({ page, worker }) => {
      await page.addInitScript((value) => localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
      await open(page, worker);
      await rightClick(page);
      await expect(menu(page)).toBeVisible();
      // Echte Aussage statt nur Bild: der Hintergrund des Menüs folgt dem Thema (hell > 0,6, dunkel < 0,4 relative Helligkeit)
      const luminance = await menu(page).evaluate((el) => {
        let node: Element | null = el;
        while (node) {
          const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
          if (m && (m[3] ?? 1) > 0.9) return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
          node = node.parentElement;
        }
        return -1;
      });
      expect(luminance).toBeGreaterThanOrEqual(0);
      if (theme === 'dark') expect(luminance).toBeLessThan(0.4);
      else expect(luminance).toBeGreaterThan(0.6);
      await page.screenshot({ path: test.info().outputPath(`trend-menu-${theme}.png`) });
    });
  }
});
