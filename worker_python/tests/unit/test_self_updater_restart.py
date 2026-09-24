"""UPD-05 Neustart nach Update: der Worker beendet sich, run_uvicorn_watchdog.bat startet ihn neu.

Früher rief hard_restart_server das nicht vorhandene scripts/launcher.py auf.
"""
from pathlib import Path

import pytest

import src.utils.self_updater as updater
from tests.conftest import WORKER_ROOT


class FakeTimer:
    started = []

    def __init__(self, delay, fn, args=()):
        self.delay, self.fn, self.args, self.daemon = delay, fn, args, False

    def start(self):
        FakeTimer.started.append(self)


@pytest.fixture
def timers(monkeypatch):
    FakeTimer.started = []
    monkeypatch.setattr(updater.threading, "Timer", FakeTimer)
    return FakeTimer.started


@pytest.mark.feature("UPD-05")
def test_unter_watchdog_beendet_sich_der_worker_verzoegert(monkeypatch, timers):
    monkeypatch.setenv(updater.SUPERVISED_ENV, "1")
    assert updater.schedule_restart() is True
    [timer] = timers
    # erst nach der HTTP-Antwort, als Hintergrund-Thread, per os._exit (Batch-Schleife startet neu)
    assert timer.delay > 0 and timer.daemon is True
    assert timer.fn is updater.os._exit and timer.args == (0,)


@pytest.mark.feature("UPD-05")
def test_ohne_watchdog_kein_neustart(monkeypatch, timers):
    monkeypatch.delenv(updater.SUPERVISED_ENV, raising=False)
    assert updater.schedule_restart() is False
    assert timers == []


@pytest.mark.feature("UPD-05")
def test_watchdog_batch_setzt_die_variable():
    bat = Path(WORKER_ROOT, "run_uvicorn_watchdog.bat").read_text(encoding="utf-8")
    loop = bat.index(":loop")
    assert f"set {updater.SUPERVISED_ENV}=1" in bat[:loop]
    assert "main.py" in bat[loop:] and "goto loop" in bat
