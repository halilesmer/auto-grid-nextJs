/**
 * BKT-30: Canlı tur takvimi (Plan 1113, bt-n1-plan.md §1/§4). Nur der Motor-Teil: Wie der Lauf ein gegebenes
 * Tur-Raster benutzt. Das Raster selbst (Telemetrie oder Orderverlauf) und die Anbindung in runJob sind spätere PRs.
 */

import { DEFAULT_PROFILE } from '@/lib/backtest/calibration';

/**
 * Takvim: canlı botun tur başları ve her tur için bu setup'ın zone başlangıcı (sunucu saniyesi, MT5-Zeit).
 * `zoneAt[i]` gehört zu `starts[i]` (gleiche Länge, aufsteigend). Zone başı = tur başı + okuma + SLTP + alt magic'lerin op'ları.
 */
export interface BotTurns {
  starts: number[];
  zoneAt: number[];
  /** BKT-31: Zeitpunkt der Kurslesung je Tur (`starts[i] + snap`); fehlt = `starts` (heutiger Entscheidungszeitpunkt). Der Lauf liest es noch nicht. */
  snapAt?: number[];
}

/**
 * Bir op'un canlıda sürdüğü saniye. Ölçüm kaynağı: P6+ ve P7 emir geçmişi, magic 200041–200064, 3571 op
 * (bt-n1-plan.md §1.3). Kurma: bir sonraki op'a kadar medyan 225–230 ms; silme: medyan 102–105 ms.
 * SLTP emir geçmişinde görünmez; 0,10 s varsayımı (P7 13:30 tur C başı 0,43 s ile uyumlu). SLTP'yi takvimi
 * kuran taraf `zoneAt` içine koyar; çalıştırıcı yalnız bot'un tur içinde gönderdiği kurma ve silmeyi sayar.
 */
export const BOT_OP_COST_S: { readonly pending: number; readonly remove: number; readonly sltp: number } = DEFAULT_PROFILE.broker.opCost;

/** XSEND (Plan G6.2): Durchgangsgrenze des Trigger-Replays, wenn ein Tur-Raster gegeben ist */
export const BOT_TURNS_MAX_PASSES = 8;

/** Ein Raster ist nur brauchbar mit gleich langen Listen; sonst läuft der Lauf wie ohne Raster */
export const botTurnsActive = (turns: BotTurns | undefined | null): turns is BotTurns =>
  !!turns && turns.starts.length > 0 && turns.zoneAt.length === turns.starts.length;

/**
 * BKT-30 (PR-3): Vorgabe für das Tur-Raster im Live-Vergleich. Aus = die Seite liest nichts zusätzlich und der Lauf ist
 * bytegleich wie vorher. Das Einschalten entscheidet P8 (Journal); eine Oberfläche gibt es bewusst nicht.
 */
export const BOT_TURNS_DEFAULT: boolean = true;

/** BKT-31: Vorgabe für die zwei Phasen je Tur (`RunModel.turnPhases`); aus = Lauf bytegleich. Das Einschalten entscheidet P8 plus ein Nachrichtenfenster mit Telemetrie. */
export const TURN_PHASES_DEFAULT: boolean = false;

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
  /** BKT-31 (PR-3), nur Telemetrie mit z0: Zahl der Turen, deren Zone-Anfang aus z0 gebaut wurde, und auf snapAt gezogene Zone-Anfänge */
  zoneFromZ0Turns?: number;
  zoneBeforeSnap?: number;
}
