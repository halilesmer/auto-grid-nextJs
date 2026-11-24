/**
 * BKT-31 (PR-4): Kalibrierungsprofil aus den Daten eines Kalibrierungsfensters W_c ableiten (Plan 1114-M1 §5.3).
 * Rein, kein Netz. Nur Zeitmessungen; Gewinn, Σ oder Ergebnisse des Auswertungsfensters W_e werden nie gelesen.
 * W_c muss vor W_e enden (`to <= evalFrom`), sonst gilt das Vorgabeprofil. Was fehlt oder zu dünn ist, bleibt beim
 * Vorgabewert und steht in `fallbacks` (Protokoll `run.calibrationDefault`/`run.calibration`).
 */
import { DEFAULT_PROFILE, derivedFor, type CalibrationProfile } from '@/lib/backtest/calibration';
import type { LiveOrder } from '@/lib/backtest/startState';
import { clusterOps, decodeTurns, estimateClockOffset, liveOpsFromOrders, type DecodedTurn, type TelemetryTurns } from '@/lib/backtest/turnSchedule';

/** Mindestzahl Messwerte je Größe; darunter bleibt der Vorgabewert */
export const MIN_OP_SAMPLES = 30;
export const MIN_QUIET_TURNS = 50;
export const MIN_SLTP_TURNS = 30;
export const MIN_SLTP_ACTIVE = 10;
/** Cluster-Abstand der Messung: fest wie die Vorgabe, damit die Messung nicht vom Ergebnis abhängt */
const MEASURE_GAP_S = DEFAULT_PROFILE.derived.clusterGapS;
/** plausibler Bereich der SLTP-Steigung (s je Änderung); außerhalb = unbrauchbar */
const SLTP_RANGE: readonly [number, number] = [0.02, 0.5];

export interface CalibrationInput {
  orders: readonly LiveOrder[];
  /** Tur-Telemetrie von W_c (UTC-ms), null = keine */
  turns: TelemetryTurns | null;
  magics: readonly number[];
  /** W_c [from, to) in Brokersekunden */
  from: number;
  to: number;
  /** Beginn des Auswertungsfensters W_e (Brokersekunden); `to` darf nicht darüber liegen */
  evalFrom: number;
  /** Brokeruhr minus UTC, ganze Stunden; null = Telemetrie nicht auswertbar */
  tzOffsetSec: number | null;
}

export interface DerivedProfile {
  profile: CalibrationProfile;
  /** Größen, die beim Vorgabewert blieben (z. B. `opCost.pending`, `headS`); `all` = Fenster überlappt oder keine Daten */
  fallbacks: string[];
  /** Zahl der Messwerte je Größe */
  samples: Record<string, number>;
}

const p50 = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] / 2 + sorted[Math.floor(sorted.length / 2)] / 2;
};
const ms = (seconds: number): number => Math.round(seconds * 1000) / 1000;

/** Die letzten `days` Handelstage (Mo–Fr, Brokersekunden als UTC-Kalender) vor `evalFrom`: Beginn von W_c */
export function calibrationFrom(evalFrom: number, days: number): number {
  let t = evalFrom;
  let counted = 0;
  while (counted < days) {
    t -= 86_400;
    const weekday = new Date(t * 1000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) counted += 1;
  }
  return t;
}

/** Steigung der kleinsten Quadrate y ~ a + c·x; null bei fehlender Streuung */
function slope(points: readonly [number, number][]): number | null {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) * (x - mx);
    sxy += (x - mx) * (y - my);
  }
  return sxx > 0 ? sxy / sxx : null;
}

export function deriveProfile(input: CalibrationInput): DerivedProfile {
  const fallbacks: string[] = [];
  const samples: Record<string, number> = {};
  if (input.to > input.evalFrom || input.from >= input.to) {
    return { profile: DEFAULT_PROFILE, fallbacks: ['all'], samples };
  }
  const ops = liveOpsFromOrders(input.orders, input.magics, input.from, input.to);
  const clusters = clusterOps(ops, MEASURE_GAP_S);

  // Op-Kosten: Abstand zum nächsten Op im selben Cluster, nach Art des früheren Op
  const gaps = { P: [] as number[], C: [] as number[] };
  for (const cluster of clusters) for (let i = 0; i + 1 < cluster.length; i++) gaps[cluster[i].kind].push(cluster[i + 1].time - cluster[i].time);
  samples['opCost.pending'] = gaps.P.length;
  samples['opCost.remove'] = gaps.C.length;
  const opCost = { ...DEFAULT_PROFILE.broker.opCost };
  if (gaps.P.length >= MIN_OP_SAMPLES) opCost.pending = ms(p50(gaps.P));
  else fallbacks.push('opCost.pending');
  if (gaps.C.length >= MIN_OP_SAMPLES) opCost.remove = ms(p50(gaps.C));
  else fallbacks.push('opCost.remove');

  // Telemetrie: nur Turen in W_c
  let decoded: DecodedTurn[] = [];
  let clockShiftS: number | null = null;
  let headS = DEFAULT_PROFILE.vps.headS;
  let zoneOverheadS = DEFAULT_PROFILE.vps.zoneOverheadS;
  if (input.turns && input.tzOffsetSec !== null) {
    const tz = input.tzOffsetSec;
    const all = decodeTurns(input.turns);
    const clock = estimateClockOffset(all, clusters.map((c) => c[0].time), tz);
    const shift = clock.reliable ? clock.shiftSec : 0;
    if (clock.reliable) clockShiftS = ms(clock.shiftSec);
    decoded = all.filter((t) => t.start + tz + shift >= input.from && t.start + tz + shift < input.to);
    // stille Turen: kein Op während der Tur
    const times = ops.map((o) => o.time);
    const quiet = decoded.filter((t) => {
      const begin = t.start + tz + shift;
      return !times.some((time) => time >= begin && time < begin + t.dur + 1) && (t.nsl === null || t.nsl === 0);
    });
    samples.headS = quiet.length;
    if (quiet.length >= MIN_QUIET_TURNS) headS = ms(p50(quiet.map((t) => t.dur - t.pre)));
    else fallbacks.push('headS');
    const withZ0 = quiet.filter((t) => t.z0 !== null);
    samples.zoneOverheadS = withZ0.length;
    if (withZ0.length >= MIN_QUIET_TURNS && input.magics.length > 0) zoneOverheadS = ms(p50(withZ0.map((t) => (t.dur - (t.z0 as number)) / input.magics.length)));
    else fallbacks.push('zoneOverheadS');
    // SLTP-Kosten: z0 − snap ~ a + nsl0·c
    const pts = decoded.filter((t) => t.snap !== null && t.z0 !== null && t.nsl0 !== null).map((t): [number, number] => [t.nsl0 as number, (t.z0 as number) - (t.snap as number)]);
    samples['opCost.sltp'] = pts.length;
    const active = pts.filter(([n]) => n > 0).length;
    const c = pts.length >= MIN_SLTP_TURNS && active >= MIN_SLTP_ACTIVE ? slope(pts) : null;
    if (c !== null && c >= SLTP_RANGE[0] && c <= SLTP_RANGE[1]) opCost.sltp = ms(c);
    else fallbacks.push('opCost.sltp');
    if (clockShiftS === null) fallbacks.push('clockShiftS');
  } else {
    fallbacks.push('headS', 'zoneOverheadS', 'opCost.sltp', 'clockShiftS');
  }

  // Füllverzögerung: fester Einstellwert (1124-D1.4), keine Messung; siehe DEFAULT_PROFILE
  const fillLatencyMs = DEFAULT_PROFILE.broker.fillLatencyMs;

  // 6 = alle messbaren Größen (ohne fillLatencyMs) blieben beim Vorgabewert
  if (fallbacks.length >= 6) return { profile: DEFAULT_PROFILE, fallbacks: ['all'], samples };
  return {
    profile: {
      id: 'derived',
      measured: { from: input.from, to: input.to, source: input.turns ? 'orders+telemetry' : 'orders' },
      vps: { headS, zoneOverheadS, clockShiftS },
      broker: { opCost, fillLatencyMs },
      derived: derivedFor(opCost),
    },
    fallbacks,
    samples,
  };
}

