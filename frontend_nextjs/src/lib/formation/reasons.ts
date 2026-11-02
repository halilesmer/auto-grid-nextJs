/**
 * Umgebung und Gründe G1 bis G11 (SIG-41). FIB-23 und SIG-40/41 zählen dieselben Gründe; die Zählung steht deshalb hier.
 * Ein Grund ist wahr, falsch oder (null) nicht messbar; nur wahre Gründe werden gezählt, jeder höchstens einmal.
 */
import type { FormationContext, TimeframeView } from './context';
import { buildFib, breakoutOf, bandOf, levelPrice, type FibModel } from './fib';
import { analyzeFrz, type FrzAnalysis, type FrzOptions } from './frzChecks';
import type { Rect } from './frz';
import { CONTEXT_TIMEFRAMES, FIB_PARAMS, type ContextTimeframe, type TrendTimeframe } from './params';
import { divergenceOf, engulfAt, engulfZones, rsiExtreme, zoneSideOf } from './sig';
import type { TrendDir, TrendModel } from './trd';
import { formationTrend } from './trdFormation';
import type { FormationBar, Side } from './types';

export interface Env {
  t: number;
  tf: ContextTimeframe;
  views: Map<TrendTimeframe, TimeframeView>;
  trends: Map<TrendTimeframe, TrendModel>;
  fibs: Map<ContextTimeframe, FibModel>;
  frz: FrzAnalysis;
}

/** Fibonacci-Ziele für FRZ-24: Ränder der Korrekturzone (0.382 und 0.618, FIB-10) und Ausdehnungen (FIB-18) aller Impulse des laufenden Trends jeder geladenen Zeiteinheit (wie CDT-10) */
export function fibTargetsOf(fibs: ReadonlyMap<ContextTimeframe, FibModel>): number[] {
  const out: number[] = [];
  for (const model of fibs.values()) {
    for (const leg of model.legs) {
      for (const level of [FIB_PARAMS.retrace[0], FIB_PARAMS.retrace[2], ...FIB_PARAMS.extensions.map((e) => -e)]) out.push(levelPrice(leg, level));
    }
  }
  return out;
}

/** Bereich von `shareEnv`: die schon gebauten Umgebungen eines Kontexts, je Zeitpunkt und Zeiteinheit */
let shared: { ctx: FormationContext; envs: Map<string, Env | null> } | null = null;

/**
 * Führt `fn` so aus, dass `buildEnv` für diesen Kontext je Zeitpunkt und Zeiteinheit nur einmal rechnet (Befund 49):
 * die Suche ruft elf Analyzer, jeder baute sonst Trends, Fibs und Zonen neu. Gilt nur ohne `frzOptions`.
 * Ein geteiltes Env darf niemand verändern. Ein innerer Bereich für denselben Kontext nutzt den äußeren weiter.
 * Nur für synchrones `fn`: nach dem ersten `await` ist der Bereich schon zu (Ergebnis gleich, aber ohne Teilung).
 */
export function shareEnv<T>(ctx: FormationContext, fn: () => T): T {
  if (shared?.ctx === ctx) return fn();
  const outer = shared;
  shared = { ctx, envs: new Map() };
  try {
    return fn();
  } finally {
    shared = outer;
  }
}

/** Umgebung zum Zeitpunkt t; null, wenn die Zeiteinheit nicht geladen ist */
export function buildEnv(ctx: FormationContext, t: number, tf: ContextTimeframe, frzOptions: FrzOptions = {}): Env | null {
  const scope = shared?.ctx === ctx && Object.keys(frzOptions).length === 0 ? shared : null;
  if (!scope) return computeEnv(ctx, t, tf, frzOptions);
  const key = `${t}|${tf}`;
  if (!scope.envs.has(key)) scope.envs.set(key, computeEnv(ctx, t, tf, frzOptions));
  return scope.envs.get(key) ?? null;
}

function computeEnv(ctx: FormationContext, t: number, tf: ContextTimeframe, frzOptions: FrzOptions): Env | null {
  if (!ctx.timeframes().includes(tf)) return null;
  const views = new Map<TrendTimeframe, TimeframeView>();
  const trends = new Map<TrendTimeframe, TrendModel>();
  const fibs = new Map<ContextTimeframe, FibModel>();
  for (const x of ctx.timeframes()) {
    const view = ctx.view(x, t);
    if (!view) continue;
    views.set(x, view);
    const trend = formationTrend(view);
    trends.set(x, trend);
    fibs.set(x, buildFib(trend));
  }
  // W1 (aus D1 gebildet) liefert nur Trend, RSI und Divergenz: keine Fib, keine Zonen
  const w1 = ctx.view('W1', t);
  if (w1) {
    views.set('W1', w1);
    trends.set('W1', formationTrend(w1));
  }
  return { t, tf, views, trends, fibs, frz: analyzeFrz(ctx, t, { entryTf: tf, fibTargets: fibTargetsOf(fibs), ...frzOptions }) };
}

/** Umgebung für eine andere Einstiegs-Zeiteinheit: nur M15-Zonen hängen davon ab (FRZ-27), sonst wird die Rechnung geteilt */
export function envFor(base: Env, ctx: FormationContext, t: number, tf: ContextTimeframe): Env {
  if (tf === base.tf) return base;
  if (tf === 'M15') return buildEnv(ctx, t, tf) ?? { ...base, tf };
  return { ...base, tf };
}

export const neighborTf = (env: Env, tf: ContextTimeframe, step: -1 | 1): ContextTimeframe | undefined => {
  const next = CONTEXT_TIMEFRAMES[CONTEXT_TIMEFRAMES.indexOf(tf) + step];
  return next && env.views.has(next) ? next : undefined;
};

/** Höhere Zeiteinheit für den Trend: wie `neighborTf`, über D1 aber W1 (aus D1 gebildet), wenn geladen. Nur für Regeln, die W1 ausdrücklich lesen (CYP-02); GAR-19 liest `env.trends.get('W1')` selbst. */
export const higherTrendTf = (env: Env, tf: ContextTimeframe): TrendTimeframe | undefined => {
  if (tf !== CONTEXT_TIMEFRAMES[0]) return neighborTf(env, tf, -1);
  return env.views.has('W1') ? 'W1' : undefined;
};

export const lastBarOf = (env: Env, tf: ContextTimeframe = env.tf): FormationBar | undefined => {
  const bars = env.views.get(tf)?.bars;
  return bars && bars.length > 0 ? bars[bars.length - 1] : undefined;
};

export const dirSide = (dir: TrendDir): Side => (dir === 'up' ? 'buy' : 'sell');

/** Docht der Kerze liegt im Rechteck */
export const touches = (rect: Rect, bar: FormationBar): boolean => bar.high >= rect.bottom && bar.low <= rect.top;

export interface Reason {
  id: string;
  /** null: nicht messbar */
  met: boolean | null;
}

export interface ReasonOptions {
  /** G9: Der Ort ist ein Formationspunkt (kommt von der Formation selbst) */
  formationPoint?: boolean;
}

const orNull = (list: (boolean | null)[]): boolean | null => {
  if (list.some((x) => x === true)) return true;
  return list.some((x) => x === null) ? null : false;
};

/** Gründe G1 bis G11 für einen Trade der Seite `side` an der letzten geschlossenen Kerze der Zeiteinheit */
export function computeReasons(env: Env, side: Side, options: ReasonOptions = {}): Reason[] {
  const view = env.views.get(env.tf);
  const bar = lastBarOf(env);
  if (!view || !bar) return [];
  const last = view.bars.length - 1;
  const zoneSide = zoneSideOf(side);
  const higherTfs = CONTEXT_TIMEFRAMES.filter((x) => CONTEXT_TIMEFRAMES.indexOf(x) < CONTEXT_TIMEFRAMES.indexOf(env.tf) && env.views.has(x));
  const lowerTf = neighborTf(env, env.tf, 1);
  const trend = env.trends.get(env.tf)!;
  const fib = env.fibs.get(env.tf)!;
  const out: Reason[] = [];
  const add = (id: string, met: boolean | null) => out.push({ id, met });

  const higher = neighborTf(env, env.tf, -1);
  const higherDir = higher ? env.trends.get(higher)?.dir : null;
  add('G1', higherDir ? dirSide(higherDir) === side : null);

  const zonesAt = (tfs: ContextTimeframe[]) =>
    [...env.frz.zones, ...env.frz.reversed].filter((z) => tfs.includes(z.tf) && z.side === zoneSide && touches(z.rect, bar));
  add('G2', zonesAt([env.tf]).length > 0);
  add('G3', engulfZones(view.bars, view.wide).some((z) => z.idx !== last && z.side === side && z.holds && touches(z.rect, bar)));

  const st = fib.state;
  if (!st) {
    add('G4', null);
    add('G5', null);
  } else {
    const withLeg = dirSide(st.leg.dir) === side;
    const reached = st.depth >= FIB_PARAMS.retrace[0] || touches(bandOf(st.leg), bar);
    add('G4', withLeg && reached && !st.ended);
    const b = breakoutOf(fib);
    add('G5', !withLeg && b !== null && b.reach >= FIB_PARAMS.extensions[0]);
  }

  add('G6', rsiExtreme(view.rsi[last], side));
  const div = divergenceOf(trend, zoneSide);
  add('G7', div ? div.tie : null);

  const own = engulfAt(view.bars, view.wide, last, side) !== null;
  const lowerView = lowerTf ? env.views.get(lowerTf) : undefined;
  const lower = lowerView && lowerView.bars.length > 0 ? engulfAt(lowerView.bars, lowerView.wide, lowerView.bars.length - 1, side) !== null : null;
  add('G8', orNull([own, lower]));

  add('G9', options.formationPoint ?? null);
  add('G10', higherTfs.length === 0 ? null : zonesAt(higherTfs).length > 0);
  add('G11', zonesAt([env.tf]).some((z) => z.tests >= 1));
  return out;
}

export const countReasons = (reasons: readonly Reason[], skip: readonly string[] = []): number =>
  reasons.filter((r) => r.met === true && !skip.includes(r.id)).length;
