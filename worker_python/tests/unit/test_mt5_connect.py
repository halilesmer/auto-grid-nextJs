"""SYS-06 MT5-Verbindung: startendes Terminal wird nicht beendet, Timeout ist ein Gesamtbudget.

Nachgestellt ist der VPS-Kaltstart vom 2026-09-24: /start (120 s) und die Symbolabfrage
(15 s) verbanden sich gleichzeitig, beendeten sich gegenseitig das startende terminal64.exe,
und /start antwortete erst nach ~19 min.

Simuliert (ohne MetaTrader5/psutil-Prozesse):
- eine Uhr (mt5_helpers/mt5_errors/mt5_connection benutzen sie statt `time`),
- terminal64.exe-Prozesse mit Startzeit, Bootdauer und „hängt“,
- BootingMT5: initialize(path, timeout) startet das Terminal bei Bedarf und wartet höchstens
  `timeout` ms auf dessen IPC; sonst -10005.
"""
import asyncio
import itertools
import sys
import threading
import time
from dataclasses import dataclass
from types import SimpleNamespace

import pytest

import src.utils.mt5_connection as mc
import src.utils.mt5_errors as me
import src.utils.mt5_helpers as mh
from tests.fakes.fake_mt5 import FakeMT5

LOGIN = 1001


class FakeClock:
    strftime = staticmethod(time.strftime)  # safe_log schreibt Zeitstempel

    def __init__(self):
        self.now = 1_000_000.0

    def monotonic(self):
        return self.now

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.now += max(0.0, seconds)


@dataclass
class SimTerminal:
    pid: int
    created: float
    boot_sec: float
    hung: bool = False


class BootingMT5(FakeMT5):
    def __init__(self, clock, exe, boot_sec):
        super().__init__()
        self.clock = clock
        self.exe = exe
        self.boot_sec = boot_sec
        self.procs: list[SimTerminal] = []
        self.killed: list[int] = []
        self.init_timeouts: list[float] = []
        self.ipc = False
        self._pids = itertools.count(2508)

    def start_terminal(self, age=0.0, boot_sec=None, hung=False) -> SimTerminal:
        term = SimTerminal(
            next(self._pids), self.clock.now - age, self.boot_sec if boot_sec is None else boot_sec, hung
        )
        self.procs.append(term)
        return term

    # ------------------------------------------------------------------ MT5-API
    def initialize(self, path=None, timeout=60000, **kwargs):
        self.initialize_calls += 1
        wait = timeout / 1000
        self.init_timeouts.append(wait)
        if not self.procs:
            self.start_terminal()  # initialize(path) startet das Terminal selbst
        term = self.procs[0]
        ready_in = term.created + term.boot_sec - self.clock.now
        if not term.hung and ready_in <= wait:
            self.clock.sleep(ready_in)
            self.ipc = True
            self._last_error = (1, "Success")
            return True
        self.clock.sleep(wait)
        self._last_error = (-10005, "IPC timeout")
        return False

    def shutdown(self):
        self.shutdown_called = True
        self.ipc = False

    def login(self, login, password=None, server=None):
        self.login_calls += 1
        return self.ipc

    def terminal_info(self):
        return self.terminal if self.ipc else None

    def account_info(self):
        return self.account if self.ipc else None

    # ------------------------------------------------------------------ psutil-Ersatz
    def process_iter(self, attrs=None):
        return [_FakeProc(self, t) for t in list(self.procs)]


class _FakeProc:
    def __init__(self, sim, term, create_time=...):
        self._sim, self._term = sim, term
        self.info = {
            "pid": term.pid,
            "name": "terminal64.exe",
            "exe": sim.exe,
            "create_time": term.created if create_time is ... else create_time,
        }

    def kill(self):
        self._sim.procs.remove(self._term)
        self._sim.killed.append(self._term.pid)

    def wait(self, timeout=None):
        return 0


@pytest.fixture
def mt5_env(tmp_path, monkeypatch):
    """Windows + MetaTrader5 vortäuschen; liefert (sim, clock, account, logs)."""
    exe = tmp_path / "terminal64.exe"
    exe.write_text("")
    clock = FakeClock()
    sim = BootingMT5(clock, str(exe), boot_sec=90)
    logs: list[str] = []

    monkeypatch.setitem(sys.modules, "MetaTrader5", sim)
    monkeypatch.setattr(mc, "mt5", sim, raising=False)
    monkeypatch.setattr(mc, "MT5_AVAILABLE", True)
    monkeypatch.setattr(mc, "safe_log", lambda msg, type="error", account_id=None: logs.append(msg))
    monkeypatch.setattr(mh, "platform", SimpleNamespace(system=lambda: "Windows"))
    for mod in (mh, me, mc):
        monkeypatch.setattr(mod, "time", clock)
    monkeypatch.setattr(me.psutil, "process_iter", sim.process_iter)

    account = {"login": LOGIN, "password": "pw", "server": "Fake-Demo", "type": "DEMO", "mt5_path": str(exe)}
    return sim, clock, account, logs


def _connect(account, clock, timeout, **kwargs):
    t0 = clock.now
    ok, is_timeout, detail = mc.connect_to_mt5_with_timeout(account, timeout, **kwargs)
    return ok, is_timeout, detail, clock.now - t0


# --------------------------------------------------------------------------- kill_zombie_mt5
@pytest.mark.feature("SYS-06")
@pytest.mark.parametrize(
    "age, create_time_readable, killed",
    [
        (30, True, False),    # startet noch → nicht beenden
        (179, True, False),
        (600, True, True),    # älter als die Schonfrist und hängt → beenden
        (600, False, False),  # Startzeit unlesbar → im Zweifel nicht beenden
    ],
)
def test_nur_terminal_aelter_als_schonfrist_wird_beendet(mt5_env, monkeypatch, age, create_time_readable, killed):
    sim, _, account, logs = mt5_env
    term = sim.start_terminal(age=age)
    if not create_time_readable:
        monkeypatch.setattr(sim, "process_iter", lambda attrs=None: [_FakeProc(sim, term, create_time=None)])
        monkeypatch.setattr(me.psutil, "process_iter", sim.process_iter)

    count = me.kill_zombie_mt5(account["mt5_path"], lambda msg, **_: logs.append(msg))

    assert count == (1 if killed else 0)
    assert sim.killed == ([term.pid] if killed else [])
    if not killed:
        assert any("henüz açılıyor" in m for m in logs)


# --------------------------------------------------------------------------- Kaltstart
@pytest.mark.feature("SYS-06")
def test_kaltstart_symbolabfrage_und_start_beenden_das_startende_terminal_nicht(mt5_env):
    sim, clock, account, logs = mt5_env
    sim.boot_sec = 120  # langsamer Kaltstart nach VPS-Neustart

    # 1. Symbolabfrage (15 s, darf nie neu starten) startet das Terminal und gibt auf
    ok, is_timeout, _, elapsed = _connect(account, clock, 15, allow_restart=False)
    assert not ok and is_timeout
    assert elapsed <= 15.5
    first_pid = sim.procs[0].pid

    # 2. /start (120 s) wartet auf genau dieses Terminal, statt es zu beenden
    ok, _, detail, elapsed = _connect(account, clock, 120)
    assert ok, detail
    assert sim.killed == []
    assert [t.pid for t in sim.procs] == [first_pid]
    assert elapsed <= 120 + 2  # + Login/Sync
    assert any("henüz açılıyor" in m for m in logs)


@pytest.mark.feature("SYS-06")
def test_symbolabfrage_beendet_nie_ein_terminal(mt5_env):
    sim, clock, account, _ = mt5_env
    sim.start_terminal(age=600, hung=True)  # alt und hängt – trotzdem nicht Sache der Symbolabfrage

    ok, is_timeout, _, elapsed = _connect(account, clock, 15, allow_restart=False)

    assert not ok and is_timeout
    assert sim.killed == []
    assert elapsed <= 15.5


@pytest.mark.feature("SYS-06")
def test_symbolabfrage_verbindet_ohne_neustart(monkeypatch):
    seen = {}

    def fake_connect(account_config, timeout=60, allow_restart=True):
        seen.update(timeout=timeout, allow_restart=allow_restart)
        return False, True, "[TIMEOUT] test"

    monkeypatch.setattr(mc, "connect_to_mt5_with_timeout", fake_connect)

    with pytest.raises(Exception, match="TIMEOUT"):
        asyncio.run(mh.fetch_and_cache_symbols("1001", {"login": LOGIN}, lambda *a, **k: None))
    assert seen == {"timeout": 15, "allow_restart": False}


# --------------------------------------------------------------------------- Zeitbudget
@pytest.mark.feature("SYS-06")
def test_haengendes_altes_terminal_wird_innerhalb_des_budgets_neu_gestartet(mt5_env):
    sim, clock, account, logs = mt5_env
    sim.boot_sec = 30  # das neu gestartete Terminal bootet in 30 s
    hung = sim.start_terminal(age=600, hung=True)

    ok, _, detail, elapsed = _connect(account, clock, 120)

    assert ok, detail
    assert sim.killed == [hung.pid]
    assert sim.init_timeouts[0] == pytest.approx(60, abs=0.5)  # erster Versuch: halbes Budget, Rest für den Neustart
    assert elapsed <= 120.5
    assert any("yeniden başlatılıyor" in m for m in logs)


@pytest.mark.feature("SYS-06")
def test_start_blockiert_nicht_weit_ueber_das_timeout(mt5_env):
    """Terminal antwortet nie (startet noch): vorher 3×120 s + Neustart + 3×120 s ≈ 12 min."""
    sim, clock, account, _ = mt5_env
    sim.start_terminal(age=0, hung=True)

    ok, is_timeout, detail, elapsed = _connect(account, clock, 120)

    assert not ok and is_timeout, detail
    assert elapsed <= 120 + mh._MIN_ATTEMPT_SEC
    assert sim.killed == []
    assert sim.initialize_calls <= 3


@pytest.mark.feature("SYS-06")
def test_warten_auf_mt5_sperre_zaehlt_zum_budget():
    """Hält ein anderer Thread die MT5-Sperre (hängende Verbindung), gibt /start nach dem Timeout auf."""
    holding, release = threading.Event(), threading.Event()

    def hold_lock():
        with mc._MT5_LOCK:
            holding.set()
            release.wait(5)

    t = threading.Thread(target=hold_lock)
    t.start()
    try:
        holding.wait(2)
        t0 = time.monotonic()
        ok, is_timeout, detail = mc.connect_to_mt5_with_timeout({"login": LOGIN}, 0.3)
        waited = time.monotonic() - t0
    finally:
        release.set()
        t.join()

    assert not ok and is_timeout
    assert detail.startswith("[TIMEOUT]")
    assert waited < 2


@pytest.mark.feature("SYS-06")
def test_init_fehler_10004_ist_kein_passwortfehler():
    ok, detail = me.parse_init_error((-10004, "No IPC connection"), LOGIN, "Fake-Demo", lambda *a, **k: None)
    assert not ok
    assert "-10004" in detail and "şifre" not in detail.lower()
