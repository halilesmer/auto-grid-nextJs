"""ANA-04 / 1109-R5: Heartbeat meldet Verspaetung von Thread und Ereignisschleife (Fake-Uhr, kein echtes Warten)."""
import asyncio
import logging

import pytest

from src.utils import worker_obs


@pytest.fixture
def lines():
    out = []

    class Grab(logging.Handler):
        def emit(self, record):
            out.append(record.getMessage())

    h = Grab()
    worker_obs.obs_log.addHandler(h)
    yield out
    worker_obs.obs_log.removeHandler(h)


@pytest.mark.feature("ANA-04")
def test_check_tick_logs_only_when_late(lines):
    assert worker_obs.check_tick("thread", 10.0, 10.9) is None
    assert lines == []
    late = worker_obs.check_tick("thread", 10.0, 12.5)
    assert late == pytest.approx(2.5)
    assert lines == ["[heartbeat] thread late 2.5s"]


@pytest.mark.feature("ANA-04")
def test_loop_task_detects_blocked_loop(lines):
    clock_values = iter([0.0, 0.3, 3.35])  # Start, puenktlicher Tick, dann 2,8 s zu spaet
    ticks = {"n": 0}

    async def fake_sleep(_):
        ticks["n"] += 1
        if ticks["n"] > 2:
            raise asyncio.CancelledError

    async def run():
        with pytest.raises(asyncio.CancelledError):
            await worker_obs._loop_task(tick=0.25, clock=lambda: next(clock_values), sleep=fake_sleep)

    asyncio.run(run())
    assert lines == ["[heartbeat] loop late 2.8s"]


@pytest.mark.feature("ANA-04")
def test_heartbeat_can_be_disabled(monkeypatch):
    monkeypatch.setenv("WORKER_HEARTBEAT", "0")
    assert worker_obs.start_heartbeat(None) is None
    monkeypatch.delenv("WORKER_HEARTBEAT")
    assert worker_obs.heartbeat_enabled()


@pytest.mark.feature("ANA-04")
def test_obs_log_follows_replaced_stdout(monkeypatch):
    """console_tee ersetzt sys.stdout nach dem Import: das Log muss trotzdem im neuen Strom landen."""
    import io
    import sys

    buf = io.StringIO()
    monkeypatch.setattr(sys, "stdout", buf)
    worker_obs.obs_log.info("[rates-timing] probe")
    assert "[rates-timing] probe" in buf.getvalue()
