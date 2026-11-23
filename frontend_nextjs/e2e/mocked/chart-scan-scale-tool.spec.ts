import type { Page } from '@playwright/test';
import { DEMO_ID, test, expect } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { hideFormationDrawings } from '../fixtures/chart-ready';

// 1116-A7.1: the formation scan widens the price axis to the levels of its formation when it ends. While a drawing tool
// is active, the screen must not move: the scale change waits until the tool ends, then it applies (1116-B1).
// Measurement without chart internals: both points of a trend line go on the same pixel row. With the same scale for
// both clicks (magnet off), both points have the same price. A scale change between the clicks gives two prices.
// Exception to `chartReady(page)` (.claude/rules/tests.md): this test clicks before the search ends on purpose.
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const storageKey = 'grid-robot-chart-workspaces-v1';
test.setTimeout(60_000);
// The mock computes its candles from the clock (sine curve). The scale widens only when the levels of the found formation lie
// outside the candle range. Measured on 2026-11-23: true at 05:30–13:30 UTC, false at 17:30 UTC. A fixed clock keeps the condition.
test.use({ fakeNow: '2026-11-23T09:00:00Z' });
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

type Stored = { id: string; points: { time: number; price: number }[] };
const stored = (page: Page) => page.evaluate((key) => {
  const store = JSON.parse(localStorage.getItem(key) || '{}');
  const all = Object.values(store.documents ?? {}).flatMap((v) => JSON.parse((v as { drawings: string }).drawings)) as Stored[];
  return all.filter((d, i) => all.findIndex((o) => o.id === d.id) === i);
}, storageKey);

test('Tarama bir çizim aracı etkinken biterse fiyat ölçeği araç bitene kadar değişmez', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  // The chart is H1: the M15 request belongs only to the formation scan. Holding it keeps the scan open.
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(/\/api\/market\/[^/]+\/rates\?.*timeframe=M15/, async (route) => { await gate; await route.fallback(); });
  await page.goto(URL);
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', '');
  await hideFormationDrawings(page);
  const magnet = page.getByRole('button', { name: msg('cw.magnet'), exact: true });
  if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
  await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
  await page.getByTestId('tool-trend-line').click();
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  const bar = (await page.getByTestId('chart-topbar').boundingBox())!;
  const y = bar.y + bar.height + 80, x1 = box.x + box.width * .3, x2 = box.x + box.width * .6; // inside the main pane
  await page.mouse.move(x1, y); await page.mouse.click(x1, y);
  await page.mouse.move((x1 + x2) / 2, y, { steps: 3 });
  // The scan ends between the two clicks
  release();
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  await page.waitForTimeout(500); // the chart draws the new scale on the next frames
  await page.mouse.move(x2, y, { steps: 3 }); await page.mouse.click(x2, y);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  const [a, b] = (await stored(page))[0].points;
  expect(b.price).toBeCloseTo(a.price, 1); // a scale change gives a difference of several units
  // The tool has ended: the pending widening applies. The same pixel row now holds another price than before.
  await expect.poll(async () => {
    await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
    await page.getByTestId('tool-trend-line').click();
        await page.mouse.move(x1, y); await page.mouse.click(x1, y);
    await page.mouse.move(x2, y); await page.mouse.click(x2, y);
    await page.keyboard.press('Escape');
    const all = await stored(page);
    return all.at(-1)!.points[0].price !== a.price;
  }, { timeout: 15_000 }).toBe(true);
});

test('Tarama fare basılıyken biter, bırakınca ölçek genişler (basılı durum takılı kalmaz)', { tag: '@ANA-17' }, async ({ page, worker }) => {
  void worker;
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(/\/api\/market\/[^/]+\/rates\?.*timeframe=M15/, async (route) => { await gate; await route.fallback(); });
  await page.goto(URL);
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-bars', /^[1-9]\d*$/);
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', '');
  await hideFormationDrawings(page);
  const magnet = page.getByRole('button', { name: msg('cw.magnet'), exact: true });
  if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
  const draw = async (x1: number, x2: number, y: number) => {
    await page.getByTestId('chart-workspace').getByRole('button', { name: msg('cw.rail.linesMenu'), exact: true }).click();
    await page.getByTestId('tool-trend-line').click();
    await page.mouse.move(x1, y); await page.mouse.click(x1, y);
    await page.mouse.move(x2, y); await page.mouse.click(x2, y);
    await page.keyboard.press('Escape');
  };
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  const bar = (await page.getByTestId('chart-topbar').boundingBox())!;
  const y = bar.y + bar.height + 80, x1 = box.x + box.width * .3, x2 = box.x + box.width * .6;
  await draw(x1, x2, y); // scale of the chart before the search ends
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  const before = (await stored(page))[0].points[0].price;
  // The pointer is pressed on an empty area (a pan) while the search ends
  await page.mouse.move(box.x + box.width * .8, y); await page.mouse.down();
  release();
  await expect(page.getByTestId('chart-page')).toHaveAttribute('data-scan-ms', /^\d+$/);
  await page.mouse.up();
  await expect.poll(async () => { await draw(x1, x2, y); return (await stored(page)).at(-1)!.points[0].price !== before; }, { timeout: 15_000 }).toBe(true);
});
