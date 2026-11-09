import type { Deal } from '@/lib/analysis/tradePairing';
import type { InitialPosition } from '@/lib/backtest/broker/pathBroker';
import type { InitialFractalDone } from '@/lib/backtest/runner';

/** Die Setup-Felder, die der Startzustand für die Schätzung braucht (Abstände in Preiseinheiten, 0 = aus) */
export interface StartSetup {
  entry_mode?: string;
  stop_loss?: number | string | null;
  take_profit?: number | string | null;
  sell_stop_loss?: number | string | null;
  sell_take_profit?: number | string | null;
  /** Grid-Schritt; 0,5 × Schritt ist die größte Abweichung, die als Fill-Verschiebung gilt (sonst: Einstellung geändert) */
  grid_step?: number | string | null;
  sell_grid_step?: number | string | null;
}

export interface StartState {
  positions: InitialPosition[];
  fractalDone: InitialFractalDone[];
  /** Positionen, bei denen SL oder TP geschätzt wurde, weil die MT5-Orderhistorie keinen Wert lieferte */
  estimated: number;
  /** WARN-Meldung für das Protokoll (leer, wenn nichts geschätzt wurde) */
  notes: { code: string; params?: Record<string, unknown> }[];
}

const ENTRY_IN = 0;
const ENTRY_OUT = 1;
const TYPE_BUY = 0;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
function knownIsTpRatio(knownIsTp: boolean, slPerTp: number, tpPerSl: number): number {
  return knownIsTp ? slPerTp : tpPerSl;
}
/** Bot-Schwelle in grid_order_manager (`> 0.00001`); 1e-9 fängt Gleitkomma-Rauschen ab */
const BOT_SLTP_EPS = 0.00001 + 1e-9;
const positive = (v: number | null | undefined): number | undefined => (v != null && v > 0 ? v : undefined);

/**
 * Startzustand eines Live-Vergleichs: Positionen, die vor `from` eröffnet und danach noch offen waren,
 * und Fraktale, die schon gehandelt wurden. SL/TP kommen zuerst aus der Eröffnungsorder
 * (`open_sl`/`open_tp` des Einstiegs-Deals); nur wo sie fehlen, greift die frühere Schätzung
 * (Kommentar des Schließ-Deals plus Verhältnis, sonst Einstellung) und wird gezählt.
 */
export function buildStartState(deals: readonly Deal[], magic: number, setup: StartSetup, from: number, digits: number): StartState {
  const byPosition = new Map<number, Deal[]>();
  for (const d of deals) {
    if (d.magic !== magic || !d.position_id) continue;
    const list = byPosition.get(d.position_id);
    if (list) list.push(d);
    else byPosition.set(d.position_id, [d]);
  }
  const fractal = setup.entry_mode === 'fractal';
  const positions: InitialPosition[] = [];
  const fractalDone: InitialFractalDone[] = [];
  let estimated = 0;
  let settingChanged = 0;
  const round = (v: number) => Number(v.toFixed(digits));

  for (const group of byPosition.values()) {
    const open = group.find((d) => d.entry === ENTRY_IN);
    if (!open || open.time >= from || open.price == null) continue;
    const close = group.filter((d) => d.entry === ENTRY_OUT).sort((a, b) => a.time - b.time).pop();
    const fm = /_F([UD])(\d+)/.exec(open.comment ?? '');
    if (close && close.time < from) {
      if (fm) fractalDone.push({ side: fm[1] as 'U' | 'D', time: Number(fm[2]) });
      continue;
    }
    const buy = open.type === TYPE_BUY;
    let sl = positive(open.open_sl);
    let tp = positive(open.open_tp);
    if (!fractal) {
      // Der Bot setzt SL/TP nach dem Fill vom Füllpreis aus neu (wie engine/orderManager.ts); open_sl/open_tp sind der Orderstand davor
      const sl0 = num(buy ? setup.stop_loss : setup.sell_stop_loss);
      const tp0 = num(buy ? setup.take_profit : setup.sell_take_profit);
      const step = num(buy ? setup.grid_step : (setup.sell_grid_step ?? setup.grid_step));
      const sign = buy ? 1 : -1;
      let changed = false;
      const fixLevel = (given: number | undefined, expected: number | undefined): number | undefined => {
        if (given === undefined || expected === undefined || step <= 0) return given;
        const diff = Math.abs(expected - given);
        if (diff <= BOT_SLTP_EPS) return given; // der Bot lässt die Position unverändert
        if (diff > 0.5 * step) {
          changed = true; // Einstellung seit der Order vermutlich geändert: Orderstand behalten
          return given;
        }
        return expected;
      };
      sl = fixLevel(sl, sl0 > 0 ? open.price - sign * sl0 : undefined);
      tp = fixLevel(tp, tp0 > 0 ? open.price + sign * tp0 : undefined);
      if (changed) settingChanged += 1;
    }
    if (sl === undefined || tp === undefined) {
      estimated += 1;
      const sl0 = num(buy ? setup.stop_loss : setup.sell_stop_loss);
      const tp0 = num(buy ? setup.take_profit : setup.sell_take_profit);
      const known = /\[(sl|tp) ([0-9.]+)\]/.exec(close?.comment ?? '');
      let estSl: number | undefined;
      let estTp: number | undefined;
      if (known) {
        const level = Number(known[2]);
        const dist = Math.abs(level - open.price);
        const slPerTp = tp0 > 0 ? sl0 / tp0 : 0;
        const tpPerSl = sl0 > 0 ? tp0 / sl0 : 0;
        let ratio = knownIsTpRatio(known[1] === 'tp', slPerTp, tpPerSl);
        if (fractal) ratio = 1;
        // TP liegt in Handelsrichtung, SL dagegen
        const knownIsTp = known[1] === 'tp';
        const factor = (knownIsTp ? -1 : 1) * (buy ? 1 : -1);
        const other = ratio > 0 ? open.price + factor * dist * ratio : undefined;
        if (known[1] === 'tp') [estTp, estSl] = [level, other];
        else [estSl, estTp] = [level, other];
      } else if (!fractal) {
        estTp = tp0 > 0 ? open.price + (buy ? tp0 : -tp0) : undefined;
        estSl = sl0 > 0 ? open.price - (buy ? sl0 : -sl0) : undefined;
      }
      sl = sl ?? estSl;
      tp = tp ?? estTp;
    }
    positions.push({
      side: buy ? 'buy' : 'sell',
      volume: open.volume ?? 0,
      price: open.price,
      sl: sl === undefined ? undefined : round(sl),
      tp: tp === undefined ? undefined : round(tp),
      magic,
      comment: open.comment ?? '',
      time: open.time,
    });
  }
  const notes: StartState['notes'] = [];
  if (estimated > 0) notes.push({ code: 'run.startLevelsEstimated', params: { positions: estimated } });
  if (settingChanged > 0) notes.push({ code: 'run.startLevelsSettingChanged', params: { positions: settingChanged } });
  return { positions, fractalDone, estimated, notes };
}
