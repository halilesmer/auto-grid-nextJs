# src/utils/market_sync.py
"""MT5 → veritabanı: mumlar ve deal'ler yalnızca eksik parçalar için, ihtiyaç anında çekilir.

docs/analyse-regeln.md §3 ve §8:
- Mum aralığı durumları: complete (ilk ve son gelen mum arası), gap_confirmed (iki gelen mum
  arasındaki boşluk: hafta sonu, tatil, günlük ara), unavailable (ilk mumdan önce / son mumdan sonra
  hiçbir şey yok: 24 saat sonra yeniden denenir). Hata saklanmaz, bir dahaki istekte yeniden denenir.
- MT5'in en yeni mumu (çoğunlukla oluşmakta olan) hiçbir zaman saklanmaz ve tamam sayılmaz;
  yanıta canlı olarak eklenir.
- Canlı botu korumak için: parçalar en fazla ~1 ay M1, aynı anda tek geçmiş sorgusu (semafor),
  parçalar arasında 0,5 sn ara, her parça kendi bağlantısı ve kilidiyle (araya bot/diğer istekler girer).
"""
import json
import logging
import threading
import zlib
import time

from src.utils import market_db as db
from src.utils import mt5_market as mm
from src.utils.worker_obs import obs_log

# Zaman dilimi → (MT5 sabitinin adı, saniye)
TIMEFRAMES = {
    "M1": ("TIMEFRAME_M1", 60),
    "M5": ("TIMEFRAME_M5", 300),
    "M15": ("TIMEFRAME_M15", 900),
    "M30": ("TIMEFRAME_M30", 1800),
    "H1": ("TIMEFRAME_H1", 3600),
    "H4": ("TIMEFRAME_H4", 14400),
    "D1": ("TIMEFRAME_D1", 86400),
}
MAX_BARS = 50_000
CHUNK_BARS = 44_640  # 31 gün M1
CHUNK_PAUSE_SEC = 0.5
FETCH_WAIT_SEC = 30
DEAL_CHUNK_SEC = 366 * 86400
# Deal'lerin en yeni kenarı her seferinde yeniden eşitlenir: 24 saat örtüşme + broker farkı payı
# (broker en fazla UTC−12; farkı bilmeden "broker şimdi − 24 sa" bundan önce olamaz)
DEAL_SETTLE_SEC = 24 * 3600 + 12 * 3600
MAX_ENTRY_LOOKUPS = 200
# Mum gelmeyen bir aralık en fazla bu kadar uzunsa ara (hafta sonu + tatil) sayılır. Daha uzunsa
# terminal geçmişi henüz indiriyor olabilir: "mevcut değil" (24 saat sonra yeniden denenir), çünkü
# onaylanmış ara bir daha hiç sorulmaz
MAX_PAUSE_SEC = 4 * 86400
# Boş ama hatasız yanıt "MT5'te yok" demek değildir: terminal o zaman diliminin geçmişini henüz yüklememiş olabilir
# (MT5, geçmişi arka planda indirir/üretir; ilk istek boş döner). Boş yanıtta sembol yeniden seçilir ve
# kısa aralıkla birkaç kez daha sorulur; yine boşsa küçük zaman dilimi kontrolü (LOWER_TF) karar verir
EMPTY_RETRIES = 2
EMPTY_RETRY_PAUSE_SEC = 1
# Bir zaman diliminde mum yok görünüyorsa, bir alt zaman diliminde aynı aralıkta mum var mı diye bakılır:
# varsa üst zaman dilimi henüz yüklenmemiştir ("syncing", kaydedilmez, bir dahaki istekte yeniden sorulur)
LOWER_TF = {
    "TIMEFRAME_D1": "TIMEFRAME_H1", "TIMEFRAME_H4": "TIMEFRAME_H1", "TIMEFRAME_H1": "TIMEFRAME_M15",
    "TIMEFRAME_M30": "TIMEFRAME_M5", "TIMEFRAME_M15": "TIMEFRAME_M5", "TIMEFRAME_M5": "TIMEFRAME_M1",
}
_TF_SEC_BY_NAME = {name: sec for name, sec in TIMEFRAMES.values()}
ENTRY_IN = 0
# BKT-19: Minuten-Spread aus Ticks. Ein Tagesstück je Abruf; ein Aufruf rechnet höchstens TICK_BUDGET_SEC (unter dem
# 120-s-Timeout des Browsers), der Rest kommt als `budget` und wird beim nächsten Aufruf fortgesetzt.
TICK_BUDGET_SEC = 40
TICK_PAUSE_SEC = 0.5
TICK_DAY_SEC = 86400
TICK_LOOKBACK_SEC = 3600  # der letzte Tick vor dem Stück bestimmt den Spread am Stückanfang
# Weniger Ticks als dieser Anteil der M1-tick_volume: das Terminal lädt die Historie noch → nicht speichern
TICK_MIN_RATIO = 0.5
# BKT-20: Replay-Minuten. S: größter Spread ≥ 3 × Median der Minuten-Mittel des Stücks (mind. 30 Minuten);
# J: Bid- oder Ask-Sprung zwischen zwei Ticks ≥ 4 × Median (Punkte). Höchstens REPLAY_MAX_TICKS_DAY Ticks je Tagesstück.
REPLAY_S_RATIO = 3.0
REPLAY_J_RATIO = 4.0
REPLAY_MIN_MINUTES = 30
REPLAY_MAX_TICKS_DAY = 30_000

# BKT-23: Trigger-Minuten auf Abruf. Je Anfrage höchstens so viele Minuten und so viel Spanne; ein Abruf je 2 Stunden.
REPLAY_REQ_MAX_MINUTES = 2000
REPLAY_REQ_MAX_SPAN_SEC = 3 * 86400
REPLAY_PIECE_SEC = 7200
REPLAY_KIND_TRIGGER = "T"
REPLAY_EMPTY_CACHE_AGE_SEC = 2 * 86400  # Minuten ohne Tick nur speichern, wenn sie so alt sind (Terminal lädt evtl. noch)
# BKT-22: Kursraster (Tickschritt in Punkten), Kandidaten groß → klein; ab GRID_SHARE aller Schritte teilbar = Raster
GRID_CANDIDATES = (100, 50, 25, 20, 10, 5, 4, 2)
GRID_SHARE = 0.99
GRID_MIN_STEPS = 50
_log = logging.getLogger(__name__)
_FETCH_SLOT = threading.Semaphore(1)
# Uç parçası (canlı mumu içeren yanıt) 30 sn tekrar kullanılır: grafik her dakika ucu yeniler,
# birden fazla sekme/kullanıcı aynı anda sorsa da MT5'e en fazla 30 sn'de bir bağlanılır
TAIL_CACHE_SEC = 30
_tail_cache: dict[tuple, tuple[float, dict]] = {}
_tail_lock = threading.Lock()
# Girişi MT5'te de bulunamayan pozisyonlar (hesap başına): her istekte yeniden sorulmaz
_entry_lookups_done: dict[str, set[int]] = {}


def _align(a: int, b: int, tf_sec: int) -> tuple[int, int]:
    return a // tf_sec * tf_sec, -(-b // tf_sec) * tf_sec


def classify(bars: list[dict], a: int, b: int, tf_sec: int, latest: dict | None, has_before: bool):
    """MT5'in [a, b) için verdiği mumları sınıflandırır.

    Dönüş: (saklanacak mumlar, [(from, to, state)], canlı mum veya None).
    `latest`: MT5'teki en yeni mum (saklanmaz, aralıktaysa canlı olarak verilir).
    `has_before`: a'dan önce mum var mı.
    """
    if latest is None:  # bu sembol/zaman diliminde MT5'te hiç mum yok
        return [], [(a, b, db.STATE_UNAVAILABLE)], None
    cap = min(b, latest["time"])
    live = latest if a <= latest["time"] < b else None
    stored = [r for r in bars if a <= r["time"] < cap]
    segments = []
    if cap <= a:
        return [], [], live

    def empty(x, y, before):
        # İki tarafta da mum var ve boşluk bir tatilden uzun değil → onaylanmış ara
        pause = before and y - x <= MAX_PAUSE_SEC
        return x, y, db.STATE_GAP if pause else db.STATE_UNAVAILABLE

    if stored:
        first, last = stored[0]["time"], stored[-1]["time"]
        if first > a:
            segments.append(empty(a, first, has_before))
        segments.append((first, last + tf_sec, db.STATE_COMPLETE))
        # Son mumdan sonrası: daha yeni bir mum (latest ≥ cap) var
        if last + tf_sec < cap:
            segments.append(empty(last + tf_sec, cap, True))
    else:
        segments.append(empty(a, cap, has_before))
    return stored, segments, live


def _syncing_holes(mt5, symbol: str, tf_name: str, bars: list[dict], a: int, b: int, latest, has_before: bool):
    """Mumsuz görünen aralıklardan, bir alt zaman diliminde mum bulunanlar (üst zaman dilimi yüklenmemiş)."""
    lower = LOWER_TF.get(tf_name)
    if lower is None or latest is None:
        return []
    _, segments, _ = classify(bars, a, b, _TF_SEC_BY_NAME[tf_name], latest, has_before)
    low_tf = getattr(mt5, lower)
    holes = []
    for x, y, state in segments:
        if state == db.STATE_COMPLETE:
            continue
        # En yeni alt dilim mumu (≤ y−1) aralığın içindeyse aralıkta mum var demektir (ucuz: tek mum istenir)
        probe = mt5.copy_rates_from(symbol, low_tf, y - 1, 1)
        if probe is not None and len(probe) and x <= int(probe[-1]["time"]) < y:
            holes.append((x, y))
    return holes


def _timed_range(mt5, symbol: str, tf_name: str, tf, a: int, b: int):
    """copy_rates_range + Zeitlog (1109-R5). Verhalten unveraendert."""
    t0 = time.monotonic()
    rates = mt5.copy_rates_range(symbol, tf, a, b - 1)
    n = len(rates) if rates is not None else 0
    obs_log.info("[rates-timing] copy_rates_range %s %s bars=%d took=%.2fs", symbol, tf_name.replace("TIMEFRAME_", ""), n,
                 time.monotonic() - t0)
    return rates


def _fetch_chunk(account: dict, symbol: str, tf_name: str, a: int, b: int) -> dict:
    """Tek bağlantı/kilit altında: [a, b) mumları, en yeni mum ve a'dan önce mum var mı."""

    def collect(mt5):
        acc = mm._check_account(mt5, account)
        info = mt5.symbol_info(symbol)
        if info is None:
            raise mm.MarketDataError(f"[SYMBOL] {symbol} bu hesapta bulunamadı.", status=404)
        if not getattr(info, "visible", True):
            mt5.symbol_select(symbol, True)  # Market Watch'ta olmayan sembolün geçmişi yüklenmez
        tf = getattr(mt5, tf_name)
        errors: list[str] = []
        rates = _timed_range(mt5, symbol, tf_name, tf, a, b)  # MT5: bitiş dahil
        if mm._mt5_error(mt5, "copy_rates_range", rates, errors):
            raise mm.MarketDataError(f"[RATES] {errors[0]}")
        for _ in range(EMPTY_RETRIES):
            if rates is not None and len(rates):
                break
            time.sleep(EMPTY_RETRY_PAUSE_SEC)
            mt5.symbol_select(symbol, True)
            rates = _timed_range(mt5, symbol, tf_name, tf, a, b)
            if mm._mt5_error(mt5, "copy_rates_range", rates, errors):
                raise mm.MarketDataError(f"[RATES] {errors[0]}")
        newest = mt5.copy_rates_from_pos(symbol, tf, 0, 1)
        latest = mm._bar(newest[-1]) if newest is not None and len(newest) else None
        bars = [mm._bar(r) for r in rates] if rates is not None else []
        has_before = False
        if not bars or bars[0]["time"] > a:
            before = mt5.copy_rates_from(symbol, tf, a - 1, 1)
            has_before = before is not None and len(before) > 0 and int(before[-1]["time"]) < a
        syncing = _syncing_holes(mt5, symbol, tf_name, bars, a, b, latest, has_before)
        tick, utc_at = mm._offset_reading(mt5, symbol)
        offset = mm.broker_offset(tick.time, utc_at) if tick is not None and tick.time else None
        return {
            "bars": bars, "latest": latest, "has_before": has_before, "syncing": syncing,
            "digits": mm._plain(getattr(info, "digits", None)), "point": mm._plain(getattr(info, "point", None)),
            "server": getattr(acc, "server", None), "offset": offset, "utc": utc_at,
        }

    return mm._connected(account, collect)


def minute_spread_stats(ticks, point: float, a: int, b: int) -> list[tuple[int, float, int, int]]:
    """Je Minute in [a, b) (MT5-Sekunden): (Minute, zeitgewichteter Mittelspread, größter Spread, Tickzahl), Spread in Punkten.

    Ein Spread gilt von seinem Tick bis zum nächsten (bzw. Minutenende); am Minutenanfang gilt der Spread des letzten
    Ticks davor. Ticks mit Bid/Ask 0 oder Ask < Bid zählen nicht. Minuten ohne Tick bekommen keine Zeile.
    `ticks`: alt → neu, Zeilen mit time_msc/bid/ask (dict oder numpy-Zeile).
    """
    a_ms, b_ms = a * 1000, b * 1000
    out: list[tuple[int, float, int, int]] = []
    carry = None  # Spread des letzten Ticks vor der aktuellen Minute
    cur = None  # [Minutenstart ms, Position ms, Spread seit Position, Σ Spread·ms, Σ ms, Max, Anzahl]

    def flush():
        nonlocal carry
        m, pos, sp_now, total, weight, top, count = cur
        if sp_now is not None:
            span = m + 60000 - pos
            total += sp_now * span
            weight += span
        if weight > 0:
            out.append((m // 1000, total / weight, top, count))
        carry = sp_now

    for row in ticks:
        bid, ask = float(row["bid"]), float(row["ask"])
        if not (bid > 0 and ask > 0 and ask >= bid):
            continue
        t = int(row["time_msc"])
        if t >= b_ms:
            break
        spread = round((ask - bid) / point)
        m = t - t % 60000
        if m < a_ms:  # Vorlauf: nur der Spread zählt
            carry = spread
            continue
        if cur is not None and cur[0] != m:
            flush()
            cur = None
        if cur is None:
            cur = [m, m, carry, 0.0, 0, 0, 0]
        if cur[2] is not None:
            cur[3] += cur[2] * (t - cur[1])
            cur[4] += t - cur[1]
        cur[1], cur[2] = t, spread
        cur[5] = max(cur[5], spread)
        cur[6] += 1
    if cur is not None:
        flush()
    return out


def _valid_quotes(ticks, point: float, b_ms: int | None = None):
    """(Zeit ms, Bid, Ask) in ganzen Punkten; Ticks mit Bid/Ask 0 oder Ask < Bid zählen nicht."""
    for row in ticks:
        bid, ask = float(row["bid"]), float(row["ask"])
        if not (bid > 0 and ask > 0 and ask >= bid):
            continue
        t = int(row["time_msc"])
        if b_ms is not None and t >= b_ms:
            break
        yield t, round(bid / point), round(ask / point)


def quote_grid(ticks, point: float) -> int:
    """BKT-22: Raster der Kurse in Punkten (größter Kandidat, durch den ≥ 99 % der Bid- und Ask-Schritte teilbar sind), sonst 1.

    Indizes, Öl und Metalle quotieren in festen Schritten (USOUSD 10, NDX100 25, GER40 50 Punkte); Devisen in 1 Punkt
    (kein Raster). Zu wenige Schritte (< 50) zählen nicht als Raster. Die Phase des Rasters wechselt von Tag zu Tag.
    """
    steps: list[int] = []
    prev = None
    for _, bid, ask in _valid_quotes(ticks, point):
        if prev is not None:
            for now, before in ((bid, prev[0]), (ask, prev[1])):
                if now != before:
                    steps.append(abs(now - before))
        prev = (bid, ask)
    if len(steps) < GRID_MIN_STEPS:
        return 1
    for g in GRID_CANDIDATES:
        if sum(1 for x in steps if x % g == 0) >= GRID_SHARE * len(steps):
            return g
    return 1


def minute_quote_extremes(ticks, point: float, a: int, b: int, grid: int) -> dict[int, tuple[int, int, int]]:
    """BKT-22: je Minute in [a, b) mit Tick: (höchster Ask, niedrigster Ask in ganzen Punkten, Raster der Minute).

    Nur Ticks in der Minute (der übernommene Tick der Vorminute zählt nicht). Raster der Minute = `grid`, wenn alle Bid-Kurse
    und alle Ask-Kurse der Minute je eine Restklasse mod `grid` haben, sonst 1 (Phase wechselt, ausreißender Tick).
    """
    a_ms, b_ms = a * 1000, b * 1000
    cur: dict[int, list] = {}
    for t, bid, ask in _valid_quotes(ticks, point, b_ms):
        if t < a_ms:
            continue
        m = t - t % 60000
        slot = cur.setdefault(m, [ask, ask, set(), set()])
        slot[0], slot[1] = max(slot[0], ask), min(slot[1], ask)
        if grid > 1:
            slot[2].add(bid % grid)
            slot[3].add(ask % grid)
    return {m // 1000: (hi, lo, grid if grid > 1 and len(rb) == 1 and len(ra) == 1 else 1)
            for m, (hi, lo, rb, ra) in cur.items()}


def replay_minutes(ticks, stats, point: float, a: int, b: int, max_ticks: int = REPLAY_MAX_TICKS_DAY):
    """Rollover-/Sprung-Minuten in [a, b): ([(Minute, Art 'S'|'J'|'SJ', ms im Minute, Bid, Ask)], verworfene Minuten).

    Bid/Ask in ganzen Punkten. `stats` = minute_spread_stats desselben Stücks (Median der Minuten-Mittel als Referenz).
    Der Sprung zählt auch vom letzten Tick vor der Minute (Vorlauf) zum ersten Tick der Minute. Ist mehr da als
    `max_ticks`, bleiben die Minuten mit dem größten Verhältnis zum Median.
    """
    if not stats:
        return [], 0
    means = sorted(s[1] for s in stats)
    mid = len(means) // 2
    med = means[mid] if len(means) % 2 else (means[mid - 1] + means[mid]) / 2
    if med <= 0:
        return [], 0
    top = {s[0]: s[2] for s in stats}
    use_spread = len(stats) >= REPLAY_MIN_MINUTES
    a_ms, b_ms = a * 1000, b * 1000
    minutes: dict[int, tuple[list[int], list[int], list[int]]] = {}
    jump: dict[int, float] = {}
    prev = None
    for row in ticks:
        bid, ask = float(row["bid"]), float(row["ask"])
        if not (bid > 0 and ask > 0 and ask >= bid):
            continue
        t = int(row["time_msc"])
        if t >= b_ms:
            break
        bp, ap = round(bid / point), round(ask / point)
        if t >= a_ms:
            m = t - t % 60000
            if prev is not None:
                step = max(abs(bp - prev[0]), abs(ap - prev[1]))
                if step > jump.get(m, 0):
                    jump[m] = step
            cols = minutes.setdefault(m, ([], [], []))
            cols[0].append(t - m)
            cols[1].append(bp)
            cols[2].append(ap)
        prev = (bp, ap)
    found = []
    for m, cols in minutes.items():
        s_ratio = top.get(m // 1000, 0) / med if use_spread else 0.0
        j_ratio = jump.get(m, 0) / med
        kind = ("S" if s_ratio >= REPLAY_S_RATIO else "") + ("J" if j_ratio >= REPLAY_J_RATIO else "")
        if kind:
            found.append((max(s_ratio if "S" in kind else 0, j_ratio if "J" in kind else 0), m // 1000, kind, cols))
    found.sort(key=lambda f: -f[0])
    kept, total, dropped = [], 0, 0
    for _, minute, kind, cols in found:
        if total + len(cols[0]) > max_ticks:
            dropped += 1
            continue
        total += len(cols[0])
        kept.append((minute, kind, cols[0], cols[1], cols[2]))
    kept.sort(key=lambda r: r[0])
    return kept, dropped


def encode_replay(ms: list[int], bid: list[int], ask: list[int]) -> bytes:
    return zlib.compress(json.dumps([ms, bid, ask], separators=(",", ":")).encode())


def decode_replay(blob: bytes) -> tuple[list[int], list[int], list[int]]:
    ms, bid, ask = json.loads(zlib.decompress(blob))
    return ms, bid, ask


def _fetch_tick_piece(account: dict, symbol: str, x: int, y: int, replay: bool = False) -> dict:
    """Ein Stück [x, y): Minutenstatistik aus den Ticks (Vorlauf eine Stunde davor) und Tickzahl im Stück."""

    def collect(mt5):
        mm._check_account(mt5, account)
        info = mt5.symbol_info(symbol)
        if info is None:
            raise mm.MarketDataError(f"[SYMBOL] {symbol} bu hesapta bulunamadı.", status=404)
        if not getattr(info, "visible", True):
            mt5.symbol_select(symbol, True)
        errors: list[str] = []
        rows = mt5.copy_ticks_range(symbol, x - TICK_LOOKBACK_SEC, y - 1, mt5.COPY_TICKS_ALL)
        if mm._mt5_error(mt5, "copy_ticks_range", rows, errors):
            raise mm.MarketDataError(f"[TICKS] {errors[0]}")
        rows = rows if rows is not None else []
        point = float(getattr(info, "point", 0) or 0)
        if point <= 0:
            raise mm.MarketDataError(f"[SYMBOL] {symbol} için point değeri yok.")
        inside = sum(1 for r in rows if int(r["time_msc"]) >= x * 1000)
        stats = minute_spread_stats(rows, point, x, y)
        marked, dropped = replay_minutes(rows, stats, point, x, y) if replay else ([], 0)
        extremes = minute_quote_extremes(rows, point, x, y, quote_grid(rows, point))
        # BKT-22: sa/sx/n bleiben wie BKT-19; dazu ahi/alo/g je Minute (Minuten ohne gültigen Tick haben auch keine Stat-Zeile)
        stats = [(*row, *extremes.get(row[0], (None, None, None))) for row in stats]
        return {"stats": stats, "count": inside, "replay": marked, "dropped": dropped}

    return mm._connected(account, collect)


def _tick_pieces(todo):
    """Eksik aralıkları Brokertag sınırlarında Stücke böler."""
    for a, b in todo:
        x = a
        while x < b:
            y = min(b, (x // TICK_DAY_SEC + 1) * TICK_DAY_SEC)
            yield x, y
            x = y


def _fill_tick_spread(account: dict, source: str, symbol: str, a: int, b: int, busy: bool,
                      replay: bool = False) -> list[dict]:
    """Fehlende Minuten-Spreads (und Replay-Minuten) für M1 [a, b) aus MT5 holen und speichern. Gibt `tick_missing` zurück."""
    todo, missing = db.plan_tick_spread(source, symbol, a, b, replay=replay)
    pieces = list(_tick_pieces(todo))
    if not pieces:
        return missing
    if busy:
        return missing + [{"from": x, "to": y, "reason": "busy", "checked_at": None} for x, y in pieces]
    deadline = time.monotonic() + TICK_BUDGET_SEC
    fetched = 0
    for i, (x, y) in enumerate(pieces):
        volume = sum(r.get("tick_volume") or 0 for r in db.read_rates(source, symbol, 60, x, y, MAX_BARS + 1))
        if volume == 0 and not db.read_rates(source, symbol, 60, x, y, 1):
            # Wochenende oder Pause innerhalb des Kerzenbereichs: keine Kerze, also nichts zu holen
            db.store_tick_spread(source, symbol, [], [(x, y, db.STATE_COMPLETE)], replay=replay, stats=True)
            continue
        if fetched and time.monotonic() >= deadline:
            missing += [{"from": p, "to": q, "reason": "budget", "checked_at": None} for p, q in pieces[i:]]
            break
        if fetched:
            time.sleep(TICK_PAUSE_SEC)
        if not _FETCH_SLOT.acquire(timeout=FETCH_WAIT_SEC):
            missing += [{"from": p, "to": q, "reason": "busy", "checked_at": None} for p, q in pieces[i:]]
            break
        fetched += 1
        try:
            part = _fetch_tick_piece(account, symbol, x, y, replay)
        except mm.MarketDataError as exc:
            missing.append({"from": x, "to": y, "reason": "error", "detail": exc.detail, "checked_at": None})
            continue
        finally:
            _FETCH_SLOT.release()
        if part["count"] == 0:
            db.store_tick_spread(source, symbol, [], [(x, y, db.STATE_UNAVAILABLE)], replay=replay, stats=True)
            missing.append({"from": x, "to": y, "reason": db.STATE_UNAVAILABLE, "checked_at": int(time.time())})
        elif part["count"] < TICK_MIN_RATIO * volume:
            # Das Terminal lädt die Historie vermutlich noch: nichts speichern, beim nächsten Aufruf neu versuchen
            missing.append({"from": x, "to": y, "reason": "syncing", "checked_at": None})
        else:
            marked = [(m, kind, encode_replay(ms, bid, ask)) for m, kind, ms, bid, ask in part["replay"]]
            db.store_tick_spread(source, symbol, part["stats"], [(x, y, db.STATE_COMPLETE)],
                                 replay_rows=marked, replay=replay, stats=True)
            if replay:
                # Für die Kalibrierung der Schwellen (S/J) auf dem VPS
                _log.info("tick_replay %s %s [%s,%s): %d Minuten markiert (%d Ticks), %d verworfen, %d Ticks gesamt",
                          source, symbol, x, y, len(marked), sum(len(r[2]) for r in part["replay"]),
                          part["dropped"], part["count"])
    return sorted(missing, key=lambda m: m["from"])


def _chunks(pieces, step):
    for a, b in pieces:
        x = a
        while x < b:
            yield x, min(b, x + step)
            x += step


def get_rates(account: dict, symbol: str, timeframe: str, a: int, b: int, busy: bool = False,
              tick_spread: bool = False, tick_replay: bool = False) -> dict:
    """Mumlar [a, b): eksik parçalar MT5'ten çekilir, veritabanından verilir.

    MT5'e ulaşılamaz veya hesap meşgulse veritabanındakiler + `missing` döner.
    Canlı mumu içeren yanıt TAIL_CACHE_SEC boyunca aynı istek için tekrar verilir.
    """
    tf_sec = TIMEFRAMES[timeframe][1]
    source = str(account.get("server") or "")
    a, b = _align(a, b, tf_sec)
    key = (source, symbol, timeframe, a, b, tick_spread, tick_replay)
    with _tail_lock:
        hit = _tail_cache.get(key)
        if hit and time.monotonic() - hit[0] < TAIL_CACHE_SEC:
            return hit[1]
    t_req = time.monotonic()
    result = _get_rates(account, source, symbol, timeframe, a, b, busy, tick_spread, tick_replay)
    obs_log.info("[rates-timing] get_rates %s %s bars=%d total=%.2fs", symbol, timeframe, len(result["t"]),
                 time.monotonic() - t_req)
    with _tail_lock:
        # Süresi dolanlar atılır (sözlük büyümesin)
        now = time.monotonic()
        for k in [k for k, (at, _) in _tail_cache.items() if now - at >= TAIL_CACHE_SEC]:
            del _tail_cache[k]
        # Geçici sorun (meşgul, MT5 hatası) önbellekte kalmasın: bir dahaki istek yeniden denesin
        transient = any(m["reason"] in ("busy", "error", "syncing") for m in result["missing"]) or any(
            m["reason"] in ("busy", "error", "budget", "syncing") for m in result.get("tick_missing", []))
        if result["live_from"] is not None and not transient:
            _tail_cache[key] = (now, result)
    return result


def _get_rates(account: dict, source: str, symbol: str, timeframe: str, a: int, b: int, busy: bool,
               tick_spread: bool = False, tick_replay: bool = False) -> dict:
    tf_name, tf_sec = TIMEFRAMES[timeframe]
    # Bir yanıt en fazla MAX_BARS mum: takvim süresi bunu aşarsa geri kalanı next_from ile
    end = min(b, a + MAX_BARS * tf_sec)
    todo, missing = db.plan_rates(source, symbol, tf_sec, a, end)
    fetched: dict[int, dict] = {}
    live = None
    full = False
    if todo and busy:
        missing += [{"from": x, "to": y, "reason": "busy", "checked_at": None} for x, y in todo]
    elif todo:
        t_slot = time.monotonic()
        got_slot = _FETCH_SLOT.acquire(timeout=FETCH_WAIT_SEC)
        obs_log.info("[rates-timing] fetch_slot %s %s wait=%.2fs got=%s", symbol, timeframe,
                     time.monotonic() - t_slot, got_slot)
        if not got_slot:
            missing += [{"from": x, "to": y, "reason": "busy", "checked_at": None} for x, y in todo]
        else:
            try:
                for i, (x, y) in enumerate(_chunks(todo, CHUNK_BARS * tf_sec)):
                    if i:
                        time.sleep(CHUNK_PAUSE_SEC)
                    try:
                        part = _fetch_chunk(account, symbol, tf_name, x, y)
                    except mm.MarketDataError as exc:
                        missing.append({"from": x, "to": y, "reason": "error", "detail": exc.detail,
                                        "checked_at": None})
                        continue
                    stored, segments, part_live = classify(part["bars"], x, y, tf_sec, part["latest"],
                                                           part["has_before"])
                    live = part_live or live
                    # Üst zaman dilimi yüklenmemiş (alt dilimde mum var): "yok" diye kaydetme, sonra yeniden sor
                    held = set(part["syncing"])
                    segments = [seg for seg in segments if seg[:2] not in held]
                    missing += [{"from": s, "to": t, "reason": "syncing", "checked_at": None} for s, t in sorted(held)]
                    for r in stored:
                        fetched[r["time"]] = r
                    if not db.store_rates(source, symbol, tf_sec, stored, segments):
                        full = True
                    missing += [{"from": s, "to": t, "reason": db.STATE_UNAVAILABLE, "checked_at": int(time.time())}
                                for s, t, state in segments if state == db.STATE_UNAVAILABLE]
                    db.save_symbol_meta(source, symbol, part["digits"], part["point"])
                    off = part["offset"]
                    if off and off["reliable"] and part["server"]:
                        db.log_broker_offset(part["server"], part["utc"], off["offset_sec"])
            finally:
                _FETCH_SLOT.release()

    tick_missing = _fill_tick_spread(account, source, symbol, a, end, busy, tick_replay) if tick_spread else None
    rows = db.read_rates(source, symbol, tf_sec, a, end, MAX_BARS + 1, with_ticks=tick_spread)
    if full:  # veritabanı dolu: çekilenler saklanamadı, yine de bu yanıtta verilir
        merged = {r["time"]: r for r in rows}
        merged.update(fetched)
        rows = [merged[t] for t in sorted(merged)]
    if live and a <= live["time"] < end and (not rows or rows[-1]["time"] < live["time"]):
        rows.append(live)
    next_from = end if end < b else None
    if len(rows) > MAX_BARS:
        next_from = rows[MAX_BARS]["time"]
        rows = rows[:MAX_BARS]
    meta = db.symbol_meta(source, symbol) or {}
    result = {
        "source": source,
        "symbol": symbol,
        "timeframe": timeframe,
        "from": a,
        "to": b,
        "t": [r["time"] for r in rows],
        "o": [r["open"] for r in rows],
        "h": [r["high"] for r in rows],
        "l": [r["low"] for r in rows],
        "c": [r["close"] for r in rows],
        "v": [r.get("tick_volume") for r in rows],
        "s": [r.get("spread") for r in rows],
        "live_from": live["time"] if live and rows and rows[-1] is live else None,
        "digits": meta.get("digits"),
        "point": meta.get("point"),
        "next_from": next_from,
        "missing": sorted(missing, key=lambda m: m["from"]),
        "db_full": full,
    }
    if tick_spread:
        result["sa"] = [r.get("sa") for r in rows]
        result["sx"] = [r.get("sx") for r in rows]
        # BKT-22: Ask-Extreme (ganze Punkte) und Kursraster je Minute; null = unbekannt
        result["ahi"] = [r.get("ahi") for r in rows]
        result["alo"] = [r.get("alo") for r in rows]
        result["g"] = [r.get("g") for r in rows]
        result["tick_missing"] = tick_missing
        if tick_replay:
            result["replay"] = _replay_columns(source, symbol, a, rows[-1]["time"] + 60 if rows else a)
    return result


def parse_replay_minutes(start: int, m: str) -> list[int]:
    """BKT-23: `m` = Minutenabstände, der erste zu `start`, jeder weitere zur Vorminute ("0,5,1" → start, +5, +6 Minuten).

    Gibt aufsteigende Minuten (Sekunden, MT5-Zeit) zurück. ValueError bei Formfehlern und Grenzüberschreitung."""
    if start < 0 or start % 60:
        raise ValueError("start muss eine volle Minute sein")
    parts = m.split(",") if m else []
    if not parts:
        raise ValueError("m ist leer")
    if len(parts) > REPLAY_REQ_MAX_MINUTES:
        raise ValueError(f"Höchstens {REPLAY_REQ_MAX_MINUTES} Minuten")
    out: list[int] = []
    cur = start
    for i, p in enumerate(parts):
        if not p.isdigit():
            raise ValueError("m: nur nichtnegative ganze Zahlen")
        d = int(p)
        if i and d == 0:
            raise ValueError("m: doppelte Minute")
        cur += d * 60
        out.append(cur)
    if out[-1] - out[0] > REPLAY_REQ_MAX_SPAN_SEC:
        raise ValueError("Die Minuten dürfen höchstens 3 Tage auseinanderliegen")
    return out


def tick_rows_by_minute(rows, point: float) -> dict[int, tuple[list[int], list[int], list[int]]]:
    """Ticks → {Minute (s): (ms in der Minute, Bid, Ask)} in ganzen Punkten; ungültige Quotes entfallen."""
    out: dict[int, tuple[list[int], list[int], list[int]]] = {}
    for row in rows:
        bid, ask = float(row["bid"]), float(row["ask"])
        if not (bid > 0 and ask > 0 and ask >= bid):
            continue
        t = int(row["time_msc"])
        m = t - t % 60000
        cols = out.setdefault(m // 1000, ([], [], []))
        cols[0].append(t - m)
        cols[1].append(round(bid / point))
        cols[2].append(round(ask / point))
    return out


def _fetch_minute_piece(account: dict, symbol: str, x: int, y: int) -> dict[int, tuple[list[int], list[int], list[int]]]:
    """Ticks [x, y) auf einmal; nur die Minuten-Gruppierung, kein Vorlauf (Tetik-Replay braucht keinen Spread)."""

    def collect(mt5):
        mm._check_account(mt5, account)
        info = mt5.symbol_info(symbol)
        if info is None:
            raise mm.MarketDataError(f"[SYMBOL] {symbol} bu hesapta bulunamadı.", status=404)
        if not getattr(info, "visible", True):
            mt5.symbol_select(symbol, True)
        errors: list[str] = []
        rows = mt5.copy_ticks_range(symbol, x, y - 1, mt5.COPY_TICKS_ALL)
        if mm._mt5_error(mt5, "copy_ticks_range", rows, errors):
            raise mm.MarketDataError(f"[TICKS] {errors[0]}")
        point = float(getattr(info, "point", 0) or 0)
        if point <= 0:
            raise mm.MarketDataError(f"[SYMBOL] {symbol} için point değeri yok.")
        return tick_rows_by_minute(rows if rows is not None else [], point)

    return mm._connected(account, collect)


def get_replay_minutes(account: dict, symbol: str, minutes: list[int], busy: bool = False) -> dict:
    """BKT-23: Ticks der gewünschten Minuten (Spalten wie `_replay_columns`, dazu `missing`).

    Vorhandene Zeilen (S/J aus BKT-20, frühere T) kommen aus der Datenbank; nur fehlende Minuten werden in
    2-Stunden-Stücken aus MT5 geholt und als Art T gespeichert. Minuten ohne Tick fehlen in der Antwort."""
    source = str(account.get("server") or "")
    wanted = set(minutes)
    have = {t: (kind, blob) for t, kind, blob in db.read_tick_replay(source, symbol, minutes[0], minutes[-1] + 60)
            if t in wanted}
    todo = [t for t in minutes if t not in have]
    missing: list[dict] = []
    pieces: list[tuple[int, int, list[int]]] = []
    for t in todo:
        if pieces and t < pieces[-1][0] + REPLAY_PIECE_SEC:
            pieces[-1][2].append(t)
            pieces[-1] = (pieces[-1][0], t + 60, pieces[-1][2])
        else:
            pieces.append((t, t + 60, [t]))
    if pieces and busy:
        missing = [{"from": x, "to": y, "reason": "busy"} for x, y, _ in pieces]
        pieces = []
    deadline = time.monotonic() + TICK_BUDGET_SEC
    fetched = 0
    old_before = time.time() - REPLAY_EMPTY_CACHE_AGE_SEC
    for i, (x, y, wanted_here) in enumerate(pieces):
        if fetched and time.monotonic() >= deadline:
            missing += [{"from": p, "to": q, "reason": "budget"} for p, q, _ in pieces[i:]]
            break
        if fetched:
            time.sleep(TICK_PAUSE_SEC)
        if not _FETCH_SLOT.acquire(timeout=FETCH_WAIT_SEC):
            missing += [{"from": p, "to": q, "reason": "busy"} for p, q, _ in pieces[i:]]
            break
        fetched += 1
        try:
            got = _fetch_minute_piece(account, symbol, x, y)
        except mm.MarketDataError as exc:
            if exc.status in (400, 404):  # Sembol/Konfiguration falsch: nicht als „fehlend“ verschweigen
                raise
            missing.append({"from": x, "to": y, "reason": "error", "detail": exc.detail})
            continue
        finally:
            _FETCH_SLOT.release()
        rows = []
        for t in wanted_here:
            cols = got.get(t)
            if cols:
                rows.append((t, REPLAY_KIND_TRIGGER, encode_replay(*cols)))
                have[t] = (REPLAY_KIND_TRIGGER, rows[-1][2])
            elif t < old_before:
                rows.append((t, REPLAY_KIND_TRIGGER, encode_replay([], [], [])))  # Minute hat keinen Tick: nicht erneut fragen
                have[t] = (REPLAY_KIND_TRIGGER, rows[-1][2])
        db.store_replay_minutes(source, symbol, rows)
    out = {"t": [], "kind": [], "off": [0], "ms": [], "b": [], "a": []}
    for t in minutes:
        if t not in have:
            continue
        kind, blob = have[t]
        ms, bid, ask = decode_replay(blob)
        if not ms:
            continue
        out["t"].append(t)
        out["kind"].append(kind)
        out["ms"] += ms
        out["b"] += bid
        out["a"] += ask
        out["off"].append(len(out["ms"]))
    out["missing"] = sorted(missing, key=lambda m: m["from"])
    return out


def _replay_columns(source: str, symbol: str, a: int, b: int) -> dict:
    """Replay-Minuten [a, b) sütunweise: t/kind je Minute, off = Start der Minute in ms/b/a (Länge + 1)."""
    out = {"t": [], "kind": [], "off": [0], "ms": [], "b": [], "a": []}
    for minute, kind, blob in db.read_tick_replay(source, symbol, a, b):
        ms, bid, ask = decode_replay(blob)
        out["t"].append(minute)
        out["kind"].append(kind)
        out["ms"] += ms
        out["b"] += bid
        out["a"] += ask
        out["off"].append(len(out["ms"]))
    return out


def _deal_dict(d) -> dict:
    return {k: mm._plain(getattr(d, k, None)) for k in db.DEAL_COLUMNS}


def _fetch_deals(account: dict, pieces: list[tuple[int, int]], positions: list[int]) -> dict:
    def collect(mt5):
        acc = mm._check_account(mt5, account)
        errors: list[str] = []
        deals = []
        done = []
        for x, y in pieces:
            got = mt5.history_deals_get(x, y - 1)
            if mm._mt5_error(mt5, "history_deals_get", got, errors):
                break
            deals += [_deal_dict(d) for d in got or ()]
            done.append((x, y))
        for pid in positions[:MAX_ENTRY_LOOKUPS]:
            got = mt5.history_deals_get(position=pid)
            deals += [_deal_dict(d) for d in got or ()]
        account_data = {
            "currency": getattr(acc, "currency", None),
            "balance": mm._plain(getattr(acc, "balance", None)),
            "margin_mode": mm._plain(getattr(acc, "margin_mode", None)),
        }
        return {"deals": deals, "done": done, "errors": errors, "account": account_data}

    return mm._connected(account, collect)


def _fetch_open_levels(account: dict, entries: list[dict]) -> list[dict]:
    """Eröffnungsorder je Position aus der MT5-Order-Historie: SL/TP (0 = None). MT5-Fehler → Position fehlt."""
    def collect(mt5):
        rows = []
        for e in entries:
            pid = e["position_id"]
            got = mt5.history_orders_get(position=pid)
            if mm._mt5_error(mt5, "history_orders_get", got, []):
                continue
            orders = list(got or ())
            # Bei Hedging-Konten trägt die Eröffnungsorder die Positions-ID als Ticket
            opening = next((o for o in orders if getattr(o, "ticket", None) == pid), None) \
                or next((o for o in orders if getattr(o, "ticket", None) == e.get("order")), None) \
                or (min(orders, key=lambda o: getattr(o, "time_setup", 0) or 0) if orders else None)
            sl = mm._plain(getattr(opening, "sl", None)) if opening else None
            tp = mm._plain(getattr(opening, "tp", None)) if opening else None
            rows.append({"position_id": pid, "sl": sl or None, "tp": tp or None})
        return rows

    return mm._connected(account, collect)


def get_deals(account_id: str, account: dict, a: int, b: int, busy: bool = False, resync: bool = False) -> dict:
    """Deal arşivi [a, b): eşitlenmemiş parçalar + en yeni kenar MT5'ten, sonra veritabanından."""
    settle = int(time.time()) - DEAL_SETTLE_SEC
    gaps = [(a, b)] if resync else db.deal_gaps(account_id, a, b)
    missing = []
    if gaps and busy:
        missing = [{"from": x, "to": y, "reason": "busy"} for x, y in gaps]
    elif gaps:
        pieces = list(_chunks(gaps, DEAL_CHUNK_SEC))
        try:
            got = _fetch_deals(account, pieces, [])
        except mm.MarketDataError as exc:
            missing = [{"from": x, "to": y, "reason": "error", "detail": exc.detail} for x, y in gaps]
        else:
            # En yeni kenar tamam sayılmaz: bir dahaki istekte yeniden eşitlenir
            synced = [(x, min(y, settle)) for x, y in got["done"]]
            db.store_deals(account_id, got["deals"], synced, got["account"])
            failed = db.subtract(pieces, got["done"])
            missing = [{"from": x, "to": y, "reason": "error", "detail": "; ".join(got["errors"])} for x, y in failed]
            done = _entry_lookups_done.setdefault(account_id, set())
            orphans = [p for p in db.positions_without_entry(account_id, a, b, ENTRY_IN) if p not in done]
            if orphans:
                try:
                    extra = _fetch_deals(account, [], orphans)
                    db.store_deals(account_id, extra["deals"], [])
                except mm.MarketDataError:
                    pass  # giriş deal'i olmayan pozisyon istemcide "giriş bilinmiyor" olur
                else:
                    # MT5'te de girişi olmayanlar bir daha sorulmaz
                    done.update(set(orphans[:MAX_ENTRY_LOOKUPS]) & set(db.positions_without_entry(account_id, a, b, ENTRY_IN)))
    if not busy:
        pending = db.entries_without_levels(account_id, a, b, ENTRY_IN)[:MAX_ENTRY_LOOKUPS]
        if pending:
            try:
                db.store_position_orders(account_id, _fetch_open_levels(account, pending))
            except mm.MarketDataError:
                pass  # open_sl/open_tp bleiben None; die nächste Anfrage versucht es erneut
    return {
        "account_id": account_id,
        "from": a,
        "to": b,
        "deals": db.read_deals(account_id, a, b),
        "account": db.account_meta(account_id),
        "zones": db.zone_registry(account_id),
        "missing": missing,
    }
