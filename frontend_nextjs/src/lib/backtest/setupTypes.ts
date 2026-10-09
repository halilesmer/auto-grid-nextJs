import type { ZoneSettings } from '@/store/types';
import type { RangeSelection } from '@/hooks/useAnalysisParams';
import type { RunSettingsValue } from './runSettings';
import type { RunParams } from './protocol';

/** Was die Seite zum Lauf wissen muss, auch nachdem die Eingaben geändert wurden */
export interface RunContext {
  setupId: string;
  sourceLabel?: string;
  params: RunParams;
  /** Der Lauf nutzte die Zone mit ungespeicherten Änderungen (Übergabe vom Test-Knopf) */
  unsaved: boolean;
  /** Kontowährung für die Anzeige */
  currency: string | null;
}

export interface BacktestSetup {
  id: string;
  zone: ZoneSettings;
  form: RunSettingsValue;
  range: RangeSelection;
  unsaved: boolean;
}

