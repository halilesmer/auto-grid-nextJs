/**
 * Trend-Einstellung der Formations-Fixtures (FRM-41, Halil 2026-11-05). Formationen rechnen nur auf dem Trendzug des
 * Nutzers. Die von Hand geprüften Reihen und Fixtures zeigen ihre Formation auf dem feinsten Zug, den der Regler zulässt:
 * Mindestgröße 0,5 ATR (TREND_LIMITS.minSize.min) und zwei Schlüsse für den Wechsel. Fixtures, deren Formation erst mit
 * einer anderen Einstellung entsteht, tragen sie selbst (Feld `trend` im JSON, siehe trendOf).
 */
import { existsSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { DEFAULT_TREND_SETTINGS, TREND_LIMITS, type TrendSettings } from '../../src/lib/formation/params';
import { sanitizeTrendSettings, usableTrendSettings } from '../../src/lib/formation/trdPath';

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
  'cyp-bad-h4-03': { minSize: 1.5, changeCloses: 1 },
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
  // Fixture-Regel 1105-A5 (Halil 2026-11-05): die Einstellung hält den belegten Fall von vor FRM-41 (gleiche Punkte)
  'bat-buy-h4-01': { rule: 'filter', minSize: 0.75, changeCloses: 1, ewoFast: 13, ewoSlow: 89 },
  't618-form-h4-01': { rule: 'filter', minSize: 1.25, changeCloses: 1, ewoRetreat: 0.4 },
  // gleiche Punkte bis auf N: das tiefere Tief zwischen H1 und H2 (0.52464 statt 0.52489)
  'f2618-sell-h4-03': { rule: 'geruest', minSize: 1.75, changeCloses: 1, ewoFast: 5, ewoSlow: 50 },
  // Fixture-Regel 1105-A5, Audit R3-01 (2026-11-06): die vier Fälle, die 388 „unerreichbar“ nannte, liegen auf dem Trendzug,
  // wenn auch ATR-Periode und EWO-Paar gewählt werden (TREND_LIMITS). Punkte gegen den Stand vor FRM-41 gemessen
  // (docs/journal/2026-11-06-fixture-unreachable-audit.md)
  'bat-sell-h4-01': { rule: 'filter', atrPeriod: 7, minSize: 1.25, changeCloses: 1, ewoFast: 8, ewoSlow: 50, ewoRetreat: 0.6 },
  'enc-buy-h4-01': { rule: 'filter', minSize: 1, changeCloses: 2, ewoFast: 13, ewoSlow: 21, ewoRetreat: 0.6 },
  'enc-bad-h4-01': { rule: 'filter', atrPeriod: 28, minSize: 1.75, changeCloses: 1, ewoFast: 8, ewoSlow: 50, ewoRetreat: 0.6 },
  'fib-counter-d1-01': { rule: 'filter', minSize: 0.5, changeCloses: 2, ewoFast: 8, ewoSlow: 50, ewoRetreat: 0.7 },
};

/**
 * Prüft einen Eintrag von FIXTURE_TRENDS: die Fixture-Datei existiert und die Einstellung ist eine, die der Nutzer im Chart
 * wählen kann (Grenzen und Raster von TREND_LIMITS, EWO schnell < langsam). Leere Liste = in Ordnung. Ein Tippfehler im Namen
 * oder ein Wert außerhalb der Regler macht den Test rot, statt einen Fall still zu überspringen (Audit R3-02).
 */
export function trendProblems(name: string, setting: Partial<TrendSettings>): string[] {
  const out: string[] = [];
  if (!existsSync(`e2e/fixtures/formation/${name}.json`)) out.push(`Fixture-Datei fehlt: ${name}.json`);
  const full = { ...FIXTURE_TREND, ...setting };
  const clean = sanitizeTrendSettings(full);
  for (const key of Object.keys(full) as (keyof TrendSettings)[]) {
    if (clean[key] !== full[key]) out.push(`${key} = ${String(full[key])} ist nicht wählbar (TREND_LIMITS)`);
  }
  for (const key of ['minSize', 'ewoRetreat'] as const) {
    const { min, step } = TREND_LIMITS[key];
    const k = (full[key] - min) / step;
    if (Math.abs(k - Math.round(k)) > 1e-9) out.push(`${key} = ${full[key]} liegt nicht im Raster des Reglers (Schritt ${step})`);
  }
  if (usableTrendSettings(full).ewoFast !== full.ewoFast) out.push(`EWO ${full.ewoFast}/${full.ewoSlow}: schnell muss kleiner als langsam sein`);
  return out;
}

/** Erste Kerze einer geladenen Fixture → ihre Einstellung; gekürzte Reihen (slice, filter) behalten dieselben Kerzenobjekte */
const registered = new WeakMap<object, TrendSettings>();

/** Merkt die Einstellung einer Fixture aus ihrem Dateipfad (…/<name>.json) und gibt sie unverändert zurück */
export function named<T extends { bars: readonly object[] }>(path: string, fx: T): T {
  const name = path.replace(/^.*\//, '').replace(/\.json$/, '');
  if (fx.bars.length > 0) registered.set(fx.bars[0], { ...FIXTURE_TREND, ...FIXTURE_TRENDS[name] });
  return fx;
}

/** Trend-Einstellung einer Fixture nach Name */
export const fixtureTrend = (name: string): TrendSettings => ({ ...FIXTURE_TREND, ...FIXTURE_TRENDS[name] });

/** Trend-Einstellung einer Fixture (auch gekürzt): eigene aus FIXTURE_TRENDS, sonst FIXTURE_TREND */
export function trendOf(bars: readonly object[]): TrendSettings {
  return (bars.length > 0 && registered.get(bars[0])) || FIXTURE_TREND;
}
