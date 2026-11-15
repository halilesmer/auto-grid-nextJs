/**
 * BKT-31 (PR-4): Kalibrierungsfenster W_c laden und das Profil ableiten. Ohne React, ohne eigenes Netz: der Aufrufer gibt
 * die Abrufe herein (nur GET: Orderverlauf, Tur-Telemetrie). Fehler und Lücken führen zum Vorgabeprofil, nie zum Abbruch.
 */
import { CALIBRATION_DAYS, DEFAULT_PROFILE, type CalibrationProfile } from '@/lib/backtest/calibration';
import { calibrationFrom, deriveProfile } from '@/lib/backtest/calibrationDerive';
import { mergeTelemetry, TURNS_CHUNK_MS, TURNS_MAX_CHUNKS } from '@/lib/backtest/botTurnsLoad';
import type { LiveOrder } from '@/lib/backtest/startState';
import type { TelemetryTurns } from '@/lib/backtest/turnSchedule';

export interface CalibrationLoadInput {
  /** Beginn des Auswertungsfensters W_e (Brokersekunden); W_c endet hier */
  evalFrom: number;
  tzOffsetSec: number | null;
  magics: number[];
  fetchOrders: (range: { from: number; to: number }) => Promise<{ orders: LiveOrder[]; missing?: unknown[] } | null>;
  fetchTurns: (range: { from: number; to: number }) => Promise<TelemetryTurns | null>;
}

export interface CalibrationLoaded {
  profile: CalibrationProfile;
  fallbacks: string[];
  samples: Record<string, number>;
  /** W_c (Brokersekunden) */
  from: number;
  to: number;
}

export async function loadCalibration(input: CalibrationLoadInput): Promise<CalibrationLoaded> {
  const to = input.evalFrom;
  const from = calibrationFrom(to, CALIBRATION_DAYS);
  let orders: LiveOrder[] = [];
  try {
    const answer = await input.fetchOrders({ from, to });
    // Fehlt ein Teil des Verlaufs, sind die Op-Abstände unzuverlässig: dann keine Messung aus Orders
    if (answer && Array.isArray(answer.orders) && !(answer.missing?.length)) orders = answer.orders;
  } catch {
    orders = [];
  }
  let turns: TelemetryTurns | null = null;
  if (input.tzOffsetSec !== null) {
    const tz = input.tzOffsetSec;
    const fromMs = (from - tz) * 1000;
    const toMs = (to - tz) * 1000;
    if (Math.ceil((toMs - fromMs) / TURNS_CHUNK_MS) <= TURNS_MAX_CHUNKS) {
      try {
        const parts: TelemetryTurns[] = [];
        for (let start = fromMs; start < toMs; start += TURNS_CHUNK_MS) {
          const part = await input.fetchTurns({ from: start, to: Math.min(toMs, start + TURNS_CHUNK_MS) });
          if (!part) throw new Error('turns');
          parts.push(part);
        }
        turns = mergeTelemetry(parts);
      } catch {
        turns = null; // alter Worker, Fehler, Netz: ohne Telemetrie
      }
    }
  }
  const derived = orders.length === 0 && turns === null
    ? { profile: DEFAULT_PROFILE, fallbacks: ['all'], samples: {} }
    : deriveProfile({ orders, turns, magics: input.magics, from, to, evalFrom: input.evalFrom, tzOffsetSec: input.tzOffsetSec });
  return { ...derived, from, to };
}
