import type { Section } from './settings';

/** Ein Teil der Seite (z. B. das Linienmenü der Formation) bittet den Chart-Arbeitsplatz, die Einstellungen in einem Abschnitt zu öffnen */
export const OPEN_SETTINGS_EVENT = 'grid-robot:open-chart-settings';

export function requestChartSettings(section: Section): void {
  window.dispatchEvent(new CustomEvent<Section>(OPEN_SETTINGS_EVENT, { detail: section }));
}
