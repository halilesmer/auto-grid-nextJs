/**
 * Hängt den Handelsblock (A40.3) und die Veto-Zeile (A40.2) an einen fertigen Kandidaten. Das Urteil, `invalidBy`, Alarm und Favoriten
 * bleiben unberührt: die Veto-Zeile kommt erst nach `settle` in die Liste.
 */
import { outward, wickEnd, type ZoneSide } from './frz';
import { tradeSigChecks } from './sigChecks';
import { emergencyStopOf, fibPrice, targetEnd } from './trade';
import { tradeStatusOf } from './tradeStatus';
import type { Env } from './reasons';
import type { ContextTimeframe } from './params';
import { TRADE_RULES, type Candidate, type Drawing, type FormationBar, type Side, type Trade } from './types';

/** Werte, die der Prüfer kennt; der Not-SL und SIG-29 kommen hier dazu */
export type TradeInput = Pick<Trade, 'entry' | 'stop' | 'tp1' | 'reason'> & Partial<Pick<Trade, 'tp1AtEntry' | 'missed' | 'tp2' | 'tp2AtEntry' | 'tp3' | 'tpBig' | 'tpBigAtEntry' | 'tpBigActivation' | 'tpBigHarmonicBroken' | 'tp1StrongZone' | 'status' | 'earlyReversal' | 'reentry' | 'reentryTp1Only' | 'cLeg'>> & {
    /** Kerze, deren ATR(14) beim Einstieg bekannt war (bei Einstieg in der Kerze die davor): der Not-SL rechnet mit ihr, nicht mit der der letzten Kerze; fehlt vor dem Einstieg */
    entryAtrIdx?: number;
  };

/**
 * @param veto true bei TDF, OBO, CDT, LIB, T618, ENC und KEI (Harmoniken und 2618 sind laut Regelbuch Ausnahme)
 */
export function withTrade(
  candidate: Candidate,
  env: Env,
  tf: ContextTimeframe,
  input: TradeInput,
  veto: boolean,
  /** Harmoniken: Stand nach dem Einstieg; `entryIdx` = Einfrierkerze, `from` = Fib-Start der Ziele (A, bei Cypher C), `targets` = TP1 und TP2 */
  run?: { entryIdx: number; from: number; targets: { tp1: number; tp2: number } },
): Candidate {
  const view = env.views.get(tf);
  // Not-SL: nach dem Einstieg mit der ATR, die beim Einstieg bekannt war (Berührung in der Kerze: die Kerze davor; die Vergangenheit ändert sich nicht), davor mit der ATR der letzten Kerze
  const atrIdx = run && input.entry !== null ? run.entryIdx - 1 : (input.entryAtrIdx ?? (view ? view.bars.length - 1 : -1));
  const atr = view && view.bars.length > 0 && atrIdx >= 0 ? (view.atr[atrIdx] ?? null) : null;
  // CRV und SIG-29 laufen über TP1 am Einstieg, wenn der Handel einen hat (AB=CD)
  const sigs = tradeSigChecks(env, tf, candidate.side, { ...input, tp1: input.tp1AtEntry ?? input.tp1 });
  if (run && input.entry !== null && input.stop !== null && view) {
    input = {
      ...input,
      status: tradeStatusOf({
        bars: view.bars,
        entryIdx: run.entryIdx,
        side: candidate.side,
        entry: input.entry,
        stop: input.stop,
        emergencyStop: emergencyStopOf(input.stop, candidate.side, atr),
        from: run.from,
        targets: run.targets,
      }),
    };
  }
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
    ...(input.tpBigHarmonicBroken === undefined ? {} : { tpBigHarmonicBroken: input.tpBigHarmonicBroken }),
    ...(input.tp1StrongZone === undefined ? {} : { tp1StrongZone: input.tp1StrongZone }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(run && input.status !== undefined ? { entryIdx: run.entryIdx } : {}),
    ...(input.earlyReversal === undefined ? {} : { earlyReversal: input.earlyReversal }),
    ...(input.reentry === undefined ? {} : { reentry: input.reentry }),
    ...(input.reentryTp1Only === undefined ? {} : { reentryTp1Only: input.reentryTp1Only }),
    ...(input.cLeg === undefined ? {} : { cLeg: input.cLeg }),
    sig29: sigs.sig29,
  };
  return { ...candidate, checks: veto ? [...candidate.checks, sigs.veto] : candidate.checks, trade };
}

/** Zustand der Harmonik bei der ersten Berührung des D-Levels: Kerze, Einstiegs-Level (nur Gartley, Bat) und Docht der Berührungskerze */
export interface HarmonicFreeze {
  idx: number;
  entryLevel?: number;
  touchEnd: number;
}

/**
 * Friert die Harmonik an der ersten Kerze ein, deren Docht das D-Level erreicht (bis `tol` davor); beginnt wie die D-Suche nach dem Trend-Pivot von C.
 * Ohne Treffer (ein eigenes D liegt nicht auf einem Docht) gilt die Kerze des D. Liegt das Level nicht auf der D-Seite von C, gibt es keine Einfrierung und keinen Handel. `atLevel`: Einstieg am Preis des Levels (Gartley, Bat).
 */
export function harmonicFreeze(
  bars: readonly FormationBar[],
  s: { es: ZoneSide; c: { idx: number; price: number; pivotIdx?: number }; d: { idx: number; price: number } | null },
  level: number,
  tol: number,
  atLevel: boolean,
): HarmonicFreeze | null {
  if (!s.d) return null;
  // Das Level muss auf der D-Seite von C liegen (1125-A1): liegt es zwischen C und der Gegenseite, ist es schon überschritten, die nächste Kerze „berührt“ es sofort und es entsteht ein Scheinhandel
  if (outward(s.es, level) <= outward(s.es, s.c.price)) return null;
  let idx = -1;
  for (let k = Math.max(s.c.idx, s.c.pivotIdx ?? s.c.idx) + 1; k < bars.length; k++) {
    if (outward(s.es, wickEnd(bars[k], s.es)) >= outward(s.es, level) - tol) {
      idx = k;
      break;
    }
  }
  const touchEnd = idx < 0 ? s.d.price : wickEnd(bars[idx], s.es);
  return { idx: idx < 0 ? s.d.idx : idx, touchEnd, ...(atLevel ? { entryLevel: level } : {}) };
}

/** Eingefrorener Stop der Harmonik: 1:1-Stop der Fib `from → Anker`; Anker = Einstiegs-Level (Gartley, Bat) oder Docht der Berührungskerze (Butterfly, Crab) */
export const harmonicStop = (from: { price: number }, freeze: HarmonicFreeze, stopLevel: number): number =>
  fibPrice(from.price, freeze.entryLevel ?? freeze.touchEnd, -stopLevel);

/** Ende der Ziel-Fib `from → D` in der Zeichnung: höchstens am eingefrorenen Stop wie TP1/TP2 im Handel (1121-A14.1); D selbst bleibt bis zum Ende des Handels am äußersten Docht und friert danach ein (1124-A2.1, `evaluateFrozenD`) */
export const harmonicTargetEnd = (from: { price: number }, d: { price: number }, freeze: HarmonicFreeze | null, stopLevel: number): number =>
  freeze ? targetEnd(from.price, d.price, harmonicStop(from, freeze, stopLevel)) : d.price;

/** Einstiegslinie ab der Berührungskerze (blau, wie Stop-Linie gleicher Beginn) und ihre Beschriftung (1124-F2.6); der Preis ist der „Giriş“ des Handelsblocks */
export function frozenEntryDrawings(ids: [string, string], bars: readonly FormationBar[], freeze: HarmonicFreeze, side: Side): Drawing[] {
  const price = freeze.entryLevel ?? freeze.touchEnd;
  return [
    { id: ids[0], tool: 'hline', anchors: [{ time: bars[freeze.idx].time, price }], label: 'entry', rules: TRADE_RULES, side },
    { id: ids[1], tool: 'label', anchors: [{ time: bars[bars.length - 1].time, price }], label: 'entry', rules: TRADE_RULES, side },
  ];
}

/** Stop-Linie ab der Berührungskerze und ihre Beschriftung (wie Z-ABCD-07 und Z-ABCD-08); der Stop läuft nicht mit der Ziel-Fib */
export function frozenStopDrawings(ids: [string, string], bars: readonly FormationBar[], freeze: HarmonicFreeze, stop: number, side: Side): Drawing[] {
  return [
    { id: ids[0], tool: 'hline', anchors: [{ time: bars[freeze.idx].time, price: stop }], rules: TRADE_RULES, side },
    { id: ids[1], tool: 'label', anchors: [{ time: bars[bars.length - 1].time, price: stop }], label: 'stop', rules: TRADE_RULES, side },
  ];
}

/**
 * Handel einer Harmonik: Ziel aus der Ziel-Fib `from → D` (Level in Notation Start = 1, Ende = 0); TP1 läuft mit dem äußersten Docht.
 * Der Stop ist eingefroren (`harmonicStop`). Gartley und Bat steigen am Preis des D-Levels ein, nicht am äußersten Docht;
 * `tp1AtEntry` (Fib `from → Level`) ist dann die Grundlage des CRV (1:1). Butterfly und Crab steigen am Docht der Berührungskerze ein (`touchEnd`, wie der Stop eingefroren) und laufen nicht mit dem äußersten Docht.
 * Solange D nicht erreicht ist, fehlen alle drei Werte; `reachedRule` ist die Bedingung, auf die sie warten.
 */
export function harmonicTrade(
  from: { price: number } | null,
  d: { price: number } | null,
  reached: boolean,
  targets: { tp1: number; tp2: number; stop: number },
  reachedRule: string,
  freeze: HarmonicFreeze | null,
): TradeInput {
  if (!from || !d || !reached || !freeze) return { entry: null, stop: null, tp1: null, reason: { entry: reachedRule, stop: reachedRule, tp1: reachedRule } };
  const stop = harmonicStop(from, freeze, targets.stop);
  // Ende der Ziel-Fib höchstens am Stop: ein Docht jenseits des Stops ohne Schluss zieht die Ziele nicht weiter (1121-A14.1)
  const end = targetEnd(from.price, d.price, stop);
  return {
    entry: freeze.entryLevel ?? freeze.touchEnd,
    stop,
    tp1: fibPrice(from.price, end, targets.tp1),
    // am Einstieg eingefroren (Level oder Docht der Berührungskerze); Grundlage des CRV, läuft nicht mit D (1120-A10.2)
    tp1AtEntry: fibPrice(from.price, freeze.entryLevel ?? freeze.touchEnd, targets.tp1),
    // TP2 (Fib 0.618) läuft wie TP1; kein großes Ziel, keine Wiedereinstieg und kein früher Rückkehr bei Harmoniken
    tp2: fibPrice(from.price, end, targets.tp2),
    // am Einstieg eingefroren (Level oder Docht der Berührungskerze), läuft nicht mit dem äußersten Docht D
    tp2AtEntry: fibPrice(from.price, freeze.entryLevel ?? freeze.touchEnd, targets.tp2),
    reason: {},
  };
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
  const stop = fibPrice(frozenFrom.price, level1, -targets.stop);
  // Ende der Ziel-Fib höchstens am Stop: ein Docht jenseits des Stops ohne Schluss zieht die Ziele nicht weiter (1121-A14.1)
  const end = targetEnd(from.price, d.price, stop);
  return {
    entry: level1,
    stop,
    tp1: fibPrice(from.price, end, targets.tp1),
    tp1AtEntry: fibPrice(frozenFrom.price, level1, targets.tp1),
    tp2: fibPrice(from.price, end, targets.tp2),
    tp2AtEntry: fibPrice(frozenFrom.price, level1, targets.tp2),
    ...(o.divergence ? { tp3: fibPrice(from.price, end, targets.divergence) } : {}),
    ...(o.big
      ? { tpBig: end + o.big.offset, tpBigAtEntry: level1 + o.big.offset, tpBigActivation: o.big.activation }
      : {}),
    ...(o.strongZone ? { tp1StrongZone: true } : {}),
    ...(o.missed > 0 ? { missed: o.missed } : {}),
    reason: {},
  };
}
