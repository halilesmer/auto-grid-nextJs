import type { Page } from '@playwright/test';
import { expect } from './test';
import { msg } from './i18n';

/**
 * Hilfen für die ANA-27-Tests (ältere Kerzen laden beim Scrollen nach links): Ziehen mit der Maus (ein waagerechtes Rad scrollt
 * diesen Chart nicht), der Weg an den linken Rand und das Anhalten der Antwort auf die Seite älterer Kerzen.
 */

/**
 * Zieht den Chart mit der Maus um höchstens 80 % der Breite nach rechts, also die Ansicht nach links (der Nutzer bedient den Chart).
 * Ein breiter Zug bringt rund 1800 Kerzen weiter; mit schmalen Zügen (halbe Breite, 820 Kerzen) waren es bei 100.000 Kerzen
 * rund 120 Züge von je 0,7 bis 1 s, und unter Last reichten 120 s nicht (Journal 2026-11-07-chart-older-candles).
 * Sechs Zwischenschritte: mit zwei erkennt der Chart den Zug nicht.
 */
export async function dragLeft(page: Page, dx = Number.POSITIVE_INFINITY) {
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  // Nicht über den Hinweisen oben links: dort fängt der Hinweis „gekürzt“ die Maus ab
  const y = box.y + box.height * 0.6, x = box.x + box.width * 0.15;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.min(dx, box.width * 0.8), y, { steps: 6 });
  await page.mouse.up();
}

/** Zieht, bis die erste Kerze mit der Anzeige „Beginn“ zu sehen ist (die Seiten kommen dabei nach) */
export async function panToFirstCandle(page: Page) {
  // Erst herauszoomen: bei engem Zoom wären es Dutzende Züge bis zur ersten Kerze
  const box = (await page.getByTestId('analysis-chart').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.mouse.wheel(0, 4000);
  await expect.poll(async () => {
    if (await page.getByTestId('older-edge-line').count()) return true;
    await dragLeft(page);
    return false;
  }, { timeout: 60_000, intervals: [50] }).toBe(true);
}

/**
 * Öffnet den Chart (`url`, erste Ladung `initialBars`) und bringt ihn mit Bedienung des Nutzers (Rad heraus, dann Ziehen) an den
 * linken Rand, bis er die Seite älterer Kerzen anfragt. Seit 1118-A5.1 speichert der Chart keinen Zoom mehr: ein gespeicherter
 * Ausschnitt am linken Rand ist kein Weg mehr dorthin. Die Antwort auf die Seite hält der Test an, bis `release()` sie freigibt:
 * so ist die Ansicht davor lesbar. Mit `fail` antwortet der Test stattdessen mit 503 und zählt die Anfragen.
 * `extra`: Felder des Chart-Dokuments, die vor einem Neuladen geschrieben werden (z. B. keine Indikatoren).
 */
export async function openNearLeftEdge(
  page: Page,
  worker: { ratesQueries: string[] },
  options: { url: string; initialBars: string | RegExp; extra?: Record<string, unknown>; fail?: boolean },
) {
  const { url, initialBars, extra = {}, fail = false } = options;
  await page.goto(url);
  const chart = page.getByTestId('analysis-chart');
  await expect(chart).toHaveAttribute('data-bars', initialBars);
  // Zuerst ist der Zeitraum gekürzt: der Hinweis sagt, dass ältere Kerzen beim Scrollen kommen
  await expect(page.getByTestId('data-quality')).toContainText(msg('analysis.data.scroll.title'));
  const loadedFrom = Math.min(...worker.ratesQueries.map((q) => Number(new URLSearchParams(q).get('from'))));
  if (Object.keys(extra).length > 0) {
    const key = (await page.getByTestId('chart-workspace').getAttribute('data-context'))!;
    await page.addInitScript(({ contextKey, fields }) => {
      const saved = JSON.parse(localStorage.getItem('grid-robot-chart-workspaces-v1') || '{}');
      saved.documents = { ...saved.documents, [contextKey]: { ...saved.documents?.[contextKey], ...fields } };
      localStorage.setItem('grid-robot-chart-workspaces-v1', JSON.stringify(saved));
    }, { contextKey: key, fields: extra });
    await page.reload();
  }
  // Erst nach dem Neuladen lesen: wechselt die Minute zwischen den beiden Ladungen, bringt das Neuladen eine Kerze mehr (1116-A35)
  await expect(chart).toHaveAttribute('data-bars', initialBars);
  const loaded = Number(await chart.getAttribute('data-bars'));
  const rangeOf = async () => ((await chart.getAttribute('data-visible-range')) ?? '').split(',').map(Number);
  let release = () => {};
  let failures = 0, requests = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/market/*/rates?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('to') !== String(loadedFrom)) return route.fallback();
    requests++;
    // Die Seite älterer Kerzen: festhalten (Ansicht davor lesen) oder mit einem Fehler beantworten
    if (fail) {
      failures++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'busy' }) });
    }
    await gate;
    return route.fallback();
  });
  // Ohne Bedienung lädt der Chart nichts (1118-A3.1)
  await page.waitForTimeout(800);
  expect(requests).toBe(0);
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.mouse.wheel(0, 4000);
  await expect.poll(async () => {
    if (requests > 0) return true;
    await dragLeft(page);
    return requests > 0;
  }, { timeout: 60_000, intervals: [50] }).toBe(true);
  if (!fail) {
    await expect(page.getByTestId('older-edge')).toHaveAttribute('data-state', 'loading');
    await expect(page.getByTestId('older-loading-strip')).toBeVisible();
  }
  const before = await rangeOf();
  return { chart, rangeOf, before, loaded, loadedFrom, release, failures: () => failures };
}
