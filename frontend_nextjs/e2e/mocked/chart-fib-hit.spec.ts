import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

// 1110-A4.8 (S3): levels of a Fib retracement outside the 0–1 band must be selectable and deletable.
// lightweight-charts-drawing 0.6.2 hit-tests only the box between the two handles.
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

type Stored = { id: string; kind: string; locked?: boolean };
const stored = (page: Page) => page.evaluate((key) => {
  const store = JSON.parse(localStorage.getItem(key) || '{}');
  const all = Object.values(store.documents ?? {}).flatMap((v) => JSON.parse((v as { drawings: string }).drawings)) as Stored[];
  return all.filter((d, i) => all.findIndex((o) => o.id === d.id) === i);
}, storageKey);

/** Draws a Fib retracement with the magnet off: handle y values are then the click values. Returns the pixel geometry. */
async function drawFib(page: Page) {
  await page.goto(URL);
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  const magnet = page.getByRole('button', { name: msg('cw.magnet'), exact: true });
  if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
  await page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true }).click();
  await page.getByTestId('tool-fib-retracement').click();
  const box = await page.getByTestId('analysis-chart').boundingBox(); if (!box) throw new Error('Chart missing');
  const bar = (await page.getByTestId('chart-topbar').boundingBox())!;
  const top = bar.y + bar.height;
  const x1 = box.x + box.width * .35, x2 = box.x + box.width * .55, y1 = top + 80, y2 = top + 30; // both inside the main pane (the RSI pane starts lower)
  await page.mouse.move(x1, y1); await page.mouse.click(x1, y1);
  await page.mouse.move(x2, y2, { steps: 5 }); await page.waitForTimeout(400); await page.mouse.click(x2, y2);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  await page.keyboard.press('Escape'); // end the tool, selection stays what the library decides
  await page.mouse.click(box.x + box.width * .9, top + 60); // empty area: nothing selected
  // retracement levels run from handle 2 (0) to handle 1 (1): level v is at y2 + (y1 - y2) * v; the default level 1.618 lies below the box
  return { x: (x1 + x2) / 2, yOutside: y2 + (y1 - y2) * 1.618, yEmpty: top + 60, xEmpty: box.x + box.width * .9 };
}

test('Fib-Seviye 0–1 bandının dışında tıklanınca çizim seçilir ve Delete siler', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  const g = await drawFib(page);
  await page.mouse.click(g.x, g.yOutside);
  await page.keyboard.press('Delete');
  await expect.poll(() => stored(page)).toHaveLength(0);
});

test('Fib-Seviye: Backspace siler, boş alana tık seçimi kaldırır', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  const g = await drawFib(page);
  await page.mouse.click(g.x, g.yOutside);
  await page.mouse.click(g.xEmpty, g.yEmpty);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  expect(await stored(page)).toHaveLength(1);
  await page.mouse.click(g.x, g.yOutside);
  await page.keyboard.press('Backspace');
  await expect.poll(() => stored(page)).toHaveLength(0);
});

test('Kilitli Fib çizimi Delete ile silinmez', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  const g = await drawFib(page);
  await page.getByRole('button', { name: msg('cw.rail.lockAll'), exact: true }).click();
  await page.mouse.click(g.x, g.yOutside);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  expect(await stored(page)).toHaveLength(1);
});

test('Fehlen die inneren Felder des DrawingManager (Bibliothek-Update), tut der Fib-Treffer nichts und warnt', { tag: '@ANA-17' }, async () => {
  const { extendFibHit } = await import('../../src/lib/chart-workspace/fibHit');
  const warn = console.warn; const calls: unknown[][] = [];
  console.warn = (...a: unknown[]) => { calls.push(a); };
  try { expect(extendFibHit({} as never)).toBe(false); } finally { console.warn = warn; }
  expect(calls).toHaveLength(1);
});

test('Fib-Seviye üzerinde fare: imleç değişir (tutamaçlar), boş alanda değişmez', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  const g = await drawFib(page);
  const cursorAt = (x: number, y: number) => page.evaluate(([px, py]) => { const el = document.elementFromPoint(px, py); return el ? getComputedStyle(el).cursor : ''; }, [x, y]);
  await page.mouse.move(g.xEmpty, g.yEmpty, { steps: 3 });
  const idle = await cursorAt(g.xEmpty, g.yEmpty);
  await page.mouse.move(g.x, g.yOutside, { steps: 5 });
  await expect.poll(() => cursorAt(g.x, g.yOutside)).not.toBe(idle);
});
