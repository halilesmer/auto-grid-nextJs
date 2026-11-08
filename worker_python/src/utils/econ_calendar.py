"""Ekonomik takvim (NWS-01): MQL5 servisinin yazdığı dosyadan okunur.

MT5 Python API'si takvimi vermez. `ops/mt5/AutoGridCalendar.mq5` bir servis olarak her dakika
`Common\\Files\\autogrid_calendar.json` dosyasını yeniden yazar (UTF-8, atomik). Burada dosya
okunur, zamanlar UTC'ye çevrilir, olaylar sıralanır ve yayın öncesi beklenti yönü hesaplanır.

Saat: olay zamanları sunucu saatindedir. Fark = `time_trade_server - time_gmt`, 15 dakikaya
yuvarlanır. Yaz saati geçişine denk gelen bir olayda (olay ile dosya yazımı arasında geçiş
varsa) 1 saatlik kayma olabilir; bilinen sınırdır.
"""
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

FILE_NAME = "autogrid_calendar.json"
ENV_FILE = "AUTOGRID_CALENDAR_FILE"
STALE_SECONDS = 300
OFFSET_STEP = 900

# Ters göstergeler: değer artarsa piyasa için kötü (işsizlik vb.). `event_code` alt dizgesiyle
# eşleşir; gerçek kodlar ancak VPS testinde görüldüğü için başlıkta da aranır.
INVERSE_KEYWORDS = ("unemployment", "jobless", "claimant", "unemployed", "initial-claims", "continuing-claims", "arbeitslos")

log = logging.getLogger(__name__)


def default_path() -> Path | None:
    env = os.environ.get(ENV_FILE)
    if env:
        return Path(env)
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "MetaQuotes" / "Terminal" / "Common" / "Files" / FILE_NAME
    return None


def _read_doc(path: Path) -> dict | None:
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    try:
        doc = json.loads(text, strict=False)
    except ValueError:
        return None
    return doc if isinstance(doc, dict) and isinstance(doc.get("events"), list) else None


def _parse_server_time(value) -> datetime | None:
    """'2026.11.10 15:30[:00]' -> naive datetime (Sunucu saati)."""
    if not isinstance(value, str):
        return None
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M"):
        try:
            return datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    return None


def server_offset_seconds(doc: dict) -> int | None:
    """Sunucu saati − GMT, 15 dakikaya yuvarlanmış; bilinmiyorsa None."""
    srv = _parse_server_time(doc.get("time_trade_server"))
    gmt = _parse_server_time(doc.get("time_gmt"))
    if srv is None or gmt is None:
        return None
    diff = (srv - gmt).total_seconds()
    return int(round(diff / OFFSET_STEP) * OFFSET_STEP)


def is_inverse(event_code: str | None, title: str | None = None) -> bool:
    hay = f"{event_code or ''} {title or ''}".lower()
    return any(k in hay for k in INVERSE_KEYWORDS)


def forecast_direction(forecast, prev, inverse: bool = False) -> str | None:
    """Beklenti, önceki değere göre: 'up' / 'down' / 'flat'; veri eksikse None. Ters göstergede yön çevrilir."""
    if not isinstance(forecast, (int, float)) or not isinstance(prev, (int, float)):
        return None
    if isinstance(forecast, bool) or isinstance(prev, bool):
        return None
    diff = forecast - prev
    if abs(diff) < 1e-9:
        return "flat"
    up = diff > 0
    if inverse:
        up = not up
    return "up" if up else "down"


def _to_event(raw: dict, offset: int) -> dict | None:
    local = _parse_server_time(raw.get("time"))
    if local is None:
        return None
    when = (local - timedelta(seconds=offset)).replace(tzinfo=timezone.utc)
    code = raw.get("event_code")
    title = raw.get("title")
    return {
        "id": raw.get("value_id"),
        "event_id": raw.get("event_id"),
        "event_code": code,
        "title": title,
        "country": raw.get("country"),
        "currency": raw.get("currency"),
        "importance": raw.get("importance"),
        "time": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "time_mode": raw.get("time_mode"),
        "sector": raw.get("sector"),
        "unit": raw.get("unit"),
        "multiplier": raw.get("multiplier"),
        "actual": raw.get("actual"),
        "forecast": raw.get("forecast"),
        "prev": raw.get("prev"),
        "revised_prev": raw.get("revised_prev"),
        "impact_type": raw.get("impact_type"),
        "forecast_direction": forecast_direction(raw.get("forecast"), raw.get("prev"), is_inverse(code, title)),
    }


def load_events(
    path: Path | None = None,
    *,
    time_from: datetime | None = None,
    time_to: datetime | None = None,
    importance: set[str] | None = None,
    currencies: set[str] | None = None,
    now: float | None = None,
) -> dict:
    """{events, stale, available, source, generated_at}; Dosya yoksa ya da bozuksa available=False."""
    path = path if path is not None else default_path()
    result = {"events": [], "stale": True, "available": False, "source": "mt5", "generated_at": None}
    if path is None:
        return result
    try:
        mtime = Path(path).stat().st_mtime
    except OSError:
        return result
    doc = _read_doc(Path(path))
    if doc is None:
        return result
    offset = server_offset_seconds(doc)
    if offset is None:
        return result

    events = [e for e in (_to_event(r, offset) for r in doc["events"] if isinstance(r, dict)) if e]
    if importance:
        events = [e for e in events if e["importance"] in importance]
    if currencies:
        events = [e for e in events if (e["currency"] or "").upper() in currencies]
    if time_from:
        lo = time_from.strftime("%Y-%m-%dT%H:%M:%SZ")
        events = [e for e in events if e["time"] >= lo]
    if time_to:
        hi = time_to.strftime("%Y-%m-%dT%H:%M:%SZ")
        events = [e for e in events if e["time"] <= hi]
    events.sort(key=lambda e: (e["time"], e["id"] or 0))

    age = (now if now is not None else time.time()) - mtime
    result.update(
        events=events,
        available=True,
        stale=age > STALE_SECONDS,
        generated_at=datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    return result
