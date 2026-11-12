/**
 * Araçlar-Menü und Grid-Risikorechner (/tools/grid-risk) gegen den Mock-Worker.
 * TLS-01 Grid-Risikorechner (Zahlen: tools-grid-risk-lib.spec.ts)
 */
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, test } from '../fixtures/test';

/** Dashboard öffnen, Konto wählen und über das Araçlar-Menü zum Rechner (Navigation ohne Neuladen) */
async function openCalculator(page: import('@playwright/test').Page, dashboard: { open: (id: string | null) => Promise<void> }) {
  await dashboard.open(DEMO_ID);
  await page.getByTestId('nav-tools').click();
  await page.getByTestId('nav-tool-grid-risk').click();
  await expect(page.getByTestId('grid-risk-page')).toBeVisible();
}

async function pickSymbol(page: import('@playwright/test').Page, name: string) {
  const box = page.getByRole('combobox', { name: msg('tools.symbol') });
  await box.fill(name);
  await page.getByRole('option', { name }).first().click();
  await expect(page.getByTestId('grid-risk-status')).toBeVisible();
}

test.describe('Grid-Risikorechner', { tag: '@TLS-01' }, () => {
  test('Ohne Konto zeigt die Seite einen Kontowähler; Konto wählen lädt die Symbole', async ({ page, worker }) => {
    void worker; // schaltet den Mock-Worker ein, ohne vorher das Dashboard zu öffnen
    await page.goto('/tools/grid-risk');
    await expect(page.getByText(msg('tools.noAccount')).first()).toBeVisible();
    const select = page.getByTestId('grid-risk-account').getByRole('combobox', { name: msg('account.select.aria') });
    await expect(select).toBeVisible();
    await select.click();
    const listId = await select.getAttribute('aria-controls');
    await page.locator(`[id="${listId}"]`).getByRole('option').filter({ hasText: `(${DEMO_ID})` }).click();
    await expect(page.getByText(msg('tools.noAccount'))).toHaveCount(0);
    await pickSymbol(page, 'USOUSD');
  });

  test('Menü → Seite, Werte kommen vom Konto, Zurück-Link, Balken folgt dem Prozentwert', async ({ page, dashboard }) => {
    await openCalculator(page, dashboard);
    await pickSymbol(page, 'USOUSD');
    // Kapital = Kontostand, P0 = Ask, Marge/Lot = 80,1 * 1000 / 10
    await expect(page.getByTestId('grid-risk-capital')).toHaveValue('1050');
    await expect(page.getByTestId('grid-risk-p0')).toHaveValue('80.1');
    await expect(page.getByTestId('grid-risk-chips')).toContainText('8.010,00');
    // Balkenbreite = Prozentwert (A2.2)
    const pct = parseFloat((await page.getByTestId('grid-risk-usage-pct').innerText()).replace(/[^\d,.-]/g, '').replace(',', '.'));
    const width = await page.getByTestId('grid-risk-usage-bar').evaluate((el) => (el as HTMLElement).style.width);
    expect(parseFloat(width)).toBeCloseTo(Math.min(100, pct), 0);
    // Geändertes Kapital: Zurück-Link erscheint und stellt den Kontowert wieder her
    await page.getByTestId('grid-risk-capital').fill('500');
    await expect(page.getByTestId('grid-risk-reset-capital')).toBeVisible();
    await page.getByTestId('grid-risk-reset-capital').click();
    await expect(page.getByTestId('grid-risk-capital')).toHaveValue('1050');
    // Alle Stufen stehen in der Tabelle; Swap ist bei negativem Wert rot mit Minus (A2.3)
    const rows = page.getByTestId('grid-risk-table').locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(5);
    const swapCell = rows.first().locator('td').nth(5);
    await expect(swapCell).toContainText('−');
    await expect(swapCell).toHaveClass(/text-danger/);
  });

  test('Kademe aralığı: „0.“ stürzt nicht ab, Komma gilt als Punkt, das Feld ist breit genug', async ({ page, dashboard }) => {
    await openCalculator(page, dashboard);
    await pickSymbol(page, 'USOUSD');
    const step = page.getByTestId('grid-risk-step');
    // Leer → NaN als Wert; früher Endlosschleife im NumberInput (Too many re-renders)
    await step.fill('');
    await step.pressSequentially('0.5');
    await expect(page.getByTestId('grid-risk-page')).toBeVisible();
    await expect(step).toHaveValue('0.5');
    // Komma gilt wie Punkt (Tippen und Einfügen)
    await step.fill('');
    await step.pressSequentially('0,25');
    await expect(step).toHaveValue('0.25');
    await page.getByTestId('grid-risk-lot').fill('');
    await page.getByTestId('grid-risk-lot').pressSequentially('0,02');
    await expect(page.getByTestId('grid-risk-lot')).toHaveValue('0.02');
    // Platz für mehrere Ziffern neben dem Cent/Fiyat-Schalter
    expect((await step.boundingBox())!.width).toBeGreaterThan(100);
  });

  test('Fehlerfälle: Dip über P0 und zu viele Stufen mit der echten Zahl (P0 80,1 → 1 in 0,01: 7911)', async ({ page, dashboard }) => {
    await openCalculator(page, dashboard);
    await pickSymbol(page, 'USOUSD');
    await page.getByTestId('grid-risk-floor').fill('90');
    await expect(page.getByText(msg('tools.err.floor.text'))).toBeVisible();
    await page.getByTestId('grid-risk-floor').fill('1');
    await page.getByTestId('grid-risk-step').fill('0.01');
    await expect(page.getByText(/7[.,]911/)).toBeVisible();
  });

  test('ohne MT5-Marge: Näherung mit Warnung', async ({ page, dashboard, worker }) => {
    worker.state.calcContext.marginNull = true;
    await openCalculator(page, dashboard);
    await pickSymbol(page, 'USOUSD');
    await expect(page.getByText(msg('tools.warn.marginApprox'))).toBeVisible();
  });

  test('375 px: kein Seitenüberlauf, ☰-Panel zeigt Araçlar', async ({ page, dashboard }) => {
    await openCalculator(page, dashboard);
    await pickSymbol(page, 'USOUSD');
    await page.setViewportSize({ width: 375, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId('nav-menu').click();
    await expect(page.getByTestId('nav-tools-group').getByTestId('nav-tool-grid-risk')).toBeVisible();
  });
});
