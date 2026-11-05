/**
 * Trend-Einstellung der Formations-Fixtures (FRM-41, Halil 2026-11-05). Formationen rechnen nur auf dem Trendzug des
 * Nutzers. Die von Hand geprüften Reihen und Fixtures zeigen ihre Formation auf dem feinsten Zug, den der Regler zulässt:
 * Mindestgröße 0,5 ATR (TREND_LIMITS.minSize.min) und zwei Schlüsse für den Wechsel. Fixtures, deren Formation erst mit
 * einer anderen Einstellung entsteht, tragen sie selbst (Feld `trend` im JSON, siehe trendOf).
 */
import { test, type Page } from '@playwright/test';
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
};

/**
 * Belegte Fälle, die keine wählbare Einstellung auf dem Trendzug des Nutzers erreicht (Fixture-Regel 1105-A5, Halil
 * 2026-11-05). Abgetastet: Regeln groesse, welle, geruest, filter; Mindestgröße 0,5–3,5 in Schritten von 0,25; ein und
 * zwei Schlüsse; EWO-Rücklauf 0,1–0,8; EWO 3/5/8/13 gegen 21/34/35/50/89; ATR 14. Der Test prüft die alte Erwartung und
 * ist als erwarteter Fehlschlag markiert (`markUnreachable`): wird der Fall wieder erreichbar, wird der Test rot.
 * Der Grund nennt die Kleinform, die statt des Falls entsteht. Journal: docs/journal/2026-11-05-fixture-documented-cases.md
 */
export const FIXTURE_UNREACHABLE: Record<string, string> = {
  'bat-sell-h4-01': 'Verkauf-Bat X 12-03 12:00 → D 12-08 12:00 auf keinem wählbaren Zug; bei 0,5 ATR X → A in 2 Kerzen (BAT-14, BAT-17)',
  'enc-buy-h4-01': 'Kauf-Kanal 12-09 → 12-19 auf keinem wählbaren Zug; bei 0,5 ATR ein Verkaufs-Kanal aus 6 Kerzen (24 h)',
  'enc-bad-h4-01': 'Negativfall ENC-03 am 2025-12-12 (L0 11-24 → L2 12-11) auf keinem wählbaren Zug; bei 0,5 ATR ein Kanal aus 16 Kerzen',
  'fib-counter-d1-01': 'Tages-Impuls 0,89027 → 0,92262 auf keinem wählbaren Zug; bei 0,5 ATR beginnt er nach einem Rücklauf von 2 Kerzen (0,89513)',
};

/** Markiert einen Test auf einem unerreichbaren belegten Fall als erwarteten Fehlschlag (streng: besteht er, ist er rot) */
export function markUnreachable(name: string): void {
  const why = FIXTURE_UNREACHABLE[name];
  test.fail(why !== undefined, `auf dem Trendzug des Nutzers nicht erreichbar: ${why}`);
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
