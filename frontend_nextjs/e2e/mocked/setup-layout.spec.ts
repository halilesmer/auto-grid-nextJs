/**
 * ZON-20 Kompaktes Setup (Teil C): Eingabefelder haben eine kurze, feste Breite statt der ganzen Spalte,
 * und zusammengehörige Felder und Schalter bleiben beim Umbruch beieinander.
 */
import type { Locator } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, expect, makeZone, test, type Dashboard, type MockWorker } from '../fixtures/test';

test.use({ viewport: { width: 1440, height: 900 } });

/** Grid-Setup mit allen Schaltern und Feldern (BOTH ohne Sync, Breakout, Bereinigen) und ein Fraktal-Setup mit SL. */
function seedFullSetups(worker: MockWorker) {
  worker.setZones(DEMO_ID, [
    makeZone({ order_type: 'BOTH', sync_buy_sell: false, is_breakout: true, clear_on_exit: true }),
    makeZone({ id: 'zone-e2e-2', order_type: 'BOTH', sync_buy_sell: false, entry_mode: 'fractal', fractal_use_sl: true }),
  ]);
}

/** Der ganze Schalter (Knopf und Beschriftung), nicht nur der Knopf. */
function switchOf(dashboard: Dashboard, label: string, index: number): Locator {
  return dashboard.zoneSwitch(label, index).locator('xpath=ancestor::label[1]');
}

async function boxOf(locator: Locator, name: string) {
  await expect(locator, name).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, name).not.toBeNull();
  return box!;
}

/**
 * Der Schalter steht in der Zeile seines Feldes: seine Mitte liegt höchstens 4 px über oder unter der Mitte des
 * Eingabefeldes, und zwischen Schalter und Feld liegen höchstens 40 px (links oder rechts, ohne Überlappung).
 */
async function expectSwitchNextTo(sw: Locator, field: Locator, name: string) {
  const s = await boxOf(sw, `${name}: Schalter`);
  const f = await boxOf(field, `${name}: Feld`);
  const offsetY = s.y + s.height / 2 - (f.y + f.height / 2);
  expect(Math.abs(offsetY), `${name}: Schalter nicht auf Höhe des Feldes (${offsetY} px)`).toBeLessThanOrEqual(4);
  const gap = s.x >= f.x ? s.x - (f.x + f.width) : f.x - (s.x + s.width);
  expect(gap, `${name}: Schalter überlappt das Feld`).toBeGreaterThanOrEqual(0);
  expect(gap, `${name}: Schalter zu weit vom Feld`).toBeLessThanOrEqual(40);
}

test.describe('ZON-20 Kompaktes Setup', () => {
  test('Zahlenfelder sind kurz (höchstens 128 px), nicht spaltenbreit', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    seedFullSetups(worker);
    await dashboard.open(DEMO_ID);
    await expect(page.getByTestId('zone-card')).toHaveCount(2);

    const widths = await page
      .getByTestId('zone-card')
      .locator('input[type="number"]')
      .evaluateAll((inputs) => inputs.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(widths.length).toBeGreaterThan(20);
    expect(widths.filter((w) => w > 128), 'Zahlenfelder breiter als 128 px').toEqual([]);
  });

  test('Schalter in Feldzeilen stehen neben ihrem Feld', { tag: '@ZON-20' }, async ({ worker, dashboard }) => {
    seedFullSetups(worker);
    await dashboard.open(DEMO_ID);

    // Grid-Setup
    await expectSwitchNextTo(switchOf(dashboard, msg('zone.sync'), 0), dashboard.zoneField(msg('zone.field.orderType'), 0), 'BUY/SELL gleich');
    await expectSwitchNextTo(
      switchOf(dashboard, msg('zone.breakout.trendOnly'), 0),
      dashboard.zoneField(msg('zone.breakout.buyPullback'), 0),
      'Nur Trend',
    );
    await expectSwitchNextTo(switchOf(dashboard, msg('zone.exit.clearOnExit'), 0), dashboard.zoneField(msg('zone.exit.side'), 0), 'Bereinigen');

    // Fraktal-Setup
    await expectSwitchNextTo(switchOf(dashboard, msg('zone.sync'), 1), dashboard.zoneField(msg('zone.field.orderType'), 1), 'Fraktal: BUY/SELL gleich');
    await expectSwitchNextTo(switchOf(dashboard, msg('zone.fractal.useSl'), 1), dashboard.zoneField(msg('zone.fractal.slMode'), 1), 'SL');
    await expectSwitchNextTo(switchOf(dashboard, msg('zone.fractal.tpByMoney'), 1), dashboard.zoneField(msg('zone.fractal.rr'), 1), 'TP als Betrag');
  });

  test('Schalter allein in seiner Zeile hat keinen Platz für eine Beschriftung über sich', { tag: '@ZON-20' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, [makeZone({ clear_on_exit: false })]);
    await dashboard.open(DEMO_ID);

    // „Bereinigen“ aus: der Schalter steht allein im Kasten, direkt unter dem Innenabstand (12 px + Rahmen)
    const sw = switchOf(dashboard, msg('zone.exit.clearOnExit'), 0);
    const s = await boxOf(sw, 'Schalter');
    const box = await boxOf(sw.locator('xpath=ancestor::section[1]'), 'Kasten');
    expect(s.y - box.y, 'Lücke über dem Schalter').toBeLessThanOrEqual(16);
  });
});

for (const width of [1440, 375]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`Grid-Abstand ${width} px ${theme}`, () => {
      test.use({ viewport: { width, height: 900 }, appLocale: 'de' });

      for (const setup of [
        { order_type: 'BUY', sync_buy_sell: true },
        { order_type: 'SELL', sync_buy_sell: true },
        { order_type: 'BOTH', sync_buy_sell: true },
        { order_type: 'BOTH', sync_buy_sell: false },
      ] as const) {
        test(`Verlust-Schalter bleibt direkt unter Grid-Abstand: ${setup.order_type}, Sync ${setup.sync_buy_sell}`,
          { tag: ['@ZON-13', '@ZON-20', '@UI-08'] }, async ({ page, worker, dashboard }) => {
            worker.setZones(DEMO_ID, [makeZone(setup)]);
            await page.addInitScript((selectedTheme) => {
              localStorage.setItem('grid-robot-theme', JSON.stringify({ state: { theme: selectedTheme }, version: 0 }));
            }, theme);
            await dashboard.open(DEMO_ID);
            await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
            const split = setup.order_type === 'BOTH' && !setup.sync_buy_sell;
            const sw = switchOf(dashboard, msg('zone.stepByLoss', undefined, 'de'), 0);

            for (const byLoss of [false, true]) {
              if (byLoss) await dashboard.zoneSwitch(msg('zone.stepByLoss', undefined, 'de')).click();
              const priceKey = split ? 'zone.field.buyGrid' : 'zone.field.gridStep';
              const lossKey = split ? 'zone.field.buyGridLoss' : 'zone.field.gridStepLoss';
              const key = byLoss ? lossKey : priceKey;
              const field = dashboard.zoneField(msg(key, undefined, 'de'));
              const f = await boxOf(field.locator('xpath=ancestor::label[1]'), 'Grid-Abstand mit Vorschau');
              const s = await boxOf(sw, 'Verlust-Schalter');
              expect(Math.abs(s.x - f.x), 'Linksbündig mit Grid-Abstand').toBeLessThanOrEqual(1);
              expect(s.y - (f.y + f.height), 'Kein Überlappen').toBeGreaterThanOrEqual(0);
              expect(s.y - (f.y + f.height), 'Kleiner Abstand unter dem Feld').toBeLessThanOrEqual(12);
              expect(s.x + s.width, 'Schalter vollständig im Fenster').toBeLessThanOrEqual(width);
              const sizes = await page.evaluate(() => ({
                scroll: document.documentElement.scrollWidth,
                client: document.documentElement.clientWidth,
              }));
              expect(sizes.scroll, 'Kein horizontaler Überlauf').toBeLessThanOrEqual(sizes.client);
            }
            if (setup.order_type === 'BUY') {
              await dashboard.zone().screenshot({ path: `test-results/grid-distance-${width}-${theme}.png` });
            }
          });
      }
    });
  }
}
