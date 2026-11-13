# src/utils/turn_log.py
"""Bot tur telemetrisi (ENG-35): her turun başlangıcı (UTC ms) ve süresi (ms, uyku hariç).

Satır: ``başlangıç_ms,süre_ms,tür,ön_ms``. Tür: ``t`` tam tur (manage_dynamic_grid), ``m`` piyasa
kapalı, ``c`` bağlantı sağlıksız, ``n`` netting çakışması. ``ön_ms`` = tur başından
manage_dynamic_grid'e kadar geçen süre (yalnız ``t``; diğerlerinde 0).
Günlük dosya ``turns_YYYYMMDD.csv.gz`` (UTC günü, tur başlangıcına göre); her tampon boşaltma
dosyaya yeni bir gzip üyesi ekler (birleşik üyeler tek akış olarak okunur). 30 günden eski dosyalar silinir.

Kural: yazma hatası turu asla durdurmaz ve zamanlamayı değiştirmez. Yalnız bellek tamponuna
ekleme turun içinde olur; disk yazımı arka plan iş parçacığında, 30 satırda ya da 10 sn'de bir.
İstisna yutulur; hesap log'una (stderr dahil, o da hesap log'una gider) hiçbir şey yazılmaz.
"""
import gzip
import os
import queue
import re
import threading
import time
import zlib
from datetime import datetime, timedelta, timezone

from src.utils.paths import get_turns_dir

KINDS = ("t", "m", "c", "n")
RETENTION_DAYS = 30
FLUSH_ROWS = 30
FLUSH_SECONDS = 10
FILE_RE = re.compile(r"^turns_(\d{8})\.csv\.gz$")


def _day_of(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y%m%d")


class TurnRecorder:
    """Turun içinde yalnız bellek tamponuna ekler; disk yazımı arka plan iş parçacığında yapılır
    (tur zamanlaması yavaş diskten etkilenmez). Tampon 30 satırda ya da 10 sn'de bir devredilir."""

    def __init__(self, account_id):
        self.account_id = account_id
        self._rows = []  # (gün, satır)
        self._last_handoff = time.monotonic()
        self._queue = queue.Queue()
        self._thread = None
        self._last_prune_day = None
        self.errors = 0  # yalnız sayaç: hesap log'una (stderr dahil) hiçbir şey yazılmaz

    def add(self, start_ms: int, dur_ms: int, kind: str, pre_ms: int = 0) -> None:
        try:
            if kind not in KINDS:
                return
            self._rows.append((_day_of(start_ms), f"{int(start_ms)},{max(0, int(dur_ms))},{kind},{max(0, int(pre_ms))}\n"))
            if len(self._rows) >= FLUSH_ROWS or time.monotonic() - self._last_handoff >= FLUSH_SECONDS:
                self._handoff()
        except Exception:  # noqa: BLE001 - telemetri turu asla durdurmaz
            self.errors += 1

    def _handoff(self) -> None:
        rows, self._rows = self._rows, []
        self._last_handoff = time.monotonic()
        if not rows:
            return
        if self._thread is None:
            self._thread = threading.Thread(target=self._worker, name="turn-log", daemon=True)
            self._thread.start()
        self._queue.put(rows)

    def _worker(self) -> None:
        while True:
            rows = self._queue.get()
            try:
                self._write(rows)
            finally:
                self._queue.task_done()

    def flush(self) -> None:
        """Tamponu yazar ve bekler (durma anı; kill ile durdurulan süreçte çalışmaz)."""
        try:
            self._handoff()
            if self._thread is not None:
                self._queue.join()
        except Exception:  # noqa: BLE001
            self.errors += 1

    def _write(self, rows) -> None:
        try:
            directory = get_turns_dir(self.account_id)
            os.makedirs(directory, exist_ok=True)
            by_day = {}
            for day, line in rows:
                by_day.setdefault(day, []).append(line)
            for day, lines in by_day.items():
                path = os.path.join(directory, f"turns_{day}.csv.gz")
                member = gzip.compress("".join(lines).encode("ascii"), compresslevel=6)
                with open(path, "ab") as raw:
                    raw.write(member)  # tek write: üye yarım görünme ihtimali en aza iner
            today = max(by_day)
            if today != self._last_prune_day:
                self._last_prune_day = today
                prune_old(directory)
        except Exception:  # noqa: BLE001
            self.errors += 1


def prune_old(directory: str, now_ms: int = None, days: int = RETENTION_DAYS) -> None:
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms
    limit = _day_of(now_ms - days * 86400000)
    for name in os.listdir(directory):
        m = FILE_RE.match(name)
        if m and m.group(1) < limit:
            try:
                os.remove(os.path.join(directory, name))
            except OSError:
                pass


def read_turns(account_id: str, from_ms: int, to_ms: int) -> list:
    """[from_ms, to_ms) aralığındaki turlar, başlangıca göre sıralı: (start, dur, kind, pre)."""
    directory = get_turns_dir(account_id)
    out = []
    day = datetime.fromtimestamp(from_ms / 1000, tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    last = _day_of(to_ms)
    while day.strftime("%Y%m%d") <= last:
        path = os.path.join(directory, f"turns_{day.strftime('%Y%m%d')}.csv.gz")
        if os.path.isfile(path):
            try:
                with gzip.open(path, "rb") as fh:
                    for raw in fh:
                        if not raw.endswith(b"\n"):
                            break  # yarım yazılmış son satır
                        try:
                            parts = raw.decode("ascii").rstrip("\n").split(",")
                            if len(parts) != 4:
                                continue
                            start = int(parts[0])
                            if from_ms <= start < to_ms:
                                out.append((start, int(parts[1]), parts[2], int(parts[3])))
                        except ValueError:
                            continue
            except (EOFError, OSError, zlib.error):
                pass  # yazılmakta olan ya da bozuk üye: okunabilen kısmı yeter
        day += timedelta(days=1)
    out.sort(key=lambda r: r[0])
    return out
