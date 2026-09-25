"""Bir sembolün olağan işlem saatlerini mum verisinden çıkarır.

MT5 Python API'si seans bilgisi (SymbolInfoSession) vermez; bu yüzden son günlerin
M5 mumlarından, broker sunucu saatiyle, "02:00-00:00" biçiminde bir tahmin üretilir.
"""
import datetime
import time
from collections import Counter

BAR_MINUTES = 5
BAR_COUNT = 2500  # ~8 gün M5
GAP_MINUTES = 30  # bundan büyük boşluk = yeni seans
MIN_DAYS = 2
CACHE_TTL_OK = 6 * 3600
CACHE_TTL_FAIL = 600

_cache: dict[str, tuple[float, str | None]] = {}


def _fmt(minute: int) -> str:
    minute %= 1440
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _day_sessions(minutes: list[int]) -> tuple:
    """Bir günün mum dakikalarını (sıralı) seanslara böler: ((başlangıç, bitiş), ...)."""
    sessions = []
    start = prev = minutes[0]
    for m in minutes[1:]:
        if m - prev > GAP_MINUTES:
            sessions.append((start, prev + BAR_MINUTES))
            start = m
        prev = m
    sessions.append((start, prev + BAR_MINUTES))
    # Gece yarısını aşan seans (ör. 23:00-01:00) aynı günde iki parça görünür: birleştir
    if len(sessions) > 1 and sessions[0][0] == 0 and sessions[-1][1] >= 1440:
        first = sessions.pop(0)
        last = sessions.pop()
        sessions.append((last[0], first[1] + 1440))
    return tuple(sessions)


def _infer(mt5, symbol: str) -> str | None:
    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M5, 0, BAR_COUNT)
    if rates is None or len(rates) == 0:
        return None
    days: dict[datetime.date, set[int]] = {}
    for r in rates:
        dt = datetime.datetime.fromtimestamp(int(r["time"]), datetime.timezone.utc)
        days.setdefault(dt.date(), set()).add(dt.hour * 60 + dt.minute)
    today = max(days)  # son gün eksik olabilir
    per_day = [
        _day_sessions(sorted(m))
        for d, m in days.items()
        if d != today and d.weekday() < 4  # Pzt-Per; hafta sonu ve kısa Cuma hariç
    ]
    if len(per_day) < MIN_DAYS:
        return None
    sessions = Counter(per_day).most_common(1)[0][0]
    if sessions == ((0, 1440),):
        return "00:00-24:00"
    return ", ".join(f"{_fmt(a)}-{_fmt(b)}" for a, b in sessions)


def infer_trading_hours(mt5, symbol: str) -> str | None:
    """Ör. "02:00-00:00" (birden çok seans: "02:00-12:00, 13:00-00:00"); belirlenemezse None."""
    if mt5 is None or not symbol:
        return None
    now = time.time()
    hit = _cache.get(symbol)
    if hit and hit[0] > now:
        return hit[1]
    try:
        hours = _infer(mt5, symbol)
    except Exception:
        hours = None
    _cache[symbol] = (now + (CACHE_TTL_OK if hours else CACHE_TTL_FAIL), hours)
    return hours
