/** NWS-02: Haber-Ereignisse relativ zu einer festen Ortszeit (Di 2026-11-10 12:00), damit Tag-Filter und Countdown stabil sind. */
import type { Page } from '@playwright/test';

export const NEWS_BASE = new Date(2026, 10, 10, 12, 0, 0);

/** Uhr auf NEWS_BASE setzen (läuft danach normal weiter); vor dem ersten page.goto aufrufen. */
export async function installNewsClock(page: Page) {
  await page.clock.install({ time: NEWS_BASE });
}

type Ev = Record<string, unknown>;
const at = (minutes: number) => new Date(NEWS_BASE.getTime() + minutes * 60_000).toISOString().replace('.000Z', 'Z');
let counter = 100;

function ev(over: Ev & { min: number; currency: string; en: string; tr?: string }): Ev {
  const { min, currency, en, tr, ...rest } = over;
  return {
    id: ++counter, event_id: counter, event_code: `e2e-${counter}`, title: en, titles: { en, tr: tr ?? en, de: en },
    country: currency.slice(0, 2), currency, importance: 'high', time: at(min), time_mode: 'datetime', sector: 'prices',
    unit: 'percent', multiplier: 'none', actual: null, forecast: null, prev: null, revised_prev: null, impact_type: 'none',
    forecast_direction: null, ...rest,
  };
}

export const NEWS_SOON_ID = 101;

/** Standard (USD, Hoch, Heute + Morgen): soon, positive, tentative, jobs (morgen), allday = 5 Zeilen. */
export function newsFixture(): Ev[] {
  counter = 100;
  return [
    ev({ min: 20, currency: 'USD', en: 'Core PCE Price Index', tr: 'Çekirdek PCE', forecast: 0.3, prev: 0.2, forecast_direction: 'up' }),
    ev({ min: -60, currency: 'USD', en: 'Retail Sales', sector: 'consumer', actual: 0.4, forecast: 0.3, prev: 0.2, revised_prev: 0.25, impact_type: 'positive' }),
    ev({ min: 300, currency: 'USD', en: 'Fed Chair Speech', time_mode: 'tentative', sector: 'none' }),
    ev({ min: 26 * 60, currency: 'USD', en: 'Unemployment Rate', sector: 'jobs', forecast: 4.3, prev: 4.2, forecast_direction: 'down' }),
    ev({ min: 24 * 60, currency: 'USD', en: 'Bank Holiday', time_mode: 'date', sector: 'holidays' }),
    ev({ min: -120, currency: 'EUR', en: 'ECB Rate Decision', sector: 'money', actual: 2.0, forecast: 2.25, prev: 2.25, impact_type: 'negative' }),
    ev({ min: 90, currency: 'EUR', en: 'German ZEW', importance: 'moderate', sector: 'business', forecast: 10, prev: 8, forecast_direction: 'up' }),
    ev({ min: -24 * 60, currency: 'USD', en: 'ISM Services', sector: 'business', actual: 52, forecast: 51, prev: 50, impact_type: 'positive' }),
    ev({ min: 3 * 24 * 60 - 120, currency: 'USD', en: 'Nonfarm Payrolls', sector: 'jobs', forecast: 180000, multiplier: 'none', unit: 'none', forecast_direction: 'up' }),
    ev({ min: 15 * 24 * 60, currency: 'USD', en: 'FOMC Minutes', sector: 'money' }),
  ];
}
