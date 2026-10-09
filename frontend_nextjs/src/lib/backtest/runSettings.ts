import type { FillModel } from './broker/pathBroker';
import type { PathChoice } from './protocol';

export const DATA_TIMEFRAMES = ['M1', 'M5', 'M15', 'H1'] as const;
export type DataTimeframe = (typeof DATA_TIMEFRAMES)[number];
export const isDataTimeframe = (tf: string): tf is DataTimeframe => (DATA_TIMEFRAMES as readonly string[]).includes(tf);

export interface RunSettingsValue {
  /** Datenquelle: Import-ID eines CSV-Imports, null = MT5-Server des Kontos */
  csvImportId: string | null;
  timeframe: DataTimeframe;
  spreadMode: 'candle' | 'fixed' | 'max';
  spreadPoints: number;
  /** null = noch nicht angefasst: es gilt der Vorschlag aus dem Archiv (oder 0) */
  commission: number | null;
  swapEnabled: boolean;
  startCapital: number;
  fill: FillModel;
  slFirst: boolean;
  path: PathChoice;
  closeAtEnd: boolean;
  approximate: boolean;
}

export const DEFAULT_RUN_SETTINGS: RunSettingsValue = {
  csvImportId: null,
  timeframe: 'M1',
  spreadMode: 'candle',
  spreadPoints: 0,
  commission: null,
  swapEnabled: true,
  startCapital: 10_000,
  fill: 'gap',
  slFirst: true,
  path: 'auto',
  closeAtEnd: false,
  approximate: false,
};

