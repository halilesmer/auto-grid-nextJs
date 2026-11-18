/**
 * ANA-25 / FRM-20: a drawing tool wins over the SVG line of a formation (priority: tool > drawing under the pointer > formation line).
 * With a tool active the hit area of the line (`line-hit`) does not take the press: the tool puts its point on the pixel that was pressed.
 * Without a tool the line keeps the press (UI-26 decision: the line must keep the press for selection).
 */
import type { Page } from '@playwright/test';
import { chartReady, hideFormationDrawings } from '../fixtures/chart-ready';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

// The mock candles and the formation lines on them follow the clock: a fixed clock gives the same chart on every run
test.use({ fakeNow: '2026-11-17T15:20:00Z' });
test.setTimeout(90_000);
const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const KEY = 'grid-robot-chart-workspaces-v1';
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('grid-robot-formation-sidebar', JSON.stringify({ open: false, tab: 'conditions' }))));

type Fib = Record<string, unknown> & { kind: string };
async function stored(page: Page) {
  return page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.values(store.documents ?? {}).flatMap(d => JSON.parse((d as { drawings: string }).drawings)) as Fib[];
  }, KEY).then(all => all.filter(d => d.kind === 'fib-retracement'));
}
/** A pixel on a formation line (`line-hit`) whose topmost element is that line, inside the candle area; searched at run time, no fixed pixel */
const pointOnLine = (page: Page) => page.evaluate(() => {
  const chart = document.querySelector('[data-testid="analysis-chart"]')!.getBoundingClientRect();
  for (const line of document.querySelectorAll<SVGLineElement>('[data-testid="line-hit"]')) {
    const len = line.getTotalLength();
    for (let f = 0.3; f <= 0.71; f += 0.1) {
      const p = line.getPointAtLength(len * f), m = line.getScreenCTM()!;
      const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
      if (x > chart.x + 60 && x < chart.right - 80 && y > chart.y + 150 && y < chart.y + chart.height * 0.55 && document.elementFromPoint(x, y) === line) return { x, y };
    }
  }
  return null;
});
const topIsLineHit = (page: Page, at: { x: number; y: number }) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid') === 'line-hit', at);
async function pickFib(page: Page) {
  await page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true }).click();
  await page.getByTestId('tool-fib-retracement').click();
}

test('ANA-25: aktif çizim aracı varken formasyon çizgisinin basışı araca gider, nokta basılan yere konur', { tag: ['@ANA-25', '@FRM-20'] }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  await chartReady(page);
  const at = await pointOnLine(page);
  expect(at, 'no formation line with a free pixel').not.toBeNull();
  const to = { x: at!.x + 120, y: at!.y - 70 };
  await pickFib(page);
  await page.mouse.move(at!.x, at!.y);
  expect(await topIsLineHit(page, at!), 'the formation line must not take the press while a tool is active').toBe(false);
  await page.mouse.click(at!.x, at!.y);
  await page.mouse.move(to.x, to.y);
  await page.mouse.click(to.x, to.y);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  // Same pixels with the formation drawings off give the same points: the tool put its point exactly where it was pressed
  await hideFormationDrawings(page);
  await page.mouse.move(0, 0);
  await pickFib(page);
  await page.mouse.click(at!.x, at!.y);
  await page.mouse.move(to.x, to.y);
  await page.mouse.click(to.x, to.y);
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  const strip = (d: Fib) => JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => /point|time|price|anchor|a$|b$/i.test(k))));
  const [first, second] = await stored(page);
  expect(strip(first)).not.toBe('{}');
  expect(strip(first)).toBe(strip(second));
});

test('ANA-25: araç seçili değilken formasyon çizgisi basışı alır', { tag: ['@ANA-25', '@FRM-20'] }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  await chartReady(page);
  const at = await pointOnLine(page);
  expect(at, 'no formation line with a free pixel').not.toBeNull();
  await page.mouse.move(at!.x, at!.y);
  expect(await topIsLineHit(page, at!)).toBe(true);
  // The tool ends after a drawing: the line takes the press again
  await pickFib(page);
  await page.mouse.move(at!.x, at!.y);
  expect(await topIsLineHit(page, at!)).toBe(false);
  await page.keyboard.press('Escape');
  await page.mouse.move(at!.x + 3, at!.y);
  await page.mouse.move(at!.x, at!.y);
  await expect.poll(() => topIsLineHit(page, at!)).toBe(true);
});
