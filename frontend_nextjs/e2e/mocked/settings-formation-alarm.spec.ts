/**
 * USR-15 · Formasyon alarmı ve „Kennzahlen angeheftet“ gehören dem Benutzer (Plan 1115-A9.2/A9.3, S6):
 * Übernahme aus dem Browser, Sekmesi in den Einstellungen, derselbe Wert im Alarm-Menü des Charts.
 */
import type { Page } from '@playwright/test';
import { DEMO_ID, expect, test } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const KEY = 'grid-robot-formation-alarm';
const PIN_KEY = 'grid-robot-metrics-pinned';
const seedLocal = (page: Page, entries: Record<string, string>) =>
  page.addInitScript((e) => {
    // nur beim ersten Laden: nach der Übernahme darf der Eintrag nicht wiederkommen
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
  }, entries);
const local = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);

async function openFormationTab(page: Page) {
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.getByTestId('settings-nav-notifications').click();
  await page.getByTestId('settings-tab-formation').click();
  await expect(page.getByTestId('settings-formation-alarm')).toBeVisible();
}

test.describe('USR-15 Formasyon alarmı: Übernahme', () => {
  test('Ohne Wert im Worker werden die persönlichen Felder aus dem Browser einmal geschrieben; Konto-Felder bleiben', { tag: '@USR-15' }, async ({ page, worker, dashboard }) => {
    const legacy = { active: false, prefs: { events: { valid: true, target: false }, forms: ['ABCD', 'GAR'], system: false, sound: true }, enabled: [`${DEMO_ID}|EURUSD`], favoritesEnabled: [DEMO_ID], memory: {}, history: {}, account: DEMO_ID };
    await seedLocal(page, { [KEY]: JSON.stringify(legacy) });
    await dashboard.open(DEMO_ID);
    await expect.poll(() => worker.userPrefs.admin?.formation_alarm).toEqual({ active: false, events: { valid: true, target: false }, forms: ['ABCD', 'GAR'], system: false, sound: true });
    // Das lokale Exemplar verliert nur die persönlichen Felder
    await expect.poll(async () => (await local(page, KEY))?.prefs).toBeUndefined();
    const rest = await local(page, KEY);
    expect(rest.active).toBeUndefined();
    expect(rest.enabled).toEqual([`${DEMO_ID}|EURUSD`]);
    expect(rest.favoritesEnabled).toEqual([DEMO_ID]);
    expect(rest.account).toBe(DEMO_ID);
  });

  test('Ein Wert im Worker gilt; der alte Browser-Wert wird nicht gelesen und nicht geschrieben', { tag: '@USR-15' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { formation_alarm: { active: true, events: { valid: false, target: true }, forms: ['BAT'], system: false, sound: false } };
    await seedLocal(page, { [KEY]: JSON.stringify({ active: false, prefs: { events: { valid: true, target: true }, forms: ['ABCD'], system: false, sound: true }, enabled: [] }) });
    await dashboard.open(DEMO_ID);
    await openFormationTab(page);
    await expect(page.getByTestId('settings-fa-form-BAT')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('settings-fa-form-ABCD')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('settings-fa-event-valid')).toHaveAttribute('aria-pressed', 'false');
    expect(worker.callsTo('PUT', /\/api\/me\/prefs\/formation_alarm/)).toHaveLength(0);
  });

  test('„Kennzahlen angeheftet“: alter Browser-Wert wandert in den Worker und wird gelöscht; der Schalter schreibt dorthin', { tag: '@USR-15' }, async ({ page, worker, dashboard }) => {
    await seedLocal(page, { [PIN_KEY]: 'false' });
    await dashboard.open(DEMO_ID);
    await expect.poll(() => worker.userPrefs.admin?.metrics_pinned).toEqual({ pinned: false });
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), PIN_KEY)).toBeNull();
    await expect(page.getByTestId('metrics-pin')).toHaveAttribute('data-pinned', 'false');
    await page.getByTestId('metrics-pin').click();
    await expect(page.getByTestId('metrics-pin')).toHaveAttribute('data-pinned', 'true');
    await expect.poll(() => worker.userPrefs.admin?.metrics_pinned).toEqual({ pinned: true });
  });
});

test.describe('USR-15 Formasyon alarmı: Einstellungen und Chart-Menü', () => {
  test('Eine Änderung in den Einstellungen steht im Alarm-Menü des Charts und umgekehrt', { tag: '@USR-15' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { formation_alarm: { active: true, events: { valid: true, target: true }, forms: ['ABCD', 'GAR', 'BAT'], system: false, sound: false } };
    await dashboard.open(DEMO_ID);
    await openFormationTab(page);
    await page.getByTestId('settings-fa-form-ABCD').click();
    await page.getByTestId('settings-fa-event-target').click();
    await page.locator('#settings-fa-sound').click();
    await expect.poll(() => (worker.userPrefs.admin.formation_alarm as { forms: string[] }).forms).toEqual(['GAR', 'BAT']);
    expect(worker.userPrefs.admin.formation_alarm).toMatchObject({ events: { valid: true, target: false }, sound: true });

    // Im Chart zeigt das Menü denselben Stand
    await page.goto(`/chart?account=${DEMO_ID}`);
    await page.getByTestId('formation-alarm').click();
    await page.getByTestId('formation-alarm-panel').getByRole('tab', { name: msg('formation.alarm.tab.settings') }).click();
    await expect(page.getByTestId('formation-alarm-form-ABCD')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('formation-alarm-form-GAR')).toHaveAttribute('aria-pressed', 'true');
    // Eine Änderung im Menü landet im Worker
    await page.getByTestId('formation-alarm-form-ABCD').click();
    await expect.poll(() => (worker.userPrefs.admin.formation_alarm as { forms: string[] }).forms).toEqual(['ABCD', 'GAR', 'BAT']);
  });

  test('Ohne Verbindung zum Worker sind die Felder gesperrt (nichts wird vorgemerkt)', { tag: '@USR-15' }, async ({ page, worker, dashboard }) => {
    worker.userPrefs.admin = { formation_alarm: { active: true, events: { valid: true, target: true }, forms: ['ABCD'], system: false, sound: false } };
    worker.userPrefsGetDelayMs = 4000;
    await dashboard.open(DEMO_ID);
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-nav-notifications').click();
    await page.getByTestId('settings-tab-formation').click();
    await expect(page.getByTestId('pref-load-formation_alarm').first()).toHaveAttribute('data-state', 'loading');
    await expect(page.getByTestId('settings-fa-form-ABCD')).toBeDisabled();
    expect(worker.callsTo('PUT', /\/api\/me\/prefs\/formation_alarm/)).toHaveLength(0);
  });

  test('375 px: kein waagerechter Überlauf', { tag: '@USR-15' }, async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await dashboard.open(DEMO_ID);
    await openFormationTab(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByTestId('settings-fa-note')).toBeVisible();
  });
});
