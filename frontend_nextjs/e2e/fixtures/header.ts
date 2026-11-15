/**
 * Kopfzeile (UI-01): Kopf-Menü rechts (Verbindungsstatus, Verbindungs- und Einstellungsfenster, Bot stoppen) und unter `lg` das ☰-Menü
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

/** Öffnet das Kopf-Menü, darin „Bağlantı ayarları“ (Einstellungen, Bereich Verbindung) und dort den Verbindungsdialog. */
export async function openConnectionDialog(page: Page) {
  const panel = await openHeaderMenu(page);
  await panel.getByTestId('connection-change').click();
  await expect(page.getByTestId('settings-pane')).toHaveAttribute('data-section', 'connection');
  await page.getByTestId('settings-conn-change').click();
  await expect(page.getByTestId('connection-dialog')).toBeVisible();
}

/** Öffnet das Einstellungsfenster über das Zahnrad. */
export async function openSettingsWindow(page: Page) {
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
}

/** Stellt die Sprache im Einstellungsfenster (Darstellung) ein und schließt es wieder. */
export async function setLanguage(page: Page, lang: 'tr' | 'en' | 'de') {
  await openSettingsWindow(page);
  await page.getByTestId(`settings-lang-${lang}`).click();
  await expect(page.getByTestId(`settings-lang-${lang}`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-dialog')).toBeHidden();
}

/** Stellt das Design im Einstellungsfenster (Darstellung) ein und schließt es wieder. */
export async function setTheme(page: Page, theme: 'system' | 'light' | 'dark') {
  await openSettingsWindow(page);
  await page.getByTestId(`settings-theme-${theme}`).click();
  await expect(page.getByTestId(`settings-theme-${theme}`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-dialog')).toBeHidden();
}

/** Öffnet unter `lg` das ☰-Menü mit den Seitenlinks und gibt das Panel zurück. */
export async function openPageMenu(page: Page) {
  await page.getByTestId('nav-menu').click();
  const panel = page.getByTestId('nav-menu-panel');
  await expect(panel).toBeVisible();
  return panel;
}
