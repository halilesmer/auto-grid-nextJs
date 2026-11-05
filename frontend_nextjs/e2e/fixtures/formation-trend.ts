/**
 * Trend-Einstellung der Formations-Fixtures (FRM-41, Halil 2026-11-05). Formationen rechnen nur auf dem Trendzug des
 * Nutzers. Die von Hand geprüften Reihen und Fixtures zeigen ihre Formation auf dem feinsten Zug, den der Regler zulässt:
 * Mindestgröße 0,5 ATR (TREND_LIMITS.minSize.min) und zwei Schlüsse für den Wechsel. Fixtures, deren Formation erst mit
 * einer anderen Einstellung entsteht, tragen sie selbst (Feld `trend` im JSON, siehe trendOf).
 */
import type { Page } from '@playwright/test';
import { DEFAULT_TREND_SETTINGS, TREND_LIMITS, type TrendSettings } from '../../src/lib/formation/params';

export const FIXTURE_TREND: TrendSettings = { ...DEFAULT_TREND_SETTINGS, minSize: TREND_LIMITS.minSize.min, changeCloses: 2 };

/**
 * Seiten-Tests: der Browser rechnet mit der Einstellung der Fixture (Standard FIXTURE_TREND). Ohne `force` bleibt eine
 * gespeicherte Einstellung stehen; mit `force` gilt die Einstellung der Fixture bei jedem Laden.
 */
export async function seedFixtureTrend(page: Page, trend: TrendSettings = FIXTURE_TREND, force = false): Promise<void> {
  await page.addInitScript(
    ([key, json, overwrite]) => {
      if (overwrite || !localStorage.getItem(key)) localStorage.setItem(key, json);
    },
    ['grid-robot-analysis-prefs', JSON.stringify({ state: { trend }, version: 0 }), force] as const,
  );
}

/**
 * Fixtures, deren Formation erst mit einer anderen Einstellung als FIXTURE_TREND auf dem Trendzug liegt (gefunden durch
 * Abtasten der Regler, 2026-11-05). Fehlt ein Name, gilt FIXTURE_TREND.
 */
export const FIXTURE_TRENDS: Record<string, Partial<TrendSettings>> = {
  'abcd-neg-h4-01': { minSize: 1.75, changeCloses: 1 },
  'bat-bad-h4-01': { minSize: 1, changeCloses: 1 },
  'but-buy-h4-01': { minSize: 1, changeCloses: 1 },
  'but-form-h4-01': { minSize: 0.75, changeCloses: 2 },
  'but-sell-h4-01': { minSize: 0.75, changeCloses: 1 },
  'crb-buy-h4-01': { minSize: 0.75, changeCloses: 1 },
  'crb-sell-h4-01': { minSize: 0.75, changeCloses: 1 },
  'cyp-bad-h4-01': { minSize: 1.25, changeCloses: 1 },
  'cyp-buy-h4-01': { minSize: 0.75, changeCloses: 1 },
  'cyp-lib-h4-01': { minSize: 1, changeCloses: 1 },
  'cyp-sell-h4-01': { minSize: 1, changeCloses: 1 },
  'enc-bad-h4-03': { minSize: 1, changeCloses: 1 },
  'enc-buy-h4-02': { minSize: 1, changeCloses: 1 },
  'enc-sell-h4-01': { minSize: 1, changeCloses: 2 },
  'enc-sell-h4-02': { minSize: 0.75, changeCloses: 2 },
  'f2618-open-h4-01': { minSize: 0.75, changeCloses: 1 },
  'gar-buy-h4-01': { minSize: 0.75 },
  'gar-buy-h4-02': { minSize: 1.5, changeCloses: 1 },
  'kei-bad-h4-01': { minSize: 1, changeCloses: 1 },
  'kei-bad-h4-02': { minSize: 1, changeCloses: 2 },
  'kei-sell-h4-01': { minSize: 1.5, changeCloses: 1 },
  'sig-nosignal-h4-01': { minSize: 1, changeCloses: 1 },
  'cdt-top-h4-01': { rule: 'geruest', changeCloses: 1, ewoFast: 8, ewoSlow: 50 },
  'crb-bad-h4-02': { rule: 'geruest', changeCloses: 1, ewoFast: 5, ewoSlow: 35 },
};

/** Erste Kerze einer geladenen Fixture → ihre Einstellung; gekürzte Reihen (slice, filter) behalten dieselben Kerzenobjekte */
const registered = new WeakMap<object, TrendSettings>();

/** Merkt die Einstellung einer Fixture aus ihrem Dateipfad (…/<name>.json) und gibt sie unverändert zurück */
export function named<T extends { bars: readonly object[] }>(path: string, fx: T): T {
  const name = path.replace(/^.*\//, '').replace(/\.json$/, '');
  if (fx.bars.length > 0) registered.set(fx.bars[0], { ...FIXTURE_TREND, ...FIXTURE_TRENDS[name] });
  return fx;
}

/** Trend-Einstellung einer Fixture (auch gekürzt): eigene aus FIXTURE_TRENDS, sonst FIXTURE_TREND */
export function trendOf(bars: readonly object[]): TrendSettings {
  return (bars.length > 0 && registered.get(bars[0])) || FIXTURE_TREND;
}
