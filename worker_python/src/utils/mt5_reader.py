# src/utils/mt5_reader.py
"""MT5 okuyucu süreçleri (1110-A2): soğuk mum/tick çekişleri API sürecinin dışında koşar.

Neden: `MetaTrader5` C eklentisi, terminal bir sembolün geçmişini indirirken GIL'i bırakmadan
bekler (VPS ölçümü 2026-11-10: tek `copy_rates_range` 82 sn, aynı anda heartbeat iş parçacığı
82 sn geç). O sırada API sürecinin tamamı durur: event loop, `/api/system/platform`, WebSocket.
Bir iş parçacığı ya da bütçe bunu kesemez; yalnız ayrı bir süreç kesebilir.

Model:
- Havuzda `READER_COUNT` alt süreç var (tembel başlar). Her biri `python -m src.utils.mt5_reader`
  ile başlar ve localhost üzerinden, her başlatmada rastgele `authkey` ile bağlanır. Kendi MT5
  bağlantısını `mt5_market._connected` ile (veri sorgusu kipi) kurar.
- API süreci sonucu `conn.poll(timeout)` ile bekler; bu bekleme GIL'i bırakır.
- Süre dolunca `ReaderTimeout` atılır; iş okuyucuda sürer (terminal ısınır), sonucu atılır.
  Okuyucu bu sırada "meşgul"dur; havuz önce boş okuyucuyu seçer.
- Bir iş `READER_HARD_SEC`'i aşarsa okuyucu öldürülür ve sonraki işte yeniden başlar.
- Üst süreç kapanınca bağlantı kopar, alt süreç `EOFError` ile çıkar.

`MetaTrader5` kurulu değilse (Mac, testler) iş aynı süreçte, zaman sınırı olmadan koşar
("inline"). `MT5_READER=inline|process` bunu zorlar.
"""
from __future__ import annotations

import importlib
import os
import secrets
import subprocess
import sys
import threading
import time
from multiprocessing.connection import Client, Listener

from src.utils import mt5_market as mm
from src.utils.worker_obs import obs_log

READER_COUNT = 2
READER_HARD_SEC = 300  # bir iş bundan uzun sürerse okuyucu öldürülür
START_TIMEOUT_SEC = 30  # alt sürecin bağlanması için (Python + MetaTrader5 import)
MIN_WAIT_SEC = 0.5
_KEY_ENV = "MT5_READER_KEY"
_EXTRA_JOBS_ENV = "MT5_READER_EXTRA_JOBS"  # yalnız testler: "modul:fonksiyon,..." ek iş

# İş adı → "modul:fonksiyon". Alt süreç yalnız bunları çalıştırır.
JOBS = {
    "rates_chunk": "src.utils.market_sync:_fetch_chunk",
    "tick_piece": "src.utils.market_sync:_fetch_tick_piece",
    "minute_piece": "src.utils.market_sync:_fetch_minute_piece",
}


class ReaderTimeout(Exception):
    """İş süre içinde bitmedi; okuyucuda sürüyor (terminal geçmişi indiriyor olabilir)."""


def _resolve(spec: str):
    module, name = spec.split(":", 1)
    return getattr(importlib.import_module(module), name)


def _worker_root() -> str:
    from src.utils.paths import PROJECT_ROOT

    return str(PROJECT_ROOT)


class Reader:
    """Tek okuyucu alt süreç. Aynı anda tek iş; kilit havuzdadır."""

    def __init__(self, name: str, env: dict | None = None):
        self.name = name
        self.env = env
        self.proc: subprocess.Popen | None = None
        self.conn = None
        self.pending_since: float | None = None  # süresi dolan işin başlangıcı

    # --- yaşam döngüsü -------------------------------------------------
    def _start(self):
        key = secrets.token_bytes(32)
        listener = Listener(("127.0.0.1", 0), authkey=key)
        host, port = listener.address
        env = dict(os.environ if self.env is None else self.env)
        env[_KEY_ENV] = key.hex()
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        self.proc = subprocess.Popen(
            [sys.executable, "-u", "-m", "src.utils.mt5_reader", host, str(port)],
            cwd=_worker_root(), env=env, stdin=subprocess.DEVNULL, creationflags=flags,
        )
        box: dict = {}

        def accept():
            try:
                box["conn"] = listener.accept()
            except Exception as exc:  # listener kapandı veya kimlik doğrulama düştü
                box["error"] = exc

        t = threading.Thread(target=accept, name=f"{self.name}-accept", daemon=True)
        t.start()
        t.join(START_TIMEOUT_SEC)
        listener.close()
        if "conn" not in box:
            self.kill()
            raise mm.MarketDataError(f"[READER] {self.name} başlatılamadı: {box.get('error') or 'zaman aşımı'}")
        self.conn = box["conn"]
        self.pending_since = None
        obs_log.info("[mt5-reader] %s started pid=%s", self.name, self.proc.pid)

    def kill(self):
        if self.conn is not None:
            try:
                self.conn.close()
            except OSError:
                pass
        self.conn = None
        if self.proc is not None and self.proc.poll() is None:
            self.proc.kill()
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                pass
        self.proc = None
        self.pending_since = None

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None and self.conn is not None

    # --- iş ------------------------------------------------------------
    def _drain(self, timeout: float) -> bool:
        """Süresi dolmuş önceki işin sonucunu bekleyip atar. Okuyucu boşaldıysa True."""
        if self.pending_since is None:
            return True
        if time.monotonic() - self.pending_since > READER_HARD_SEC:
            obs_log.warning("[mt5-reader] %s job over %ss, restarting", self.name, READER_HARD_SEC)
            self.kill()
            return True
        try:
            if not self.conn.poll(max(0.0, timeout)):
                return False
            self.conn.recv()
        except (EOFError, OSError):
            self.kill()
            return True
        obs_log.info("[mt5-reader] %s late job done after %.1fs", self.name, time.monotonic() - self.pending_since)
        self.pending_since = None
        return True

    def call(self, job: str, args: tuple, timeout: float):
        deadline = time.monotonic() + timeout
        if not self._drain(timeout):
            raise ReaderTimeout(f"{self.name} hâlâ önceki işte")
        if not self.alive():
            self.kill()
            self._start()
        started = time.monotonic()
        try:
            self.conn.send((job, args))
            if not self.conn.poll(max(MIN_WAIT_SEC, deadline - time.monotonic())):
                self.pending_since = started
                obs_log.info("[mt5-reader] %s %s timeout after %.1fs (job keeps running)", self.name, job,
                             time.monotonic() - started)
                raise ReaderTimeout(f"{self.name} {job}")
            reply = self.conn.recv()
        except (EOFError, OSError) as exc:
            self.kill()
            raise mm.MarketDataError(f"[READER] {self.name} bağlantısı koptu: {exc}")
        if reply[0] == "ok":
            return reply[1]
        raise mm.MarketDataError(reply[1], status=reply[2])


class ReaderPool:
    def __init__(self, count: int = READER_COUNT, env: dict | None = None):
        self.readers = [Reader(f"mt5-reader-{i + 1}", env) for i in range(count)]
        self._locks = [threading.Lock() for _ in self.readers]
        self._free = threading.Condition()

    def _take(self, timeout: float) -> int | None:
        """Kullanımda olmayan bir okuyucu; boş (önceki işi olmayan) olanı tercih eder."""
        deadline = time.monotonic() + timeout
        with self._free:
            while True:
                taken = [i for i, lock in enumerate(self._locks) if not lock.locked()]
                if taken:
                    taken.sort(key=lambda i: self.readers[i].pending_since or 0.0)
                    i = taken[0]
                    self._locks[i].acquire()
                    return i
                left = deadline - time.monotonic()
                if left <= 0:
                    return None
                self._free.wait(left)

    def _give(self, i: int):
        with self._free:
            self._locks[i].release()
            self._free.notify()

    def call(self, job: str, args: tuple, timeout: float):
        t0 = time.monotonic()
        i = self._take(timeout)
        if i is None:
            raise ReaderTimeout("tüm okuyucular meşgul")
        try:
            return self.readers[i].call(job, args, max(MIN_WAIT_SEC, timeout - (time.monotonic() - t0)))
        finally:
            self._give(i)

    def close(self):
        for r in self.readers:
            r.kill()


_pool: ReaderPool | None = None
_pool_lock = threading.Lock()


def mode() -> str:
    from src.utils import mt5_connection as mc

    forced = os.environ.get("MT5_READER", "").strip().lower()
    if forced in ("inline", "process"):
        return forced
    return "process" if mc.MT5_AVAILABLE else "inline"


def run(job: str, args: tuple, timeout: float):
    """İşi bir okuyucuda koşar; en çok `timeout` sn bekler (inline kipte sınırsız)."""
    if job not in JOBS:
        raise ValueError(f"unknown reader job {job!r}")
    if mode() == "inline":
        return _resolve(JOBS[job])(*args)
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = ReaderPool()
    return _pool.call(job, args, timeout)


# --- alt süreç ---------------------------------------------------------
def _child_jobs() -> dict:
    jobs = dict(JOBS)
    for item in filter(None, os.environ.get(_EXTRA_JOBS_ENV, "").split(",")):
        name, _, spec = item.partition("=")
        jobs[name] = spec
    return jobs


def _serve(host: str, port: int):
    conn = Client((host, port), authkey=bytes.fromhex(os.environ.pop(_KEY_ENV)))
    jobs = _child_jobs()
    while True:
        try:
            job, args = conn.recv()
        except (EOFError, OSError):
            return  # üst süreç kapandı
        try:
            reply = ("ok", _resolve(jobs[job])(*args))
        except mm.MarketDataError as exc:
            reply = ("err", exc.detail, exc.status)
        except Exception as exc:  # beklenmeyen hata üst sürece taşınır, okuyucu yaşamaya devam eder
            reply = ("err", f"[READER] {type(exc).__name__}: {exc}", 503)
        try:
            conn.send(reply)
        except (EOFError, OSError):
            return


if __name__ == "__main__":
    _serve(sys.argv[1], int(sys.argv[2]))
