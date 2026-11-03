/**
 * UI-11 Gemeinsame Chart-Ebenen (ChartView): System-RSI(7) und Wave 5/35 stehen auf jedem Chart, auch auf /chart frei
 * und im Setup-Modus. Sie werden aus den geschlossenen Kerzen des Charts gerechnet und lassen sich im Dialog
 * „Anzeige“ ein- und ausschalten. Plan: docs/journal/2026-11-01-unified-chart-page.md.
 */
import type { Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const SETUP = `/chart?account=${DEMO_ID}&mode=setup&zone=${ZONE_ID}&tf=H1`;
const FREE = `/chart?account=${DEMO_ID}&symbol=EURUSD&tf=H1&range=7d`;
/** Wave 5/35 braucht 35 Kerzen, bis der erste Wert steht (Wert ab Kerze 35) */
const WAVE_WARMUP = 34;

async function openOverlays(page: Page) {
  await page.getByTestId('workspace-settings').click();
  await page.getByRole('button', { name: msg('cw.overlays'), exact: true }).click();
}

for (const [name, url] of [['frei', FREE], ['Setup', SETUP]] as const) {
  test.describe(`UI-11 ${name}`, () => {
    test('RSI(7) und Wave 5/35 stehen als System-Fenster unter den Kerzen', { tag: '@UI-11' }, async ({ page, worker }) => {
      void worker;
      await page.goto(url);
      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toHaveAttribute('data-bars', /^[1-9]\d*$/);
      const bars = Number(await chart.getAttribute('data-bars'));
      await expect(chart).toHaveAttribute('data-system-panes', '3');
      await expect(chart).toHaveAttribute('data-wave-visible', 'true');
      const waves = Number(await chart.getAttribute('data-wave-points'));
      // Die laufende Kerze zählt nicht mit: höchstens eine Kerze weniger als im Chart
      expect(waves).toBeGreaterThanOrEqual(bars - 1 - WAVE_WARMUP);
      expect(waves).toBeLessThanOrEqual(bars - WAVE_WARMUP);
    });

    test('Die Schalter „RSI“ und „Wave“ blenden die Fenster aus und wieder ein', { tag: '@UI-11' }, async ({ page, worker }) => {
      void worker;
      await page.goto(url);
      const chart = page.getByTestId('analysis-chart');
      await expect(chart).toHaveAttribute('data-wave-visible', 'true');
      await openOverlays(page);
      const wave = page.locator('#overlay-wave');
      await expect(wave).toHaveAttribute('aria-checked', 'true');
      await wave.click();
      await expect(chart).toHaveAttribute('data-wave-visible', 'false');
      await wave.click();
      await expect(chart).toHaveAttribute('data-wave-visible', 'true');
      await expect(page.locator('#overlay-rsi')).toHaveAttribute('aria-checked', 'true');
    });
  });
}

test.describe('UI-11 Nutzer-Indikatoren', () => {
  test('Der erste Klick auf einen Ebenen-Schalter lässt RSI 14 und EWO eines neuen Charts stehen', { tag: '@UI-11' }, async ({ page, worker }) => {
    void worker;
    await page.goto(FREE);
    const values = page.getByTestId('workspace-indicator-values');
    await expect(values).toContainText('EWO');
    await expect(values).toContainText('RSI');
    await openOverlays(page);
    await page.locator('#overlay-wave').click();
    await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-wave-visible', 'false');
    await page.getByRole('button', { name: msg('cw.apply') }).click();
    await expect(values).toContainText('EWO');
    await expect(values).toContainText('RSI');
    await page.reload();
    await expect(values).toContainText('EWO');
    await expect(values).toContainText('RSI');
  });
});

test.describe('UI-11 schmale Breite', () => {
  for (const [name, url] of [['frei', FREE], ['Setup', SETUP]] as const) {
    test(`${name}: unter 71 rem enden die Fenster über der Werkzeugkarte, darüber stehen sie neben der Kopfleiste`, { tag: '@UI-11' }, async ({ page, worker }) => {
      void worker;
      for (const [width, narrow] of [[375, true], [1440, false]] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await expect(page.getByTestId('analysis-chart')).toHaveAttribute('data-system-panes', '3');
        const box = (id: string) => page.getByTestId(id).boundingBox().then(b => b!);
        const bottomOf = async (id: string) => { const b = await box(id); return b.y + b.height; };
        const workspaceBottom = await bottomOf('chart-workspace');
        if (narrow) {
          // Die Fläche endet über der Karte, die Lücke ist klein, und die Fläche ist nicht auf null gefallen
          await expect.poll(async () => (await box('workspace-toolbar')).y - (await bottomOf('analysis-chart'))).toBeGreaterThanOrEqual(0);
          // Die zugeklappte Setup-Karte hat einen eigenen Streifen über den Werkzeugen (--floating-card, UI-12)
          const card = await page.getByTestId('formation-main').evaluate(el => parseFloat(el.style.getPropertyValue('--floating-card')) || 0);
          // Obergrenze: höchstens die Höhe der Karte plus 4 px Abstand und 4 px Toleranz
          if (name === 'Setup') expect(card).toBeLessThanOrEqual((await box('chart-floating-card')).height + 8);
          else expect(card).toBe(0);
          expect((await box('workspace-toolbar')).y - (await bottomOf('analysis-chart'))).toBeLessThanOrEqual(24 + card);
          expect((await box('analysis-chart')).height).toBeGreaterThan(300);
        } else await expect.poll(async () => workspaceBottom - (await bottomOf('analysis-chart'))).toBeLessThanOrEqual(1);
      }
    });
  }
});
