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
import threading
import time

from src.utils import market_db as db
from src.utils import mt5_market as mm

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
ENTRY_IN = 0
_FETCH_SLOT = threading.Semaphore(1)
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
        rates = mt5.copy_rates_range(symbol, tf, a, b - 1)  # MT5: bitiş dahil
        if mm._mt5_error(mt5, "copy_rates_range", rates, errors):
            raise mm.MarketDataError(f"[RATES] {errors[0]}")
        newest = mt5.copy_rates_from_pos(symbol, tf, 0, 1)
        latest = mm._bar(newest[-1]) if newest is not None and len(newest) else None
        bars = [mm._bar(r) for r in rates] if rates is not None else []
        has_before = False
        if not bars or bars[0]["time"] > a:
            before = mt5.copy_rates_from(symbol, tf, a - 1, 1)
            has_before = before is not None and len(before) > 0 and int(before[-1]["time"]) < a
        tick, utc_at = mm._offset_reading(mt5, symbol)
        offset = mm.broker_offset(tick.time, utc_at) if tick is not None and tick.time else None
        return {
            "bars": bars, "latest": latest, "has_before": has_before,
            "digits": mm._plain(getattr(info, "digits", None)), "point": mm._plain(getattr(info, "point", None)),
            "server": getattr(acc, "server", None), "offset": offset, "utc": utc_at,
        }

    return mm._connected(account, collect)


def _chunks(pieces, step):
    for a, b in pieces:
        x = a
        while x < b:
            yield x, min(b, x + step)
            x += step


def get_rates(account: dict, symbol: str, timeframe: str, a: int, b: int, busy: bool = False) -> dict:
    """Mumlar [a, b): eksik parçalar MT5'ten çekilir, veritabanından verilir.

    MT5'e ulaşılamaz veya hesap meşgulse veritabanındakiler + `missing` döner.
    """
    tf_name, tf_sec = TIMEFRAMES[timeframe]
    source = str(account.get("server") or "")
    a, b = _align(a, b, tf_sec)
    # Bir yanıt en fazla MAX_BARS mum: takvim süresi bunu aşarsa geri kalanı next_from ile
    end = min(b, a + MAX_BARS * tf_sec)
    todo, missing = db.plan_rates(source, symbol, tf_sec, a, end)
    fetched: dict[int, dict] = {}
    live = None
    full = False
    if todo and busy:
        missing += [{"from": x, "to": y, "reason": "busy", "checked_at": None} for x, y in todo]
    elif todo:
        if not _FETCH_SLOT.acquire(timeout=FETCH_WAIT_SEC):
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

    rows = db.read_rates(source, symbol, tf_sec, a, end, MAX_BARS + 1)
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
    return {
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
    return {
        "account_id": account_id,
        "from": a,
        "to": b,
        "deals": db.read_deals(account_id, a, b),
        "account": db.account_meta(account_id),
        "zones": db.zone_registry(account_id),
        "missing": missing,
    }
