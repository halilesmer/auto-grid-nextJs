/**
 * Canlı, yalnız okuma (FRM-39): formasyon işlem durumlarını geçmişte mum mum tarar ("o tarihte ne görünürdü").
 *
 * Mumlar canlı worker'dan GET /market/{id}/rates ile okunur (yalnız okuma, art arda, aynı anda bir istek).
 * Formasyon kütüphanesi Playwright'ın node tarafında doğrudan çağrılır: `FormationContext` + `scanFormations`,
 * `/chart` sayfasının kullandığı kurulumun aynısı. Ana zaman dilimi H4 ve H1; bağlam için komşuları da yüklenir
 * (H4: D1 ve H1, H1: H4 ve M15).
 *
 * Sayımlar bilgi olarak yazdırılır ve test-results/formation-history/ altına JSON olarak kaydedilir (commit edilmez).
 * Değişmez ihlali varsa spec kırmızı olur.
 *
 * Ayarlar (ortam değişkeni): FORMATION_HISTORY_BARS_H4 / _H1 (ana mum sayısı; varsayılan 1560 / 6240 = bir yıl),
 * FORMATION_HISTORY_STEP_H4 / _H1 (her n. mumda tara, varsayılan 1), FORMATION_HISTORY_SYMBOLS (virgüllü liste).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { barsOf, TIMEFRAME_SEC, type MissingRange } from '../../src/lib/analysis/candles';
import type { RatesResponse } from '../../src/services/marketApi';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { ABCD_PARAMS, DEFAULT_TREND_SETTINGS, HISTORY_DAYS, type ContextTimeframe } from '../../src/lib/formation/params';
import { setFormationDiag, type DiagEvent } from '../../src/lib/formation/diag';
import { scanFormations, type ScanFormation, type ScanHit } from '../../src/lib/formation/scan';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import { remeasureAtVanish, vanishVerdict, type VanishForm } from '../fixtures/formation-vanish';
import { dReached, shapeOf } from '../../src/lib/formation/abcd';
import { cLegOf, lowerAbcdAt, lowerCandleAt, noPeakDivergence } from '../../src/lib/formation/cLeg';
import { closesBeyond, outward, probeFractal, wickEnd, otherSide } from '../../src/lib/formation/frz';
import { buildEnv, dirSide, envFor, neighborTf, shareEnv } from '../../src/lib/formation/reasons';
import { reversalCandleAt } from '../../src/lib/formation/reversal';
import { engulfZones } from '../../src/lib/formation/sig';
import { pipOf } from '../../src/lib/formation/xabcd';
import { outcomesOf, realizedOutcomesOf } from '../../src/lib/formation/trade';
import { weeklyFromDaily } from '../../src/lib/formation/weekly';
import type { FormationBar, Side, Trade } from '../../src/lib/formation/types';
import { expect, test } from './live';

/** Bir yıl: H4 ~1560 ana mum, H1 ~6240 (hafta sonu hariç, 52 hafta × 5 gün) */
const BARS: Record<'H4' | 'H1', number> = {
  H4: Number(process.env.FORMATION_HISTORY_BARS_H4) || 1560,
  H1: Number(process.env.FORMATION_HISTORY_BARS_H1) || 6240,
};
const STEPS: Record<'H4' | 'H1', number> = {
  H4: Math.max(1, Number(process.env.FORMATION_HISTORY_STEP_H4) || 1),
  H1: Math.max(1, Number(process.env.FORMATION_HISTORY_STEP_H1) || 1),
};
/** Bir istekte en çok bu kadar gün (worker'a parça parça yük) */
const CHUNK_DAYS = 60;
const PREFERRED = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDCAD'];
const FALLBACKS = ['USDCAD', 'USDCHF', 'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'NZDUSD', 'EURAUD'];
const DAY = 86400;
const HARMONICS = ['GAR', 'BAT', 'BUT', 'CRB'] as const;
const FORMS: ScanFormation[] = ['ABCD', ...HARMONICS];
type MainTf = 'H4' | 'H1';
const MAIN_TFS: MainTf[] = (process.env.FORMATION_HISTORY_TFS ? process.env.FORMATION_HISTORY_TFS.split(',') : ['H4', 'H1']).filter((x): x is MainTf => x === 'H4' || x === 'H1');
/** Özetteki bayrak ve sayaçların tek cümlelik tanımı */
const FLAG_DEFS: Record<string, string> = {
  tpBig: 'Bir AB=CD adayı taramanın herhangi bir durumunda büyük hedef (üçte bir üçte bir üçte bir) taşıdı.',
  earlyReversal: 'Bir AB=CD adayı herhangi bir durumda erken dönüş işlemi (earlyReversalOf null değil) taşıdı.',
  reentry: 'Bir AB=CD adayının ilk işlemi TP1 ve TP2 aldı ve fiyat sonra D’deki Engulf bölgesine döndü; yeniden giriş değerleri üretildi.',
  reentryTarget2: 'Yeniden girişte ikinci hedef (reentry.target2, son dip/tepe bölgesi) dolu.',
  reentryTp1Only: 'İlk işlem yalnız TP1 aldı (TP2 almadı) ve fiyat sonra D’deki Engulf bölgesine döndü; değer yok, yalnız uyarı.',
  'diag.earlyBand': 'Erken dönüş Stufe 3 nach Grund (FORMATION_HISTORY_EARLY=1; AB=CD-only). stateReasons = Tarama-Zustände (Stufe 2, nicht 3) nach Grund: noBand = Band leer; notYet = Band da, D hat −0,272 nicht erreicht; other. candidateReasons = Kandidaten, die Stufe 3 nie erreichten, nach letztem Grund. candidateDepth = deren Korrekturtiefe; notYetMaxProgress = größter Weg C→−0,272 des D.',
  'diag.early.sN': 'Erken dönüş eleme basamağı N: s1 D var ve seviye 1 yok; s2 + geçersiz değil; s3 + D −0,272 bandında; s4 + D mumunun dokunduğu işlem yönlü bölge; s5 + D’den sonra Engulf; s6 + hacimce güçlü; s7 + Engulf bölgeye dokunuyor; s8 + stop girişin doğru tarafında (işlem oluştu). states = tarama durumu, keys = ayrı aday.',
  'probableC.k1': 'Olası C, katman K1: AB=CD adayının son iki dönüm noktası A, B (B en son dönüm noktası); kapanan t mumu C yönünde fraktalin sol yarısı (solda iki komşu, hiçbiri C ucunun ötesinde kapanmamış, sağ komşu yok) ve düzeltme derinliği ABCD-04..06 sınırlarında.',
  'probableC.k2': 'Olası C, katman K2: K1 ve kütüphanenin cLegOf fonksiyonu o anki veriyle (C = t mumu, D yok) null olmayan sonuç verir (aynı koşullar, aynı çağrı).',
  'probableC.outcome': 'verified = t+2 mumu kapanınca aynı C ile (aynı A, B, C zamanı ve yön) C ayağı bölümü doğmuş; falseAlarm = doğmamış (neden ayrı); bornLater = t+2de doğmadı ama t+3..t+12 içinde doğdu; neverBorn = t+12 içinde doğmadı.',
  'probableC.missed': 'Kaçırılan mesafe = (t+2 kapanışı − olası C anındaki giriş) C ayağı yönünde; pozitif = fiyat girişi kâr yönünde geçti; R = giriş–stop mesafesi; buyable = kaçırılan ≤ 0 (fiyat girişin alınabilir tarafında). Giriş yalnız olası anda cLeg.entry doluysa vardır.',
  'diag.reentryExits': 'reentryOf çağrısı (ilk işlemde TP1 alınmışken) hangi çıkışla bitti: noTpIdx = TP1/TP2 indeksi yok; noZoneAtD = D’ye dokunan, D’den önce oluşmuş Engulf bölgesi yok; allZonesConsumed = tüm bölgeler kapanışla tüketilmiş; noTouchAfterTp = bölge duruyor ama TP’den sonra dokunuş yok; tp1Only; reentry.',
};
/**
 * FORMATION_HISTORY_PROBABLE=1: "olası C" ölçümü (yalnız ölçer, kütüphaneyi değiştirmez). Yalnız AB=CD hesaplanır
 * (FORMATION_HISTORY_ABCD_ONLY=1 ile aynı yol: `analyzeAbcd`, `scanFormations`in AB=CD kolunun kendisi); harmonikler sıfır kalır.
 */
const PROBABLE = process.env.FORMATION_HISTORY_PROBABLE === '1';
const EARLY_BAND = process.env.FORMATION_HISTORY_EARLY === '1';
const ABCD_ONLY = PROBABLE || EARLY_BAND || process.env.FORMATION_HISTORY_ABCD_ONLY === '1';
const OUT_DIR = process.env.FORMATION_HISTORY_OUT || path.resolve(__dirname, '../../test-results/formation-history');

/** [tf, geçmiş gün] */
type Span = Partial<Record<'D1' | 'H4' | 'H1' | 'M15', number>>;

/** Ana mum sayısı → takvim günü (hafta sonu payıyla) */
const daysOf = (tf: MainTf, n: number) => Math.ceil(((n * TIMEFRAME_SEC[tf]) / DAY) * (7 / 5)) + 3;

interface Loaded {
  bars: FormationBar[];
  missing: MissingRange[];
  liveFrom: number | null;
}

async function loadRates(
  get: (p: string) => Promise<RatesResponse>,
  accountId: string,
  symbol: string,
  tf: 'D1' | 'H4' | 'H1' | 'M15',
  from: number,
  to: number,
): Promise<Loaded> {
  const tfSec = TIMEFRAME_SEC[tf];
  const bars: FormationBar[] = [];
  const missing: MissingRange[] = [];
  let liveFrom: number | null = null;
  let cursor = Math.floor(from / tfSec) * tfSec;
  const end = Math.ceil(to / tfSec) * tfSec;
  while (cursor < end) {
    const chunkEnd = Math.min(end, cursor + CHUNK_DAYS * DAY);
    const q = new URLSearchParams({ symbol, timeframe: tf, from: String(cursor), to: String(chunkEnd) });
    const page = await get(`/market/${encodeURIComponent(accountId)}/rates?${q}`);
    const cols = barsOf(page, tfSec);
    bars.push(...cols.bars);
    missing.push(...page.missing, ...cols.invalid);
    liveFrom = page.live_from ?? liveFrom;
    cursor = page.next_from !== null && page.next_from > cursor && page.next_from < chunkEnd ? page.next_from : chunkEnd;
  }
  return { bars, missing, liveFrom };
}

// ---------- sayaçlar ----------

interface Violation {
  count: number;
  first?: Record<string, unknown>;
  /** ilk 3 örnek */
  firsts?: Record<string, unknown>[];
  by?: Record<string, number>;
}

class Tally {
  readonly violations: Record<string, Violation> = {};
  readonly counts: Record<string, number> = {};
  readonly lists: Record<string, number[]> = {};
  violate(name: string, example: Record<string, unknown>) {
    const v = (this.violations[name] ??= { count: 0 });
    v.count++;
    const part = [example.label, example.side].filter((x) => typeof x === 'string').join('.');
    if (part) {
      v.by ??= {};
      v.by[part] = (v.by[part] ?? 0) + 1;
    }
    v.first ??= example;
    if ((v.firsts ??= []).length < 3) v.firsts.push(example);
  }
  inc(name: string, by = 1) {
    this.counts[name] = (this.counts[name] ?? 0) + by;
  }
  push(name: string, value: number) {
    (this.lists[name] ??= []).push(value);
  }
}

const finite = (x: unknown): boolean => {
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every(finite);
  if (x && typeof x === 'object') return Object.values(x).every(finite);
  return true;
};
const same = (a: number | null | undefined, b: number | null | undefined) =>
  a === b || (a != null && b != null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));
const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16);

interface Example {
  kind: string;
  symbol: string;
  tf: MainTf;
  form: string;
  at: number;
  atText: string;
  side: Side;
  note?: string;
}

/** Zustand eines Kandidaten über die Scans (2026-11-20): Stand nur vorwärts, Not-SL fest ab dem Einstieg */
interface RunState {
  lastKind?: string;
  notSl?: { v: number | null; at: number };
}
const STATUS_RANK: Record<string, number> = { open: 0, tp1: 1, tp12: 2, tp123: 3, stopped: 9, breakeven: 9 };

interface AbcdKey extends RunState {
  firstAt: number;
  entry?: { entry: number; stop: number; hasBig: boolean; at: number };
  lastStatus?: string;
  evers: Set<string>;
  statusEver: Set<string>;
  cLegFirstAt?: number;
  cLegCTime?: number;
  lastTrade?: Trade;
  lastAt: number;
}

interface HarmKey extends RunState {
  firstAt: number;
  reached?: { entry: number; stop: number; dPrice: number; at: number };
  dMoved: number;
  lastAt: number;
}

/**
 * Invarianten eines eingegangenen Handels (`trade.status` gesetzt), je Scan:
 * (a) der Stand geht nicht zurück: gestoppt und Rest am Einstieg sind endgültig, TP1 → offen und TP1 und TP2 → TP1 gibt es nicht;
 * (b) die Ziele liegen auf der Gewinnseite und sind geordnet (TP1 vor TP2 vor dem großen Ziel), der Not-SL ändert sich nach dem Einstieg nicht.
 */
function checkRun(tally: InstanceType<typeof Tally>, k: RunState, c: { side: Side }, t: Trade, ctx: { symbol: string; tf: MainTf; at: number; key: string; form: string }) {
  const where = { form: ctx.form, symbol: ctx.symbol, tf: ctx.tf, key: ctx.key, at: iso(ctx.at) };
  const kind = t.status!.kind;
  if (k.lastKind !== undefined && k.lastKind !== kind) {
    const was = STATUS_RANK[k.lastKind] ?? 0;
    const now = STATUS_RANK[kind] ?? 0;
    // Erlaubt: aufwärts im Rang; Rest am Einstieg (breakeven) nach TP1 oder TP1 und TP2 mit großem Ziel
    const terminalWas = was === 9;
    const ok = !terminalWas && (now > was || (kind === 'breakeven' && was >= 1));
    if (!ok) tally.violate('statusWentBack', { ...where, was: k.lastKind, now: kind });
  }
  k.lastKind = kind;
  if (t.entry !== null) {
    const profit = (p: number) => (c.side === 'buy' ? p - t.entry! : t.entry! - p);
    const beyond = (far: number, near: number) => (c.side === 'buy' ? far > near : far < near);
    const goals: [string, number | null | undefined][] = [['tp1', t.tp1], ['tp1AtEntry', t.tp1AtEntry], ['tp2', t.tp2], ['tp2AtEntry', t.tp2AtEntry], ['tpBig', t.tpBig], ['tpBigAtEntry', t.tpBigAtEntry]];
    // Die koşan Ziele (tp1, tp2, tpBig) laufen mit dem Extrem weiter und sind nach dem Ende des Handels bedeutungslos (gestoppt, Rest am Einstieg);
    // geprüft werden sie nur, solange sie zählen: TP1/TP2 bis TP1 und TP2 erreicht sind, das große Ziel bis es erreicht ist
    const live = (name: string): boolean => {
      if (name === 'tp1' || name === 'tp2') return kind === 'open' || kind === 'tp1';
      if (name === 'tpBig') return kind !== 'stopped' && kind !== 'breakeven' && kind !== 'tp123';
      return true;
    };
    for (const [name, v] of goals) if (live(name) && v != null && !(profit(v) > 0)) tally.violate('targetNotOnProfitSide', { ...where, label: `${ctx.form}.${name}.${kind}`, name, value: v, entry: t.entry, side: c.side });
    // Zählpreis von TP1/TP2: ein Ziel, das im Verlust liegt, darf nie als erreicht zählen (tradeStatus.ts verschiebt die Ziele mit jedem neuen Extrem)
    for (const [name, v] of [['tp1Fill', t.status!.tp1Fill], ['tp2Fill', t.status!.tp2Fill]] as const) {
      if (v !== undefined && !(profit(v) > 0)) tally.violate('fillOnLossSide', { ...where, label: `${ctx.form}.${name}.${kind}`, name, value: v, entry: t.entry, stop: t.stop, side: c.side });
    }
    const order: [string, number | null | undefined, string, number | null | undefined][] = [
      ['tp2', t.tp2, 'tp1', t.tp1],
      ['tp2AtEntry', t.tp2AtEntry, 'tp1AtEntry', t.tp1AtEntry],
      ['tpBig', t.tpBig, 'tp2', t.tp2],
      ['tpBigAtEntry', t.tpBigAtEntry, 'tp2AtEntry', t.tp2AtEntry],
    ];
    for (const [far, fv, near, nv] of order) if (fv != null && nv != null && !beyond(fv, nv)) tally.violate('targetsNotOrdered', { ...where, label: `${far}.${kind}`, far, farValue: fv, near, nearValue: nv, side: c.side });
  }
  if (!k.notSl) k.notSl = { v: t.emergencyStop, at: ctx.at };
  else if (!same(k.notSl.v, t.emergencyStop)) tally.violate('emergencyStopChanged', { ...where, firstAt: iso(k.notSl.at), was: k.notSl.v, now: t.emergencyStop });
}

/**
 * Alle Zeiteinheiten des Kontexts (1120-A13.8): jeder Kandidat mit A, B, C wird über die Scans verfolgt (Schlüssel: Zeiteinheit, Form, Seite, Punkte).
 * - `entryChanged`: nach dem Einstieg (Stand oder Erken dönüş gesetzt) ändern sich Einstieg, Stop oder Einstiegsart (früher Rückkehr / normal) nicht;
 * - `candidateVanished`: ein Kandidat mit Einstieg fehlt in einem späteren Scan ganz; fällt sein erster Punkt aus dem Verlaufsfenster der Zeiteinheit
 *   (`HISTORY_DAYS`), zählt das nicht. Ob der Handel beendet war, zählt zur Zeit des Verschwindens: neu gemessen mit denselben Punkten und nur mit
 *   Kerzen bis dahin (1122-A1.3.2, `remeasureAtVanish`); die Neben-Zeiteinheiten sieht der Scan nur bei jedem Schritt;
 * - `hiddenTrades`: AB=CD-Kandidaten mit eingegangenem Handel, die ein laufender Handel derselben Zeiteinheit verdeckt (1122-A1.3, nur Zähler);
 * - die Invarianten von `checkRun` gelten auch für die Zeiteinheiten neben der Haupt-Zeiteinheit.
 */
interface Track extends RunState {
  tf: string;
  form: string;
  side: Side;
  firstTime: number;
  seen: number;
  /** Preise von A, B, C (für Beispiele) */
  prices: number[];
  lastSeenAt?: number;
  lastState?: string;
  /** Handel beendet (`status.endIdx` gesetzt: Stop, Rest am Einstieg, alle Ziele) */
  lastFinished?: boolean;
  lastEntry?: number | null;
  lastStop?: number | null;
  entered?: { fp: string; at: number };
  /** Punkte, wie die Suche sie zeigte (für die Neumessung beim Verschwinden) */
  points: { X?: { time: number; price: number }; A: { time: number; price: number }; B: { time: number; price: number }; C: { time: number; price: number } };
}

function trackAll(tally: InstanceType<typeof Tally>, tracks: Map<string, Track>, all: ScanHit[], mainTf: MainTf, symbol: string, at: number, scanNo: number, ctx: FormationContext, hidden: Set<string>) {
  for (const hit of all) {
    const { candidate: c, form } = hit;
    const p = c.points;
    if (!p.A || !p.B || !p.C) continue;
    const key = `${hit.tf}|${form}|${c.side}|${p.X?.time ?? ''}|${p.A.time}|${p.B.time}|${p.C.time}`;
    const d = hit.displaced;
    if (d?.trade?.entry != null && d.trade.status !== undefined && d.points.A && d.points.B && d.points.C) {
      tally.inc('hiddenTrades.states');
      hidden.add(`${hit.tf}|${form}|${d.side}|${d.points.A.time}|${d.points.B.time}|${d.points.C.time}`);
    }
    let k = tracks.get(key);
    if (!k) {
      const pt = (a: { time: number; price: number }) => ({ time: a.time, price: a.price });
      k = { tf: hit.tf, form, side: c.side, firstTime: Math.min(p.X?.time ?? Infinity, p.A.time), seen: scanNo, prices: [p.A.price, p.B.price, p.C.price], points: { ...(p.X ? { X: pt(p.X) } : {}), A: pt(p.A), B: pt(p.B), C: pt(p.C) } };
      tracks.set(key, k);
      tally.inc(`tf.${hit.tf}.candidates`);
    }
    k.seen = scanNo;
    const t = c.trade;
    if (!t) continue;
    k.lastSeenAt = at;
    k.lastState = t.status?.kind ?? (t.earlyReversal ? 'earlyReversal' : 'noStatus');
    k.lastFinished = t.status?.endIdx !== undefined;
    k.lastEntry = t.entry;
    k.lastStop = t.stop;
    const other = hit.tf !== mainTf;
    if (other) {
      if (!finite(t)) tally.violate('nonFinite', { form, symbol, tf: hit.tf, at: iso(at), trade: t });
      if (t.entry !== null && t.stop !== null) {
        const risk = c.side === 'buy' ? t.entry - t.stop : t.stop - t.entry;
        if (!(risk > 0)) tally.violate('riskNotPositive', { label: `${hit.tf}:${form}`, side: c.side, symbol, tf: hit.tf, at: iso(at), entry: t.entry, stop: t.stop });
      }
      if (t.status) checkRun(tally, k, c, t, { symbol, tf: hit.tf as MainTf, at, key, form: `${hit.tf}:${form}` });
    }
    if (t.entry !== null && (t.status !== undefined || t.earlyReversal !== undefined)) {
      const fp = JSON.stringify({ entry: t.entry, stop: t.stop, kind: t.earlyReversal ? 'early' : 'normal' });
      if (!k.entered) {
        k.entered = { fp, at };
        tally.inc(`tf.${hit.tf}.entered`);
      } else if (k.entered.fp !== fp) {
        const was = JSON.parse(k.entered.fp) as Record<string, unknown>;
        tally.violate('entryChanged', { label: `${hit.tf}:${form}`, side: c.side, symbol, tf: hit.tf, key, enteredAt: iso(k.entered.at), at: iso(at), was, now: JSON.parse(fp) });
        k.entered = { fp, at };
      }
    }
  }
  for (const [key, k] of tracks) {
    if (k.seen === scanNo) continue;
    const windowStart = at - HISTORY_DAYS[k.tf as keyof typeof HISTORY_DAYS] * DAY;
    if (k.entered && k.firstTime >= windowStart) {
      // Entscheidung 1120-A42.1: ein beendeter Handel darf aus dem Rückblick fallen (die Geschichte wird nicht neu geschrieben): Zähler, kein Verstoß.
      // Beendet heißt: schon beim letzten Scan beendet oder neu gemessen zur Zeit des Verschwindens beendet (1122-A1.3.2)
      const re = k.lastFinished ? null : remeasureAtVanish(ctx, at, { tf: k.tf as ContextTimeframe, form: k.form as VanishForm, points: k.points });
      const verdict = vanishVerdict(!!k.lastFinished, re ?? { state: null, finished: false, endTime: null });
      tally.inc(`vanished.${verdict === 'finished' ? 'finished' : 'running'}.${re?.state ?? k.lastState}`);
      if (verdict === 'finished') {
        tally.inc('finishedVanished');
        if (re) tally.inc('finishedBetweenScans');
      } else tally.violate('candidateVanished', { label: `${k.tf}:${k.form}`, side: k.side, symbol, tf: k.tf, key, enteredAt: iso(k.entered.at), vanishedAt: iso(at), lastSeenAt: k.lastSeenAt !== undefined ? iso(k.lastSeenAt) : null, lastState: k.lastState, stateAtVanish: re?.state ?? null, abcPrices: k.prices, entry: k.lastEntry, stop: k.lastStop, firstPoint: iso(k.firstTime), kind: JSON.parse(k.entered.fp).kind });
    }
    tracks.delete(key);
  }
}

function median(xs: number[]) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ---------- olası C (FORMATION_HISTORY_PROBABLE=1) ----------

/** Doğrulama penceresi: t+2 (zamanında) ve t+3..t+12 (geç) */
const PC_LATE_BARS = 12;

type PcVariant = 'base' | 'v1' | 'v2' | 'v3';

interface PcRec {
  v: PcVariant;
  /** Son dönüm noktası aynı yöndeki bir C'ydi ve olası C onun yerini alır (eski tanım bunu dışarıda bırakıyordu) */
  viaReplace: boolean;
  /** AB=CD yönü (satış: B tepe, C dip) */
  side: Side;
  /** C ayağının yönü (AB=CD'nin tersi) */
  legSide: Side;
  j: number;
  cTime: number;
  cPrice: number;
  aIdx: number;
  bIdx: number;
  depth: number;
  k2: boolean;
  variant: string | null;
  entry: number | null;
  stop: number | null;
  /** İlan anının C mumunun kapanışından gecikmesi (saat) */
  delayHours: number;
  /** İlan anındaki fiyat (V1: t+1 kapanışı; V3: ilan anında kapanan son H1; diğerleri t kapanışı) */
  announceClose: number;
  buyableAtAnnounce?: boolean;
  outcome?: 'verified' | 'falseAlarm';
  cause?: string;
  lateAfter?: number;
  missed?: number;
  missedR?: number | null;
  missedPip?: number;
  buyable?: boolean;
}

type PcHit = { candidate: ScanHit['candidate'] };

const quant = (xs: number[], q: number) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(q * (s.length - 1))];
};
const dist = (xs: number[]) => (xs.length ? { n: xs.length, p25: quant(xs, 0.25), median: quant(xs, 0.5), p75: quant(xs, 0.75), max: Math.max(...xs) } : { n: 0 });

class ProbableC {
  readonly recs: PcRec[] = [];
  private readonly pending: PcRec[] = [];
  private readonly pip: number;
  /** `AB=CD yönü|C zamanı` → neden K1 (eski tanım) dışı kaldı */
  private readonly why = new Map<string, string>();
  h1Missing = 0;
  constructor(
    private readonly ctx: FormationContext,
    symbol: string,
    private readonly tf: MainTf,
  ) {
    this.pip = pipOf(symbol);
  }

  /**
   * t anında kapanan son mumu (rightN = 1: bir önceki mumu) olası C olarak dene. Yalnız ölçer; kütüphane sonuçlarına dokunmaz.
   * Son dönüm noktası B ise (eski tanım) A, B onunla ve bir öncesidir; son dönüm noktası aynı yöndeki bir C' ise ve aday ondan daha uçtaysa,
   * aday C'nin yerini alır (kütüphanenin çizgisi de öyle yapar), B ve A bir ve iki dönüm noktası geridedir.
   */
  private probe(at: number, rightN: 0 | 1): PcRec[] {
    const tfs = this.ctx.timeframes();
    const base = tfs.length > 0 ? buildEnv(this.ctx, at, tfs[0]) : null;
    if (!base) return [];
    const env = envFor(base, this.ctx, at, this.tf);
    const view = env.views.get(this.tf);
    const trend = env.trends.get(this.tf);
    if (!view || !trend) return [];
    const bars = view.bars;
    const cur = bars.length - 1;
    const j = cur - rightN;
    const pv = trend.pivots;
    const n = pv.length;
    if (j < 3 || n < 2) return [];
    const out: PcRec[] = [];
    const Lp = pv[n - 1];
    for (const viaReplace of [false, true]) {
      const cs = viaReplace ? Lp.side : otherSide(Lp.side);
      const sideKey = `${cs === 'support' ? 'sell' : 'buy'}|${bars[j].time}`;
      const reject = (code: string) => {
        if (rightN === 0 && !viaReplace) this.why.set(sideKey, code);
        else if (rightN === 0 && !this.why.has(sideKey)) this.why.set(sideKey, `replace:${code}`);
        return null;
      };
      const B = viaReplace ? pv[n - 2] : Lp;
      const A = viaReplace ? pv[n - 3] : pv[n - 2];
      if (!B || !A) {
        reject('tooFewPivots');
        continue;
      }
      if (A.side !== cs || B.side === cs) {
        reject('sideMismatch');
        continue;
      }
      if (j <= B.idx) {
        reject('notAfterB');
        continue;
      }
      if (viaReplace && !(j > Lp.idx && outward(cs, wickEnd(bars[j], cs)) > outward(cs, Lp.price))) {
        reject('notBeyondLastPivot');
        continue;
      }
      const probe = probeFractal(bars, j, cs);
      if (probe.leftBars !== 2 || probe.rightBars !== rightN || probe.beyond !== 0) {
        reject('leftFractalFails');
        continue;
      }
      const s = shapeOf(bars, { a: { idx: A.idx, price: A.price }, b: { idx: B.idx, price: B.price }, c: { idx: j, price: wickEnd(bars[j], cs) } });
      if (s.depth === null) {
        reject('lenZero');
        continue;
      }
      if (s.depth < ABCD_PARAMS.minCorrection) {
        reject('depthBelowMin');
        continue;
      }
      if (s.depth > ABCD_PARAMS.maxCorrection) {
        reject(`depthAboveMax${s.depth > 1 ? '>1' : '<=1'}`);
        continue;
      }
      const higherTf = neighborTf(env, this.tf, -1);
      const higherDir = higherTf ? (env.trends.get(higherTf)?.dir ?? null) : null;
      const leg = cLegOf({
        bars,
        s,
        reached: dReached(s),
        early: false,
        withTrend: higherDir ? dirSide(higherDir) === s.side : null,
        noDivergence: noPeakDivergence(trend, s),
        engulfZones: engulfZones(bars, view.wide),
        zones: [...env.frz.zones, ...env.frz.reversed],
        candle: lowerCandleAt(env, this.tf, s),
        lowerAbcd: lowerAbcdAt(env, this.tf, s),
        atr: view.atr[cur] ?? null,
      });
      out.push({
        v: rightN === 1 ? 'v1' : 'base',
        viaReplace,
        side: s.side,
        legSide: s.side === 'sell' ? 'buy' : 'sell',
        j,
        cTime: bars[j].time,
        cPrice: s.c.price,
        aIdx: A.idx,
        bIdx: B.idx,
        depth: s.depth,
        k2: leg !== null && leg.variant !== null,
        variant: leg?.variant ?? null,
        entry: leg?.entry ?? null,
        stop: leg?.stop ?? null,
        delayHours: (rightN * TIMEFRAME_SEC[this.tf]) / 3600,
        announceClose: bars[cur].close,
      });
    }
    return out;
  }

  /** V2: C mumunda biten işlem yönlü dönüş mumu/Engulf (kütüphanenin `reversalCandleAt`'i, aynı zaman dilimi) */
  private reversalMet(at: number, r: PcRec): boolean {
    const tfs = this.ctx.timeframes();
    const base = tfs.length > 0 ? buildEnv(this.ctx, at, tfs[0]) : null;
    if (!base) return false;
    const env = envFor(base, this.ctx, at, this.tf);
    return reversalCandleAt(env, this.tf, r.legSide, { idx: r.j, price: r.cPrice }, [this.tf]).state === 'met';
  }

  /** V3: C ucunun H1 mumu tamamlanmış 2+2 fraktal; ilan anı = max(C mumu kapanışı, H1 fraktalının tamamlandığı an). null = H1 fraktal yok */
  private h1Announce(at: number, r: PcRec): { delayHours: number; close: number } | null {
    const tfSec = TIMEFRAME_SEC[this.tf];
    const cs = r.side === 'sell' ? 'support' : 'resistance';
    const h1 = this.ctx.view('H1', at + 3 * 3600)?.bars;
    if (!h1) {
      this.h1Missing++;
      return null;
    }
    const e = h1.findIndex((b) => b.time >= r.cTime && b.time < r.cTime + tfSec && Math.abs(wickEnd(b, cs) - r.cPrice) <= 1e-9 * Math.max(1, Math.abs(r.cPrice)));
    if (e < 0 || e + 2 >= h1.length) return null;
    const probe = probeFractal(h1.slice(0, e + 3), e, cs);
    if (probe.leftBars !== 2 || probe.rightBars !== 2 || probe.beyond !== 0) return null;
    const done = h1[e + 2].time + 3600;
    const announce = Math.max(done, at);
    const lastH1 = h1.find((b) => b.time + 3600 === announce);
    return { delayHours: (announce - at) / 3600, close: lastH1?.close ?? r.announceClose };
  }

  /** Bir tarama adımı: önce bekleyenleri çöz, sonra yeni olası C'leri dene. `hits` bu `at` anındaki AB=CD kandidatları */
  step(at: number, hits: readonly PcHit[]) {
    const tfs = this.ctx.timeframes();
    const base = tfs.length > 0 ? buildEnv(this.ctx, at, tfs[0]) : null;
    const env = base ? envFor(base, this.ctx, at, this.tf) : null;
    const bars = env?.views.get(this.tf)?.bars ?? [];
    const cur = bars.length - 1;
    const found = (r: PcRec) =>
      hits.find((h) => h.candidate.points.C?.time === r.cTime && h.candidate.side === r.side && h.candidate.points.A !== undefined && h.candidate.points.A.time === bars[r.aIdx]?.time && h.candidate.points.B?.time === bars[r.bIdx]?.time);
    for (const r of [...this.pending]) {
      const age = cur - r.j;
      const hit = found(r);
      const born = hit?.candidate.trade?.cLeg ? hit.candidate.trade.cLeg : null;
      if (age === 2) {
        if (born) {
          r.outcome = 'verified';
          if (r.entry !== null && r.stop !== null) {
            const gain = (p: number) => (r.legSide === 'buy' ? p : -p);
            const missed = gain(bars[cur].close) - gain(r.entry);
            const risk = Math.abs(r.entry - r.stop);
            r.missed = missed;
            r.missedR = risk > 0 ? missed / risk : null;
            r.missedPip = missed / this.pip;
            r.buyable = missed <= 0;
          }
        } else {
          r.outcome = 'falseAlarm';
          const cs = r.side === 'sell' ? 'support' : 'resistance';
          const pivots = env?.trends.get(this.tf)?.pivots ?? [];
          if (bars.slice(r.j + 1, cur + 1).some((b) => closesBeyond(b, r.cPrice, cs))) r.cause = 'moreExtremeBar';
          else if (!pivots.some((p) => p.idx === r.bIdx) || !pivots.some((p) => p.idx === r.aIdx)) r.cause = 'candidateGone';
          else if (!pivots.some((p) => p.idx === r.j && p.side === cs)) r.cause = 'pivotNotDrawn';
          else if (hit) r.cause = 'cLegNull';
          else r.cause = 'otherPoints';
        }
      } else if (age > 2 && r.outcome === 'falseAlarm' && r.lateAfter === undefined && born) {
        r.lateAfter = age;
      }
      if (age >= PC_LATE_BARS) this.pending.splice(this.pending.indexOf(r), 1);
    }
    const add = (r: PcRec) => {
      if (r.entry !== null) {
        const gain = (p: number) => (r.legSide === 'buy' ? p : -p);
        r.buyableAtAnnounce = gain(r.announceClose) <= gain(r.entry);
      }
      this.recs.push(r);
      this.pending.push(r);
    };
    for (const r of this.probe(at, 0)) {
      add(r);
      if (!r.k2) continue;
      if (this.reversalMet(at, r)) add({ ...r, v: 'v2' });
      const h = this.h1Announce(at, r);
      if (h) add({ ...r, v: 'v3', delayHours: h.delayHours, announceClose: h.close });
    }
    for (const r of this.probe(at, 1)) if (r.k2) add(r);
  }

  summary(bornKeys: ReadonlySet<string>) {
    const keyOf = (r: PcRec) => `${r.side}|${r.cTime}`;
    const layer = (pick: (r: PcRec) => boolean) => {
      const rs = this.recs.filter(pick);
      const done = rs.filter((r) => r.outcome !== undefined);
      const verified = done.filter((r) => r.outcome === 'verified');
      const fa = done.filter((r) => r.outcome === 'falseAlarm');
      const causes: Record<string, number> = {};
      for (const r of fa) causes[r.cause ?? 'other'] = (causes[r.cause ?? 'other'] ?? 0) + 1;
      const withEntry = verified.filter((r) => r.missed !== undefined);
      const announced = new Set(rs.map(keyOf));
      const hasEntry = rs.filter((r) => r.entry !== null);
      return {
        probable: rs.length,
        resolved: done.length,
        open: rs.length - done.length,
        verified: verified.length,
        verifiedPct: done.length ? Math.round((1000 * verified.length) / done.length) / 10 : null,
        falseAlarm: fa.length,
        falseAlarmCauses: causes,
        bornLater: fa.filter((r) => r.lateAfter !== undefined).length,
        neverBorn: fa.filter((r) => r.lateAfter === undefined).length,
        coverage: { bornCaught: [...bornKeys].filter((k) => announced.has(k)).length, bornTotal: bornKeys.size },
        delayHours: dist(rs.map((r) => r.delayHours)),
        buyableAtAnnounce: { withEntry: hasEntry.length, buyable: hasEntry.filter((r) => r.buyableAtAnnounce).length },
        missed: {
          verifiedWithEntry: withEntry.length,
          verifiedNoEntry: verified.length - withEntry.length,
          buyable: withEntry.filter((r) => r.buyable).length,
          pip: dist(withEntry.map((r) => r.missedPip!)),
          r: dist(withEntry.flatMap((r) => (r.missedR === null || r.missedR === undefined ? [] : [r.missedR]))),
        },
      };
    };
    const keysOf = (pick: (r: PcRec) => boolean) => new Set(this.recs.filter(pick).map(keyOf));
    const k1Old = keysOf((r) => r.v === 'base' && !r.viaReplace);
    const k1Fix = keysOf((r) => r.v === 'base');
    const k2Fix = keysOf((r) => r.v === 'base' && r.k2);
    const k2Old = keysOf((r) => r.v === 'base' && !r.viaReplace && r.k2);
    const born = [...bornKeys];
    const why = (miss: (k: string) => boolean) => born.filter(miss).reduce<Record<string, number>>((acc, k) => ({ ...acc, [this.why.get(k) || 'noProbe']: (acc[this.why.get(k) || 'noProbe'] ?? 0) + 1 }), {});
    return {
      k1: layer((r) => r.v === 'base' && !r.viaReplace),
      k2: layer((r) => r.v === 'base' && !r.viaReplace && r.k2),
      k1Fixed: layer((r) => r.v === 'base'),
      k2Fixed: layer((r) => r.v === 'base' && r.k2),
      v1: layer((r) => r.v === 'v1'),
      v2: layer((r) => r.v === 'v2'),
      v3: layer((r) => r.v === 'v3'),
      born: {
        distinctC: bornKeys.size,
        withoutK1: born.filter((k) => !k1Old.has(k)).length,
        withoutK2: born.filter((k) => !k2Old.has(k)).length,
        withoutK1Fixed: born.filter((k) => !k1Fix.has(k)).length,
        withoutK2Fixed: born.filter((k) => !k2Fix.has(k)).length,
      },
      bornWithoutK1Why: why((k) => !k1Old.has(k)),
      bornWithoutK1FixedWhy: why((k) => !k1Fix.has(k)),
      viaReplace: { k1: this.recs.filter((r) => r.v === 'base' && r.viaReplace).length, k2: this.recs.filter((r) => r.v === 'base' && r.viaReplace && r.k2).length },
      variants: Object.fromEntries(['zone', 'candle', 'null'].map((x) => [x, this.recs.filter((r) => r.v === 'base' && r.k2 && (r.variant ?? 'null') === x).length])),
      h1Missing: this.h1Missing,
      records: this.recs.map((r) => ({ v: r.v, viaReplace: r.viaReplace, cAt: iso(r.cTime), side: r.legSide, depth: Math.round(r.depth * 1000) / 1000, k2: r.k2, variant: r.variant, outcome: r.outcome ?? 'open', cause: r.cause, lateAfter: r.lateAfter, delayHours: r.delayHours, buyableAtAnnounce: r.buyableAtAnnounce, missedPip: r.missedPip, missedR: r.missedR, buyable: r.buyable })),
    };
  }
}

function scanSeries(symbol: string, tf: MainTf, ctx: FormationContext, mainBars: FormationBar[], examples: Example[], tp12: unknown[]) {
  const tfSec = TIMEFRAME_SEC[tf];
  const tally = new Tally();
  const abcd = new Map<string, AbcdKey>();
  const harm = new Map<string, HarmKey>();
  const tracks = new Map<string, Track>();
  /** AB=CD-Kandidaten mit Handel, die ein laufender Handel verdeckt (1122-A1.3) */
  const hidden = new Set<string>();
  const exampleKinds = new Map<string, number>();
  const addExample = (kind: string, hit: ScanHit, at: number, note?: string) => {
    const n = exampleKinds.get(kind) ?? 0;
    if (n >= 2) return;
    exampleKinds.set(kind, n + 1);
    examples.push({ kind, symbol, tf, form: hit.form, at, atText: iso(at), side: hit.candidate.side, note });
  };
  // Eleme sayaçları (diag.ts kancası): ad → tarama durumu sayısı ve ayrı aday anahtarları
  const diagKeys = new Map<string, Set<string>>();
  const countStage = (name: string, key: string) => {
    tally.inc(`diag.${name}`);
    let ks = diagKeys.get(name);
    if (!ks) diagKeys.set(name, (ks = new Set()));
    ks.add(key);
  };
  const events = new Map<string, number | string>();
  // Erken dönüş Stufe 3 (band): Grund je Tarama (letzter Aufruf gewinnt) und je Kandidat
  type BandRec = NonNullable<DiagEvent['band']>;
  const bandNow = new Map<string, BandRec>();
  const bandStates: Record<string, number> = { noBand: 0, notYet: 0, other: 0 };
  const bandCand = new Map<string, { last: BandRec['reason']; depth: number | null; maxProgress: number; reasons: Set<string> }>();
  setFormationDiag((e) => {
    if (e.fn === 'earlyBand') {
      if (e.band) bandNow.set(e.key, e.band);
      return;
    }
    const k = `${e.fn}|${e.key}`;
    const prev = events.get(k);
    if (e.fn === 'early' && typeof prev === 'number' && typeof e.step === 'number' && prev >= e.step) return;
    events.set(k, e.step);
  });
  const pc = PROBABLE ? new ProbableC(ctx, symbol, tf) : null;
  const first = Math.max(0, mainBars.length - BARS[tf]);
  const STEP = STEPS[tf];
  if (PROBABLE && STEP !== 1) throw new Error('FORMATION_HISTORY_PROBABLE=1 needs step 1 (olası C t+2 sonucunu mum mum izler)');
  let scans = 0;
  let ms = 0;
  for (let i = first; i < mainBars.length; i += STEP) {
    const at = mainBars[i].time + tfSec;
    bandNow.clear();
    const started = performance.now();
    // ABCD_ONLY: `scanFormations`in AB=CD kolu (ANALYZERS.ABCD) tek başına; aynı hitler, harmonikler hesaplanmaz
    const allHits = (
      ABCD_ONLY
        ? shareEnv(ctx, () => {
            const found = analyzeAbcd(ctx, at)
              .filter((a) => Object.keys(a.candidate.points).length > 0)
              .map((a): ScanHit => ({ form: 'ABCD', tf: a.tf, candidate: a.candidate, ...(a.displaced ? { displaced: a.displaced } : {}) }));
            pc?.step(at, found.filter((h) => h.tf === tf));
            return found;
          })
        : scanFormations(ctx, at)
    ).filter((h) => FORMS.includes(h.form));
    const hits = allHits.filter((h) => h.tf === tf);
    ms += performance.now() - started;
    scans++;
    for (const [ek, step] of events) {
      const [fn, ...rest] = ek.split('|');
      const key = rest.join('|');
      if (fn === 'early') for (let m = 3; m <= (step as number); m++) countStage(`early.s${m}`, key);
      else {
        countStage('reentry.called', key);
        countStage(`reentry.exit.${step}`, key);
      }
    }
    events.clear();
    trackAll(tally, tracks, allHits, tf, symbol, at, scans, ctx, hidden);
    for (const hit of hits) {
      const { candidate: c, form } = hit;
      const p = c.points;
      const t = c.trade;
      if (t && !finite(t)) tally.violate('nonFinite', { form, symbol, tf, at: iso(at), trade: t });
      if (form === 'ABCD') {
        if (!p.A || !p.B || !p.C) continue;
        const key = `${c.side}|${p.A.time}|${p.B.time}|${p.C.time}`;
        let k = abcd.get(key);
        if (!k) {
          k = { firstAt: at, evers: new Set(), statusEver: new Set(), lastAt: at };
          abcd.set(key, k);
          tally.inc('abcd.candidates');
        }
        k.lastAt = at;
        if (!t) continue;
        k.lastTrade = t;
        const reached = c.checks.find((x) => x.id === 'ABCD-08')?.state === 'met';
        // Erken dönüş, Stufe 1–2 (3–8 kommen aus der Kanca): D da und Level 1 nicht erreicht; Kandidat nicht ungültig
        if (p.D && !reached) {
          countStage('early.s1', key);
          if ((c.invalidBy ?? []).length === 0) {
            countStage('early.s2', key);
            const b = bandNow.get(key);
            if (b) {
              bandStates[b.reason]++;
              const bc = bandCand.get(key) ?? { last: b.reason, depth: b.depth, maxProgress: 0, reasons: new Set<string>() };
              bc.last = b.reason;
              bc.reasons.add(b.reason);
              if (b.progress !== null && b.progress > bc.maxProgress) bc.maxProgress = b.progress;
              bandCand.set(key, bc);
            }
          }
        }
        if (t.cLeg && reached) tally.violate('cLegWhileReached', { symbol, tf, at: iso(at), key });
        if (t.cLeg) {
          const cl = t.cLeg;
          tally.inc('cleg.states');
          tally.inc(`cleg.variant.${cl.variant ?? 'null'}`);
          if (k.cLegFirstAt === undefined) {
            k.cLegFirstAt = at;
            k.cLegCTime = p.C.time;
            tally.inc('cleg.born');
            tally.push('cleg.delayBars', (at - (p.C.time + tfSec)) / tfSec);
            addExample(cl.variant === 'candle' ? 'cLegCandle' : 'cLegZone', hit, at, `variant=${cl.variant}`);
          }
          if (cl.variant) addExample(cl.variant === 'candle' ? 'cLegCandle' : 'cLegZone', hit, at, `variant=${cl.variant}`);
          for (const r of cl.rows) tally.inc(`cleg.row.${r.key}.${r.state}`);
          for (const [label, e, s] of [['cLeg', cl.entry, cl.stop]] as const) {
            if (e !== null && s !== null) {
              const risk = cl.side === 'buy' ? e - s : s - e;
              if (!(risk > 0)) tally.violate('riskNotPositive', { label, side: cl.side, symbol, tf, at: iso(at), entry: e, stop: s });
            }
          }
        }
        if (t.entry !== null && t.stop !== null) {
          const risk = c.side === 'buy' ? t.entry - t.stop : t.stop - t.entry;
          if (!(risk > 0)) tally.violate('riskNotPositive', { label: 'abcd', side: c.side, symbol, tf, at: iso(at), entry: t.entry, stop: t.stop });
          const hasBig = t.tpBig !== undefined;
          if (!k.entry) k.entry = { entry: t.entry, stop: t.stop, hasBig, at };
          else {
            if (!same(k.entry.entry, t.entry) || !same(k.entry.stop, t.stop)) {
              tally.violate('abcdEntryStopChanged', { symbol, tf, key, entryAt: iso(k.entry.at), at: iso(at), was: [k.entry.entry, k.entry.stop], now: [t.entry, t.stop] });
            }
            if (k.entry.hasBig !== hasBig) {
              tally.violate('tpBigPresenceChanged', { symbol, tf, key, entryAt: iso(k.entry.at), at: iso(at), was: k.entry.hasBig, now: hasBig });
            }
          }
        }
        if (t.status) {
          checkRun(tally, k, c, t, { symbol, tf, at, key, form: 'ABCD' });
          k.lastStatus = t.status.kind;
          k.statusEver.add(t.status.kind);
          if (t.status.kind === 'tp12' || t.status.kind === 'tp123') {
            const tp12Key = `${key}|${t.status.kind}`;
            if (!k.evers.has(tp12Key)) {
              k.evers.add(tp12Key);
              const side = c.side;
              tp12.push({
                symbol, tf, at: iso(at), side, status: t.status, entry: t.entry, stop: t.stop, tp1: t.tp1, tp2: t.tp2, tp1AtEntry: t.tp1AtEntry, tp2AtEntry: t.tp2AtEntry,
                tpBig: t.tpBig, tpBigAtEntry: t.tpBigAtEntry, outcomes: outcomesOf(t, side), realized: realizedOutcomesOf(t, side, t.status),
              });
            }
          }
        }
        if (t.tpBig !== undefined && !k.evers.has('tpBig')) {
          k.evers.add('tpBig');
          addExample('tpBig', hit, at);
        }
        if (t.earlyReversal && !k.evers.has('early')) {
          k.evers.add('early');
          addExample('earlyReversal', hit, at);
        }
        if (t.reentry && !k.evers.has('reentry')) {
          k.evers.add('reentry');
          addExample('reentry', hit, at);
        }
        if (t.reentry?.target2 != null && !k.evers.has('reentry2')) {
          k.evers.add('reentry2');
          addExample('reentryTarget2', hit, at);
        }
        if (t.reentry) {
          const r = t.reentry;
          const risk = c.side === 'buy' ? r.entry - r.stop : r.stop - r.entry;
          if (!(risk > 0)) tally.violate('riskNotPositive', { label: 'reentry', side: c.side, symbol, tf, at: iso(at), entry: r.entry, stop: r.stop });
          if (r.target2 !== null) {
            if (r.target === null) tally.violate('reentryTarget2WithoutTarget', { symbol, tf, at: iso(at), target2: r.target2 });
            else if (!(Math.abs(r.target2 - r.entry) > Math.abs(r.target - r.entry))) {
              tally.violate('reentryTarget2NotFarther', { symbol, tf, at: iso(at), entry: r.entry, target: r.target, target2: r.target2 });
            }
          }
        }
        if (t.reentryTp1Only && !k.evers.has('reentryTp1Only')) k.evers.add('reentryTp1Only');
      } else {
        if (!p.X || !p.A || !p.B || !p.C) continue;
        const key = `${form}|${c.side}|${p.X.time}|${p.A.time}|${p.B.time}|${p.C.time}`;
        let k = harm.get(key);
        if (!k) {
          k = { firstAt: at, dMoved: 0, lastAt: at };
          harm.set(key, k);
          tally.inc(`${form}.candidates`);
        }
        k.lastAt = at;
        if (!t || !p.D || t.entry === null || t.stop === null) continue;
        const risk = c.side === 'buy' ? t.entry - t.stop : t.stop - t.entry;
        if (!(risk > 0)) tally.violate('riskNotPositive', { label: form, side: c.side, symbol, tf, at: iso(at), entry: t.entry, stop: t.stop });
        if (t.status) checkRun(tally, k, c, t, { symbol, tf, at, key, form });
        if (!k.reached) {
          k.reached = { entry: t.entry, stop: t.stop, dPrice: p.D.price, at };
          tally.inc(`${form}.reachedD`);
          addExample('harmonicStop', hit, at, form);
        } else {
          if (!same(p.D.price, k.reached.dPrice)) {
            k.dMoved++;
            tally.inc(`${form}.scansWithMovedD`);
          }
          if (!same(k.reached.stop, t.stop)) {
            tally.violate(`${form}.stopChanged`, { symbol, tf, key, reachedAt: iso(k.reached.at), at: iso(at), was: k.reached.stop, now: t.stop, dWas: k.reached.dPrice, dNow: p.D.price });
          }
          if ((form === 'GAR' || form === 'BAT') && !same(k.reached.entry, t.entry)) {
            tally.violate(`${form}.entryNotDLevel`, { symbol, tf, key, reachedAt: iso(k.reached.at), at: iso(at), was: k.reached.entry, now: t.entry, dNow: p.D.price });
          }
        }
      }
    }
  }
  // Özetle
  const status: Record<string, number> = {};
  const statusEver: Record<string, number> = {};
  let entered = 0;
  const flags = { tpBig: 0, earlyReversal: 0, reentry: 0, reentryTarget2: 0, reentryTp1Only: 0 };
  const cKeys = new Set<string>();
  for (const [key, k] of abcd) {
    if (k.entry) entered++;
    if (k.lastStatus) status[k.lastStatus] = (status[k.lastStatus] ?? 0) + 1;
    for (const s of k.statusEver) statusEver[s] = (statusEver[s] ?? 0) + 1;
    if (k.evers.has('tpBig')) flags.tpBig++;
    if (k.evers.has('early')) flags.earlyReversal++;
    if (k.evers.has('reentry')) flags.reentry++;
    if (k.evers.has('reentry2')) flags.reentryTarget2++;
    if (k.evers.has('reentryTp1Only')) flags.reentryTp1Only++;
    if (k.cLegCTime !== undefined) cKeys.add(`${key.split('|')[0]}|${k.cLegCTime}`);
  }
  setFormationDiag(null);
  const stage = (name: string) => ({ states: tally.counts[`diag.${name}`] ?? 0, keys: diagKeys.get(name)?.size ?? 0 });
  const names = [...diagKeys.keys()];
  const diag = {
    earlyFunnel: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((m) => [`s${m}`, stage(`early.s${m}`)])),
    reentryCalled: stage('reentry.called'),
    reentryExits: Object.fromEntries(names.filter((n) => n.startsWith('reentry.exit.')).map((n) => [n.slice('reentry.exit.'.length), stage(n)])),
  };
  // Stufe 3 (band) nach Grund: je Tarama-Zustand und je Kandidat (Kandidat = Stufe 2 erreicht, Stufe 3 nie)
  const s3Keys = diagKeys.get('early.s3') ?? new Set<string>();
  const bucketOf = (x: number | null, cuts: readonly number[]) => {
    if (x === null) return 'null';
    const i = cuts.findIndex((c) => x < c);
    if (i === 0) return `<${cuts[0]}`;
    return i === -1 ? `>=${cuts[cuts.length - 1]}` : `${cuts[i - 1]}-${cuts[i]}`;
  };
  const bucketDepth = (d: number | null) => bucketOf(d, [0.382, 0.5, 0.618, 0.678]);
  const bucketProg = (x: number) => bucketOf(x, [0.5, 0.8, 0.95]);
  const byReason: Record<string, number> = { noBand: 0, notYet: 0, other: 0 };
  const byDepth: Record<string, number> = {};
  const byDepthAll: Record<string, number> = {};
  const byProgress: Record<string, number> = {};
  const mixed = { noBandAndNotYet: 0 };
  let stage3Cands = 0;
  for (const [key, bc] of bandCand) {
    byDepthAll[bucketDepth(bc.depth)] = (byDepthAll[bucketDepth(bc.depth)] ?? 0) + 1;
    if (s3Keys.has(key)) continue;
    stage3Cands++;
    byReason[bc.last]++;
    byDepth[bucketDepth(bc.depth)] = (byDepth[bucketDepth(bc.depth)] ?? 0) + 1;
    if (bc.last === 'notYet') byProgress[bucketProg(bc.maxProgress)] = (byProgress[bucketProg(bc.maxProgress)] ?? 0) + 1;
    if (bc.reasons.has('noBand') && bc.reasons.has('notYet')) mixed.noBandAndNotYet++;
  }
  const earlyBand = {
    s2States: tally.counts['diag.early.s2'] ?? 0,
    s3States: tally.counts['diag.early.s3'] ?? 0,
    stateReasons: bandStates,
    s2Candidates: diagKeys.get('early.s2')?.size ?? 0,
    s3Candidates: s3Keys.size,
    stage3Candidates: stage3Cands,
    candidateReasons: byReason,
    candidateDepth: byDepth,
    allS2CandidateDepth: byDepthAll,
    notYetMaxProgress: byProgress,
    mixed,
  };
  const delays = tally.lists['cleg.delayBars'] ?? [];
  const probableC = pc ? pc.summary(cKeys) : undefined;
  const harmonics = Object.fromEntries(
    HARMONICS.map((h) => [
      h,
      {
        candidates: tally.counts[`${h}.candidates`] ?? 0,
        reachedD: tally.counts[`${h}.reachedD`] ?? 0,
        scansWithMovedD: tally.counts[`${h}.scansWithMovedD`] ?? 0,
        stopChanged: tally.violations[`${h}.stopChanged`]?.count ?? 0,
        entryNotDLevel: tally.violations[`${h}.entryNotDLevel`]?.count ?? 0,
      },
    ]),
  );
  const cleg = {
    born: tally.counts['cleg.born'] ?? 0,
    distinctC: cKeys.size,
    states: tally.counts['cleg.states'] ?? 0,
    variant: { zone: tally.counts['cleg.variant.zone'] ?? 0, candle: tally.counts['cleg.variant.candle'] ?? 0, null: tally.counts['cleg.variant.null'] ?? 0 },
    rows: Object.fromEntries(
      ['depth', 'trend', 'noDivergence', 'zone', 'candle', 'lowerAbcd'].map((r) => [
        r,
        { met: tally.counts[`cleg.row.${r}.met`] ?? 0, unmet: tally.counts[`cleg.row.${r}.unmet`] ?? 0, unmeasurable: tally.counts[`cleg.row.${r}.unmeasurable`] ?? 0 },
      ]),
    ),
    delayBars: delays.length ? { min: Math.min(...delays), median: median(delays), max: Math.max(...delays) } : null,
  };
  return {
    scans,
    msPerScan: Math.round(ms / Math.max(1, scans)),
    from: iso(mainBars[first].time),
    to: iso(mainBars[mainBars.length - 1].time),
    abcd: { candidates: abcd.size, entered, lastStatus: status, statusEver, ...flags },
    diag,
    earlyBand,
    cleg,
    ...(probableC ? { probableC } : {}),
    harmonics,
    finishedVanished: tally.counts.finishedVanished ?? 0,
    finishedBetweenScans: tally.counts.finishedBetweenScans ?? 0,
    hiddenTrades: { states: tally.counts['hiddenTrades.states'] ?? 0, keys: hidden.size },
    vanishedByState: Object.fromEntries(Object.entries(tally.counts).filter(([n]) => n.startsWith('vanished.')).map(([n, v]) => [n.slice('vanished.'.length), v])),
    timeframes: Object.fromEntries(['D1', 'H4', 'H1', 'M15'].map((x) => [x, { candidates: tally.counts[`tf.${x}.candidates`] ?? 0, entered: tally.counts[`tf.${x}.entered`] ?? 0 }])),
    violations: tally.violations,
  };
}

test('Formasyon geçmiş taraması: işlem durumları canlı mumlarla (salt okunur)', { tag: ['@FRM-39'] }, async ({ api, account }) => {
  test.setTimeout(8 * 60 * 60 * 1000);
  const get = (p: string) => api.get<RatesResponse>(p);

  // Ürünler: worker'ın sembol listesinden
  const listed = (await api.get<{ symbols: { name?: string }[] }>(`/symbols/${account.id}`)).symbols.map((s) => String(s.name ?? ''));
  const find = (want: string) => listed.find((n) => n === want) ?? listed.find((n) => n.startsWith(want) && n.length <= want.length + 3);
  const override = process.env.FORMATION_HISTORY_SYMBOLS?.split(',').map((s) => s.trim()).filter(Boolean);
  const wanted = override ?? [...PREFERRED, ...FALLBACKS];
  const symbols: string[] = [];
  for (const w of wanted) {
    const s = find(w);
    if (s && !symbols.includes(s)) symbols.push(s);
    if (symbols.length >= (override ? override.length : 6)) break;
  }
  expect(symbols.length, `Sembol listesinde yeterli ürün yok (bulunan: ${symbols.join(',')})`).toBeGreaterThanOrEqual(override ? override.length : 6);

  const nowSec = Math.floor(Date.now() / 1000);
  const to = (Math.floor(nowSec / DAY) + 2) * DAY;
  const result: Record<string, Record<string, ReturnType<typeof scanSeries>>> = {};
  const examples: Example[] = [];
  const tp12: unknown[] = [];
  const info: Record<string, unknown> = { symbols, bars: BARS, step: STEPS, trend: 'DEFAULT_TREND_SETTINGS', flagDefs: FLAG_DEFS, loadMs: {}, scanMs: {} };
  mkdirSync(OUT_DIR, { recursive: true });

  for (const symbol of symbols) {
    result[symbol] = {};
    const loadStarted = Date.now();
    const need: Record<MainTf, Span> = {
      H4: { D1: daysOf('H4', BARS.H4) + Math.max(HISTORY_DAYS.D1, 1100), H4: daysOf('H4', BARS.H4) + HISTORY_DAYS.H4, H1: daysOf('H4', BARS.H4) + HISTORY_DAYS.H1 },
      H1: { H4: daysOf('H1', BARS.H1) + HISTORY_DAYS.H4, H1: daysOf('H1', BARS.H1) + HISTORY_DAYS.H1, M15: daysOf('H1', BARS.H1) + HISTORY_DAYS.M15 },
    };
    const data: Partial<Record<MainTf, Partial<Record<'D1' | 'H4' | 'H1' | 'M15', Loaded>>>> = {};
    for (const tf of MAIN_TFS) {
      data[tf] = {};
      for (const [ctf, days] of Object.entries(need[tf]) as ['D1' | 'H4' | 'H1' | 'M15', number][]) {
        data[tf]![ctf] = await loadRates(get, account.id, symbol, ctf, to - days * DAY, to);
      }
    }
    (info.loadMs as Record<string, number>)[symbol] = Date.now() - loadStarted;

    for (const tf of MAIN_TFS) {
      const d = data[tf]!;
      const input: ContextInput = {};
      for (const [ctf, loaded] of Object.entries(d) as ['D1' | 'H4' | 'H1' | 'M15', Loaded][]) {
        if (ctf === 'D1') {
          input.D1 = { bars: loaded.bars, missing: loaded.missing };
          input.W1 = { bars: weeklyFromDaily(loaded.bars, loaded.missing), missing: [] };
        } else input[ctf] = { bars: loaded.bars, missing: loaded.missing };
      }
      const main = d[tf]!;
      // Laufan mum (live_from) kapalı değildir: ana mumlar yalnız kapalıları sayar
      const closed = main.bars.filter((b) => main.liveFrom === null || b.time < main.liveFrom);
      // Eksik veri sessizce atlanmaz: tarama aralığındaki eksik aralıkları her zaman dilimi için say
      const scanStart = closed[Math.max(0, closed.length - BARS[tf])].time;
      const coverage: Record<string, { bars: number; missingRanges: number; missingHours: number; reasons: Record<string, number> }> = {};
      for (const [ctf, loaded] of Object.entries(d) as ['D1' | 'H4' | 'H1' | 'M15', Loaded][]) {
        const inSpan = loaded.missing.filter((m) => m.to > scanStart);
        const reasons: Record<string, number> = {};
        for (const m of inSpan) reasons[m.reason] = (reasons[m.reason] ?? 0) + 1;
        coverage[ctf] = {
          bars: loaded.bars.length,
          missingRanges: inSpan.length,
          missingHours: Math.round(inSpan.reduce((n, m) => n + (m.to - Math.max(m.from, scanStart)) / 3600, 0)),
          reasons,
        };
      }
      ((info.coverage ??= {}) as Record<string, unknown>)[`${symbol}.${tf}`] = coverage;
      const ctx = new FormationContext(symbol, input, { trend: DEFAULT_TREND_SETTINGS });
      const t0 = Date.now();
      result[symbol][tf] = scanSeries(symbol, tf, ctx, closed, examples, tp12);
      (info.scanMs as Record<string, number>)[`${symbol}.${tf}`] = Date.now() - t0;
      const row = result[symbol][tf];
      console.log(`[formation-history] ${symbol} ${tf}: ${row.scans} tarama, ${row.msPerScan} ms/tarama, ABCD aday ${row.abcd.candidates}, C ayağı ${row.cleg.born}, ihlal ${Object.keys(row.violations).length}`);
      writeFileSync(path.join(OUT_DIR, `summary-${override ? symbols.join('+') : 'all'}.json`), JSON.stringify({ info, result, examples, tp12 }, null, 2));
    }
  }

  const failed = Object.entries(result).flatMap(([symbol, byTf]) =>
    Object.entries(byTf).flatMap(([tf, r]) => Object.entries(r.violations).map(([name, v]) => `${symbol} ${tf} ${name} x${v.count} ${JSON.stringify(v.by ?? {})} ilk: ${JSON.stringify(v.first)}`)),
  );
  console.log('[formation-history] ihlaller:\n' + (failed.join('\n') || 'yok'));
  expect(failed, 'değişmez ihlalleri').toEqual([]);
});
