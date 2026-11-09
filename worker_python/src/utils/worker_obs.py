"""1109-R5: Worker-Beobachtbarkeit (nur messen, Verhalten bleibt gleich).

- `obs_log`: schmaler Logger, schreibt auf stdout (-> logs/worker_console.log), grep: `[rates-timing]`, `[heartbeat]`.
- Heartbeat: ein Thread und eine asyncio-Task ticken alle ~250 ms. Kommt ein Tick >1 s zu spaet, wird die
  Verspaetung geloggt. Thread UND Schleife spaet -> der Prozess haengt (GIL gehalten). Nur Schleife spaet ->
  die Ereignisschleife ist blockiert, der Thread laeuft frei.
- Abschalten: Umgebungsvariable WORKER_HEARTBEAT=0.
"""
import asyncio
import logging
import os
import sys
import threading
import time

TICK_SEC = 0.25
LATE_SEC = 1.0

obs_log = logging.getLogger("grid.obs")
if not obs_log.handlers:
    class _LiveStdout(logging.StreamHandler):
        """Schreibt auf das AKTUELLE sys.stdout: console_tee ersetzt es erst nach dem Import."""

        def __init__(self):
            super().__init__(sys.stdout)

        @property
        def stream(self):
            return sys.stdout

        @stream.setter
        def stream(self, _value):
            pass

    _h = _LiveStdout()
    _h.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    obs_log.addHandler(_h)
    obs_log.setLevel(logging.INFO)
    obs_log.propagate = False


def heartbeat_enabled() -> bool:
    return os.environ.get("WORKER_HEARTBEAT", "1").strip().lower() not in ("0", "false", "off", "no")


def check_tick(kind: str, expected: float, now: float, late_sec: float = LATE_SEC) -> float | None:
    """Loggt, wenn `now` mehr als `late_sec` nach `expected` liegt; gibt die Verspaetung oder None zurueck."""
    late = now - expected
    if late > late_sec:
        obs_log.warning("[heartbeat] %s late %.1fs", kind, late)
        return late
    return None


def _thread_loop(stop: threading.Event, tick=TICK_SEC, clock=time.monotonic):
    expected = clock() + tick
    while not stop.wait(tick):
        now = clock()
        check_tick("thread", expected, now)
        expected = now + tick


async def _loop_task(tick=TICK_SEC, clock=time.monotonic, sleep=asyncio.sleep):
    expected = clock() + tick
    while True:
        await sleep(tick)
        now = clock()
        check_tick("loop", expected, now)
        expected = now + tick


def start_heartbeat(loop: asyncio.AbstractEventLoop):
    """Startet Thread + Task. Gibt (Thread-Stopp-Event, Task) zurueck oder None, wenn abgeschaltet."""
    if not heartbeat_enabled():
        return None
    stop = threading.Event()
    threading.Thread(target=_thread_loop, args=(stop,), name="heartbeat", daemon=True).start()
    return stop, loop.create_task(_loop_task())
