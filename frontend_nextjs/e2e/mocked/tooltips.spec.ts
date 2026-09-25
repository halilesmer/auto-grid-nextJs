/**
 * UI-07 · Hinweise (Tooltips): jede Einstellung, jedes Feld und jeder Button erklärt sich
 * (hooks/RULES.md §5). Der Abdeckungstest schlägt an, sobald ein sichtbares Bedienelement weder
 * in einem Tooltip-Wrapper noch neben einem (i)-Hinweis steht.
 */
import type { Locator, Page } from '@playwright/test';
import { DEMO_ID, RUNNING_METRICS, ZONE_ID, expect, makeZone, test, type Dashboard } from '../fixtures/test';
import { msg } from '../fixtures/i18n';

const CONTROLS =
  'button, a[href], input, select, textarea, [role="switch"], [role="tab"], [role="radio"], [role="combobox"]';

/** Sichtbare Bedienelemente ohne Hinweis. Leere Liste = alles erklärt. */
async function unhinted(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const covered = (el: Element) =>
      Boolean(
        el.closest('[data-tooltip-trigger], [data-tooltip-exempt]') ||
          // Feld/Schalter: das umschließende <label> trägt das (i)
          el.closest('label')?.querySelector('[data-tooltip-trigger]') ||
          // Gruppen, in denen Label und Feld getrennte Elemente sind (Kontoformular, Combobox …)
          el.closest('[data-tooltip-scope]')?.querySelector('[data-tooltip-trigger]'),
      );
    return [...document.querySelectorAll(selector)]
      .filter((el) => visible(el) && !covered(el))
      .map((el) => el.outerHTML.slice(0, 160));
  }, CONTROLS);
}

/** Alle Felder der Zonenkarte sichtbar: BOTH ohne Sync, Breakout und „bei Verlassen temizle“ an, Kerzenschluss. */
function fullZone() {
  return makeZone({
    order_type: 'BOTH',
    sync_buy_sell: false,
    is_breakout: true,
    clear_on_exit: true,
    exit_condition: 'Mum Kapanışı',
  });
}

/** Das (i) hinter dem Label eines Zonenfeldes. */
function fieldHint(zone: Locator, label: string): Locator {
  return zone
    .locator('label')
    .filter({ has: zone.page().getByText(label, { exact: true }) })
    .getByTestId('field-hint');
}

async function openMenus(dashboard: Dashboard) {
  const { page } = dashboard;
  await dashboard.zone().getByRole('button', { name: msg('zone.header.menu') }).click();
  await page.getByRole('button', { name: msg('dashboard.sysinfo.title') }).click();
}

test.describe('UI-07 Hinweise: Abdeckung', () => {
  test('Dashboard (Bot gestoppt): jedes Bedienelement erklärt sich', { tag: '@UI-07' }, async ({ page, worker, dashboard }) => {
    worker.state.settings[DEMO_ID].ZONES = [fullZone()];
    await dashboard.open(DEMO_ID);
    // Ungespeicherte Änderung: schwebende Leiste und „Kaydet“ der Zone erscheinen
    await dashboard.zoneField(msg('zone.field.minPrice')).fill('91');
    await expect(page.getByTestId('unsaved-bar')).toBeVisible();
    await openMenus(dashboard);

    expect(await unhinted(page)).toEqual([]);
  });

  test('Dashboard (Bot läuft): jedes Bedienelement erklärt sich', { tag: '@UI-07' }, async ({ page, worker, dashboard }) => {
    worker.state.settings[DEMO_ID].ZONES = [fullZone(), makeZone({ id: 'zone-e2e-2', order_type: 'SELL', is_breakout: true })];
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await expect(dashboard.botStatus).toHaveText(msg('bot.status.running'));

    expect(await unhinted(page)).toEqual([]);
  });

  test('Konto-Dialog und Rückfragen', { tag: '@UI-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await unhinted(page)).toEqual([]);

    // MT5-Pfad von Hand: anderes Eingabefeld
    await dialog.getByLabel(msg('account.path.custom')).check();
    expect(await unhinted(page)).toEqual([]);
    await dialog.getByRole('button', { name: msg('account.dialog.close') }).click();

    // Rückfrage (Modal mit „Abbrechen“ und Bestätigen)
    await page.getByRole('button', { name: msg('account.action.deleteTitle') }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await unhinted(page)).toEqual([]);
  });

  test('VPS-Seite', { tag: '@UI-07' }, async ({ page, worker }) => {
    void worker;
    await page.route('**/api/vps/**', async (route) => {
      const action = new URL(route.request().url()).pathname.replace('/api/vps/', '');
      if (action === 'status') {
        return route.fulfill({
          json: {
            ok: true,
            hostname: 'VPS-01',
            version: 'v0.7.71',
            git: { branch: 'main', commit: '6e6011d0' },
            worker: { listening: true, reachable: true, error: null },
            worker_watchdog: true,
            ngrok: { running: true, public_url: 'https://example.ngrok-free.dev' },
            ngrok_watchdog: true,
            bots: [{ pid: 4711, account: '5039114' }],
            mt5_terminals: 1,
            session_active: true,
            autologon: true,
            auto_update_minutes: null,
            tasks: { start: { exists: true, state: 'Ready' }, update: { exists: true, state: 'Ready' } },
            elevated: [{ pid: 99, role: 'worker', account: null }],
            boot_time: '2026-09-24T08:00:00',
            uptime_minutes: 125,
          },
        });
      }
      if (action === 'logs') return route.fulfill({ json: { ok: true, log: 'worker', lines: ['Zeile 1'] } });
      return route.fulfill({ json: { ok: true, message: 'ok' } });
    });
    await page.goto('/vps');
    await expect(page.getByTestId('vps-tile-worker')).toBeVisible();
    await expect(page.getByTestId('vps-elevated')).toBeVisible();

    expect(await unhinted(page)).toEqual([]);
  });

  test('Formasyon- und Chart-Seite', { tag: '@UI-07' }, async ({ page, worker, dashboard }) => {
    void worker;
    await page.goto('/formasyon');
    await expect(page.getByRole('heading', { name: msg('formation.title') })).toBeVisible();
    expect(await unhinted(page)).toEqual([]);

    await dashboard.open(DEMO_ID);
    await dashboard.zone().getByRole('link', { name: msg('zone.header.test') }).click();
    await expect(page).toHaveURL(new RegExp(`/chart\\?zone=${ZONE_ID}`));
    await expect(page.getByText(msg('chart.zone.priceRange'))).toBeVisible();
    expect(await unhinted(page)).toEqual([]);
  });
});

test.describe('UI-07 Hinweise: Verhalten', () => {
  test('(i) zeigt beim Hovern den Text, Escape schließt ihn', { tag: '@UI-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const hint = fieldHint(dashboard.zone(), msg('zone.field.gridStep'));
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveCount(0);

    await hint.hover();
    await expect(tooltip).toHaveText(msg('zone.field.gridStep.hint'));
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);

    // Maus weg und wieder her: öffnet erneut; danach nichts bleibt hängen
    await page.mouse.move(0, 0);
    await hint.hover();
    await expect(tooltip).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
  });

  test('Tastaturfokus zeigt den Hinweis', { tag: '@UI-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await dashboard.zoneField(msg('zone.field.minPrice')).focus();
    await page.keyboard.press('Tab'); // → (i) des nächsten Feldes „Max Fiyat“
    await expect(page.getByRole('tooltip')).toHaveText(msg('zone.field.maxPrice.hint'));
  });

  test('Klick auf (i) verändert das Feld nicht', { tag: '@UI-07' }, async ({ page, worker, dashboard }) => {
    worker.state.settings[DEMO_ID].ZONES = [fullZone()];
    await dashboard.open(DEMO_ID);
    const sw = dashboard.zoneSwitch(msg('zone.breakout.trendOnly'));
    await expect(sw).toBeChecked();
    // Das (i) sitzt im <label> des Schalters: ein Klick darf ihn nicht umschalten
    await dashboard.zone().locator('label', { hasText: msg('zone.breakout.trendOnly') }).getByTestId('field-hint').click();
    await expect(sw).toBeChecked();
    await expect(page.getByTestId('unsaved-bar')).toBeHidden();
  });

  test('Deaktivierter Button nennt den Grund', { tag: '@UI-07' }, async ({ page, worker, dashboard }) => {
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    const edit = page.getByRole('button', { name: msg('account.action.editBlocked') });
    await expect(edit).toBeDisabled();
    // Der Wrapper bekommt die Zeigerereignisse (der Button selbst hat pointer-events: none)
    await edit.locator('xpath=..').hover();
    await expect(page.getByRole('tooltip')).toHaveText(msg('account.action.editBlocked'));
  });

  test('Der Tooltip liegt im Konto-Dialog über dem Dialog; Escape schließt erst ihn', { tag: '@UI-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await page.getByRole('button', { name: msg('account.action.add') }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-tooltip-scope]').first().getByTestId('field-hint').hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveText(msg('account.form.name.hint'));

    // Nicht hinter dem modalen <dialog> versteckt: an der Tooltip-Mitte liegt der Tooltip selbst
    // (elementFromPoint überspringt pointer-events:none, daher kurz einschalten)
    const onTop = await tooltip.evaluate((el) => {
      const node = el as HTMLElement;
      node.style.pointerEvents = 'auto';
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      node.style.pointerEvents = '';
      return hit === node || node.contains(hit);
    });
    expect(onTop).toBe(true);

    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Nicht abgeschnitten in der Zonenkarte (overflow-hidden)', { tag: '@UI-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    const zone = dashboard.zone();
    await fieldHint(zone, msg('zone.field.orderType')).hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    // Liegt im Top-Layer und damit nicht im Kartenrahmen gefangen
    expect(await tooltip.evaluate((el) => el.matches(':popover-open'))).toBe(true);
  });

  test('Laufende Bots: Button-Hinweis bei Hover', { tag: '@UI-07' }, async ({ page, worker, dashboard }) => {
    worker.setMetrics(DEMO_ID, RUNNING_METRICS);
    worker.setBotRunning(DEMO_ID);
    await dashboard.open(DEMO_ID);
    await page.getByTestId('bot-controls').getByRole('button', { name: msg('bot.stop') }).hover();
    await expect(page.getByRole('tooltip')).toHaveText(msg('bot.stop.hint'));
  });
});

test.describe('UI-07 Hinweise: Sprache', () => {
  test.use({ appLocale: 'de' });

  test('Der Hinweis folgt der gewählten Sprache', { tag: '@UI-07' }, async ({ page, dashboard }) => {
    await dashboard.open(DEMO_ID);
    await fieldHint(dashboard.zone(), msg('zone.field.gridStep', undefined, 'de')).hover();
    await expect(page.getByRole('tooltip')).toHaveText(msg('zone.field.gridStep.hint', undefined, 'de'));
  });
});
