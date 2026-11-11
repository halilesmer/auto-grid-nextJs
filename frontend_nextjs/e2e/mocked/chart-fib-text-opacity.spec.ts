/**
 * UI-27 Fibonacci-Fenster, S5 (Plan 1110-A4.11): Level-Text auf der Linie und Farb-Deckkraft (Trendlinie, je Level, alle Level).
 * Die Deckkraft liegt als „#rrggbbaa“ in der Farbe; alte Farben („#rrggbb“) bleiben unverändert.
 */
import type { Page } from '@playwright/test';
import { joinColor, normalizeFibStyle, splitColor } from '../../src/lib/chart-workspace/fibStyle';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

const URL = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
const KEY = 'grid-robot-chart-workspaces-v1';
test.setTimeout(90_000);

type Level = { coeff: number; color: string; visible: boolean; text?: string };
type Fib = { kind: string; style: { levels?: Level[]; fibTrendLine?: { color: string }; showText?: boolean } };
const dialog = (page: Page) => page.getByTestId('fib-settings');
async function stored(page: Page) {
  return page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.values(store.documents ?? {}).flatMap(d => JSON.parse((d as { drawings: string }).drawings)) as Fib[];
  }, KEY).then(all => all.filter(d => d.kind === 'fib-retracement'));
}
async function drawFib(page: Page) {
  await page.getByRole('button', { name: msg('cw.rail.fibMenu'), exact: true }).click();
  await page.getByTestId('tool-fib-retracement').click();
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  const bar = (await page.getByTestId('chart-topbar').boundingBox())!;
  const y1 = bar.y + bar.height + 90, y2 = y1 + 160;
  await page.mouse.click(box.x + box.width * .35, y1);
  await page.mouse.move(box.x + box.width * .5, (y1 + y2) / 2);
  await page.mouse.click(box.x + box.width * .6, y2);
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  return { x: box.x + box.width * .47, y: (y1 + y2) / 2 };
}
async function open(page: Page, at: { x: number; y: number }) {
  await page.waitForTimeout(800);
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(150);
  await page.mouse.dblclick(at.x, at.y);
  await expect(dialog(page)).toBeVisible();
}

test('UI-27: Farbe und Deckkraft werden als #rrggbbaa gespeichert; alte Farben bleiben', { tag: '@UI-27' }, () => {
  expect(joinColor('#2962ff', 100)).toBe('#2962ff');
  expect(joinColor('#2962ff', 50)).toBe('#2962ff80');
  expect(joinColor('#2962ff', 0)).toBe('#2962ff00');
  expect(splitColor('#2962ff80')).toEqual({ rgb: '#2962ff', alpha: 50 });
  expect(splitColor('#fff')).toEqual({ rgb: '#ffffff', alpha: 100 });
  expect(splitColor('#fffa')).toEqual({ rgb: '#ffffff', alpha: 67 });
  // ein alter Eintrag ohne Deckkraft und ohne Text wird nicht verändert
  const s = normalizeFibStyle({ levels: [{ coeff: 0.5, color: '#4caf50', visible: true }] });
  expect(s.levels).toEqual([{ coeff: 0.5, color: '#4caf50', visible: true }]);
  // zu langer Text wird gekürzt, leerer Text fällt weg
  const t = normalizeFibStyle({ levels: [{ coeff: 1, color: '#fff', visible: true, text: 'x'.repeat(80) }, { coeff: 2, color: '#fff', visible: true, text: '' }] });
  expect(t.levels[0].text).toHaveLength(40);
  expect(t.levels[1].text).toBeUndefined();
});

test('UI-27: Level-Text steht auf der Linie; Deckkraft je Level, Trendlinie und für alle Level', { tag: '@UI-27' }, async ({ page, worker }) => {
  void worker;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(URL);
  const at = await drawFib(page);
  await open(page, at);
  const d = dialog(page);
  const first = d.getByTestId('fib-level').first();
  await first.getByTestId('fib-level-text').fill('Hedef');
  await first.getByLabel(`${msg('fib.levelAlpha')} 0`, { exact: true }).fill('50');
  await d.getByLabel(msg('fib.trendAlpha'), { exact: true }).fill('40');
  await d.getByTestId('fib-ok').click();
  await expect(d).toHaveCount(0);
  let fib = (await stored(page))[0];
  expect(fib.style.levels![0]).toMatchObject({ text: 'Hedef' });
  expect(fib.style.levels![0].color).toMatch(/^#[\da-f]{6}80$/i);
  expect(fib.style.fibTrendLine!.color).toMatch(/^#[\da-f]{6}66$/i);
  // (die Bibliothek zeichnet auf Canvas; der Text selbst wird im Browser geprüft, hier der gespeicherte Stand)
  // Deckkraft für alle Level: alle Farben bekommen dieselbe Deckkraft, die Farbtöne bleiben
  const before = fib.style.levels!.map(l => splitColor(l.color).rgb);
  await open(page, at);
  await d.getByLabel(msg('fib.oneAlpha'), { exact: true }).fill('25');
  await d.getByTestId('fib-ok').click();
  fib = (await stored(page))[0];
  expect(fib.style.levels!.map(l => splitColor(l.color).alpha)).toEqual(fib.style.levels!.map(() => 25));
  expect(fib.style.levels!.map(l => splitColor(l.color).rgb)).toEqual(before);
  // „Metin“ aus: der Schalter wird gespeichert, der Text bleibt erhalten
  await open(page, at);
  await d.getByLabel(msg('fib.text'), { exact: true }).uncheck();
  await d.getByTestId('fib-ok').click();
  fib = (await stored(page))[0];
  expect(fib.style.showText).toBe(false);
  expect(fib.style.levels![0].text).toBe('Hedef');
});
