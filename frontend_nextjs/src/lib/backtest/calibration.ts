/**
 * BKT-31 (PR-1): Kalibrasyon profili (plan 1114-M1 §5.2). Broker/VPS'e bağlı sabitler tek yerde toplanır.
 * `DEFAULT_PROFILE` = bugünkü sabitlerin aynısı; koşu bytegleich kalır. Saf tip + sabit, ağ yok.
 * Repo herkese açık: profil hesap no, sunucu adı ya da bilet taşımaz.
 */

export interface CalibrationProfile {
  /** profil adı (broker/sunucu adı değil), ör. "default-2026-11" */
  id: string;
  /** ölçüm penceresi (broker saniyesi) ve kaynağı; varsayılanda null */
  measured: { from: number; to: number; source: 'orders+telemetry' | 'orders' } | null;
  /** VPS/terminal: boş tur okuma süresi (boş tur periyodu − LOOP), zone başına ek yük, saat kayması (null = tahmin) */
  vps: { headS: number; zoneOverheadS: number; clockShiftS: number | null };
  /** broker gidiş-dönüş (op maliyeti, saniye) ve dolum gecikmesi (ms) */
  broker: { opCost: { pending: number; remove: number; sltp: number }; fillLatencyMs: number };
  /** op maliyeti ve LOOP'tan türeyen eşikler (saniye) */
  derived: { clusterGapS: number; chainSlackS: number };
}

/** EightCap/VPS ölçümleri (bt-n1-plan.md §1.3, bt-d1-plan.md K57.2); bugünkü sabitlerle aynı değerler */
export const DEFAULT_PROFILE: CalibrationProfile = {
  id: 'default-2026-11',
  measured: null,
  vps: { headS: 0.105, zoneOverheadS: 0, clockShiftS: null },
  broker: { opCost: { pending: 0.225, remove: 0.102, sltp: 0.1 }, fillLatencyMs: 1 },
  derived: { clusterGapS: 0.8, chainSlackS: 0.7 },
};
