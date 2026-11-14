/**
 * BKT-30: Canlı tur takvimi (Plan 1113, bt-n1-plan.md §1/§4). Nur der Motor-Teil: Wie der Lauf ein gegebenes
 * Tur-Raster benutzt. Das Raster selbst (Telemetrie oder Orderverlauf) und die Anbindung in runJob sind spätere PRs.
 */

/**
 * Takvim: canlı botun tur başları ve her tur için bu setup'ın zone başlangıcı (sunucu saniyesi, MT5-Zeit).
 * `zoneAt[i]` gehört zu `starts[i]` (gleiche Länge, aufsteigend). Zone başı = tur başı + okuma + SLTP + alt magic'lerin op'ları.
 */
export interface BotTurns {
  starts: number[];
  zoneAt: number[];
}

/**
 * Bir op'un canlıda sürdüğü saniye. Ölçüm kaynağı: P6+ ve P7 emir geçmişi, magic 200041–200064, 3571 op
 * (bt-n1-plan.md §1.3). Kurma: bir sonraki op'a kadar medyan 225–230 ms; silme: medyan 102–105 ms.
 * SLTP emir geçmişinde görünmez; 0,10 s varsayımı (P7 13:30 tur C başı 0,43 s ile uyumlu). SLTP'yi takvimi
 * kuran taraf `zoneAt` içine koyar; çalıştırıcı yalnız bot'un tur içinde gönderdiği kurma ve silmeyi sayar.
 */
export const BOT_OP_COST_S = { pending: 0.225, remove: 0.102, sltp: 0.1 } as const;

/** XSEND (Plan G6.2): Durchgangsgrenze des Trigger-Replays, wenn ein Tur-Raster gegeben ist */
export const BOT_TURNS_MAX_PASSES = 8;

/** Ein Raster ist nur brauchbar mit gleich langen Listen; sonst läuft der Lauf wie ohne Raster */
export const botTurnsActive = (turns: BotTurns | undefined | null): turns is BotTurns =>
  !!turns && turns.starts.length > 0 && turns.zoneAt.length === turns.starts.length;

/**
 * BKT-30 (PR-3): Vorgabe für das Tur-Raster im Live-Vergleich. Aus = die Seite liest nichts zusätzlich und der Lauf ist
 * bytegleich wie vorher. Das Einschalten entscheidet P8 (Journal); eine Oberfläche gibt es bewusst nicht.
 */
export const BOT_TURNS_DEFAULT: boolean = false;

/** Eintrag `run.botTurns` im Laufprotokoll: woher das Raster kam und wie gut es zu den Live-Orders passt */
export interface BotTurnsInfo {
  source: 'telemetry' | 'liveOrders' | 'off';
  turns: number;
  /** Live-Op-Kerzen, die ans Raster ausgerichtet sind (Kette bzw. Uhr-Paare) */
  alignedClusters: number;
  totalClusters: number;
  /** nur Telemetrie: feste Restverschiebung der Uhr in Sekunden */
  clockShiftSec?: number;
  clockReliable?: boolean;
}
