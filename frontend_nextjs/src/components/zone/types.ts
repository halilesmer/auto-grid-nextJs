import type { ZoneSettings, SymbolDetail, LiveData } from '@/store/types';
import type { SymbolConfig } from '@/utils/zoneHelpers';

export type FieldUpdateFn = (field: string, value: unknown) => void;

export type HandleChangeFn = (
  field: string,
  value: string | number | boolean,
  zone: ZoneSettings,
  symbolConfig: SymbolConfig,
  update: FieldUpdateFn
) => void;

export type HandleBlurFn = (
  field: string,
  value: number | undefined,
  step: number,
  precision: number,
  update: FieldUpdateFn,
  symbolConfig?: SymbolConfig
) => void;

export type SyncZonePrecisionFn = (
  zone: ZoneSettings,
  symbolConfig: SymbolConfig,
  update: FieldUpdateFn
) => void;

export interface ZoneHeaderProps {
  zone: ZoneSettings;
  /** Kopfzeile der Setup-Karte, z. B. „Setup 2“ (das Symbol steht im Kopf der Symbolkarte) */
  title: string;
  isActive: boolean;
  isGlobalRunning: boolean;
  modified: boolean;
  disableButtons: boolean;
  /** Motorun bu bölge için durumu (liveData.zone_states), ör. "AUTO_CLEAR" */
  engineState?: string;
  remotePaused?: boolean;
  onToggleActive: (zoneId: string, currentActive: boolean) => void;
  onRestart: (zoneId: string) => void;
  onDelete: () => void;
  onSave: () => void;
  saving: boolean;
}

export interface ZoneBasicFieldsProps {
  zone: ZoneSettings;
  update: FieldUpdateFn;
  symbolConfig: SymbolConfig;
  handleChange: HandleChangeFn;
  handleBlur: HandleBlurFn;
}

export interface ZoneGridFieldsProps {
  zone: ZoneSettings;
  update: FieldUpdateFn;
  symbolConfig: SymbolConfig;
  isBoth: boolean;
  sync: boolean;
  handleChange: HandleChangeFn;
  handleBlur: HandleBlurFn;
}

export interface ZoneSellFieldsProps {
  zone: ZoneSettings;
  update: FieldUpdateFn;
  symbolConfig: SymbolConfig;
  handleChange: HandleChangeFn;
  handleBlur: HandleBlurFn;
}

export interface ZoneBreakoutFieldsProps {
  zone: ZoneSettings;
  update: FieldUpdateFn;
  symbolConfig: SymbolConfig;
  isBoth: boolean;
  sync: boolean;
  handleChange: HandleChangeFn;
  handleBlur: HandleBlurFn;
}

export interface ZoneFractalFieldsProps {
  zone: ZoneSettings;
  update: FieldUpdateFn;
  symbolConfig: SymbolConfig;
  isBoth: boolean;
  sync: boolean;
  handleChange: HandleChangeFn;
  handleBlur: HandleBlurFn;
}

export interface ZoneExitFieldsProps {
  zone: ZoneSettings;
  update: FieldUpdateFn;
}

export interface ZoneCardProps {
  zone: ZoneSettings;
  /** Kopfzeile, z. B. „Setup 2“ */
  title: string;
  modified: boolean;
  disableButtons: boolean;
  onUpdate: (zoneId: string, field: string, value: unknown) => void;
  onToggleActive: (zoneId: string, currentActive: boolean) => Promise<void>;
  onRestart: (zoneId: string) => Promise<void>;
  onDelete: () => void;
  /** Sadece bu bölgeyi kaydeder */
  onSave: (zoneId: string) => Promise<void>;
  saving: boolean;
  /** Engine-Platz der Zone (zuletzt gespeicherte Reihenfolge, engineOrder); -1 = noch nicht gespeichert */
  zoneIndex: number;
  liveData: LiveData;
  isRunning: boolean;
  symbolDetails: Record<string, SymbolDetail>;
  handleChange: HandleChangeFn;
  handleBlur: HandleBlurFn;
  syncZonePrecision: SyncZonePrecisionFn;
}