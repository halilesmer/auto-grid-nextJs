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
from multiprocessing import AuthenticationError
from multiprocessing.connection import Client, Listener

from src.utils import mt5_market as mm
from src.utils.worker_obs import obs_log

READER_COUNT = 2  # uzun çekişler
LANES = {"long": READER_COUNT, "fast": 1}  # fast: sıcak grafiğin uç parçası (1110-A2.3)
START_BACKOFF_SEC = 10  # başarısız başlatmadan sonra bu kadar yeniden denenmez
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
        self.pending_key: tuple | None = None  # süresi dolan iş (aynı iş yeniden sorulursa sonucu verilir)
        self.late: tuple | None = None  # (anahtar, cevap): süresi dolduktan sonra gelen sonuç
        self.failed_at = 0.0

    # --- yaşam döngüsü -------------------------------------------------
    def _start(self):
        if time.monotonic() - self.failed_at < START_BACKOFF_SEC:
            raise mm.MarketDataError(f"[READER] {self.name} az önce başlatılamadı; birazdan yeniden denenir.")
        key = secrets.token_bytes(32)
        listener = Listener(("127.0.0.1", 0), authkey=key)
        box: dict = {}
        try:
            host, port = listener.address
            env = dict(os.environ if self.env is None else self.env)
            env[_KEY_ENV] = key.hex()
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
            self.proc = subprocess.Popen(
                [sys.executable, "-u", "-m", "src.utils.mt5_reader", host, str(port)],
                cwd=_worker_root(), env=env, stdin=subprocess.DEVNULL, stdout=self._log_file(),
                stderr=subprocess.STDOUT, creationflags=flags,
            )

            def accept():
                while "conn" not in box:  # yanlış anahtarla bağlanan başka bir yerel süreç başlatmayı düşürmez
                    try:
                        box["conn"] = listener.accept()
                    except AuthenticationError:
                        continue
                    except OSError:  # dinleyici kapandı
                        return

            t = threading.Thread(target=accept, name=f"{self.name}-accept", daemon=True)
            t.start()
            stop = time.monotonic() + START_TIMEOUT_SEC
            while t.is_alive() and time.monotonic() < stop and self.proc.poll() is None:
                t.join(0.1)
        finally:
            listener.close()
        if "conn" not in box:
            code = self.proc.poll() if self.proc else None
            self.kill()
            self.failed_at = time.monotonic()
            reason = f"çıkış kodu {code}" if code is not None else "zaman aşımı"
            raise mm.MarketDataError(f"[READER] {self.name} başlatılamadı ({reason}); bkz. {self._log_path()}")
        self.conn = box["conn"]
        self.pending_since = None
        self.pending_key = None
        obs_log.info("[mt5-reader] %s started pid=%s", self.name, self.proc.pid)

    def _log_path(self) -> str:
        from src.utils import paths

        return os.path.join(paths.LOGS_DIR, f"{self.name}.log")

    def _log_file(self):
        """Alt sürecin çıktısı ([rates-timing], traceback): kendi dosyası, sürecin tamamı boyunca açık."""
        try:
            os.makedirs(os.path.dirname(self._log_path()), exist_ok=True)
            return open(self._log_path(), "a", encoding="utf-8")
        except OSError:
            return subprocess.DEVNULL

    def kill(self):
        if self.conn is not None:
            try:
                self.conn.close()
            except OSError:
                pass
        self.conn = None
        proc, self.proc = self.proc, None
        if proc is not None and proc.poll() is None:
            # Windows'ta venv python.exe bir başlatıcıdır, asıl Python onun alt sürecidir: ağaç öldürülür
            try:
                import psutil

                for child in psutil.Process(proc.pid).children(recursive=True):
                    child.kill()
            except Exception:
                pass
            proc.kill()
            try:
                proc.wait(5)
            except subprocess.TimeoutExpired:
                pass
        if proc is not None and proc.stdout not in (None, subprocess.DEVNULL):
            try:
                proc.stdout.close()
            except OSError:
                pass
        self.pending_since = None
        self.pending_key = None

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None and self.conn is not None

    # --- iş ------------------------------------------------------------
    def _drain(self, timeout: float) -> bool:
        """Süresi dolmuş önceki işin sonucunu bekler ve `late`'e koyar. Okuyucu boşaldıysa True."""
        if self.pending_since is None:
            return True
        try:
            ready = self.conn.poll(0)
            if not ready and time.monotonic() - self.pending_since > READER_HARD_SEC:
                obs_log.warning("[mt5-reader] %s job over %ss, restarting", self.name, READER_HARD_SEC)
                self.kill()
                return True
            if not ready and not self.conn.poll(max(0.0, timeout)):
                return False
            self.late = (self.pending_key, self.conn.recv())
        except (EOFError, OSError):
            self.kill()
            return True
        obs_log.info("[mt5-reader] %s late job done after %.1fs", self.name, time.monotonic() - self.pending_since)
        self.pending_since = None
        self.pending_key = None
        return True

    def call(self, job: str, args: tuple, timeout: float, wait_busy: bool = True):
        """`wait_busy=False`: önceki iş sürüyorsa onu beklemeden `ReaderTimeout` (1110-A3, hızlı şerit)."""
        deadline = time.monotonic() + timeout
        key = (job, args)
        if not self._drain(timeout if wait_busy else 0.0):
            raise ReaderTimeout(f"{self.name} hâlâ önceki işte")
        late, self.late = self.late, None
        if late is not None and late[0] == key:  # aynı iş: geç gelen sonuç boşa gitmez
            return _unwrap(late[1])
        if not self.alive():
            self.kill()
            self._start()
        started = time.monotonic()
        try:
            self.conn.send(key)
            if not self.conn.poll(max(MIN_WAIT_SEC, deadline - time.monotonic())):
                self.pending_since = started
                self.pending_key = key
                obs_log.info("[mt5-reader] %s %s timeout after %.1fs (job keeps running)", self.name, job,
                             time.monotonic() - started)
                raise ReaderTimeout(f"{self.name} {job}")
            reply = self.conn.recv()
        except (EOFError, OSError) as exc:
            self.kill()
            raise mm.MarketDataError(f"[READER] {self.name} bağlantısı koptu: {exc}")
        return _unwrap(reply)


def _unwrap(reply):
    if reply[0] == "ok":
        return reply[1]
    raise mm.MarketDataError(reply[1], status=reply[2])


class ReaderPool:
    def __init__(self, count: int = READER_COUNT, env: dict | None = None, prefix: str = "mt5-reader"):
        self.readers = [Reader(f"{prefix}-{i + 1}", env) for i in range(count)]
        self._locks = [threading.Lock() for _ in self.readers]
        self._free = threading.Condition()

    def _take(self, key: tuple, timeout: float) -> int | None:
        """Kullanımda olmayan bir okuyucu: önce aynı işi süren, sonra boş, sonra en eski işi süren."""
        deadline = time.monotonic() + timeout
        with self._free:
            while True:
                free = [i for i, lock in enumerate(self._locks) if not lock.locked()]
                if free:
                    def rank(i):
                        r = self.readers[i]
                        return (r.pending_key != key, r.pending_since or 0.0)

                    i = min(free, key=rank)
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

    def call(self, job: str, args: tuple, timeout: float, wait_busy: bool = True):
        t0 = time.monotonic()
        i = self._take((job, args), timeout)
        if i is None:
            raise ReaderTimeout("tüm okuyucular meşgul")
        try:
            return self.readers[i].call(job, args, max(MIN_WAIT_SEC, timeout - (time.monotonic() - t0)), wait_busy)
        finally:
            self._give(i)

    def close(self):
        for r in self.readers:
            r.kill()


_pools: dict[str, ReaderPool] = {}
_pool_lock = threading.Lock()


def mode() -> str:
    from src.utils import mt5_connection as mc

    forced = os.environ.get("MT5_READER", "").strip().lower()
    if forced in ("inline", "process"):
        return forced
    return "process" if mc.MT5_AVAILABLE else "inline"


def run(job: str, args: tuple, timeout: float, lane: str = "long"):
    """İşi bir okuyucuda koşar; en çok `timeout` sn bekler (inline kipte sınırsız).

    `lane="fast"`: sıcak grafiğin uç parçası; kendi okuyucusu var, uzun çekişlerin arkasında beklemez.
    Terminal tüm süreçlerin çağrılarını sıraya koyar (VPS 2026-11-10: hızlı iş, soğuk D1 yüklemesinin
    arkasında 87 sn bekledi). Hızlı okuyucunun önceki işi sürüyorsa yeni iş beklemeden düşer (1110-A3)."""
    if job not in JOBS:
        raise ValueError(f"unknown reader job {job!r}")
    if lane not in LANES:
        raise ValueError(f"unknown reader lane {lane!r}")
    if mode() == "inline":
        return _resolve(JOBS[job])(*args)
    with _pool_lock:
        pool = _pools.get(lane)
        if pool is None:
            pool = _pools[lane] = ReaderPool(LANES[lane], prefix=f"mt5-reader-{lane}")
    return pool.call(job, args, timeout, wait_busy=lane != "fast")


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
