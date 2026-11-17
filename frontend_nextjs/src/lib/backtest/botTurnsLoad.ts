/**
 * BKT-30 (PR-3): Tur-Raster für den Live-Vergleich einmal je Konto und Fenster laden und bauen. Ohne React, ohne eigenes
 * Netz: die Seite gibt die Abrufe herein (Orderverlauf, Tur-Telemetrie). Quelle: Telemetrie, sonst Orderverlauf, sonst keins.
 */
import { BOT_TURNS_DEFAULT, type BotTurnsInfo } from '@/lib/backtest/botTurns';
import type { CalibrationProfile } from '@/lib/backtest/calibration';
import type { LiveOrder } from '@/lib/backtest/startState';
import {
  liveOpsFromOrders,
  scheduleFromLiveOrders,
  scheduleFromTelemetry,
  type TelemetryTurns,
  type TurnSchedule,
} from '@/lib/backtest/turnSchedule';

/** Der Worker liefert höchstens 2 Tage je Abruf */
export const TURNS_CHUNK_MS = 2 * 86_400_000;
/** Mehr Abrufe als dieses Fenster erlaubt (30 Tage Aufbewahrung): länger geht nur der Orderverlauf */
export const TURNS_MAX_CHUNKS = 16;
/** Die Telemetrie muss Anfang und Ende des Fensters bis auf diese Sekunden abdecken, sonst gilt sie als Lücke */
export const TURNS_COVER_SLACK_S = 300;

export interface BotTurnsLoadInput {
  /** Aus: kein Abruf, kein Raster (Vorgabe BOT_TURNS_DEFAULT) */
  enabled?: boolean;
  /** Fenster [from, to) in Brokersekunden; nur Läufe mit Live-Daten (gespeichertes Setup, MT5-M1) */
  live: boolean;
  from: number;
  to: number;
  /** Jetzt in Brokersekunden: die Telemetrie muss nur bis dahin reichen */
  nowSec: number;
  /** Brokeruhr minus UTC in Sekunden (ganze Stunden); null = Uhr unbekannt, dann keine Telemetrie */
  tzOffsetSec: number | null;
  loopSec: number;
  /** Magics aller gespeicherten Zonen des Kontos */
  magics: number[];
  fetchOrders: (range: { from: number; to: number }) => Promise<{ orders: LiveOrder[]; missing?: unknown[] } | null>;
  fetchTurns: (range: { from: number; to: number }) => Promise<TelemetryTurns | null>;
  /** BKT-31 (PR-4): Kalibrierungsprofil für das Raster; fehlt = DEFAULT_PROFILE (bytegleich) */
  profile?: CalibrationProfile;
}

export interface BotTurnsLoaded {
  schedule: TurnSchedule | null;
  /** null = Schalter aus: im Protokoll steht nichts */
  info: BotTurnsInfo | null;
}

const OFF: BotTurnsInfo = { source: 'off', turns: 0, alignedClusters: 0, totalClusters: 0 };

/** Teilstücke (zeitlich geordnet, ohne Überlappung) zu einer kompakten Telemetrie verbinden */
export function mergeTelemetry(parts: readonly TelemetryTurns[]): TelemetryTurns {
  const out: {
    t0: number | null;
    dt: number[];
    dur: number[];
    kind: string[];
    pre: number[];
    snap: (number | null)[];
    nsl: (number | null)[];
    z0: (number | null)[];
    nsl0: (number | null)[];
  } = { t0: null, dt: [], dur: [], kind: [], pre: [], snap: [], nsl: [], z0: [], nsl0: [] };
  let lastAbs = 0;
  for (const part of parts) {
    if (part.t0 === null || part.kind.length === 0) continue;
    if (out.t0 === null) out.t0 = part.t0;
    else out.dt.push(part.t0 - lastAbs);
    let abs = part.t0;
    for (let i = 0; i < part.kind.length; i++) {
      if (i > 0) {
        const step = part.dt[i - 1] ?? 0;
        abs += step;
        out.dt.push(step);
      }
      out.dur.push(part.dur[i] ?? 0);
      out.kind.push(part.kind[i]);
      out.pre.push(part.pre[i] ?? 0);
      out.snap.push(part.snap?.[i] ?? null);
      out.nsl.push(part.nsl?.[i] ?? null);
      out.z0.push(part.z0?.[i] ?? null);
      out.nsl0.push(part.nsl0?.[i] ?? null);
    }
    lastAbs = abs;
  }
  return out;
}

/** Erste und letzte Tur-Startsekunde (UTC) über alle Turarten; null bei leerer Telemetrie */
export function telemetrySpan(turns: TelemetryTurns): { first: number; last: number } | null {
  if (turns.t0 === null || turns.kind.length === 0) return null;
  let ms = turns.t0;
  const first = ms / 1000;
  for (let i = 1; i < turns.kind.length; i++) ms += turns.dt[i - 1] ?? 0;
  return { first, last: ms / 1000 };
}

export async function loadBotTurns(input: BotTurnsLoadInput): Promise<BotTurnsLoaded> {
  if (!(input.enabled ?? BOT_TURNS_DEFAULT)) return { schedule: null, info: null };
  if (!input.live || input.magics.length === 0) return { schedule: null, info: OFF };

  let orders: LiveOrder[] | null = null;
  try {
    const answer = await input.fetchOrders({ from: input.from, to: input.to });
    // Fehlt ein Teil des Verlaufs, ist die Kette unzuverlässig: dann kein Raster aus Orders
    orders = answer && !(answer.missing?.length) ? answer.orders : null;
  } catch {
    orders = null;
  }
  const liveOps = orders ? liveOpsFromOrders(orders, input.magics, input.from, input.to) : [];

  // Telemetrie: Brokersekunde → UTC-Millisekunde mit dem ganzstündigen Abstand
  if (input.tzOffsetSec !== null) {
    const tz = input.tzOffsetSec;
    const fromMs = (input.from - tz) * 1000;
    const toMs = (input.to - tz) * 1000;
    if (Math.ceil((toMs - fromMs) / TURNS_CHUNK_MS) <= TURNS_MAX_CHUNKS) {
      try {
        const parts: TelemetryTurns[] = [];
        for (let start = fromMs; start < toMs; start += TURNS_CHUNK_MS) {
          const part = await input.fetchTurns({ from: start, to: Math.min(toMs, start + TURNS_CHUNK_MS) });
          if (!part) throw new Error('turns');
          parts.push(part);
        }
        const telemetry = mergeTelemetry(parts);
        // Abdeckung zählt alle Turarten (t/m/c/n: der Bot lebt); der Kalender entsteht weiter nur aus `t`-Turen.
        // Sonst lehnt ein Fenster, das am Wochenende beginnt (nur `m`-Turen bis zur Marktöffnung), die Telemetrie ab.
        const span = telemetrySpan(telemetry);
        const first = span?.first;
        const last = span?.last;
        const needEnd = Math.min(input.to, input.nowSec) - tz;
        // Abdeckung: die Telemetrie reicht vom Anfang bis zum Ende des Fensters (bzw. bis jetzt)
        if (first !== undefined && last !== undefined && first <= input.from - tz + TURNS_COVER_SLACK_S && last >= needEnd - TURNS_COVER_SLACK_S) {
          const schedule = scheduleFromTelemetry(telemetry, liveOps, input.magics, { tzOffsetSec: tz, from: input.from, to: input.to, ...(input.profile ? { profile: input.profile } : {}) });
          if (schedule.turnCount > 0) {
            return {
              schedule,
              info: {
                source: 'telemetry',
                turns: schedule.turnCount,
                alignedClusters: schedule.alignedClusters,
                totalClusters: schedule.totalClusters,
                clockShiftSec: schedule.clock?.shiftSec,
                clockReliable: schedule.clock?.reliable,
              },
            };
          }
        }
      } catch {
        // alter Worker, Fehler, Netz: Ersatzquelle
      }
    }
  }

  if (orders && liveOps.length > 0) {
    const schedule = scheduleFromLiveOrders(liveOps, input.magics, input.from, input.to, input.loopSec, input.profile ? { profile: input.profile } : {});
    return {
      schedule,
      info: { source: 'liveOrders', turns: schedule.turnCount, alignedClusters: schedule.alignedClusters, totalClusters: schedule.totalClusters },
    };
  }
  return { schedule: null, info: OFF };
}
