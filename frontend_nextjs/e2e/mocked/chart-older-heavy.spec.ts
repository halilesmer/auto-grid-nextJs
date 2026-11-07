import { MAX_TOTAL_BARS, OLDER_PAGE_BARS } from '../../src/lib/analysis/candles';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { dragLeft, openNearLeftEdge, panToFirstCandle } from '../fixtures/chart-older';

/**
 * Die schweren ANA-27-Fälle (mehr als 100.000 Kerzen im Chart) laufen hintereinander in einem Worker: parallel bremsten sie
 * sich und einander aus (Journal 2026-11-07-chart-older-candles). `default` heißt: der Reihe nach, ein Fehler überspringt
 * die übrigen nicht (anders als `serial`).
 */
test.describe.configure({ mode: 'default' });


/**
 * ANA-27 schwere Fälle. Messung: wie lange dauert es, eine Seite älterer M1-Kerzen anzufügen (Antwort da → Chart gezeichnet),
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
    const w = window as unknown as { __older: { response: number[]; steps: { bars: number; committed: number; drawn: number }[]; longest: number } };
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
      const committed = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => w.__older.steps.push({ bars: Number(bars), committed, drawn: performance.now() })));
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-bars'] });
  });
  const days = Math.ceil(DATA_BARS / 1440);
  const to = Date.UTC(2026, 0, 1) / 1000;
  const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  await page.goto(`/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=M1&from=${iso(to - days * DAY)}&to=${iso(to)}`);
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-bars', '100000', { timeout: 120_000 });
  const read = () => page.evaluate(() => (window as unknown as { __older: { response: number[]; steps: { bars: number; committed: number; drawn: number }[]; longest: number } }).__older);
  const pages: { bars: number; ms: number }[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const before = Number(await chart.getAttribute('data-bars'));
    if (before >= TARGET) break;
    // Mit der Maus nach links ziehen, bis die nächste Seite kommt (der Rand löst sie aus)
    await expect.poll(async () => {
      const now = Number(await chart.getAttribute('data-bars'));
      if (now > before) return now;
      await dragLeft(page);
      return now;
    }, { timeout: 120_000, intervals: [50] }).toBeGreaterThan(before);
    await expect.poll(async () => (await read()).steps.at(-1)?.bars ?? 0, { timeout: 30_000 }).toBeGreaterThan(before);
    const { response, steps } = await read();
    const step = steps.at(-1)!;
    // Die erste Antwort nach dem letzten Zeichnen (kommen zwei Seiten in einem Schritt, zählt der ganze Schritt)
    const previousCommitted = steps.at(-2)?.committed ?? 0;
    const answered = response.find((t) => t > previousCommitted && t <= step.committed) ?? step.committed;
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

test.describe('ANA-27 Zeitraum über 100.000 Kerzen (M1)', () => {
  const M1_URL = `/chart?mode=free&account=${DEMO_ID}&symbol=EURUSD&tf=M1&from=2024-01-03&to=2024-03-20`;
  // 78 Tage M1 = 112.320 Kerzen: mehr als die 100.000 der ersten Ladung, der Rest kommt nach

  test('Sola kaydırınca bir sayfa eklenir, görünen zaman aralığı aynı kalır, aralık başında yükleme durur', { tag: '@ANA-27' }, async ({ page, worker }) => {
    // Wie vor dem Umzug dieses Tests aus chart-workspace.spec.ts (90 s); der Umzug hatte die Angabe verloren
    test.setTimeout(90_000);
    worker.state.ratesAllDays = true;
    const { chart, rangeOf, before, loadedFrom, release } = await openNearLeftEdge(page, worker, { url: M1_URL, initialBars: '100000' });
    release();
    // Die zweite Seite: nur der Rest bis zum Zeitraumbeginn, nicht mehr als eine Seite
    await expect(chart).toHaveAttribute('data-bars', '112320');
    const older = new URLSearchParams(worker.ratesQueries.filter((q) => new URLSearchParams(q).get('to') === String(loadedFrom)).at(-1));
    expect(Number(older.get('from'))).toBe(Date.UTC(2024, 0, 3) / 1000);
    // Die Ansicht springt nicht: dieselbe erste und letzte sichtbare Kerzenzeit wie vor dem Anfügen
    await page.waitForTimeout(500);
    const after = await rangeOf();
    expect(Math.max(Math.abs(after[0] - before[0]), Math.abs(after[1] - before[1]))).toBeLessThanOrEqual(60);
    // Am Zeitraumbeginn ist Schluss: der Hinweis „gekürzt“ ist weg, die Anzeige links nennt den Beginn
    await expect(page.getByTestId('data-quality')).toHaveCount(0);
    await panToFirstCandle(page);
    await expect(page.getByTestId('older-edge')).toHaveAttribute('data-state', 'range');
    await expect(page.getByTestId('older-edge-line')).toBeVisible();
    const requests = worker.ratesQueries.length;
    await page.waitForTimeout(1200);
    expect(worker.ratesQueries.length).toBe(requests);
  });
});
