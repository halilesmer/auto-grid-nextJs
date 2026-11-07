# src/utils/market_db.py
"""Analiz sayfasının veritabanı (SQLite, data/market.sqlite; docs/analyse-regeln.md §3).

VPS hesap yapmaz, yalnızca saklar ve verir: mumlar ve hangi aralıkların ne durumda olduğu
(rate_coverage), hesabın tüm deal'leri ve eşitlenmiş aralıklar (deal_coverage), bölge kaydı
(magic ↔ bölge, silinmiş bölgeler dahil) ve her kaydedilen bölge ayarı, broker saat farkı ölçümleri.

Kurallar:
- Zamanlar MT5 zamanıdır (saniye), dönüştürülmez.
- Aralıklar yarı açıktır: [from_t, to_t).
- Tek bekleme ayarı sqlite3.connect(timeout=10); ayrıca busy_timeout pragması YOK (meşgul
  işleyicisini değiştirirdi).
- Yazmalar modül genelindeki kilit arkasında, işlem başına tek transaction.
- Şema sürümü PRAGMA user_version'da. Göç öncesi yedek alınır, göç tek transaction'dır; başarısız
  olursa eski sürüm kalır, veri uçları 503 döner, işlem (bot) etkilenmez.
"""
import glob
import json
import os
import shutil
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone

from src.utils import paths

DB_FILENAME = "market.sqlite"
BUSY_TIMEOUT_SEC = 10
BACKUP_KEEP = 7
# Veritabanı bu boyutu aşınca yeni mum saklanmaz (deal arşivi küçüktür, devam eder)
MAX_MB_DEFAULT = 10000
# "Mevcut değil" aralıkları bu kadar sonra yeniden denenir
UNAVAILABLE_RETRY_SEC = 24 * 3600

STATE_COMPLETE = "complete"
STATE_GAP = "gap_confirmed"
STATE_UNAVAILABLE = "unavailable"
COVERED_STATES = (STATE_COMPLETE, STATE_GAP)
# BKT-22: Version der Tick-Statistik (1 = ahi/alo/g); ältere Abdeckung wird einmal neu geholt
TICK_STATS_VERSION = 1

_WRITE_LOCK = threading.Lock()
# Yedek yazıcıları kilitlemez (SQLite backup API'si tutarlı kopya verir); yalnızca iki yedek aynı anda olmasın
_BACKUP_LOCK = threading.Lock()
_ready_paths: set[str] = set()


class MarketDbUnavailable(Exception):
    """Veritabanı kullanılamıyor (ör. başarısız göç). Veri uçları 503 döner."""


# Göçler: sürüm N, MIGRATIONS[N-1]'deki komutlarla kurulur. Var olan bir göç asla değiştirilmez.
MIGRATIONS: list[list[str]] = [
    [
        """CREATE TABLE rates (
            source TEXT NOT NULL, symbol TEXT NOT NULL, timeframe INTEGER NOT NULL,
            t_mt5 INTEGER NOT NULL, o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL,
            c REAL NOT NULL, tick_volume INTEGER, spread INTEGER,
            PRIMARY KEY (source, symbol, timeframe, t_mt5)
        ) WITHOUT ROWID""",
        """CREATE TABLE rate_coverage (
            source TEXT NOT NULL, symbol TEXT NOT NULL, timeframe INTEGER NOT NULL,
            from_t INTEGER NOT NULL, to_t INTEGER NOT NULL, state TEXT NOT NULL,
            checked_at INTEGER NOT NULL
        )""",
        "CREATE INDEX rate_coverage_key ON rate_coverage (source, symbol, timeframe, from_t)",
        """CREATE TABLE symbol_meta (
            source TEXT NOT NULL, symbol TEXT NOT NULL, digits INTEGER, point REAL,
            updated_at INTEGER NOT NULL, PRIMARY KEY (source, symbol)
        )""",
        """CREATE TABLE broker_offset_log (
            server TEXT NOT NULL, observed_utc INTEGER NOT NULL, offset_sec INTEGER NOT NULL
        )""",
        "CREATE INDEX broker_offset_log_server ON broker_offset_log (server, observed_utc)",
        """CREATE TABLE deals (
            account_id TEXT NOT NULL, ticket INTEGER NOT NULL, "order" INTEGER, position_id INTEGER,
            t_mt5 INTEGER NOT NULL, time_msc INTEGER, type INTEGER, entry INTEGER, magic INTEGER,
            symbol TEXT, volume REAL, price REAL, profit REAL, commission REAL, swap REAL,
            fee REAL, comment TEXT, reason INTEGER,
            PRIMARY KEY (account_id, ticket)
        )""",
        "CREATE INDEX deals_time ON deals (account_id, t_mt5)",
        "CREATE INDEX deals_position ON deals (account_id, position_id)",
        """CREATE TABLE deal_coverage (
            account_id TEXT NOT NULL, from_t INTEGER NOT NULL, to_t INTEGER NOT NULL,
            synced_at INTEGER NOT NULL
        )""",
        """CREATE TABLE account_meta (
            account_id TEXT PRIMARY KEY, currency TEXT, balance REAL, margin_mode INTEGER,
            updated_at INTEGER NOT NULL
        )""",
        """CREATE TABLE zone_registry (
            account_id TEXT NOT NULL, magic INTEGER NOT NULL, zone_id TEXT, symbol TEXT,
            label TEXT, created_at INTEGER NOT NULL, deleted_at INTEGER,
            PRIMARY KEY (account_id, magic)
        )""",
        """CREATE TABLE zone_config_versions (
            account_id TEXT NOT NULL, magic INTEGER NOT NULL, version INTEGER NOT NULL,
            config_json TEXT NOT NULL, valid_from INTEGER NOT NULL,
            PRIMARY KEY (account_id, magic, version)
        )""",
    ],
    [
        # B9 / BKT-05: CSV-Importe. Kerzen eines Imports liegen in `rates` mit source = "csv:<import_id>".
        """CREATE TABLE csv_imports (
            import_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, symbol TEXT NOT NULL,
            timeframe INTEGER NOT NULL, filename TEXT, status TEXT NOT NULL,
            size_bytes INTEGER NOT NULL, received_bytes INTEGER NOT NULL DEFAULT 0,
            next_chunk INTEGER NOT NULL DEFAULT 0, offset_sec INTEGER NOT NULL DEFAULT 0,
            bars INTEGER, first_t INTEGER, last_t INTEGER, gaps INTEGER,
            created_at INTEGER NOT NULL, committed_at INTEGER
        )""",
        "CREATE INDEX csv_imports_account ON csv_imports (account_id, symbol, timeframe)",
    ],
    [
        # B8 / BKT-11: sahibi doğrulanmış kullanıcı; hesaplardan bağımsız parametre kopyaları.
        """CREATE TABLE backtest_presets (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
            payload TEXT NOT NULL, created_at INTEGER NOT NULL
        )""",
        "CREATE INDEX backtest_presets_owner ON backtest_presets (owner, created_at)",
    ],
    [
        # BKT-05: per-row UTC offsets are supplied by the file, not guessed from today's clock.
        "ALTER TABLE csv_imports ADD COLUMN offset_mode TEXT NOT NULL DEFAULT 'fixed'",
    ],
    [
        # BKT-14: gespeicherte Live-Backtest-Vergleiche; `payload` ist das vollständige, geprüfte JSON.
        """CREATE TABLE backtest_reports (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL,
            account_id TEXT NOT NULL, period_from INTEGER NOT NULL, period_to INTEGER NOT NULL,
            worker_version TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL,
            symbol_count INTEGER NOT NULL, passed_count INTEGER NOT NULL
        )""",
        "CREATE INDEX backtest_reports_owner ON backtest_reports (owner, created_at)",
    ],
    [
        # BKT-19: Minuten-Spread aus Ticks. Eigene Tabellen, weil store_rates die Kerzenzeilen ersetzt (INSERT OR
        # REPLACE) und die Tick-Spalten sonst verloren gingen; die Tick-Abdeckung lebt unabhängig von der Kerzen-Abdeckung.
        """CREATE TABLE tick_spread (
            source TEXT NOT NULL, symbol TEXT NOT NULL, t_mt5 INTEGER NOT NULL,
            sa REAL NOT NULL, sx INTEGER NOT NULL, n INTEGER NOT NULL,
            PRIMARY KEY (source, symbol, t_mt5)
        ) WITHOUT ROWID""",
        """CREATE TABLE tick_spread_coverage (
            source TEXT NOT NULL, symbol TEXT NOT NULL,
            from_t INTEGER NOT NULL, to_t INTEGER NOT NULL, state TEXT NOT NULL, checked_at INTEGER NOT NULL
        )""",
        "CREATE INDEX tick_spread_coverage_key ON tick_spread_coverage (source, symbol, from_t)",
    ],
    [
        # BKT-20: Tick-Replay. Die Ticks der Rollover-/Sprung-Minuten (Blob: zlib(JSON [ms[], bid[], ask[]]), Preise in
        # ganzen Punkten); `replay` in der Abdeckung = der Bereich ist auch auf Replay-Minuten geprüft (0 = nur BKT-19).
        """CREATE TABLE tick_replay (
            source TEXT NOT NULL, symbol TEXT NOT NULL, t_mt5 INTEGER NOT NULL,
            kind TEXT NOT NULL, ticks BLOB NOT NULL,
            PRIMARY KEY (source, symbol, t_mt5)
        ) WITHOUT ROWID""",
        "ALTER TABLE tick_spread_coverage ADD COLUMN replay INTEGER NOT NULL DEFAULT 0",
    ],
    [
        # ANA-07: SL/TP der Eröffnungsorder je Position (history_orders_get). Eine Zeile = nachgeschlagen;
        # sl/tp NULL = die Order trug keinen Wert oder ist nicht mehr in der MT5-Historie.
        """CREATE TABLE position_orders (
            account_id TEXT NOT NULL, position_id INTEGER NOT NULL, sl REAL, tp REAL,
            looked_up_at INTEGER NOT NULL, PRIMARY KEY (account_id, position_id)
        )""",
    ],
    [
        # BKT-22: Ask-Extreme (ganze Punkte, nur Ticks in der Minute), Kursraster der Minute (1 = keins) und die
        # Version der Tick-Statistik in der Abdeckung (0 = Stand von BKT-19/20, wird einmal neu geholt). NULL = unbekannt.
        "ALTER TABLE tick_spread ADD COLUMN ahi INTEGER",
        "ALTER TABLE tick_spread ADD COLUMN alo INTEGER",
        "ALTER TABLE tick_spread ADD COLUMN g INTEGER",
        "ALTER TABLE tick_spread_coverage ADD COLUMN stats INTEGER NOT NULL DEFAULT 0",
    ],
]
SCHEMA_VERSION = len(MIGRATIONS)


# --------------------------------------------------------------------------- dosya ve bağlantı
def db_path() -> str:
    return os.path.join(paths.DATA_DIR, DB_FILENAME)


def backups_dir() -> str:
    return os.path.join(paths.DATA_DIR, "backups")


def max_bytes() -> int:
    try:
        mb = float(os.getenv("MARKET_DB_MAX_MB", MAX_MB_DEFAULT))
    except ValueError:
        mb = MAX_MB_DEFAULT
    return int(mb * 1024 * 1024)


def size_bytes() -> int:
    path = db_path()
    total = 0
    for p in (path, path + "-wal"):
        try:
            total += os.path.getsize(p)
        except FileNotFoundError:
            # exists()+getsize() ist nicht atomar: SQLite löscht die -wal-Datei beim Checkpoint
            # dazwischen (HTTP 500 auf /rates). Fehlende Datei zählt als 0 Byte.
            pass
    return total


def is_full() -> bool:
    return size_bytes() >= max_bytes()


def _open(path: str) -> sqlite3.Connection:
    try:
        conn = sqlite3.connect(path, timeout=BUSY_TIMEOUT_SEC, isolation_level=None)
    except sqlite3.Error as exc:
        raise MarketDbUnavailable(f"Veritabanı açılamadı: {exc}") from exc
    conn.row_factory = sqlite3.Row
    return conn


def _migrate(path: str):
    """Şemayı güncel sürüme getirir. Hata → eski sürüm kalır, MarketDbUnavailable."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    existed = os.path.exists(path)
    conn = _open(path)
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise MarketDbUnavailable(
                f"Veritabanı sürümü {version}, bu worker {SCHEMA_VERSION}'i tanıyor; worker'ı güncelleyin."
            )
        if version == SCHEMA_VERSION:
            conn.execute("PRAGMA journal_mode=WAL")
            return
        if existed and version > 0:
            backup(tag=f"pre-v{SCHEMA_VERSION}")
        if version == 0:
            # İlk tablodan önce: sonradan değiştirilemez (VACUUM gerekir)
            conn.execute("PRAGMA auto_vacuum=INCREMENTAL")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("BEGIN IMMEDIATE")
        try:
            for target in range(version + 1, SCHEMA_VERSION + 1):
                for statement in MIGRATIONS[target - 1]:
                    conn.execute(statement)
            conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
            conn.execute("COMMIT")
        except Exception as exc:
            conn.execute("ROLLBACK")
            raise MarketDbUnavailable(f"Veritabanı göçü başarısız (sürüm {version} kaldı): {exc}") from exc
    finally:
        conn.close()


def _ensure_ready() -> str:
    path = db_path()
    if path not in _ready_paths:
        with _WRITE_LOCK:
            if path not in _ready_paths:
                try:
                    _migrate(path)
                except sqlite3.Error as exc:  # kilitli, disk dolu, bozuk dosya …
                    raise MarketDbUnavailable(f"Veritabanı hazırlanamadı: {exc}") from exc
                _ready_paths.add(path)
    _daily_backup()
    return path


@contextmanager
def reading():
    conn = _open(_ensure_ready())
    try:
        yield conn
    except sqlite3.Error as exc:
        raise MarketDbUnavailable(f"Veritabanı okunamadı: {exc}") from exc
    finally:
        conn.close()


@contextmanager
def writing():
    """Kilit + tek transaction; hata olursa geri alınır. SQLite hataları → MarketDbUnavailable."""
    path = _ensure_ready()
    with _WRITE_LOCK:
        conn = _open(path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            conn.execute("COMMIT")
        except sqlite3.Error as exc:
            raise MarketDbUnavailable(f"Veritabanına yazılamadı: {exc}") from exc
        finally:
            conn.close()


def reset_cache():
    """Testler ve geri yükleme için: bir sonraki erişimde şema yeniden kontrol edilir."""
    _ready_paths.clear()


# --------------------------------------------------------------------------- yedek
def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def backup(tag: str | None = None) -> str | None:
    """Connection.backup ile tutarlı kopya: data/backups/market-YYYYMMDD[-tag].sqlite. En yeni 7 kalır."""
    path = db_path()
    if not os.path.exists(path):
        return None
    os.makedirs(backups_dir(), exist_ok=True)
    name = f"market-{_today()}" + (f"-{tag}" if tag else "") + ".sqlite"
    target = os.path.join(backups_dir(), name)
    src = _open(path)
    dst = sqlite3.connect(target + ".tmp")
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    os.replace(target + ".tmp", target)
    for old in sorted(glob.glob(os.path.join(backups_dir(), "market-*.sqlite")))[:-BACKUP_KEEP]:
        os.remove(old)
    return target


def _daily_backup():
    """Günde bir yedek (o gün ilk erişimde). Yedek hatası veriyi asla engellemez."""
    if os.path.exists(os.path.join(backups_dir(), f"market-{_today()}.sqlite")):
        return
    if not _BACKUP_LOCK.acquire(blocking=False):
        return  # başka bir istek şu an yedekliyor
    try:
        backup()
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️ [MARKET-DB] Günlük yedek alınamadı: {exc}")
    finally:
        _BACKUP_LOCK.release()


def restore(backup_file: str):
    """Yedeği geri yükler (worker çalışırken de: aynı kilit). Mevcut dosya .broken olarak kalır."""
    if not os.path.exists(backup_file):
        raise FileNotFoundError(backup_file)
    path = db_path()
    with _WRITE_LOCK:
        for suffix in ("-wal", "-shm"):
            if os.path.exists(path + suffix):
                os.remove(path + suffix)
        if os.path.exists(path):
            shutil.move(path, path + ".broken")
        src = sqlite3.connect(backup_file)
        dst = sqlite3.connect(path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        _ready_paths.discard(path)


# --------------------------------------------------------------------------- aralıklar
def subtract(ranges: list[tuple[int, int]], cut: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """ranges − cut (yarı açık aralıklar), sıralı."""
    result = []
    cut = sorted(cut)
    for a, b in ranges:
        pos = a
        for x, y in cut:
            if y <= pos or x >= b:
                continue
            if x > pos:
                result.append((pos, x))
            pos = max(pos, y)
            if pos >= b:
                break
        if pos < b:
            result.append((pos, b))
    return result


def _replace_segment(conn, table: str, where: str, args: tuple, a: int, b: int, values: dict, merge_key: str):
    """[a, b) aralığını yeni değerle yazar: çakışan satırlar kırpılır, eşit komşular birleşir."""
    rows = [dict(r) for r in conn.execute(
        f"SELECT rowid AS rid, * FROM {table} WHERE {where} AND to_t >= ? AND from_t <= ?", (*args, a, b)
    )]
    lo, hi = a, b
    for row in rows:
        conn.execute(f"DELETE FROM {table} WHERE rowid = ?", (row["rid"],))
        keys = (merge_key,) if isinstance(merge_key, str) else merge_key
        same = all(row[k] == values[k] for k in keys)
        if same:  # aynı durumdaki komşu veya çakışan satır birleşir
            lo, hi = min(lo, row["from_t"]), max(hi, row["to_t"])
            continue
        rest = {k: v for k, v in row.items() if k not in ("rid", "from_t", "to_t")}
        for x, y in subtract([(row["from_t"], row["to_t"])], [(a, b)]):
            _insert(conn, table, {**rest, "from_t": x, "to_t": y})
    _insert(conn, table, {**values, "from_t": lo, "to_t": hi})


def _insert(conn, table: str, row: dict):
    cols = ", ".join(f'"{k}"' for k in row)
    conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({', '.join('?' for _ in row)})", tuple(row.values()))


# --------------------------------------------------------------------------- mumlar
def rate_coverage(source: str, symbol: str, timeframe: int, a: int, b: int) -> list[dict]:
    with reading() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT from_t, to_t, state, checked_at FROM rate_coverage "
            "WHERE source=? AND symbol=? AND timeframe=? AND to_t > ? AND from_t < ? ORDER BY from_t",
            (source, symbol, timeframe, a, b),
        )]


def plan_rates(source: str, symbol: str, timeframe: int, a: int, b: int, now: float | None = None):
    """[a, b) için: MT5'ten alınacak parçalar ve henüz yeniden denenmeyecek "mevcut değil" parçaları."""
    now = time.time() if now is None else now
    covered, waiting = [], []
    for seg in rate_coverage(source, symbol, timeframe, a, b):
        if seg["state"] in COVERED_STATES:
            covered.append((seg["from_t"], seg["to_t"]))
        elif now - seg["checked_at"] < UNAVAILABLE_RETRY_SEC:
            x, y = max(a, seg["from_t"]), min(b, seg["to_t"])
            covered.append((x, y))
            waiting.append({"from": x, "to": y, "reason": STATE_UNAVAILABLE, "checked_at": seg["checked_at"]})
    return subtract([(a, b)], covered), waiting


def store_rates(source: str, symbol: str, timeframe: int, bars: list[dict], segments: list[tuple[int, int, str]],
                checked_at: int | None = None) -> bool:
    """Mumları ve aralık durumlarını tek transaction'da yazar. Veritabanı doluysa yazmaz → False."""
    if is_full():
        return False
    checked_at = int(time.time()) if checked_at is None else checked_at
    with writing() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO rates VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(source, symbol, timeframe, int(r["time"]), r["open"], r["high"], r["low"], r["close"],
              r.get("tick_volume"), r.get("spread")) for r in bars],
        )
        for x, y, state in segments:
            if y > x:
                _replace_segment(
                    conn, "rate_coverage", "source=? AND symbol=? AND timeframe=?", (source, symbol, timeframe),
                    x, y, {"source": source, "symbol": symbol, "timeframe": timeframe, "state": state,
                           "checked_at": checked_at}, merge_key="state",
                )
    return True


def read_rates(source: str, symbol: str, timeframe: int, a: int, b: int, limit: int,
               with_ticks: bool = False) -> list[dict]:
    """Kerzen [a, b). `with_ticks` (nur M1): dazu sa/sx aus tick_spread (None ohne Tick-Daten)."""
    with reading() as conn:
        if with_ticks:
            return [dict(r) for r in conn.execute(
                "SELECT r.t_mt5 AS time, r.o AS open, r.h AS high, r.l AS low, r.c AS close, r.tick_volume, "
                "r.spread, t.sa AS sa, t.sx AS sx, t.ahi AS ahi, t.alo AS alo, t.g AS g FROM rates r LEFT JOIN tick_spread t "
                "ON t.source = r.source AND t.symbol = r.symbol AND t.t_mt5 = r.t_mt5 "
                "WHERE r.source=? AND r.symbol=? AND r.timeframe=? AND r.t_mt5 >= ? AND r.t_mt5 < ? "
                "ORDER BY r.t_mt5 LIMIT ?",
                (source, symbol, timeframe, a, b, limit),
            )]
        return [dict(r) for r in conn.execute(
            "SELECT t_mt5 AS time, o AS open, h AS high, l AS low, c AS close, tick_volume, spread "
            "FROM rates WHERE source=? AND symbol=? AND timeframe=? AND t_mt5 >= ? AND t_mt5 < ? "
            "ORDER BY t_mt5 LIMIT ?",
            (source, symbol, timeframe, a, b, limit),
        )]


# --------------------------------------------------------------------------- Tick-Spread (BKT-19)
def complete_candle_ranges(source: str, symbol: str, timeframe: int, a: int, b: int) -> list[tuple[int, int]]:
    """Teile von [a, b) mit Kerzen-Abdeckung `complete` (nur dort gibt es Kerzen, also Tick-Arbeit)."""
    return [(max(a, x["from_t"]), min(b, x["to_t"])) for x in rate_coverage(source, symbol, timeframe, a, b)
            if x["state"] == STATE_COMPLETE]


def plan_tick_spread(source: str, symbol: str, a: int, b: int, now: float | None = None, replay: bool = False):
    """[a, b) für M1: aus MT5 zu berechnende Teile und noch nicht erneut zu versuchende „nicht verfügbar“-Teile.

    `replay`: auch Bereiche, die nur für BKT-19 (ohne Replay-Minuten) gespeichert sind, werden noch einmal geholt."""
    now = time.time() if now is None else now
    with reading() as conn:
        segs = [dict(r) for r in conn.execute(
            "SELECT from_t, to_t, state, checked_at, replay, stats FROM tick_spread_coverage "
            "WHERE source=? AND symbol=? AND to_t > ? AND from_t < ? ORDER BY from_t", (source, symbol, a, b))]
    covered, waiting = [], []
    for seg in segs:
        if seg["state"] in COVERED_STATES:
            if seg["stats"] >= TICK_STATS_VERSION and (not replay or seg["replay"]):
                covered.append((seg["from_t"], seg["to_t"]))
        elif now - seg["checked_at"] < UNAVAILABLE_RETRY_SEC:
            x, y = max(a, seg["from_t"]), min(b, seg["to_t"])
            covered.append((x, y))
            waiting.append({"from": x, "to": y, "reason": STATE_UNAVAILABLE, "checked_at": seg["checked_at"]})
    todo = subtract(complete_candle_ranges(source, symbol, 60, a, b), covered)
    return todo, waiting


def store_tick_spread(source: str, symbol: str, rows: list[tuple],
                      segments: list[tuple[int, int, str]], checked_at: int | None = None,
                      replay_rows: list[tuple[int, str, bytes]] | None = None, replay: bool = False,
                      stats: bool = False) -> bool:
    """Minutenwerte (t, sa, sx, n[, ahi, alo, g]), Replay-Minuten (t, Art, Blob) und Abdeckung in einer Transaktion.

    `stats`: die Zeilen tragen ahi/alo/g (BKT-22), die Abdeckung bekommt TICK_STATS_VERSION. Datenbank voll → False."""
    if is_full():
        return False
    checked_at = int(time.time()) if checked_at is None else checked_at
    with writing() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO tick_spread (source, symbol, t_mt5, sa, sx, n, ahi, alo, g) VALUES (?,?,?,?,?,?,?,?,?)",
            [(source, symbol, int(r[0]), round(float(r[1]), 2), int(r[2]), int(r[3]),
              *((None if v is None else int(v)) for v in (tuple(r[4:7]) + (None, None, None))[:3])) for r in rows],
        )
        if replay_rows:
            conn.executemany(
                "INSERT OR REPLACE INTO tick_replay VALUES (?,?,?,?,?)",
                [(source, symbol, int(t), kind, blob) for t, kind, blob in replay_rows],
            )
        for x, y, state in segments:
            if y > x:
                _replace_segment(
                    conn, "tick_spread_coverage", "source=? AND symbol=?", (source, symbol), x, y,
                    {"source": source, "symbol": symbol, "state": state, "checked_at": checked_at,
                     "replay": 1 if replay else 0, "stats": TICK_STATS_VERSION if stats else 0},
                    merge_key=("state", "replay", "stats"),
                )
    return True


def read_tick_replay(source: str, symbol: str, a: int, b: int) -> list[tuple[int, str, bytes]]:
    """Replay-Minuten [a, b): (Minute, Art, Blob)."""
    with reading() as conn:
        return [(r["t_mt5"], r["kind"], bytes(r["ticks"])) for r in conn.execute(
            "SELECT t_mt5, kind, ticks FROM tick_replay WHERE source=? AND symbol=? AND t_mt5 >= ? AND t_mt5 < ? "
            "ORDER BY t_mt5", (source, symbol, a, b))]


def tick_coverage_summary(source: str, symbol: str) -> list[dict]:
    with reading() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT state, replay, stats, MIN(from_t) AS first, MAX(to_t) AS last, COUNT(*) AS segments "
            "FROM tick_spread_coverage WHERE source=? AND symbol=? GROUP BY state, replay, stats "
            "ORDER BY state, replay, stats",
            (source, symbol))]


def save_symbol_meta(source: str, symbol: str, digits, point):
    with writing() as conn:
        conn.execute("INSERT OR REPLACE INTO symbol_meta VALUES (?,?,?,?,?)",
                     (source, symbol, digits, point, int(time.time())))


def symbol_meta(source: str, symbol: str) -> dict | None:
    with reading() as conn:
        row = conn.execute("SELECT digits, point FROM symbol_meta WHERE source=? AND symbol=?",
                           (source, symbol)).fetchone()
    return dict(row) if row else None


def coverage_summary(source: str, symbol: str) -> list[dict]:
    with reading() as conn:
        rows = conn.execute(
            "SELECT timeframe, state, MIN(from_t) AS first, MAX(to_t) AS last, COUNT(*) AS segments "
            "FROM rate_coverage WHERE source=? AND symbol=? GROUP BY timeframe, state ORDER BY timeframe, state",
            (source, symbol),
        ).fetchall()
        counts = dict(conn.execute(
            "SELECT timeframe, COUNT(*) FROM rates WHERE source=? AND symbol=? GROUP BY timeframe", (source, symbol)
        ).fetchall())
    # Kerzen liegen nur in "complete"-Bereichen; Pause/nicht verfügbar haben per Definition keine
    return [{**dict(r), "bars": counts.get(r["timeframe"], 0) if r["state"] == STATE_COMPLETE else 0} for r in rows]


def last_broker_offset(server: str, max_age_sec: int) -> int | None:
    """Jüngster protokollierter (verlässlicher) Broker-Abstand des Servers, höchstens max_age_sec alt."""
    with reading() as conn:
        row = conn.execute(
            "SELECT offset_sec FROM broker_offset_log WHERE server=? AND observed_utc>=? "
            "ORDER BY observed_utc DESC LIMIT 1", (server, int(time.time()) - max_age_sec),
        ).fetchone()
    return int(row[0]) if row else None


def log_broker_offset(server: str, observed_utc: float, offset_sec: int):
    with writing() as conn:
        conn.execute("INSERT INTO broker_offset_log VALUES (?,?,?)", (server, int(observed_utc), int(offset_sec)))


# --------------------------------------------------------------------------- deal'ler
DEAL_COLUMNS = ("ticket", "order", "position_id", "time", "time_msc", "type", "entry", "magic", "symbol",
                "volume", "price", "profit", "commission", "swap", "fee", "comment", "reason")


def deal_gaps(account_id: str, a: int, b: int) -> list[tuple[int, int]]:
    with reading() as conn:
        covered = [(r[0], r[1]) for r in conn.execute(
            "SELECT from_t, to_t FROM deal_coverage WHERE account_id=? AND to_t > ? AND from_t < ?",
            (account_id, a, b),
        )]
    return subtract([(a, b)], covered)


def store_deals(account_id: str, deals: list[dict], synced: list[tuple[int, int]], account: dict | None = None):
    now = int(time.time())
    with writing() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO deals (account_id, ticket, \"order\", position_id, t_mt5, time_msc, type, entry, "
            "magic, symbol, volume, price, profit, commission, swap, fee, comment, reason) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(account_id, *(d.get(c) for c in DEAL_COLUMNS)) for d in deals],
        )
        for x, y in synced:
            if y > x:
                _replace_segment(conn, "deal_coverage", "account_id=?", (account_id,), x, y,
                                 {"account_id": account_id, "synced_at": now}, merge_key="account_id")
        if account:
            conn.execute("INSERT OR REPLACE INTO account_meta VALUES (?,?,?,?,?)",
                         (account_id, account.get("currency"), account.get("balance"),
                          account.get("margin_mode"), now))


def _deal_row(row) -> dict:
    d = dict(row)
    d["time"] = d.pop("t_mt5")
    d.pop("account_id", None)
    return d


def entries_without_levels(account_id: str, a: int, b: int, entry_in: int = 0) -> list[dict]:
    """Einstiegs-Deals im Zeitraum, deren Eröffnungsorder noch nicht nachgeschlagen wurde (neueste zuerst)."""
    with reading() as conn:
        return [{"position_id": r[0], "order": r[1]} for r in conn.execute(
            "SELECT d.position_id, MAX(d.\"order\") FROM deals d WHERE d.account_id=? AND d.t_mt5 >= ? "
            "AND d.t_mt5 < ? AND d.entry=? AND d.position_id > 0 AND NOT EXISTS (SELECT 1 FROM position_orders p "
            "WHERE p.account_id=d.account_id AND p.position_id=d.position_id) "
            "GROUP BY d.position_id ORDER BY MAX(d.t_mt5) DESC",
            (account_id, a, b, entry_in),
        )]


def store_position_orders(account_id: str, rows: list[dict]):
    now = int(time.time())
    with writing() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO position_orders (account_id, position_id, sl, tp, looked_up_at) VALUES (?,?,?,?,?)",
            [(account_id, r["position_id"], r.get("sl"), r.get("tp"), now) for r in rows],
        )


def _attach_open_levels(conn, account_id: str, deals: list[dict]) -> None:
    """Einstiegs-Deals bekommen open_sl/open_tp der Eröffnungsorder (None = unbekannt)."""
    ids = {d["position_id"] for d in deals if d.get("position_id")}
    levels = {}
    if ids:
        marks = ",".join("?" for _ in ids)
        levels = {r[0]: (r[1], r[2]) for r in conn.execute(
            f"SELECT position_id, sl, tp FROM position_orders WHERE account_id=? AND position_id IN ({marks})",
            (account_id, *ids),
        )}
    for d in deals:
        sl, tp = levels.get(d.get("position_id"), (None, None))
        d["open_sl"], d["open_tp"] = sl, tp


def read_deals(account_id: str, a: int, b: int) -> list[dict]:
    """Aralıktaki deal'ler + aralıktan önce açılmış pozisyonların giriş deal'leri (eşleştirme için)."""
    with reading() as conn:
        inside = [_deal_row(r) for r in conn.execute(
            "SELECT * FROM deals WHERE account_id=? AND t_mt5 >= ? AND t_mt5 < ? ORDER BY time_msc, ticket",
            (account_id, a, b),
        )]
        positions = {d["position_id"] for d in inside if d["position_id"]}
        tickets = {d["ticket"] for d in inside}
        earlier = []
        if positions:
            marks = ",".join("?" for _ in positions)
            earlier = [_deal_row(r) for r in conn.execute(
                f"SELECT * FROM deals WHERE account_id=? AND t_mt5 < ? AND position_id IN ({marks}) "
                "ORDER BY time_msc, ticket",
                (account_id, a, *positions),
            ) if r["ticket"] not in tickets]
        merged = earlier + inside
        _attach_open_levels(conn, account_id, merged)
    return merged


def positions_without_entry(account_id: str, a: int, b: int, entry_in: int = 0) -> list[int]:
    """Aralıktaki deal'lerin pozisyonlarından giriş deal'i arşivde olmayanlar."""
    with reading() as conn:
        return [r[0] for r in conn.execute(
            "SELECT DISTINCT position_id FROM deals d WHERE account_id=? AND t_mt5 >= ? AND t_mt5 < ? "
            "AND position_id > 0 AND NOT EXISTS (SELECT 1 FROM deals e WHERE e.account_id=d.account_id "
            "AND e.position_id=d.position_id AND e.entry=?)",
            (account_id, a, b, entry_in),
        )]


def account_meta(account_id: str) -> dict | None:
    with reading() as conn:
        row = conn.execute("SELECT currency, balance, margin_mode, updated_at FROM account_meta WHERE account_id=?",
                           (account_id,)).fetchone()
    return dict(row) if row else None


# --------------------------------------------------------------------------- bölge kaydı
def record_zones(account_id: str, zones: list[dict], now: int | None = None):
    """Ayar kaydında: her bölgenin magic'i kayda (silinen bölge deleted_at alır), değişen ayar yeni sürüm."""
    from src.utils.zone_magic import zone_magic

    now = int(time.time()) if now is None else now
    with writing() as conn:
        present = set()
        for idx, zone in enumerate(zones or []):
            if not isinstance(zone, dict):
                continue
            magic = zone_magic(zone, idx)
            present.add(magic)
            label = zone.get("name") or f"Z{magic - 200000}"
            exists = conn.execute("SELECT 1 FROM zone_registry WHERE account_id=? AND magic=?",
                                  (account_id, magic)).fetchone()
            if exists:
                conn.execute("UPDATE zone_registry SET zone_id=?, symbol=?, label=?, deleted_at=NULL "
                             "WHERE account_id=? AND magic=?",
                             (zone.get("id"), zone.get("symbol"), label, account_id, magic))
            else:
                conn.execute("INSERT INTO zone_registry VALUES (?,?,?,?,?,?,NULL)",
                             (account_id, magic, zone.get("id"), zone.get("symbol"), label, now))
            config = json.dumps(zone, sort_keys=True, ensure_ascii=False)
            last = conn.execute("SELECT version, config_json FROM zone_config_versions WHERE account_id=? AND magic=? "
                                "ORDER BY version DESC LIMIT 1", (account_id, magic)).fetchone()
            if last is None or last["config_json"] != config:
                conn.execute("INSERT INTO zone_config_versions VALUES (?,?,?,?,?)",
                             (account_id, magic, (last["version"] + 1) if last else 1, config, now))
        for row in conn.execute("SELECT magic FROM zone_registry WHERE account_id=? AND deleted_at IS NULL",
                                (account_id,)).fetchall():
            if row["magic"] not in present:
                conn.execute("UPDATE zone_registry SET deleted_at=? WHERE account_id=? AND magic=?",
                             (now, account_id, row["magic"]))


def zone_registry(account_id: str) -> list[dict]:
    with reading() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT magic, zone_id, symbol, label, created_at, deleted_at FROM zone_registry "
            "WHERE account_id=? ORDER BY magic", (account_id,)
        )]


def zone_versions(account_id: str, magic: int) -> list[dict]:
    with reading() as conn:
        return [{**dict(r), "config": json.loads(r["config_json"])} for r in conn.execute(
            "SELECT version, valid_from, config_json FROM zone_config_versions WHERE account_id=? AND magic=? "
            "ORDER BY version", (account_id, magic)
        )]


# --------------------------------------------------------------------------- csv içe aktarma
CSV_SOURCE_PREFIX = "csv:"


def csv_source(import_id: str) -> str:
    return f"{CSV_SOURCE_PREFIX}{import_id}"


def imports_dir() -> str:
    return os.path.join(paths.DATA_DIR, "imports")


def staging_file(import_id: str) -> str:
    return os.path.join(imports_dir(), f"{import_id}.csv")


def remove_csv_import(conn, import_id: str):
    """Kayıt, mumlar ve aralıklar (transaction içinde) ve hazırlık dosyası. Dosya hatası yutulmaz."""
    src = csv_source(import_id)
    conn.execute("DELETE FROM rates WHERE source=?", (src,))
    conn.execute("DELETE FROM rate_coverage WHERE source=?", (src,))
    conn.execute("DELETE FROM csv_imports WHERE import_id=?", (import_id,))
    try:
        os.remove(staging_file(import_id))
    except FileNotFoundError:
        pass  # onaylanmış içe aktarmanın dosyası zaten silinmiştir


# --------------------------------------------------------------------------- hesap silme
def reclaim_space():
    """Silinen sayfaları dosyadan geri verir (aksi halde boyut küçülmez ve is_full() doğru kalır)."""
    if not os.path.exists(db_path()):
        return
    conn = _open(db_path())
    try:
        conn.execute("PRAGMA incremental_vacuum")
    finally:
        conn.close()


def delete_account(account_id: str):
    """Hesabın deal arşivini, CSV içe aktarmalarını ve backtest raporlarını (BKT-14) siler (bölge kaydı ve MT5 mumları kalır; mumlar sunucuya aittir)."""
    if not os.path.exists(db_path()):
        return
    with writing() as conn:
        for table in ("deals", "deal_coverage", "account_meta", "backtest_reports"):
            conn.execute(f"DELETE FROM {table} WHERE account_id=?", (account_id,))
        for row in conn.execute("SELECT import_id FROM csv_imports WHERE account_id=?", (account_id,)).fetchall():
            remove_csv_import(conn, row["import_id"])
    reclaim_space()
