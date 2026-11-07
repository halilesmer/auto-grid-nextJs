import { MAX_TOTAL_BARS, OLDER_PAGE_BARS } from '../../src/lib/analysis/candles';
import { DEMO_ID, expect, test } from '../fixtures/test';

/**
 * ANA-27 Messung: wie lange dauert es, eine Seite älterer M1-Kerzen anzufügen (Antwort da → Chart gezeichnet),
 * je größer der Chart wird. Standard 150.000 Kerzen (schnell); ANA_PROFILE_BARS=360000 misst die
 * Obergrenze eines Jahres M1. Grenze laut Plan 1107-A4.4: über 1 s je Seite → Gesamtgrenze (MAX_TOTAL_BARS) senken; Ergebnis im Journal 2026-11-07-chart-older-candles.
 */
// Mehr als MAX_TOTAL_BARS lädt der Chart nicht: der Zeitraum darf größer sein (360.000 = ein Jahr M1), der Chart hält höchstens die Gesamtgrenze
const DATA_BARS = Number(process.env.ANA_PROFILE_BARS ?? 150_000);
const TARGET = Math.min(DATA_BARS, MAX_TOTAL_BARS);
const DAY = 86400;

test('Ältere Kerzen anfügen: Dauer je Seite bleibt unter der Grenze', { tag: '@ANA-27' }, async ({ page, worker }, testInfo) => {
  test.setTimeout(TARGET > 150_000 ? 600_000 : 120_000);
  worker.state.ratesAllDays = true;
  // Zeitpunkte im Browser: Antwort von /rates fertig, Kerzenzahl am Chart geändert, danach zwei Bilder später
  await page.addInitScript(() => {
    const w = window as unknown as { __older: { response: number[]; steps: { bars: number; drawn: number }[]; longest: number } };
    w.__older = { response: [], steps: [], longest: 0 };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      if (String(url).includes('/rates')) this.addEventListener('loadend', () => w.__older.response.push(performance.now()));
      return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__older.longest = Math.max(w.__older.longest, e.duration); }).observe({ entryTypes: ['longtask'] });
    } catch { /* ohne Long-Task-API */ }
    let last = '';
    new MutationObserver(() => {
      const bars = document.querySelector('[data-testid="analysis-chart"]')?.getAttribute('data-bars') ?? '';
      if (bars === last) return;
      last = bars;
      requestAnimationFrame(() => requestAnimationFrame(() => w.__older.steps.push({ bars: Number(bars), drawn: performance.now() })));
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-bars'] });
  });
  const days = Math.ceil(DATA_BARS / 1440);
  const to = Date.UTC(2026, 0, 1) / 1000;
  const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  await page.goto(`/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=M1&from=${iso(to - days * DAY)}&to=${iso(to)}`);
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-bars', '100000', { timeout: 120_000 });
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  const read = () => page.evaluate(() => (window as unknown as { __older: { response: number[]; steps: { bars: number; drawn: number }[]; longest: number } }).__older);
  const pages: { bars: number; ms: number }[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const before = Number(await chart.getAttribute('data-bars'));
    if (before >= TARGET) break;
    // Waagerechtes Rad schiebt den Chart weit nach links: der Rand löst die nächste Seite aus
    await page.mouse.wheel(-400_000, 0);
    await expect.poll(async () => Number(await chart.getAttribute('data-bars')), { timeout: 60_000 }).toBeGreaterThan(before);
    await expect.poll(async () => (await read()).steps.at(-1)?.bars ?? 0, { timeout: 30_000 }).toBeGreaterThan(before);
    const { response, steps } = await read();
    const step = steps.at(-1)!;
    const answered = response.filter((t) => t <= step.drawn).at(-1)!;
    pages.push({ bars: step.bars, ms: Math.round(step.drawn - answered) });
  }
  const { longest } = await read();
  const report = `Seiten (Kerzen im Chart nach der Seite → ms bis gezeichnet): ${pages.map((p) => `${p.bars}→${p.ms}`).join(', ')}; längster Long Task ${Math.round(longest)} ms`;
  console.log(report);
  testInfo.annotations.push({ type: 'messung', description: report });
  expect(pages.length).toBeGreaterThan(0);
  expect(pages.at(-1)!.bars).toBeGreaterThanOrEqual(TARGET);
  // Die Gesamtgrenze hält: die letzte Seite geht höchstens um eine Seite darüber hinaus
  expect(Number(await chart.getAttribute('data-bars'))).toBeLessThanOrEqual(MAX_TOTAL_BARS + OLDER_PAGE_BARS);
  // Grobe Schranke gegen Rückschritte, auch auf einer langsamen CI-Maschine; die Grenze von 1 s liest man aus der Messung (Journal)
  for (const p of pages) expect(p.ms).toBeLessThan(8000);
});
