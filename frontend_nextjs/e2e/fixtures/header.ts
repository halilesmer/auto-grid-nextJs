/**
 * Kopfzeile (UI-01): Kopf-Menü rechts (Verbindung, Sprache, Design, System) und unter `lg` das ☰-Menü
 * mit den Seitenlinks. Beide Panels liegen als Overlay über dem Inhalt.
 */
import { expect, type Page } from '@playwright/test';

/** Auslöser des Kopf-Menüs; zeigt den Verbindungsstatus (`data-status`). */
export const headerMenuTrigger = (page: Page) => page.getByTestId('connection-chip');

/** Öffnet das Kopf-Menü und gibt das Panel zurück. */
export async function openHeaderMenu(page: Page) {
  await headerMenuTrigger(page).click();
  const panel = page.getByTestId('header-menu-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** Öffnet das Kopf-Menü und darin den Verbindungsdialog. */
export async function openConnectionDialog(page: Page) {
  const panel = await openHeaderMenu(page);
  await panel.getByTestId('connection-change').click();
  await expect(page.getByTestId('connection-dialog')).toBeVisible();
}

/** Öffnet unter `lg` das ☰-Menü mit den Seitenlinks und gibt das Panel zurück. */
export async function openPageMenu(page: Page) {
  await page.getByTestId('nav-menu').click();
  const panel = page.getByTestId('nav-menu-panel');
  await expect(panel).toBeVisible();
  return panel;
}
