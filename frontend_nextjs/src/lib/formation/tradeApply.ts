/**
 * Hängt den Handelsblock (A40.3) und die Veto-Zeile (A40.2) an einen fertigen Kandidaten. Das Urteil, `invalidBy`, Alarm und Favoriten
 * bleiben unberührt: die Veto-Zeile kommt erst nach `settle` in die Liste.
 */
import { tradeSigChecks } from './sigChecks';
import { emergencyStopOf, fibPrice } from './trade';
import type { Env } from './reasons';
import type { ContextTimeframe } from './params';
import type { Candidate, Trade } from './types';

/** Werte, die der Prüfer kennt; der Not-SL und SIG-29 kommen hier dazu */
export type TradeInput = Pick<Trade, 'entry' | 'stop' | 'tp1' | 'reason'> & Partial<Pick<Trade, 'tp1AtEntry' | 'missed' | 'tp2' | 'tp2AtEntry' | 'tp3' | 'tpBig' | 'tpBigAtEntry' | 'tpBigActivation' | 'tp1StrongZone' | 'status' | 'earlyReversal' | 'reentry' | 'reentryTp1Only'>>;

/**
 * @param veto true bei TDF, OBO, CDT, LIB, T618, ENC und KEI (Harmoniken und 2618 sind laut Regelbuch Ausnahme)
 */
export function withTrade(candidate: Candidate, env: Env, tf: ContextTimeframe, input: TradeInput, veto: boolean): Candidate {
  const view = env.views.get(tf);
  const atr = view && view.bars.length > 0 ? (view.atr[view.bars.length - 1] ?? null) : null;
  // CRV und SIG-29 laufen über TP1 am Einstieg, wenn der Handel einen hat (AB=CD)
  const sigs = tradeSigChecks(env, tf, candidate.side, { ...input, tp1: input.tp1AtEntry ?? input.tp1 });
  const trade: Trade = {
    entry: input.entry,
    stop: input.stop,
    emergencyStop: emergencyStopOf(input.stop, candidate.side, atr),
    tp1: input.tp1,
    reason: input.reason,
    ...(input.tp1AtEntry === undefined ? {} : { tp1AtEntry: input.tp1AtEntry }),
    ...(input.missed === undefined ? {} : { missed: input.missed }),
    ...(input.tp2 === undefined ? {} : { tp2: input.tp2 }),
    ...(input.tp2AtEntry === undefined ? {} : { tp2AtEntry: input.tp2AtEntry }),
    ...(input.tp3 === undefined ? {} : { tp3: input.tp3 }),
    ...(input.tpBig === undefined ? {} : { tpBig: input.tpBig }),
    ...(input.tpBigAtEntry === undefined ? {} : { tpBigAtEntry: input.tpBigAtEntry }),
    ...(input.tpBigActivation === undefined ? {} : { tpBigActivation: input.tpBigActivation }),
    ...(input.tp1StrongZone === undefined ? {} : { tp1StrongZone: input.tp1StrongZone }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.earlyReversal === undefined ? {} : { earlyReversal: input.earlyReversal }),
    ...(input.reentry === undefined ? {} : { reentry: input.reentry }),
    ...(input.reentryTp1Only === undefined ? {} : { reentryTp1Only: input.reentryTp1Only }),
    sig29: sigs.sig29,
  };
  return { ...candidate, checks: veto ? [...candidate.checks, sigs.veto] : candidate.checks, trade };
}

/**
 * Handel einer Harmonik: Einstieg am D, Ziel und 1:1-Stop aus der Ziel-Fib `from → D` (Level in Notation Start = 1, Ende = 0, `-stop` jenseits von D).
 * Solange D nicht erreicht ist, fehlen alle drei Werte; `reachedRule` ist die Bedingung, auf die sie warten.
 */
export function harmonicTrade(
  from: { price: number } | null,
  d: { price: number } | null,
  reached: boolean,
  targets: { tp1: number; stop: number },
  reachedRule: string,
): TradeInput {
  if (!from || !d || !reached) return { entry: null, stop: null, tp1: null, reason: { entry: reachedRule, stop: reachedRule, tp1: reachedRule } };
  return { entry: d.price, stop: fibPrice(from.price, d.price, -targets.stop), tp1: fibPrice(from.price, d.price, targets.tp1), reason: {} };
}

/**
 * Handel von AB=CD (1114-A4.1): Einstieg an Level 1, nicht am äußersten Docht. Der Stop ist der 1:1-Stop der Ziel-Fib `frozenFrom → Level 1`
 * und bleibt stehen, sobald Level 1 (mit Toleranz) erreicht ist; TP1 folgt der Fib `from → äußerster Docht`.
 * TP2 (0.618) läuft wie TP1; TP3 (0.786) nur bei Divergenz und ohne Anteil (1114-A4.2, A4.3).
 * Bei harmonischem D (`big`) kommt das große AB=CD-Ziel als dritter Anteil dazu: `d + offset` (offset = A − X), am Einstieg `level1 + offset` (1114-A4.3).
 * `frozenFrom` ist das `from` der Kerze, die Level 1 zuerst erreicht hat; `tp1AtEntry` (Fib `frozenFrom → Level 1`) ist die Grundlage des CRV (1:1).
 */
export function abcdTrade(o: {
  from: { price: number } | null;
  frozenFrom: { price: number } | null;
  d: { price: number } | null;
  level1: number;
  reached: boolean;
  /** Preisstrecke, die der Docht Level 1 verfehlt (0 bei erreichtem Level 1) */
  missed: number;
  targets: { tp1: number; tp2: number; stop: number; divergence: number };
  /** Divergenz an D: dann zeigt der Handel TP3 (0.786) als Zusatzziel ohne Anteil */
  divergence: boolean;
  /** Harmonisches D mit bekanntem X: `offset` = A − X (Preis), `activation` = A; null sonst */
  big: { offset: number; activation: number } | null;
  /** Sehr starke Zone der Gegenseite am TP1 (nur Hinweis) */
  strongZone: boolean;
  reachedRule: string;
}): TradeInput {
  const { from, frozenFrom, d, level1, targets } = o;
  if (!from || !frozenFrom || !d || !o.reached) {
    return { entry: null, stop: null, tp1: null, reason: { entry: o.reachedRule, stop: o.reachedRule, tp1: o.reachedRule } };
  }
  return {
    entry: level1,
    stop: fibPrice(frozenFrom.price, level1, -targets.stop),
    tp1: fibPrice(from.price, d.price, targets.tp1),
    tp1AtEntry: fibPrice(frozenFrom.price, level1, targets.tp1),
    tp2: fibPrice(from.price, d.price, targets.tp2),
    tp2AtEntry: fibPrice(frozenFrom.price, level1, targets.tp2),
    ...(o.divergence ? { tp3: fibPrice(from.price, d.price, targets.divergence) } : {}),
    ...(o.big
      ? { tpBig: d.price + o.big.offset, tpBigAtEntry: level1 + o.big.offset, tpBigActivation: o.big.activation }
      : {}),
    ...(o.strongZone ? { tp1StrongZone: true } : {}),
    ...(o.missed > 0 ? { missed: o.missed } : {}),
    reason: {},
  };
}
