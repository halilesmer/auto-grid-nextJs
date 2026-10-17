/**
 * UI-01 · Kopfzeile: eine Zeile mit fester Höhe (56 px, CSS-Variable --nav-height, die die fixierte
 * Steuerleiste als Abstand nutzt). Rechts das Kopf-Menü mit Verbindung, Sprache, Design und System;
 * unter `lg` stehen die Seitenlinks im ☰-Menü. Beide Panels liegen über dem Inhalt und verschieben nichts.
 */
import type { Locator, Page } from '@playwright/test';
import { MOCK_API } from '../fixtures/env';
import { headerMenuTrigger, openHeaderMenu, openPageMenu } from '../fixtures/header';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';
import { hostOf } from '../../src/lib/connectionCode';

async function expectInViewport(page: Page, locator: Locator, name: string) {
  await expect(locator, name).toBeVisible();
  const box = await locator.boundingBox();
  expect(box!.x, `${name}: links außerhalb`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name}: rechts außerhalb`).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box!.y + box!.height, `${name}: unten außerhalb`).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test.describe('UI-01 Kopfzeile', () => {
  test('eine Zeile mit fester Höhe von 56 px bei jeder Breite', { tag: '@UI-01' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const nav = page.getByRole('navigation');
    for (const width of [375, 640, 1023, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => (await nav.boundingBox())!.height, `${width}px`).toBe(56);
    }
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--nav-height').trim())).toBe('3.5rem');
  });

  test('unter lg stehen die Seitenlinks im ☰-Menü, ab lg in der Zeile', { tag: '@UI-01' }, async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await dashboard.open(DEMO_ID);
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: msg('nav.analysis') })).toHaveCount(0);

    const panel = await openPageMenu(page);
    for (const key of ['nav.dashboard', 'nav.analysis', 'nav.backtest', 'nav.formation', 'nav.vps', 'nav.users'] as const) {
      await expectInViewport(page, panel.getByRole('link', { name: msg(key), exact: true }), key);
    }
    await expect(panel.getByRole('link', { name: msg('nav.dashboard') })).toHaveAttribute('aria-current', 'page');
    await panel.getByRole('link', { name: msg('nav.analysis') }).click();
    await expect(page).toHaveURL(/\/chart/);
    await expect(panel).toBeHidden();

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByTestId('nav-menu')).toBeHidden();
    await expect(nav.getByRole('link', { name: msg('nav.analysis') })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('UI-01 Kopf-Menü', () => {
  test('bündelt Verbindung, Sprache, Design und System; Auswahl schließt es nicht', { tag: '@UI-01' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const panel = await openHeaderMenu(page);
    const connection = panel.getByTestId('header-menu-connection');
    await expect(connection).toContainText(hostOf(MOCK_API));
    await expect(connection).toContainText(msg('connection.status.connected'));
    await expect(panel.getByTestId('language-switcher')).toBeVisible();
    await expect(panel.getByRole('radiogroup', { name: msg('common.theme') })).toBeVisible();
    await expect(panel.getByRole('button', { name: msg('dashboard.sysinfo.checkUpdates') })).toBeVisible();
    await expect(panel.getByRole('button', { name: msg('dashboard.shutdown') })).toBeVisible();

    // Sprache und Design nacheinander wählen, ohne das Menü neu zu öffnen
    await panel.getByTestId('language-en').click();
    await panel.getByRole('radio', { name: msg('common.theme.light', undefined, 'en') }).click();
    await expect(panel).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(headerMenuTrigger(page)).toBeFocused();
  });

  test('„Verbindung ändern“ öffnet den Verbindungsdialog', { tag: '@UI-01' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const panel = await openHeaderMenu(page);
    await panel.getByTestId('connection-change').click();
    await expect(page.getByTestId('connection-dialog')).toBeVisible();
    await expect(panel).toBeHidden();
  });

  test('Panel liegt über der Steuerleiste und verschiebt nichts', { tag: '@UI-01' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const bar = page.getByTestId('control-bar');
    const before = (await bar.boundingBox())!;
    const panel = await openHeaderMenu(page);
    expect(await bar.boundingBox()).toEqual(before);

    const box = (await panel.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: before.y + before.height / 2 };
    expect(point.y, 'Panel reicht über die Steuerleiste').toBeLessThan(box.y + box.height);
    const panelOnTop = await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="header-menu-panel"]')),
      point,
    );
    expect(panelOnTop).toBe(true);
  });

  test('ohne gewähltes Konto ist Herunterfahren deaktiviert und sendet nichts', { tag: ['@UI-01', '@UPD-03'] }, async ({ page, worker, dashboard }) => {
    await dashboard.open(null);
    const panel = await openHeaderMenu(page);
    await expect(panel.getByRole('button', { name: msg('dashboard.shutdown') })).toBeDisabled();
    expect(worker.callsTo('POST', '/api/stop')).toHaveLength(0);
  });

  test('Störungstext im Auslöser überlappt bei 1024 px keinen Link (tr, längster Text)', { tag: ['@UI-01', '@UI-08'] }, async ({ page, worker, dashboard }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await dashboard.open(DEMO_ID);
    worker.overrides.set('GET /api/system/platform', { status: 401, body: { detail: 'Invalid or missing API key' } });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const trigger = headerMenuTrigger(page);
    await expect(trigger).toHaveAttribute('data-status', 'unauthorized');
    await expect(trigger).toContainText(msg('connection.status.unauthorized'));
    const triggerBox = (await trigger.boundingBox())!;
    const lastLink = page.getByRole('navigation').getByRole('link', { name: msg('nav.users'), exact: true });
    const linkBox = (await lastLink.boundingBox())!;
    expect(linkBox.x + linkBox.width, 'letzter Link endet vor dem Auslöser').toBeLessThanOrEqual(triggerBox.x);
    expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(1024);
    worker.unauthorized.length = 0; // erwartet: die 401 kam aus dem Override
  });

  test('bei 375 px liegt das Panel ganz im Fenster', { tag: ['@UI-01', '@UI-08'] }, async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await dashboard.open(DEMO_ID);
    const panel = await openHeaderMenu(page);
    await expectInViewport(page, panel, 'Kopf-Menü');
    await expectInViewport(page, panel.getByRole('button', { name: msg('dashboard.shutdown') }), 'Herunterfahren');
  });

  test('System funktioniert auf jeder Seite: Update-Prüfung und Herunterfahren auf /chart', { tag: ['@UI-01', '@UPD-01', '@UPD-03'] }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await page.getByRole('navigation').getByRole('link', { name: msg('nav.analysis') }).click();
    await expect(page).toHaveURL(/\/chart/);

    let panel = await openHeaderMenu(page);
    await panel.getByRole('button', { name: msg('dashboard.sysinfo.checkUpdates') }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(msg('update.upToDate'));
    await modal.getByRole('button', { name: msg('common.close'), exact: true }).last().click();
    await expect(modal).toBeHidden();

    panel = await openHeaderMenu(page);
    await panel.getByRole('button', { name: msg('dashboard.shutdown') }).click();
    // Die Rückfrage nennt Konto und LIVE/DEMO (ui-design §6)
    await expect(modal).toContainText(msg('dashboard.shutdown.message', { account: 'E2E Demo', env: msg('dashboard.env.demo') }));
    await modal.getByRole('button', { name: msg('dashboard.shutdown.confirm') }).click();
    await expect.poll(() => worker.callsTo('POST', '/api/stop').length).toBe(1);
    expect(worker.callsTo('POST', '/api/stop')[0].query.get('account_id')).toBe(DEMO_ID);
  });
});
