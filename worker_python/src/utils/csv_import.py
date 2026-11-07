"""CSV-Import von Kerzendaten (B9, BKT-05; docs/journal/2026-10-06-backtest-module-plan.md).

Akış: create (kayıt + ara dosya) → chunk (sıralı parçalar) → commit (doğrula, yaz) / delete.
Onaylanmış bir içe aktarmanın mumları `csv:<import_id>` kaynağında durur; MT5 mumlarına (kaynak = sunucu adı)
dokunulmaz. Yalnızca `committed` içe aktarmalar seçilebilir; hatalı dosya commit'te hemen silinir.
1107-A6.2 / A5.2: bir aktarma aktarıldığı hesabın MT5 sunucusuna bağlıdır; aynı sunucudaki her hesap onu görür.
Aynı sunucu, sembol ve dilimdeki bütün onaylı aktarmalar tek seri olarak okunur (aynı dakika birden çok dosyada
varsa en eski aktarma kazanır). Yeni aktarma eskisini silmez; silme yalnızca elle ve yalnızca admin içindir.
Zaman: CSV zamanı + offset_sec = MT5 zamanı. UTC dosyasında broker_offset_sec sütunu varsa
her satır kendi farkını kullanır (mevsimsel geçiş); sabit offset_sec bu durumda sıfır olmalıdır.
"""
import calendar
import csv
import logging
import math
import os
import re
import threading
import time
import uuid
from datetime import datetime
from typing import NamedTuple

from src.utils import market_db as db
from src.utils.market_sync import MAX_BARS, MAX_PAUSE_SEC, TIMEFRAMES

MAX_FILE_BYTES = 150 * 1024 * 1024
MAX_CHUNK_BYTES = 4 * 1024 * 1024
MAX_ROWS = 2_000_000
MAX_OPEN_STAGING = 3
STAGING_MAX_AGE_SEC = 24 * 3600
MAX_ERRORS = 20
MAX_OFFSET_SEC = 14 * 3600
MIN_TIME = calendar.timegm((2000, 1, 1, 0, 0, 0))
FUTURE_MARGIN_SEC = 86400
BATCH_ROWS = 50_000
BYTES_PER_ROW = 90  # grobe Größe einer `rates`-Zeile, nur für die Platzprüfung

SYMBOL_RE = re.compile(r"^[A-Za-z0-9._#+\-]{1,32}$")
ID_RE = re.compile(r"^[0-9a-f]{32}$")
TF_BY_SEC = {sec: name for name, (_, sec) in TIMEFRAMES.items()}
_CHUNK_LOCK = threading.Lock()
# Şu an commit edilen içe aktarmalar: aynı anda ikinci commit/chunk/delete dosyaya dokunmasın
_COMMITTING: set[str] = set()
MAX_VOLUME = 2**62
log = logging.getLogger(__name__)


class ImportFailure(Exception):
    """Fehler mit HTTP-Status und Meldung (die API wandelt sie in HTTPException um)."""

    def __init__(self, status: int, detail, errors: list | None = None):
        super().__init__(str(detail))
        self.status, self.detail, self.errors = status, detail, errors or []


class Viewer(NamedTuple):
    """İsteği yapan: hangi hesapla geldi, hesabın MT5 sunucusu, admin mi."""

    account_id: str
    server: str
    is_admin: bool


# --------------------------------------------------------------------------- ara kayıt (staging)
def _row(import_id: str) -> dict:
    if not ID_RE.fullmatch(import_id):
        raise ImportFailure(404, "Import not found")
    with db.reading() as conn:
        row = conn.execute("SELECT * FROM csv_imports WHERE import_id=?", (import_id,)).fetchone()
    if row is None:
        raise ImportFailure(404, "Import not found")
    return dict(row)


def _entry(import_id: str, account_id: str) -> dict:
    """Yükleme sürerken (staging) kayıt yalnızca yükleyen hesaba aittir; yabancı ya da bilinmeyen: 404."""
    row = _row(import_id)
    if row["account_id"] != account_id:
        raise ImportFailure(404, "Import not found")
    return row


def _visible(row: dict, viewer: Viewer) -> bool:
    """Onaylı aktarma: aynı sunucudaki hesaplar görür; sunucusuz (hesabı kalmamış) aktarmayı yalnız admin görür.
    Yarım yükleme: yalnız yükleyen hesap."""
    if row["status"] != "committed":
        return row["account_id"] == viewer.account_id
    if row["server"] is None:
        return viewer.is_admin
    return row["server"] == viewer.server


def _visible_entry(import_id: str, viewer: Viewer) -> dict:
    row = _row(import_id)
    if not _visible(row, viewer):
        raise ImportFailure(404, "Import not found")
    return row


def _public(row: dict) -> dict:
    keys = ("import_id", "symbol", "filename", "status", "size_bytes", "received_bytes", "bars",
            "first_t", "last_t", "gaps", "offset_sec", "offset_mode", "created_at", "committed_at", "server")
    return {**{k: row[k] for k in keys}, "timeframe": TF_BY_SEC.get(row["timeframe"], str(row["timeframe"]))}


def _series_key(row: dict) -> tuple:
    """Aynı sunucu + sembol + dilim = bir seri. Sunucusuz aktarma (yalnız admin görür) yükleyen hesapla gruplanır."""
    owner = ("server", row["server"]) if row["server"] is not None else ("account", row["account_id"])
    return owner + (row["symbol"], row["timeframe"])


def _series_rows(conn, row: dict) -> list[dict]:
    """Serinin onaylı dosyaları, öncelik sırasıyla (en eski önce; eşitlikte import_id)."""
    where, args = ("server=?", [row["server"]]) if row["server"] is not None else (
        "server IS NULL AND account_id=?", [row["account_id"]])
    return [dict(r) for r in conn.execute(
        f"SELECT * FROM csv_imports WHERE {where} AND symbol=? AND timeframe=? AND status='committed' "
        "ORDER BY committed_at, import_id", (*args, row["symbol"], row["timeframe"]))]


def list_imports(viewer: Viewer) -> dict:
    """Görünen dosyalar (onaylı: sunucudaki hepsi; yarım: yalnız kendi yüklemeleri) ve seriler.

    Seri: sunucu + sembol + dilim; `bars` birleşik seride farklı dakika sayısıdır (çakışan dakikalar bir kez sayılır),
    `import_id` serinin en eski dosyasıdır; `import_ids` hepsi (`csv:<import_id>` bütün seriyi okur, hangisi olursa)."""
    with db.reading() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM csv_imports WHERE (status='committed' AND (server=? OR (server IS NULL AND ?))) "
            "OR (status='staging' AND account_id=?) ORDER BY created_at DESC",
            (viewer.server, 1 if viewer.is_admin else 0, viewer.account_id))]
        groups: dict[tuple, list[dict]] = {}
        for row in rows:
            if row["status"] == "committed":
                groups.setdefault(_series_key(row), []).append(row)
        series = []
        for files in groups.values():
            files.sort(key=lambda r: (r["committed_at"], r["import_id"]))
            sources = [db.csv_source(f["import_id"]) for f in files]
            by_start = sorted(files, key=lambda f: f["first_t"])
            disjoint = all(a["last_t"] < b["first_t"] for a, b in zip(by_start, by_start[1:]))
            if disjoint:  # örtüşme yok: dosya başına mum sayıları toplanır, milyonlarca satır taranmaz
                bars = sum(f["bars"] or 0 for f in files)
            else:
                marks = ",".join("?" for _ in sources)
                bars = conn.execute(
                    f"SELECT COUNT(DISTINCT t_mt5) FROM rates WHERE source IN ({marks}) AND symbol=? AND timeframe=?",
                    (*sources, files[0]["symbol"], files[0]["timeframe"])).fetchone()[0]
            series.append({
                "import_id": files[0]["import_id"], "server": files[0]["server"], "symbol": files[0]["symbol"],
                "timeframe": TF_BY_SEC.get(files[0]["timeframe"], str(files[0]["timeframe"])),
                "first_t": min(f["first_t"] for f in files), "last_t": max(f["last_t"] for f in files),
                "bars": bars, "files": len(files), "import_ids": [f["import_id"] for f in files],
            })
    series.sort(key=lambda x: (x["symbol"], x["timeframe"], x["import_id"]))
    return {"imports": [_public(r) for r in rows], "series": series}


def create(account_id: str, server: str, symbol: str, timeframe: str, filename: str, size: int, offset_sec: int, offset_mode: str = 'fixed') -> dict:
    symbol = symbol.strip()
    server = server.strip()
    if not server:
        raise ImportFailure(400, "Account has no MT5 server")
    if not SYMBOL_RE.match(symbol):
        raise ImportFailure(400, "Symbol is not valid")
    if timeframe not in TIMEFRAMES:
        raise ImportFailure(400, f"Timeframe {timeframe} is not supported")
    if not 0 < size <= MAX_FILE_BYTES:
        raise ImportFailure(413, f"File size must be 1 to {MAX_FILE_BYTES} bytes")
    if abs(offset_sec) > MAX_OFFSET_SEC:
        raise ImportFailure(400, "Time offset must be within ±14 hours")
    if db.is_full() or db.size_bytes() + size >= db.max_bytes():
        raise ImportFailure(507, "Market database is full")
    import_id = uuid.uuid4().hex
    now = int(time.time())
    with db.writing() as conn:
        # Hiç tamamlanmayan eski ara kayıtlar temizlenir (tarayıcı kapandı, ağ koptu)
        for old in conn.execute("SELECT import_id FROM csv_imports WHERE status='staging' AND created_at < ?",
                                (now - STAGING_MAX_AGE_SEC,)).fetchall():
            db.remove_csv_import(conn, old["import_id"])
        open_count = conn.execute("SELECT COUNT(*) FROM csv_imports WHERE account_id=? AND status='staging'",
                                  (account_id,)).fetchone()[0]
        if open_count >= MAX_OPEN_STAGING:
            raise ImportFailure(409, "Too many unfinished imports; cancel one first")
        conn.execute(
            "INSERT INTO csv_imports (import_id, account_id, symbol, timeframe, filename, status, size_bytes, "
            "offset_sec, created_at, offset_mode, server) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (import_id, account_id, symbol, TIMEFRAMES[timeframe][1], os.path.basename(filename or "")[:120],
             "staging", size, offset_sec, now, offset_mode, server),
        )
    os.makedirs(db.imports_dir(), exist_ok=True)
    return {"import_id": import_id, "chunk_bytes": MAX_CHUNK_BYTES, "offset_mode": offset_mode}


def add_chunk(account_id: str, import_id: str, index: int, data: bytes) -> dict:
    if len(data) == 0 or len(data) > MAX_CHUNK_BYTES:
        raise ImportFailure(413, f"Chunk must be 1 to {MAX_CHUNK_BYTES} bytes")
    with _CHUNK_LOCK:
        row = _entry(import_id, account_id)
        if row["status"] != "staging" or import_id in _COMMITTING:
            raise ImportFailure(409, "Import is already committed")
        if index != row["next_chunk"]:
            raise ImportFailure(409, f"Expected chunk {row['next_chunk']}")
        if row["received_bytes"] + len(data) > row["size_bytes"]:
            raise ImportFailure(413, "More data than announced")
        path = db.staging_file(import_id)
        # Önceki başarısız yazımdan artan baytlar atılır: tekrar denenen chunk iki kez eklenmesin
        if os.path.exists(path) and os.path.getsize(path) != row["received_bytes"]:
            os.truncate(path, row["received_bytes"])
        with open(path, "ab") as fh:
            fh.write(data)
        received = row["received_bytes"] + len(data)
        with db.writing() as conn:
            conn.execute("UPDATE csv_imports SET received_bytes=?, next_chunk=? WHERE import_id=?",
                         (received, index + 1, import_id))
    return {"received_bytes": received, "next_chunk": index + 1}


def delete(viewer: Viewer, import_id: str):
    """Yarım yüklemeyi yükleyen hesap iptal eder; onaylı aktarmayı yalnız admin siler (kalıcı, geri alınamaz)."""
    with _CHUNK_LOCK:  # sürmekte olan bir chunk yazımı dosyayı silmeden sonra yeniden yaratmasın
        row = _visible_entry(import_id, viewer)
        if row["status"] == "committed" and not viewer.is_admin:
            raise ImportFailure(403, "Administrator access required")
        if import_id in _COMMITTING:
            raise ImportFailure(409, "Import is being committed")
        with db.writing() as conn:
            db.remove_csv_import(conn, import_id)
    db.reclaim_space()


# --------------------------------------------------------------------------- Parser
_DATETIME_FORMATS = ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
                     "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M",
                     "%Y.%m.%d", "%Y-%m-%d")
_NAMES = {
    "time": ("time", "datetime", "timestamp", "date", "t"),
    "open": ("open", "o"), "high": ("high", "h"), "low": ("low", "l"), "close": ("close", "c"),
    "volume": ("volume", "tickvol", "tick_volume", "vol", "v"),
    "broker_offset_sec": ("broker_offset_sec",),
}


def _parse_time(text: str) -> int:
    text = text.strip()
    if text.isdigit():
        value = int(text)
        return value // 1000 if value > 10**11 else value  # Millisekunden
    for fmt in _DATETIME_FORMATS:
        try:
            return calendar.timegm(datetime.strptime(text, fmt).timetuple())
        except ValueError:
            continue
    raise ValueError(f"time '{text[:30]}' is not a known format")


def _is_time(text: str) -> bool:
    try:
        _parse_time(text)
        return True
    except ValueError:
        return False


def _open_text(path: str):
    with open(path, "rb") as fh:
        head = fh.read(4)
    if head.startswith((b"\xff\xfe", b"\xfe\xff")):
        encoding = "utf-16"
    else:
        encoding = "utf-8-sig"
    return open(path, "r", encoding=encoding, newline="")


def _layout(first: list[str]) -> tuple[bool, dict]:
    """(hat Kopfzeile, Spalte je Feld). Ohne Kopfzeile: [Datum, Zeit,] O, H, L, C[, Vol]."""
    names = [c.strip().strip("<>").lower() for c in first]
    if not any(_is_time(c) for c in first[:2]) or any(n in ("open", "high", "low", "close") for n in names):
        cols: dict = {}
        for field, aliases in _NAMES.items():
            for i, n in enumerate(names):
                if n in aliases and field not in cols:
                    cols[field] = i
        if "time" in names and "date" in names:
            cols["date"] = names.index("date")
            cols["time"] = names.index("time")
        missing = [f for f in ("time", "open", "high", "low", "close") if f not in cols]
        if missing:
            raise ImportFailure(422, f"Header lacks column(s): {', '.join(missing)}")
        return True, cols
    split = len(first) >= 6 and _is_time(f"{first[0]} {first[1]}") and not _is_time(first[1])
    base = 2 if split else 1
    if len(first) < base + 4:
        raise ImportFailure(422, "Expected time, open, high, low, close columns")
    cols = {"time": base - 1, "open": base, "high": base + 1, "low": base + 2, "close": base + 3}
    if split:
        cols["date"] = 0
    if len(first) > base + 4:
        cols["volume"] = base + 4
    return False, cols


def iter_rows(path: str, tf_sec: int, offset_sec: int, errors: list, now: float | None = None, metadata: dict | None = None):
    """Liefert (t, o, h, l, c, volume) geprüft und sortiert. Fehler → `errors` (höchstens MAX_ERRORS).

    Bricht beim MAX_ERRORS-ten Fehler ab. Prüft: Format, Zeit-Raster, strikt steigende Zeit, OHLC,
    Zeit-Bereich (2000 bis jetzt + 1 Tag), Zeilenzahl.
    """
    limit = (now if now is not None else time.time()) + FUTURE_MARGIN_SEC
    with _open_text(path) as fh:
        first_line = fh.readline()
        fh.seek(0)
        # En çok geçen ayraç (eşitlikte virgül); Sniffer ondalık virgüllü ";" dosyalarında yanılıyor
        delimiter = max(",;\t", key=lambda d: (first_line.count(d), d == ","))
        reader = csv.reader(fh, delimiter=delimiter)
        has_header, cols = None, {}
        prev, count = None, 0

        def fail(line: int, message: str) -> bool:
            errors.append({"line": line, "message": message})
            return len(errors) >= MAX_ERRORS

        for row in reader:
            if not row or not any(c.strip() for c in row):
                continue
            line = reader.line_num
            if has_header is None:
                has_header, cols = _layout(row)
                if "broker_offset_sec" in cols and offset_sec != 0:
                    raise ImportFailure(422, "Per-row broker offsets cannot be combined with a fixed time offset")
                if metadata is not None:
                    metadata["offset_mode"] = "row" if "broker_offset_sec" in cols else "fixed"
                if has_header:
                    continue
            try:
                text = row[cols["time"]]
                if "date" in cols:
                    text = f"{row[cols['date']].strip()} {text.strip()}"
                row_offset = int(row[cols["broker_offset_sec"]]) if "broker_offset_sec" in cols else offset_sec
                if abs(row_offset) > MAX_OFFSET_SEC:
                    raise ValueError("broker offset must be within ±14 hours")
                t = _parse_time(text) + row_offset
                o, h, l, c = (float(row[cols[k]].replace(",", ".") if delimiter != "," else row[cols[k]])
                              for k in ("open", "high", "low", "close"))
                vol = int(float(row[cols["volume"]])) if "volume" in cols and row[cols["volume"]].strip() else None
                if vol is not None and not 0 <= vol <= MAX_VOLUME:
                    raise ValueError("volume is out of range")
            except IndexError:
                if fail(line, "row has too few columns"):
                    return
                continue
            except (ValueError, OverflowError) as exc:
                if fail(line, str(exc)[:120]):
                    return
                continue
            problem = None
            if not all(math.isfinite(x) and x > 0 for x in (o, h, l, c)):
                problem = "prices must be positive numbers"
            elif h < max(o, c, l) or l > min(o, c, h):
                problem = "high/low do not contain open and close"
            elif t % tf_sec != 0:
                problem = "time is not on the timeframe grid (wrong timeframe or time zone?)"
            elif not MIN_TIME <= t <= limit:
                problem = "time is outside 2000 … now"
            elif prev is not None and t <= prev:
                problem = "time is not increasing (duplicate or unsorted)"
            if problem:
                if fail(line, problem):
                    return
                continue
            count += 1
            if count > MAX_ROWS:
                fail(line, f"more than {MAX_ROWS} rows")
                return
            prev = t
            yield t, o, h, l, c, vol
        if has_header is None:
            fail(0, "file is empty")


def _scan(path: str, tf_sec: int, offset_sec: int) -> dict:
    """Erster Durchgang: prüft alles, ohne Kerzen zu halten; sammelt Umfang und große Lücken."""
    errors: list = []
    bars, first, last = 0, None, None
    gaps: list[tuple[int, int]] = []
    metadata = {"offset_mode": "fixed"}
    try:
        for t, *_ in iter_rows(path, tf_sec, offset_sec, errors, metadata=metadata):
            if last is not None and t - last - tf_sec > MAX_PAUSE_SEC and len(gaps) < 1000:
                gaps.append((last + tf_sec, t))
            first = t if first is None else first
            last, bars = t, bars + 1
    except (UnicodeError, csv.Error) as exc:  # UTF-8/UTF-16 değil, ikili dosya, çok uzun alan
        raise ImportFailure(422, f"The file cannot be read as CSV text ({type(exc).__name__})")
    if errors:
        raise ImportFailure(422, "The file has errors", errors)
    if bars == 0:
        raise ImportFailure(422, "The file has no candles")
    return {"bars": bars, "first": first, "last": last, "gaps": gaps, **metadata}


# --------------------------------------------------------------------------- Commit
def commit(account_id: str, import_id: str, extend: bool) -> dict:
    with _CHUNK_LOCK:
        row = _entry(import_id, account_id)
        if row["status"] != "staging" or import_id in _COMMITTING:
            raise ImportFailure(409, "Import is already committed")
        path = db.staging_file(import_id)
        if row["received_bytes"] != row["size_bytes"] or not os.path.exists(path) \
                or os.path.getsize(path) != row["size_bytes"]:
            raise ImportFailure(409, "Upload is not complete")
        _COMMITTING.add(import_id)
    try:
        return _commit(account_id, row, extend)
    finally:
        _COMMITTING.discard(import_id)


def _commit(account_id: str, row: dict, extend: bool) -> dict:
    import_id, path, tf_sec = row["import_id"], db.staging_file(row["import_id"]), row["timeframe"]
    try:
        scan = _scan(path, tf_sec, row["offset_sec"])
        if scan["offset_mode"] != row["offset_mode"]:
            raise ImportFailure(422, "Selected time offset mode does not match the CSV header")
    except ImportFailure:
        # Hatalı dosya: ara kayıt hemen silinir, hiç seçilebilir olmaz
        with db.writing() as conn:
            db.remove_csv_import(conn, import_id)
        db.reclaim_space()
        raise
    end = scan["last"] + tf_sec
    if db.is_full() or db.size_bytes() + scan["bars"] * BYTES_PER_ROW >= db.max_bytes():
        raise ImportFailure(507, "Market database is full")
    src = db.csv_source(import_id)
    segments, pos = [], scan["first"]
    for a, b in scan["gaps"]:  # büyük boşluklar `unavailable` olarak görünür kalır
        segments += [(pos, a, db.STATE_COMPLETE), (a, b, db.STATE_UNAVAILABLE)]
        pos = b
    segments.append((pos, end, db.STATE_COMPLETE))
    now = int(time.time())
    # Nur committed ist über /rates lesbar. Vorbereitete Batches bleiben bis zum atomaren
    # Statuswechsel unsichtbar; Parse-Zeit und andere Schreibvorgänge teilen keinen DB-Lock.
    try:
        with db.writing() as conn:
            conn.execute("DELETE FROM rates WHERE source=?", (src,))  # Reste nach Prozessabbruch
        batch = []
        errors: list = []
        metadata = {}
        count, first, last = 0, None, None
        for t, o, h, l, c, vol in iter_rows(path, tf_sec, row["offset_sec"], errors, metadata=metadata):
            count += 1
            first = t if first is None else first
            last = t
            batch.append((src, row["symbol"], tf_sec, t, o, h, l, c, vol, None))
            if len(batch) >= BATCH_ROWS:
                _insert_batch(account_id, import_id, batch)
                batch = []
        if errors or (count, first, last, metadata.get("offset_mode")) != (
                scan["bars"], scan["first"], scan["last"], scan["offset_mode"]):
            # Datei hat sich zwischen den Durchgängen geändert
            raise ImportFailure(409, "File changed during the import")
        if batch:
            _insert_batch(account_id, import_id, batch)
        with db.writing() as conn:
            _require_staging(conn, account_id, import_id)
            # Aynı sunucu, sembol ve dilimde örtüşen dosya: uyarı. Eski dosya hiçbir durumda silinmez (1107-A5.2):
            # onayla ("extend") gelirse yeni dosya kendi mumlarının tamamıyla saklanır, seri yalnız eksik dakikalarla uzar.
            overlaps = [dict(r) for r in conn.execute(
                "SELECT * FROM csv_imports WHERE server=? AND symbol=? AND timeframe=? AND status='committed' "
                "AND first_t < ? AND last_t >= ?",
                (row["server"], row["symbol"], tf_sec, end, scan["first"]))]
            if overlaps and not extend:
                raise ImportFailure(409, "Overlaps an existing import", [_public(o) for o in overlaps])
            for x, y, state in segments:
                if y > x:
                    db._insert(conn, "rate_coverage", {"source": src, "symbol": row["symbol"], "timeframe": tf_sec,
                                                       "from_t": x, "to_t": y, "state": state, "checked_at": now})
            # committed_at (Vorrang in der Serie) ist der Zeitpunkt der Fertigstellung, nicht des Commit-Beginns:
            # eine große Datei, die früher begann, aber später fertig wird, ist nicht „älter“
            conn.execute(
                "UPDATE csv_imports SET status='committed', bars=?, first_t=?, last_t=?, gaps=?, committed_at=?, offset_mode=? "
                "WHERE import_id=?", (scan["bars"], scan["first"], scan["last"], len(scan["gaps"]), int(time.time()),
                                      scan["offset_mode"], import_id))
    except BaseException:
        # Abgebrochene Batches dürfen bei einem erneuten Commit nicht doppelt eingefügt werden.
        with db.writing() as conn:
            conn.execute("DELETE FROM rates WHERE source=?", (src,))
        raise
    try:
        os.remove(path)  # ham dosya artık gerekmiyor
    except OSError:
        # Commit tamam; dosya (ör. Windows'ta virüs tarayıcı) silinemedi: içe aktarma geçerli, yalnız artık dosya kalır
        log.warning("CSV staging file could not be removed: %s", path, exc_info=True)
    return _public(_entry(import_id, account_id))


def _require_staging(conn, account_id: str, import_id: str):
    # Ein Admin-Löschen oder Abbruch kann zwischen Batches stattfinden. Dann keine verwaisten Kerzen schreiben.
    entry = conn.execute("SELECT status FROM csv_imports WHERE import_id=? AND account_id=?",
                         (import_id, account_id)).fetchone()
    if entry is None:
        raise ImportFailure(404, "Import not found")
    if entry["status"] != "staging":
        raise ImportFailure(409, "Import is already committed")


def _insert_batch(account_id: str, import_id: str, batch: list):
    with db.writing() as conn:
        _require_staging(conn, account_id, import_id)
        conn.executemany("INSERT INTO rates VALUES (?,?,?,?,?,?,?,?,?,?)", batch)


# --------------------------------------------------------------------------- Lesen
def get_rates(viewer: Viewer, import_id: str, symbol: str, timeframe: str, a: int, b: int) -> dict:
    """Kerzen [a, b) der Serie, zu der der Import gehört, im Format von market_sync.get_rates; nie MT5.

    Serie = alle onaylı aktarmalar desselben Servers, Symbols und Zeitrahmens; eine Minute in mehreren Dateien
    liefert die älteste. `missing` sind die Lücken der vereinigten Abdeckung."""
    row = _visible_entry(import_id, viewer)
    if row["status"] != "committed":
        raise ImportFailure(409, "Import is not committed")
    tf_sec = TIMEFRAMES[timeframe][1]
    if symbol != row["symbol"] or tf_sec != row["timeframe"]:
        raise ImportFailure(400, f"Import holds {row['symbol']} {TF_BY_SEC[row['timeframe']]} only")
    with db.reading() as conn:
        sources = [db.csv_source(f["import_id"]) for f in _series_rows(conn, row)]
    if not sources:  # Admin hat die Datei zwischen Prüfung und Lesen gelöscht
        raise ImportFailure(404, "Import not found")
    a = a - a % tf_sec
    b = b - b % tf_sec if b % tf_sec == 0 else b - b % tf_sec + tf_sec
    end = min(b, a + MAX_BARS * tf_sec)
    covered = [(s["from_t"], s["to_t"]) for s in db.rate_coverage_union(sources, symbol, tf_sec, a, end)
               if s["state"] in db.COVERED_STATES]
    missing = [{"from": x, "to": y, "reason": "csv_gap", "checked_at": None}
               for x, y in db.subtract([(a, end)], sorted(covered))]
    rows = db.read_rates_union(sources, symbol, tf_sec, a, end, MAX_BARS + 1)
    next_from = end if end < b else None
    if len(rows) > MAX_BARS:
        next_from = rows[MAX_BARS]["time"]
        rows = rows[:MAX_BARS]
    return {
        "source": db.csv_source(import_id), "symbol": symbol, "timeframe": timeframe, "from": a, "to": b,
        "t": [r["time"] for r in rows], "o": [r["open"] for r in rows], "h": [r["high"] for r in rows],
        "l": [r["low"] for r in rows], "c": [r["close"] for r in rows], "v": [r.get("tick_volume") for r in rows],
        "s": [None for _ in rows], "live_from": None, "digits": None, "point": None,
        "next_from": next_from, "missing": missing, "db_full": False,
    }
