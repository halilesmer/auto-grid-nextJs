/**
 * Trades aus dem Deal-Archiv (GET /history/{id}/deals) nach docs/analyse-regeln.md §2/§4:
 * - Ein- und Ausstiege werden über die Positionsnummer (position_id) zusammengeführt.
 * - Ein Trade ist ein Ausstieg; eine Teilschließung ist ein eigener Trade. Einstiegskosten
 *   (Kommission, Gebühr) werden nach Volumen anteilig verteilt.
 * - Umkehr (DEAL_ENTRY_INOUT, Netting-Konto): schließt die Position und eröffnet den Rest in der
 *   Gegenrichtung unter derselben Positionsnummer. Die Kosten des Deals werden nach Volumen geteilt.
 * - Zone nur über das Zonen-Register: bekannte Magic-Nummer und Einstieg nach dem Eintrag ins Register.
 *   Alles andere aus dem Robot-Bereich ist „Zone unbekannt“, nie geraten. Magic 200000 ist ausgeschlossen.
 * Zeiten sind MT5-Zeit (Sekunden); nur der Vergleich mit dem Register (echte Uhr) braucht den Broker-Abstand.
 */

/** Ein Deal wie market_db.read_deals (Zeit in MT5-Sekunden). */
export interface Deal {
  ticket: number;
  order: number | null;
  position_id: number | null;
  time: number;
  time_msc: number | null;
  type: number;
  entry: number;
  magic: number | null;
  symbol: string | null;
  volume: number | null;
  price: number | null;
  profit: number | null;
  commission: number | null;
  swap: number | null;
  fee: number | null;
  comment: string | null;
  reason: number | null;
}

/** Eintrag im Zonen-Register (market_db.zone_registry); created_at/deleted_at sind echte Unix-Sekunden. */
export interface ZoneRegistryEntry {
  magic: number;
  zone_id: string | null;
  symbol: string | null;
  label: string | null;
  created_at: number;
  deleted_at: number | null;
}

/** MT5 DEAL_TYPE_* / DEAL_ENTRY_* */
export const DEAL_BUY = 0;
export const DEAL_SELL = 1;
export const ENTRY_IN = 0;
export const ENTRY_OUT = 1;
export const ENTRY_INOUT = 2;
export const ENTRY_OUT_BY = 3;

/** Robot-Bereich der Magic-Nummern (src/utils/zone_magic.py); 200000 selbst gehört zu keiner Zone */
export const BASE_MAGIC = 200000;
const MAGIC_LIMIT = BASE_MAGIC + 1000;
/** Ohne gemessenen Broker-Abstand: der größte mögliche (UTC+14), damit nie ein Trade zu früh zugeordnet wird */
const MAX_OFFSET_SEC = 14 * 3600;
const EPS = 1e-9;

export type Side = 'buy' | 'sell';

/** Fraktal-Order aus dem Kommentar: Setup-Nummer (1 = Zonenfelder), Seite und Kerzenzeit */
export interface FractalRef {
  sid: number;
  side: 'U' | 'D';
  time: number;
}

/**
 * Zuordnung eines Trades:
 * - zone: Magic im Register, Einstieg nach dem Registereintrag;
 * - unknown: Robot-Magic, aber nicht (sicher) im Register — z. B. Trades aus der Zeit vor dem Register;
 * - manual: Magic 0 (Hand-Trade im Terminal oder in der MT5-App);
 * - other: Magic eines anderen Programms.
 */
export type ZoneMatch =
  | { kind: 'zone'; magic: number; label: string | null }
  | { kind: 'unknown'; magic: number }
  | { kind: 'manual' }
  | { kind: 'other'; magic: number };

export interface Trade {
  /** Eindeutig: Position + Ausstiegs-Deal */
  id: string;
  positionId: number;
  symbol: string;
  side: Side;
  /** Geschlossenes Volumen dieses Ausstiegs */
  volume: number;
  /** Einstieg (volumengewichteter Durchschnitt der Einstiege dieser Seite); null = Einstieg nicht im Archiv */
  entryTime: number | null;
  entryPrice: number | null;
  exitTime: number;
  exitPrice: number;
  exitTicket: number;
  /** DEAL_REASON_* des Ausstiegs (4 = SL, 5 = TP, …) */
  exitReason: number | null;
  profit: number;
  /** Kommission und Gebühr: Ausstieg + anteiliger Einstieg */
  commission: number;
  fee: number;
  swap: number;
  /** Gewinn + Kommission + Swap + Gebühr */
  net: number;
  /** Die Position war vor oder nach diesem Ausstieg noch (teilweise) offen */
  partial: boolean;
  /** Ausstieg durch Umkehr (INOUT): danach läuft die Position in der Gegenrichtung weiter */
  reversal: boolean;
  /** Geschlossen durch eine Gegenposition (Close By) */
  closeBy: boolean;
  magic: number | null;
  zone: ZoneMatch;
  /** Fraktal-Order: Setup, Seite und Kerzenzeit aus dem Kommentar AutoGrid_Z{n}_F{k}{U|D}{zeit} */
  fractal: FractalRef | null;
}

/** Einstieg (für Pfeile im Chart), auch wenn die Position im Zeitraum nicht geschlossen wurde. */
export interface TradeEntry {
  id: string;
  positionId: number;
  ticket: number;
  symbol: string;
  side: Side;
  time: number;
  price: number;
  volume: number;
  /** Eröffnet durch eine Umkehr (INOUT) */
  reversal: boolean;
  magic: number | null;
  zone: ZoneMatch;
  fractal: FractalRef | null;
  /** Die Seite dieses Einstiegs wurde ganz geschlossen (Teilschließungen allein zählen nicht) */
  closed: boolean;
}

export interface PairingResult {
  trades: Trade[];
  entries: TradeEntry[];
  /** Deals, die kein Handel sind (Ein-/Auszahlung, Gutschrift, …) */
  nonTrade: number;
  /** Deals mit Magic 200000 (ausgeschlossen) */
  excluded: number;
}

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const sideOf = (dealType: number): Side => (dealType === DEAL_BUY ? 'buy' : 'sell');
const opposite = (s: Side): Side => (s === 'buy' ? 'sell' : 'buy');

// Setup 1: AutoGrid_Z{n}_F{U|D}{zeit}, Setup k ≥ 2: AutoGrid_Z{n}_F{k}{U|D}{zeit} (worker grid_orders.fractal_comment)
const FRACTAL_COMMENT = /^AutoGrid_Z\d+_F(\d*)([UD])(\d+)$/;
export function parseFractalComment(comment: string | null | undefined): FractalRef | null {
  const m = FRACTAL_COMMENT.exec(String(comment ?? ''));
  return m ? { sid: m[1] ? Number(m[1]) : 1, side: m[2] as 'U' | 'D', time: Number(m[3]) } : null;
}

/**
 * Zone eines Trades über das Register. `entryMt5`: Einstiegszeit in MT5-Zeit (null = unbekannt →
 * nicht beweisbar nach dem Registereintrag → unbekannt). `offsetSec`: Broker-Abstand zu UTC.
 */
export function matchZone(
  magic: number | null,
  entryMt5: number | null,
  registry: Map<number, ZoneRegistryEntry>,
  offsetSec: number | null,
): ZoneMatch {
  const m = magic ?? 0;
  if (m === 0) return { kind: 'manual' };
  if (m <= BASE_MAGIC || m >= MAGIC_LIMIT) return { kind: 'other', magic: m };
  const reg = registry.get(m);
  if (!reg || entryMt5 === null) return { kind: 'unknown', magic: m };
  // MT5-Zeit → echte Zeit; ohne Messung mit dem größten möglichen Abstand (lieber „unbekannt“ als falsch)
  const entryUtc = entryMt5 - (offsetSec ?? MAX_OFFSET_SEC);
  return entryUtc >= reg.created_at ? { kind: 'zone', magic: m, label: reg.label } : { kind: 'unknown', magic: m };
}

interface Leg {
  side: Side;
  volume: number;
  /** Summe Preis × Volumen (für den Durchschnitt) */
  priceVolume: number;
  /** Noch nicht verteilte Einstiegskosten */
  commission: number;
  fee: number;
  firstTime: number;
  magic: number | null;
  entries: TradeEntry[];
  /** Es gab schon einen Ausstieg aus dieser Seite */
  closedBefore: boolean;
  fractal: TradeEntry['fractal'];
}

function dealOrder(a: Deal, b: Deal) {
  return (a.time_msc ?? a.time * 1000) - (b.time_msc ?? b.time * 1000) || a.time - b.time || a.ticket - b.ticket;
}

/**
 * Deals → Trades und Einstiege. `registry` aus der Antwort von /history/{id}/deals, `offsetSec` vom
 * Brokeruhr-Endpunkt (null = unbekannt).
 */
export function pairTrades(deals: Deal[], registry: ZoneRegistryEntry[], offsetSec: number | null): PairingResult {
  const reg = new Map(registry.map((r) => [r.magic, r]));
  const byPosition = new Map<number, Deal[]>();
  let nonTrade = 0;
  let excluded = 0;
  for (const d of deals) {
    if (d.type !== DEAL_BUY && d.type !== DEAL_SELL) {
      nonTrade++;
      continue;
    }
    if (d.magic === BASE_MAGIC) {
      excluded++;
      continue;
    }
    // Ohne Positionsnummer (sollte es nicht geben): als eigene Position, nie mit einer anderen vermischt
    const pid = d.position_id && d.position_id > 0 ? d.position_id : -d.ticket;
    const list = byPosition.get(pid);
    if (list) list.push(d);
    else byPosition.set(pid, [d]);
  }

  const trades: Trade[] = [];
  const entries: TradeEntry[] = [];
  for (const [pid, list] of byPosition) {
    list.sort(dealOrder);
    let leg: Leg | null = null;
    // Magic der Position: die des ersten Einstiegs (der Ausstieg durch SL/TP trägt sie ebenfalls)
    const positionMagic = list.find((d) => d.entry === ENTRY_IN)?.magic ?? list[0].magic;
    const symbol = list[0].symbol ?? '';

    const openLeg = (d: Deal, side: Side, volume: number, commission: number, fee: number, reversal: boolean) => {
      const price = num(d.price);
      const fractal = parseFractalComment(d.comment);
      const entry: TradeEntry = {
        id: `${pid}-in-${d.ticket}`,
        positionId: pid,
        ticket: d.ticket,
        symbol,
        side,
        time: d.time,
        price,
        volume,
        reversal,
        magic: positionMagic,
        zone: { kind: 'manual' }, // unten gesetzt, sobald die Einstiegszeit feststeht
        fractal,
        closed: false,
      };
      entries.push(entry);
      if (leg && leg.side === side && leg.volume > EPS) {
        leg.volume += volume;
        leg.priceVolume += price * volume;
        leg.commission += commission;
        leg.fee += fee;
        leg.entries.push(entry);
      } else {
        leg = {
          side,
          volume,
          priceVolume: price * volume,
          commission,
          fee,
          firstTime: d.time,
          magic: positionMagic,
          entries: [entry],
          closedBefore: false,
          fractal: fractal,
        };
      }
    };

    const close = (d: Deal, volume: number, share: number, flags: { reversal: boolean; closeBy: boolean }, willRemain: boolean) => {
      const cur = leg as Leg | null;
      const known = cur !== null && cur.volume > EPS;
      // Seite: aus dem Einstieg, sonst Gegenrichtung des Ausstiegs-Deals
      const side: Side = known ? cur.side : opposite(sideOf(d.type));
      let commission = num(d.commission) * share;
      let fee = num(d.fee) * share;
      let entryPrice: number | null = null;
      let entryTime: number | null = null;
      let partial = willRemain;
      let fractal: Trade['fractal'] = null;
      // Mehr geschlossen als im Archiv eröffnet (Einstiege fehlen): Einstieg nicht bestimmbar, nicht raten
      if (known && volume > cur.volume + EPS) {
        commission += cur.commission;
        fee += cur.fee;
        cur.volume = 0;
        cur.entries.forEach((e) => (e.closed = true));
        leg = null;
      } else if (known) {
        const closed = Math.min(volume, cur.volume);
        const part = closed / cur.volume;
        entryPrice = cur.priceVolume / cur.volume;
        entryTime = cur.firstTime;
        commission += cur.commission * part;
        fee += cur.fee * part;
        partial = partial || cur.closedBefore || volume < cur.volume - EPS;
        fractal = cur.fractal;
        cur.commission -= cur.commission * part;
        cur.fee -= cur.fee * part;
        cur.priceVolume -= cur.priceVolume * part;
        cur.volume -= closed;
        cur.closedBefore = true;
        if (cur.volume <= EPS) {
          cur.entries.forEach((e) => (e.closed = true));
          leg = null;
        }
      }
      const profit = num(d.profit);
      const swap = num(d.swap);
      trades.push({
        id: `${pid}-out-${d.ticket}`,
        positionId: pid,
        symbol,
        side,
        volume,
        entryTime,
        entryPrice,
        exitTime: d.time,
        exitPrice: num(d.price),
        exitTicket: d.ticket,
        exitReason: d.reason,
        profit,
        commission,
        fee,
        swap,
        net: profit + commission + swap + fee,
        partial,
        reversal: flags.reversal,
        closeBy: flags.closeBy,
        magic: positionMagic,
        zone: matchZone(positionMagic, entryTime, reg, offsetSec),
        fractal,
      });
    };

    for (const d of list) {
      const volume = num(d.volume);
      const side = sideOf(d.type);
      const cur = leg as Leg | null;
      if (d.entry === ENTRY_IN) {
        // Ein Einstieg in Gegenrichtung zu einer offenen Seite kommt bei MT5 nicht vor; falls doch, beginnt
        // eine neue Seite (die alte bleibt ohne Ausstieg, statt falsch verrechnet zu werden)
        openLeg(d, side, volume, num(d.commission), num(d.fee), false);
      } else if (d.entry === ENTRY_INOUT) {
        // Umkehr: der offene Teil wird geschlossen, der Rest in der Gegenrichtung eröffnet. Ohne bekannten
        // Einstieg ist die Aufteilung unbekannt: ein Ausstieg ohne Einstieg, keine neue Seite (nicht raten)
        if (!cur || cur.volume <= EPS) {
          close(d, volume, 1, { reversal: true, closeBy: false }, false);
          continue;
        }
        const openVol = cur.volume;
        const closing = Math.min(openVol, volume);
        const share = volume > EPS ? closing / volume : 0;
        if (closing > EPS) close(d, closing, share, { reversal: true, closeBy: false }, false);
        const rest = volume - closing;
        if (rest > EPS) openLeg(d, side, rest, num(d.commission) * (1 - share), num(d.fee) * (1 - share), true);
      } else {
        // OUT oder OUT_BY: Teil- oder Vollschließung
        const remains = cur !== null && cur.volume - volume > EPS;
        close(d, volume, 1, { reversal: false, closeBy: d.entry === ENTRY_OUT_BY }, remains);
      }
    }
  }

  // Zuordnung der Einstiege (für die Pfeile) nach derselben Regel
  for (const e of entries) e.zone = matchZone(e.magic, e.time, reg, offsetSec);
  trades.sort((a, b) => a.exitTime - b.exitTime || a.exitTicket - b.exitTicket);
  entries.sort((a, b) => a.time - b.time || a.ticket - b.ticket);
  return { trades, entries, nonTrade, excluded };
}

/** Gehört ein Trade/Einstieg in den Chart dieser Zone? Eigene Zone und „Zone unbekannt“ (gleiches Symbol). */
export function belongsToZoneView(item: { symbol: string; zone: ZoneMatch }, symbol: string, magic: number | undefined): boolean {
  if (item.symbol.toUpperCase() !== symbol.toUpperCase()) return false;
  if (item.zone.kind === 'unknown') return true;
  return item.zone.kind === 'zone' && magic !== undefined && item.zone.magic === magic;
}
