"""Brokerin haftalık işlem seansları (BKT-21): MQL5 betiğinin yazdığı dosyadan okunur.

MT5 Python API'si seans bilgisi vermez (SymbolInfoSessionTrade yalnız MQL5'te var). Bu yüzden
`ops/mt5/AutoGridTradeSessions.mq5` bir kez çalıştırılır ve ortak `Files` klasörüne
`autogrid_trade_sessions.json` yazar. Dosya yoksa ya da geçersizse `None` döner; backtest o zaman
seansı bilmeden, eskisi gibi çalışır.

Biçim: {"version": 1, "server": "...", "symbols": {"XAUUSD": [[[from_s, to_s], ...] x 7]}}
Gün 0 = Pazar (MQL5 ENUM_DAY_OF_WEEK), saniyeler gün başına göre, broker saatiyle; to ≤ 86400.
"""
import json
import logging
import os
from pathlib import Path

FILE_NAME = "autogrid_trade_sessions.json"
ENV_FILE = "AUTOGRID_TRADE_SESSIONS_FILE"
DAY_SECONDS = 86400

log = logging.getLogger(__name__)

# yol -> (mtime, belge ya da None)
_cache: dict[str, tuple[float, dict | None]] = {}
_warned: set[str] = set()


def reset_cache() -> None:
    _cache.clear()
    _warned.clear()


def default_path() -> Path | None:
    """Ortam değişkeni, yoksa %APPDATA%\\MetaQuotes\\Terminal\\Common\\Files; ikisi de yoksa None."""
    env = os.environ.get(ENV_FILE)
    if env:
        return Path(env)
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "MetaQuotes" / "Terminal" / "Common" / "Files" / FILE_NAME
    return None


def _valid_week(week) -> bool:
    if not isinstance(week, list) or len(week) != 7:
        return False
    for day in week:
        if not isinstance(day, list):
            return False
        prev_end = 0
        for item in day:
            if not isinstance(item, list) or len(item) != 2:
                return False
            start, end = item
            if isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
                return False
            if start < prev_end or end <= start or end > DAY_SECONDS:
                return False
            prev_end = end
    return True


def _load(path: Path) -> dict | None:
    key = str(path)
    try:
        mtime = path.stat().st_mtime
    except OSError:
        _cache.pop(key, None)
        return None
    hit = _cache.get(key)
    if hit and hit[0] == mtime:
        return hit[1]
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(doc, dict) or not isinstance(doc.get("symbols"), dict):
            doc = None
    except (OSError, ValueError):
        doc = None
    _cache[key] = (mtime, doc)
    return doc


def sessions_for(symbol: str, server: str, path: Path | None = None) -> list | None:
    """7 günlük [[from, to], ...] planı; dosya yok, sunucu uyuşmuyor ya da plan geçersizse None."""
    path = path if path is not None else default_path()
    if path is None:
        return None
    doc = _load(Path(path))
    if doc is None:
        return None
    file_server = str(doc.get("server") or "").strip().lower()
    if file_server and file_server != str(server or "").strip().lower():
        if str(path) not in _warned:
            _warned.add(str(path))
            log.warning("İşlem seansı dosyası başka bir sunucuya ait (%s); kullanılmıyor.", doc.get("server"))
        return None
    week = doc["symbols"].get(symbol)
    return week if _valid_week(week) else None
