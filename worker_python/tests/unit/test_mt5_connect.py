"""SYS-06 MT5-Verbindung: startendes Terminal wird nicht beendet, Timeout ist ein Gesamtbudget,
fehlende „Python integration“ wird sofort gemeldet.

Nachgestellt ist der VPS-Kaltstart vom 2026-09-24: /start (120 s) und die Symbolabfrage
(15 s) verbanden sich gleichzeitig, beendeten sich gegenseitig das startende terminal64.exe,
und /start antwortete erst nach ~19 min. Danach am selben Tag: In MT5 war unter
Optionen → Community „Python integration“ abgewählt; das Terminal legte seinen Python-Kanal
(named pipe) nie an, und jeder Versuch wartete 60 s auf -10003.

Simuliert (ohne MetaTrader5/psutil-Prozesse):
- eine Uhr (mt5_helpers/mt5_errors/mt5_connection benutzen sie statt `time`),
- terminal64.exe-Prozesse mit Startzeit, Bootdauer, „hängt“ und Python-Kanal (named pipe),
- BootingMT5: initialize(path, timeout) startet das Terminal bei Bedarf und wartet höchstens
  `timeout` ms auf dessen IPC; sonst -10005 (bzw. -10003, wenn der Kanal fehlt).
"""
import asyncio
import itertools
import os
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
    python_integration: bool = True
    pipe_sec: float = 3.0  # so schnell legte das echte Terminal seinen Python-Kanal an

    def has_pipe(self, now):
        return self.python_integration and now - self.created >= self.pipe_sec


class BootingMT5(FakeMT5):
    def __init__(self, clock, exe, boot_sec):
        super().__init__()
        self.clock = clock
        self.exe = exe
        self.boot_sec = boot_sec
        self.python_integration = True  # für Terminals, die initialize selbst startet
        self.procs: list[SimTerminal] = []
        self.killed: list[int] = []
        self.init_timeouts: list[float] = []
        self.ipc = False
        self._pids = itertools.count(2508)

    def start_terminal(self, age=0.0, boot_sec=None, hung=False, python_integration=None, pipe_sec=3.0) -> SimTerminal:
        term = SimTerminal(
            next(self._pids),
            self.clock.now - age,
            self.boot_sec if boot_sec is None else boot_sec,
            hung,
            self.python_integration if python_integration is None else python_integration,
            pipe_sec,
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
        if term.python_integration and not term.hung and ready_in <= wait:
            self.clock.sleep(ready_in)
            self.ipc = True
            self._last_error = (1, "Success")
            return True
        self.clock.sleep(wait)
        if term.has_pipe(self.clock.now):
            self._last_error = (-10005, "IPC timeout")
        else:
            self._last_error = (-10003, "IPC initialize failed, Pipe server didn't answer in 60 sec")
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

    # ------------------------------------------------------------------ psutil-/Pipe-Ersatz
    def process_iter(self, attrs=None):
        return [_FakeProc(self, t) for t in list(self.procs)]

    def pipes(self):
        name = me.mt5_pipe_name(os.path.realpath(self.exe))
        return [name] if any(t.has_pipe(self.clock.now) for t in self.procs) else []


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
    monkeypatch.setattr(me, "_list_pipes", sim.pipes)

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


# --------------------------------------------------------------------------- Python integration
PYTHON_INTEGRATION_HINT = "Python integration"


@pytest.mark.feature("SYS-06")
def test_pipe_name_wie_die_metatrader5_bibliothek():
    """Name des Kanals, den das Terminal auf dem VPS für diesen Pfad anlegte."""
    assert me.mt5_pipe_name(r"C:\Program Files\MT5_EC_D_H_34\terminal64.exe") == (
        "MT5.Terminal.D265C4EC8A33037D96297AAEB6A2278C22A89E6FA5555FB4BE6CD1A53EA0E5E8"
    )


@pytest.mark.feature("SYS-06")
@pytest.mark.parametrize("timeout, allow_restart", [(120, True), (15, False)])  # /start bzw. Symbolabfrage
def test_offenes_terminal_ohne_python_integration_sofort_klare_meldung(mt5_env, timeout, allow_restart):
    """Vorher: 60 s pro initialize-Versuch, dann -10003 „gleiche Adminrechte?“; Neustart half nie."""
    sim, clock, account, logs = mt5_env
    sim.start_terminal(age=600, python_integration=False)

    ok, is_timeout, detail, elapsed = _connect(account, clock, timeout, allow_restart=allow_restart)

    assert not ok and not is_timeout
    assert PYTHON_INTEGRATION_HINT in detail and "Community" in detail
    assert sim.initialize_calls == 0
    assert sim.killed == []
    assert elapsed < 1


@pytest.mark.feature("SYS-06")
def test_kaltstart_ohne_python_integration_meldet_nach_erstem_versuch(mt5_env):
    """initialize startet das Terminal selbst (VPS-Neustart): ein Versuch, kein Neustart, klare Meldung."""
    sim, clock, account, _ = mt5_env
    sim.python_integration = False

    ok, is_timeout, detail, elapsed = _connect(account, clock, 120)

    assert not ok and not is_timeout
    assert PYTHON_INTEGRATION_HINT in detail
    assert sim.initialize_calls == 1
    assert sim.killed == []
    assert elapsed <= 60.5  # erster Versuch = halbes Budget; vorher 120 s und -10003


@pytest.mark.feature("SYS-06")
@pytest.mark.parametrize(
    "python_integration, expect_ok, max_elapsed",
    [
        (True, True, 12 + 2),  # Kanal nach 10 s, IPC nach 12 s: normal verbinden (+ Login/Sync)
        (False, False, me.MT5_PIPE_STARTUP_SEC + 1),  # Kanal kommt nie: Meldung, sobald das Terminal 30 s alt ist
    ],
)
def test_startendes_terminal_wird_auf_python_kanal_abgewartet(mt5_env, python_integration, expect_ok, max_elapsed):
    sim, clock, account, _ = mt5_env
    sim.start_terminal(age=0, boot_sec=12, pipe_sec=10, python_integration=python_integration)

    ok, _, detail, elapsed = _connect(account, clock, 120)

    assert ok == expect_ok, detail
    assert (PYTHON_INTEGRATION_HINT in (detail or "")) == (not expect_ok)
    assert elapsed <= max_elapsed
    assert sim.killed == []


@pytest.mark.feature("SYS-06")
def test_kanal_eines_anderen_terminals_blockiert_nicht(mt5_env, monkeypatch):
    """Zweites Konto mit eigenem Terminal: ohne Gewissheit keine Sperre, sondern normaler Versuch."""
    sim, clock, account, _ = mt5_env
    sim.start_terminal(age=600, python_integration=False)
    monkeypatch.setattr(me, "_list_pipes", lambda: ["MT5.Terminal.0123ABCD", "MT5.Terminal.Debugger.0123ABCD"])

    ok, _, detail, _ = _connect(account, clock, 15, allow_restart=False)

    assert not ok
    assert sim.initialize_calls >= 1
    assert PYTHON_INTEGRATION_HINT not in detail


@pytest.mark.feature("SYS-06")
@pytest.mark.parametrize(
    "pipes, age, expected",
    [
        (None, 600, "unknown"),  # Kanäle nicht lesbar (kein Windows)
        ([], None, "unknown"),  # Startzeit unlesbar
        ([], 600, "missing"),
        ([], 5, "starting"),
        (["MT5.Terminal.Debugger.ABC"], 600, "missing"),  # MetaEditor-Debugger-Kanal zählt nicht
    ],
)
def test_python_pipe_state(mt5_env, monkeypatch, pipes, age, expected):
    sim, _, account, _ = mt5_env
    term = sim.start_terminal(age=600 if age is None else age, python_integration=False)
    if age is None:
        monkeypatch.setattr(me.psutil, "process_iter", lambda attrs=None: [_FakeProc(sim, term, create_time=None)])
    monkeypatch.setattr(me, "_list_pipes", lambda: pipes)

    assert me.python_pipe_state(account["mt5_path"]) == expected


@pytest.mark.feature("SYS-06")
def test_python_pipe_state_ohne_terminal_und_mit_kanal(mt5_env):
    sim, _, account, _ = mt5_env
    assert me.python_pipe_state(account["mt5_path"]) == "no_terminal"
    sim.start_terminal(age=600)
    assert me.python_pipe_state(account["mt5_path"]) == "ready"
