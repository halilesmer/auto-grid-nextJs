"""Ekonomik takvim (NWS-01): MQL5 servisinin yazdığı dosyadan okunur.

MT5 Python API'si takvimi vermez. `ops/mt5/AutoGridCalendar.mq5` bir servis olarak her dakika
`Common\\Files\\autogrid_calendar_<dil>.json` dosyasını yeniden yazar (UTF-8, atomik); MT5 olay adını yalnız terminalin dilinde verir, bu yüzden bir dil için bir
terminal gerekir. Burada bütün dil dosyaları okunur, başlıklar birleştirilir, zamanlar UTC'ye çevrilir, olaylar sıralanır ve yayın öncesi beklenti yönü hesaplanır.

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

FILE_GLOB = "autogrid_calendar_*.json"
FILE_PREFIX = "autogrid_calendar_"
ENV_DIR = "AUTOGRID_CALENDAR_DIR"
FALLBACK_LANG = "en"
STALE_SECONDS = 300
OFFSET_STEP = 900

# Ters göstergeler: değer artarsa piyasa için kötü (işsizlik vb.). `event_code` alt dizgesiyle
# eşleşir; gerçek kodlar ancak VPS testinde görüldüğü için başlıkta da aranır.
INVERSE_KEYWORDS = ("unemployment", "jobless", "claimant", "unemployed", "initial-claims", "continuing-claims", "arbeitslos")

log = logging.getLogger(__name__)


def default_dir() -> Path | None:
    """Ortam değişkeni, yoksa %APPDATA%\\MetaQuotes\\Terminal\\Common\\Files; ikisi de yoksa None."""
    env = os.environ.get(ENV_DIR)
    if env:
        return Path(env)
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "MetaQuotes" / "Terminal" / "Common" / "Files"
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


def _to_event(raw: dict, offset: int, titles: dict[str, str]) -> dict | None:
    local = _parse_server_time(raw.get("time"))
    if local is None:
        return None
    when = (local - timedelta(seconds=offset)).replace(tzinfo=timezone.utc)
    code = raw.get("event_code")
    return {
        "id": raw.get("value_id"),
        "event_id": raw.get("event_id"),
        "event_code": code,
        "title": raw.get("title"),
        "titles": titles,
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
        "forecast_direction": forecast_direction(
            raw.get("forecast"), raw.get("prev"), is_inverse(code, " ".join(titles.values()))
        ),
    }


def _key(raw: dict):
    return raw.get("value_id") if raw.get("value_id") is not None else ("e", raw.get("event_id"))


def _lang_of(doc: dict, path: Path) -> str:
    lang = doc.get("lang")
    if isinstance(lang, str) and lang.strip():
        return lang.strip().lower()
    return path.stem[len(FILE_PREFIX):].lower() or FALLBACK_LANG


def _pick_title(titles: dict[str, str], lang: str | None, order: list[str]) -> str | None:
    for code in (lang, FALLBACK_LANG, *order):
        if code and titles.get(code):
            return titles[code]
    return None


def load_events(
    directory: Path | None = None,
    *,
    lang: str | None = None,
    time_from: datetime | None = None,
    time_to: datetime | None = None,
    importance: set[str] | None = None,
    currencies: set[str] | None = None,
    now: float | None = None,
) -> dict:
    """{events, languages, stale, available, source, generated_at}; Dosya yoksa available=False.

    Zaman ve değerler en taze, bayat olmayan dosyadan gelir (hepsi bayatsa en tazeden, stale=True).
    Başlıklar bütün dil dosyalarından `value_id` ile birleşir (bayat dosyanın başlığı da kullanılır).
    """
    directory = directory if directory is not None else default_dir()
    result = {"events": [], "languages": [], "stale": True, "available": False, "source": "mt5", "generated_at": None}
    if directory is None:
        return result
    docs = []  # (mtime, lang, doc)
    try:
        paths = sorted(Path(directory).glob(FILE_GLOB))
    except OSError:
        return result
    for path in paths:
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        doc = _read_doc(path)
        if doc is None or server_offset_seconds(doc) is None:
            continue
        docs.append((mtime, _lang_of(doc, path), doc))
    if not docs:
        return result
    docs.sort(key=lambda d: d[0], reverse=True)
    clock = now if now is not None else time.time()
    fresh = [d for d in docs if clock - d[0] <= STALE_SECONDS]
    primary = (fresh or docs)[0]
    mtime, _, pdoc = primary
    offset = server_offset_seconds(pdoc)

    # Başlıklar: en taze dosya önce (dil sırası), aynı dil iki dosyadaysa tazesi kazanır
    titles_by_key: dict = {}
    order: list[str] = []
    for _, dlang, doc in docs:
        if dlang not in order:
            order.append(dlang)
        for raw in doc["events"]:
            if isinstance(raw, dict) and isinstance(raw.get("title"), str):
                titles_by_key.setdefault(_key(raw), {}).setdefault(dlang, raw["title"])

    events = []
    for raw in pdoc["events"]:
        if not isinstance(raw, dict):
            continue
        titles = titles_by_key.get(_key(raw), {})
        event = _to_event(raw, offset, titles)
        if event is None:
            continue
        event["title"] = _pick_title(titles, lang, order) or raw.get("title")
        events.append(event)
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

    result.update(
        events=events,
        languages=sorted(set(order)),
        available=True,
        stale=clock - mtime > STALE_SECONDS,
        generated_at=datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    return result
