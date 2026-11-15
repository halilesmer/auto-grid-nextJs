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
export type TradeInput = Pick<Trade, 'entry' | 'stop' | 'tp1' | 'reason'> & Partial<Pick<Trade, 'tp1AtEntry' | 'missed'>>;

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
  targets: { tp1: number; stop: number };
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
    ...(o.missed > 0 ? { missed: o.missed } : {}),
    reason: {},
  };
}
