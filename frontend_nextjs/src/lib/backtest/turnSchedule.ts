/**
 * BKT-30 (PR-2): Canlı botun tur takvimini üreten saf fonksiyonlar (plan 1113, bt-n1-plan.md §3.1, §9 K39.1).
 * Çıktı `RunModel.botTurns` biçimindedir (`BotTurns`: `starts` + setup başına `zoneAt`, sunucu saniyesi).
 * Ağ yok, React yok. Çağrı (runJob, worker GET) PR-3'ün işi.
 *
 * İki kaynak:
 *  - `scheduleFromTelemetry` (birincil): worker tur kaydı (ENG-35, `GET /api/bot/{id}/turns`). Tur başları kesin,
 *    boş turlar dahil. Telemetri VPS UTC saatidir, emirler broker saatinde; hizalama = tam saat farkı + tek sabit kayma.
 *  - `scheduleFromLiveOrders` (yedek): telemetrisi olmayan eski pencereler. Tur başları canlı emir geçmişinden kurulur
 *    (zincir kuralı); boş turlar bir sonraki gerçek tura geriye hizalanır (orcRb: sahte kısa tur oluşmaz).
 */
import { BOT_OP_COST_S, type BotTurns } from '@/lib/backtest/botTurns';
import type { LiveOrder } from '@/lib/backtest/startState';

/** Tur başından ilk op'a (SLTP yokken) kadar okuma süresi, saniye. Ölçüm: bt-n1-plan.md §1.3 (boş tur periyodu 2,105 = LOOP 2,0 + 0,105). */
export const TURN_HEAD_S = 0.105;

/** Bir küme: birbirine bu kadar saniyeden yakın op'lar aynı turdandır (ölçüm: küme içi adım ≤ 0,23 s, tur arası ≥ 1 s) */
export const OP_CLUSTER_GAP_S = 0.8;

/** Zincir toleransı: sonraki küme önceki kümenin bitişinden ≤ LOOP + HEAD + bu kadar sonra gelirse hemen sonraki turdur */
const CHAIN_SLACK_S = 0.7;

/** Telemetride tur başına ilişkilendirilen ilk op'un gecikme penceresi (kayma tahmini); SLTP yükü pozitif uca düşer */
const PAIR_BEFORE_S = 0.5;
const PAIR_AFTER_S = 1.0;
/** Kayma tahmini için en az bu kadar eşleşen küme gerekir; altında kayma 0 sayılır ve `reliable` false olur */
export const MIN_CLOCK_PAIRS = 5;
/** Tur başı SLTP yükü bu değerin üstündeyse (ilk op'tan çıkarılan) bir SLTP yükü değil, başka bir olay sayılır */
const SLTP_MAX_S = 1.0;

/** Bir canlı op: emir kurma (P, `time_setup_msc`) ya da botun silmesi (C, state 2, `time_done_msc`); zaman broker saniyesi */
export interface LiveOp {
  time: number;
  kind: 'P' | 'C';
  magic: number;
}

const OP_COST: Record<LiveOp['kind'], number> = { P: BOT_OP_COST_S.pending, C: BOT_OP_COST_S.remove };

/** LiveOrder satırlarından op listesi (zamana göre sıralı); yalnız `magics` içindeki magic'ler ve [from, to) */
export function liveOpsFromOrders(orders: readonly LiveOrder[], magics: readonly number[], from: number, to: number): LiveOp[] {
  const wanted = new Set(magics);
  const ops: LiveOp[] = [];
  for (const o of orders) {
    if (!wanted.has(o.magic)) continue;
    ops.push({ time: o.time_setup_msc / 1000, kind: 'P', magic: o.magic });
    if (o.state === 2 && o.time_done_msc > 0) ops.push({ time: o.time_done_msc / 1000, kind: 'C', magic: o.magic });
  }
  return ops.filter((op) => op.time >= from && op.time < to).sort((a, b) => a.time - b.time);
}

/** Op'ları ≤ OP_CLUSTER_GAP_S aralıklarla kümeler (girdi zamana göre sıralı olmalı) */
export function clusterOps(ops: readonly LiveOp[]): LiveOp[][] {
  const clusters: LiveOp[][] = [];
  let current: LiveOp[] | null = null;
  for (const op of ops) {
    if (!current || op.time - current[current.length - 1].time > OP_CLUSTER_GAP_S) {
      current = [op];
      clusters.push(current);
    } else current.push(op);
  }
  return clusters;
}

/** Bir turun takvim kaydı: karar anı (tur başı), tur başından ilk op'a kadar okuma ve SLTP yükü (saniye) */
interface Turn {
  start: number;
  /** tur başından zone döngüsüne kadar sabit kısım (telemetride `pre` + HEAD, yedekte HEAD) */
  head: number;
  /** tur başı TP/SL düzeltmelerinin yükü */
  sltp: number;
}

/** Her tura, başı o tura ait olan op'ları atar: tur i = [start_i, start_{i+1}). Girdiler sıralı. */
function assignOps(starts: readonly number[], ops: readonly LiveOp[]): LiveOp[][] {
  const perTurn: LiveOp[][] = starts.map(() => []);
  let i = 0;
  for (const op of ops) {
    while (i + 1 < starts.length && starts[i + 1] <= op.time) i += 1;
    if (starts.length > 0 && op.time >= starts[0]) perTurn[i].push(op);
  }
  return perTurn;
}

/** zoneAt: tur başı + okuma + SLTP + küçük magic'li setup'ların o turdaki op maliyeti (zone sırası magic sırasıdır) */
function buildZoneAt(turns: readonly Turn[], opsPerTurn: readonly LiveOp[][], magics: readonly number[]): Record<number, number[]> {
  const zoneAt: Record<number, number[]> = {};
  for (const magic of magics) zoneAt[magic] = new Array<number>(turns.length);
  turns.forEach((turn, k) => {
    const ops = opsPerTurn[k];
    for (const magic of magics) {
      let lower = 0;
      for (const op of ops) if (op.magic < magic) lower += OP_COST[op.kind];
      zoneAt[magic][k] = turn.start + turn.head + turn.sltp + lower;
    }
  });
  return zoneAt;
}

/** Takvim sonucu: PR-3 bunu koşu protokolüne (`run.botTurns`) yazar */
export interface TurnSchedule {
  source: 'telemetry' | 'liveOrders';
  /** tur başları (broker saniyesi, artan); tüm setup'lar için ortak */
  starts: number[];
  /** setup (magic) başına zone başları; `starts` ile aynı uzunlukta */
  zoneAt: Record<number, number[]>;
  turnCount: number;
  /** zincire / tur başına hizalanan canlı op kümesi sayısı */
  alignedClusters: number;
  /** canlı op kümesi sayısı (pencerede) */
  totalClusters: number;
  /** yalnız telemetri: saat kayması tahmini */
  clock?: ClockEstimate;
  /** alt magic op sayıları nereden geldi: canlı emir geçmişi ya da BT'nin kendi op'ları (G4.1) */
  opCounts: 'live' | 'own';
}

/** Bir setup için `RunModel.botTurns` */
export const botTurnsFor = (schedule: TurnSchedule, magic: number): BotTurns => ({ starts: schedule.starts, zoneAt: schedule.zoneAt[magic] ?? schedule.starts });

// ---------------------------------------------------------------------------------------------------------------------
// Yedek kaynak: canlı emir geçmişi

/**
 * Canlı op'lardan tur takvimi (orcRb). Kural (bt-n1-plan.md §3.1):
 *  - bir küme önceki kümenin bitişinden (son op + maliyeti) ≤ LOOP + HEAD + 0,7 s sonra gelirse tur başı = önceki bitiş + LOOP (zincir);
 *  - değilse tur başı = ilk op − HEAD;
 *  - iki gerçek tur arasındaki boş turlar, bir sonraki gerçek tura geriye doğru (LOOP + HEAD) aralıkla dizilir: ilk boş tur
 *    önceki bitişten sonra serbest kalan en erken yerde değil, hizalı yerde başlar, 1,14 s'lik sahte tur oluşmaz;
 *  - son kümeden `to`'ya kadar boş turlar LOOP + HEAD periyodudur.
 * `ownOps` verilirse alt magic maliyetleri bunlardan hesaplanır (G4.1), tur başları yine canlı op'lardandır.
 */
export function scheduleFromLiveOrders(
  liveOps: readonly LiveOp[],
  magics: readonly number[],
  from: number,
  to: number,
  loopSec: number,
  opts: { ownOps?: readonly LiveOp[] } = {},
): TurnSchedule {
  const period = TURN_HEAD_S + loopSec;
  const inWindow = liveOps.filter((op) => op.time >= from && op.time < to).sort((a, b) => a.time - b.time);
  const clusters = clusterOps(inWindow);
  const starts: number[] = [];
  let end: number | null = null; // önceki kümenin bitişi
  for (const cluster of clusters) {
    const first = cluster[0].time;
    const chained = end !== null && first - end <= period + CHAIN_SLACK_S;
    const start = chained ? (end as number) + loopSec : first - TURN_HEAD_S;
    // boş turlar: bu turdan geriye doğru, önceki bitişten sonraki ilk uygun yere kadar
    const lowest = end === null ? from : (end as number) + loopSec;
    for (let k = Math.floor((start - lowest) / period); k >= 1; k -= 1) starts.push(start - k * period);
    starts.push(start);
    const last = cluster[cluster.length - 1];
    end = last.time + OP_COST[last.kind];
  }
  // son kümeden sonra
  for (let s = (end ?? from - loopSec) + loopSec; s < to; s += period) starts.push(s);
  const turns: Turn[] = starts.map((start) => ({ start, head: TURN_HEAD_S, sltp: 0 }));
  const opsForCost = opts.ownOps ? [...opts.ownOps].sort((a, b) => a.time - b.time) : inWindow;
  return {
    source: 'liveOrders',
    starts,
    zoneAt: buildZoneAt(turns, assignOps(starts, opsForCost), magics),
    turnCount: starts.length,
    alignedClusters: clusters.length,
    totalClusters: clusters.length,
    opCounts: opts.ownOps ? 'own' : 'live',
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Birincil kaynak: worker tur telemetrisi

/** `GET /api/bot/{id}/turns` yanıtı (kompakt): `t0` + `dt` farkları, UTC ms */
export interface TelemetryTurns {
  t0: number | null;
  dt: readonly number[];
  dur: readonly number[];
  kind: readonly string[];
  pre: readonly number[];
}

/** Açılmış bir telemetri turu: UTC saniye (ondalıklı), süreler saniye */
export interface DecodedTurn {
  start: number;
  dur: number;
  pre: number;
}

/** Yalnız tam turlar (`kind` t) açılır; piyasa kapalı (m), bağlantı (c) ve netting (n) turları bot kararı üretmez, atlanır */
export function decodeTurns(turns: TelemetryTurns): DecodedTurn[] {
  const out: DecodedTurn[] = [];
  if (turns.t0 === null || turns.kind.length === 0) return out;
  let ms = turns.t0;
  for (let i = 0; i < turns.kind.length; i++) {
    if (i > 0) ms += turns.dt[i - 1] ?? 0;
    if (turns.kind[i] !== 't') continue;
    out.push({ start: ms / 1000, dur: (turns.dur[i] ?? 0) / 1000, pre: (turns.pre[i] ?? 0) / 1000 });
  }
  return out;
}

/** Saat kayması tahmini: broker saati = telemetri UTC + `tzOffsetSec` + `shiftSec` */
export interface ClockEstimate {
  /** tam saat farkı (verilen) */
  tzOffsetSec: number;
  /** tam saatten sonra kalan tek sabit kayma (medyan), saniye */
  shiftSec: number;
  /** eşleşen küme çiftlerinin dağılımı (kayma etrafında): p10 / p90 sapma, saniye */
  p10: number;
  p90: number;
  /** eşleşen çift sayısı */
  pairs: number;
  /** pairs ≥ MIN_CLOCK_PAIRS */
  reliable: boolean;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)] / 2 + sorted[Math.floor(sorted.length / 2)] / 2;
};
const quantile = (values: readonly number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

/** i: en son tur, öyle ki start + tz ≤ time + PAIR_BEFORE_S (ikili arama); -1 = yok */
function turnBefore(starts: readonly number[], limit: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= limit) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Kayma tahmini. Her canlı op kümesinin ilk op'u kendi tur başından `pre` + HEAD kadar sonra gelir (SLTP yükü pozitif
 * kuyruk). Çift = (küme, ondan önceki son tur); sapma d = ilk op − (tur başı + tz + pre + HEAD). Kayma bu sapmaların
 * medyanıdır; iki geçiş: önce geniş pencere, sonra medyan etrafında. Tek sabittir, pencereye göre ayarlanmaz.
 */
export function estimateClockOffset(turns: readonly DecodedTurn[], firstOps: readonly number[], tzOffsetSec: number): ClockEstimate {
  const starts = turns.map((t) => t.start + tzOffsetSec);
  const deviations = (center: number): number[] => {
    const out: number[] = [];
    for (const f of firstOps) {
      const i = turnBefore(starts, f + PAIR_BEFORE_S - center);
      if (i < 0) continue;
      const d = f - (starts[i] + turns[i].pre + TURN_HEAD_S);
      if (d >= center - PAIR_BEFORE_S && d <= center + PAIR_AFTER_S) out.push(d);
    }
    return out;
  };
  let center = 0;
  let pairs = deviations(center);
  if (pairs.length >= MIN_CLOCK_PAIRS) {
    center = median(pairs);
    pairs = deviations(center);
  }
  const reliable = pairs.length >= MIN_CLOCK_PAIRS;
  const shiftSec = reliable ? median(pairs) : 0;
  return {
    tzOffsetSec,
    shiftSec,
    p10: quantile(pairs, 0.1) - shiftSec,
    p90: quantile(pairs, 0.9) - shiftSec,
    pairs: pairs.length,
    reliable,
  };
}

export interface TelemetryOptions {
  /** broker saati − UTC, tam saat (saniye); `GET /market/{id}/clock` `offset_sec` */
  tzOffsetSec: number;
  /** pencere (broker saniyesi); dışındaki turlar atılır */
  from: number;
  to: number;
  /** G4.1: BT'nin kendi op'ları (tüm setup'lar, zamana göre); verilirse alt magic maliyetleri bunlardan hesaplanır */
  ownOps?: readonly LiveOp[];
  /** tur başı SLTP yükü: 'live' = turun ilk canlı op'unun gecikmesinden (Sınıf B), 'none' = 0 */
  sltp?: 'live' | 'none';
}

/**
 * Telemetriden tur takvimi. Yalnız `kind=t` turları; zaman: telemetri UTC + tam saat + tek sabit kayma
 * (`estimateClockOffset`). `liveOps` iki iş görür: kayma tahmini ve (ownOps yoksa) alt magic op maliyeti.
 */
export function scheduleFromTelemetry(
  telemetry: TelemetryTurns,
  liveOps: readonly LiveOp[],
  magics: readonly number[],
  opts: TelemetryOptions,
): TurnSchedule {
  const decoded = decodeTurns(telemetry);
  const inWindow = liveOps.filter((op) => op.time >= opts.from && op.time < opts.to).sort((a, b) => a.time - b.time);
  const clusters = clusterOps(inWindow);
  const clock = estimateClockOffset(decoded, clusters.map((c) => c[0].time), opts.tzOffsetSec);
  const offset = opts.tzOffsetSec + clock.shiftSec;
  const kept = decoded.filter((t) => t.start + offset >= opts.from && t.start + offset < opts.to);
  const starts = kept.map((t) => t.start + offset);
  const opsLive = assignOps(starts, inWindow);
  // SLTP yükü: turun ilk op'u beklenenden geç geliyorsa fark (alt magic yoktur, ilk op'un öncesi yalnız TP/SL düzeltmesi)
  const turns: Turn[] = kept.map((t, k) => {
    const head = t.pre + TURN_HEAD_S;
    let sltp = 0;
    if (opts.sltp !== 'none' && opsLive[k].length > 0) {
      const d = opsLive[k][0].time - (starts[k] + head);
      if (d > 0 && d <= SLTP_MAX_S) sltp = d;
    }
    return { start: starts[k], head, sltp };
  });
  const opsForCost = opts.ownOps ? assignOps(starts, [...opts.ownOps].sort((a, b) => a.time - b.time)) : opsLive;
  return {
    source: 'telemetry',
    starts,
    zoneAt: buildZoneAt(turns, opsForCost, magics),
    turnCount: starts.length,
    alignedClusters: clock.pairs,
    totalClusters: clusters.length,
    clock,
    opCounts: opts.ownOps ? 'own' : 'live',
  };
}
