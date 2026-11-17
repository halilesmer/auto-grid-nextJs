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
import { DEFAULT_TREND_SETTINGS, HISTORY_DAYS } from '../../src/lib/formation/params';
import { setFormationDiag } from '../../src/lib/formation/diag';
import { scanFormations, type ScanFormation, type ScanHit } from '../../src/lib/formation/scan';
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
  'diag.early.sN': 'Erken dönüş eleme basamağı N: s1 D var ve seviye 1 yok; s2 + geçersiz değil; s3 + D −0,272 bandında; s4 + D mumunun dokunduğu işlem yönlü bölge; s5 + D’den sonra Engulf; s6 + hacimce güçlü; s7 + Engulf bölgeye dokunuyor; s8 + stop girişin doğru tarafında (işlem oluştu). states = tarama durumu, keys = ayrı aday.',
  'diag.reentryExits': 'reentryOf çağrısı (ilk işlemde TP1 alınmışken) hangi çıkışla bitti: noTpIdx = TP1/TP2 indeksi yok; noZoneAtD = D’ye dokunan, D’den önce oluşmuş Engulf bölgesi yok; allZonesConsumed = tüm bölgeler kapanışla tüketilmiş; noTouchAfterTp = bölge duruyor ama TP’den sonra dokunuş yok; tp1Only; reentry.',
};
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

interface AbcdKey {
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

interface HarmKey {
  firstAt: number;
  reached?: { entry: number; stop: number; dPrice: number; at: number };
  dMoved: number;
  lastAt: number;
}

function median(xs: number[]) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function scanSeries(symbol: string, tf: MainTf, ctx: FormationContext, mainBars: FormationBar[], examples: Example[], tp12: unknown[]) {
  const tfSec = TIMEFRAME_SEC[tf];
  const tally = new Tally();
  const abcd = new Map<string, AbcdKey>();
  const harm = new Map<string, HarmKey>();
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
  setFormationDiag((e) => {
    const k = `${e.fn}|${e.key}`;
    const prev = events.get(k);
    if (e.fn === 'early' && typeof prev === 'number' && typeof e.step === 'number' && prev >= e.step) return;
    events.set(k, e.step);
  });
  const first = Math.max(0, mainBars.length - BARS[tf]);
  const STEP = STEPS[tf];
  let scans = 0;
  let ms = 0;
  for (let i = first; i < mainBars.length; i += STEP) {
    const at = mainBars[i].time + tfSec;
    const started = performance.now();
    const hits = scanFormations(ctx, at).filter((h) => h.tf === tf && FORMS.includes(h.form));
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
          if ((c.invalidBy ?? []).length === 0) countStage('early.s2', key);
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
  const delays = tally.lists['cleg.delayBars'] ?? [];
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
    cleg,
    harmonics,
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
