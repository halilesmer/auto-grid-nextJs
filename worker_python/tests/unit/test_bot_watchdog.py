"""BOT-03 Neustart veralteter/hängender Bot · BOT-05 Watchdog-Neustart · BOT-06 Watchdog gibt auf."""
import asyncio
import json
import os
import time
from types import SimpleNamespace

import pytest

import src.api.bot_control as bot_control
import src.utils.bot_manager as bot_manager
import src.utils.bot_watchdog as wd
from src.utils.paths import get_metrics_path, get_pid_path
from tests.conftest import TEST_ACCOUNT_ID


# --------------------------------------------------------------------------- BOT-03
@pytest.mark.feature("BOT-03")
@pytest.mark.parametrize(
    "pid_content, current, outdated",
    [
        ("4711\nv0.7.61", "v0.7.62", True),   # Bot läuft mit altem Code
        ("4711\nv0.7.62", "v0.7.62", False),  # aktuell
        ("4711", "v0.7.62", True),            # alte PID-Datei ohne Version
        ("4711\nv0.7.61", "", False),         # VERSION unlesbar → nicht neu starten
    ],
)
def test_veralteter_bot_wird_erkannt(monkeypatch, pid_content, current, outdated):
    with open(get_pid_path(TEST_ACCOUNT_ID), "w") as f:
        f.write(pid_content)
    monkeypatch.setattr(bot_manager, "_current_version", lambda: current)
    assert bot_manager.is_bot_outdated(TEST_ACCOUNT_ID) is outdated


@pytest.mark.feature("BOT-03")
def test_laufender_bot_ohne_frische_metriken_gilt_als_ungesund(monkeypatch):
    path = get_metrics_path(TEST_ACCOUNT_ID)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"mt5_connected": True}, f)
    assert bot_control._running_bot_is_healthy(TEST_ACCOUNT_ID) is True

    old = time.time() - 181
    os.utime(path, (old, old))
    assert bot_control._running_bot_is_healthy(TEST_ACCOUNT_ID) is False

    os.remove(path)  # noch keine Metriken: gesund nur in den ersten 180 s nach dem Start
    monkeypatch.setattr(bot_control, "get_bot_process_age", lambda acc: 30)
    assert bot_control._running_bot_is_healthy(TEST_ACCOUNT_ID) is True
    monkeypatch.setattr(bot_control, "get_bot_process_age", lambda acc: 400)
    assert bot_control._running_bot_is_healthy(TEST_ACCOUNT_ID) is False


# --------------------------------------------------------------------------- Watchdog-Harness
@pytest.fixture
def watchdog(monkeypatch):
    """Steuerbare Uhr + Bot-Zustand; _restart zeichnet nur auf (startet keinen Prozess)."""
    clock = {"now": 1_000_000.0}
    bot = {"running": False, "age": None, "hung": False, "exists": True}
    restarts = []

    monkeypatch.setattr(wd, "time", SimpleNamespace(time=lambda: clock["now"]))
    monkeypatch.setattr(wd, "is_bot_running", lambda acc: bot["running"])
    monkeypatch.setattr(wd, "get_bot_process_age", lambda acc: bot["age"])
    monkeypatch.setattr(wd, "_is_hung", lambda acc: bot["hung"])
    monkeypatch.setattr(wd, "_account_exists", lambda acc: bot["exists"])
    monkeypatch.setattr(wd, "_restart", lambda acc, entry, hung: restarts.append((clock["now"], hung)) or True)
    monkeypatch.setattr(wd, "log_step", lambda *a, **k: None)
    wd._watched.clear()
    wd.watch(TEST_ACCOUNT_ID)

    def check():
        entry = wd._watched.get(TEST_ACCOUNT_ID)
        if entry is not None:
            asyncio.run(wd._check_account(TEST_ACCOUNT_ID, entry))

    yield SimpleNamespace(clock=clock, bot=bot, restarts=restarts, check=check)
    wd._watched.clear()


# --------------------------------------------------------------------------- BOT-05
@pytest.mark.feature("BOT-05")
def test_abgestuerzter_bot_wird_mit_wachsendem_abstand_neu_gestartet(watchdog):
    w = watchdog
    w.check()
    assert w.restarts == [(1_000_000.0, False)]

    w.clock["now"] += 10  # Backoff 15 s noch nicht abgelaufen
    w.check()
    assert len(w.restarts) == 1

    w.clock["now"] += 6
    w.check()
    assert len(w.restarts) == 2
    entry = wd._watched[TEST_ACCOUNT_ID]
    assert entry.next_attempt_at - w.clock["now"] == 30  # zweiter Versuch → 30 s Pause


@pytest.mark.feature("BOT-05")
def test_haengender_bot_wird_neu_gestartet_gesunder_nicht(watchdog):
    w = watchdog
    w.bot.update(running=True, age=700, hung=False)
    w.check()
    assert w.restarts == []
    w.bot["hung"] = True
    w.check()
    assert w.restarts == [(w.clock["now"], True)]


@pytest.mark.feature("BOT-05")
def test_haenger_erkennung_nach_metrik_alter(monkeypatch):
    monkeypatch.setattr(wd, "get_bot_process_age", lambda acc: 100)
    assert wd._is_hung(TEST_ACCOUNT_ID) is False  # noch in der Startphase
    monkeypatch.setattr(wd, "get_bot_process_age", lambda acc: 900)
    assert wd._is_hung(TEST_ACCOUNT_ID) is True  # 15 min alt, nie Metriken geschrieben
    with open(get_metrics_path(TEST_ACCOUNT_ID), "w") as f:
        f.write("{}")
    assert wd._is_hung(TEST_ACCOUNT_ID) is False  # frische Metriken


@pytest.mark.feature("BOT-05")
def test_stabiler_bot_setzt_den_zaehler_zurueck(watchdog):
    w = watchdog
    w.check()
    w.clock["now"] += 20
    w.check()
    assert len(wd._watched[TEST_ACCOUNT_ID].restarts) == 2
    w.bot.update(running=True, age=wd.STABLE_SECONDS + 1, hung=False)
    w.check()
    assert wd._watched[TEST_ACCOUNT_ID].restarts == []


# --------------------------------------------------------------------------- BOT-06
@pytest.mark.feature("BOT-06")
def test_nach_fuenf_neustarts_in_30_min_wird_aufgegeben(watchdog):
    w = watchdog
    for _ in range(wd.MAX_RESTARTS):
        w.check()
        w.clock["now"] += 300  # jeweils nach Ablauf des Backoffs
    assert len(w.restarts) == wd.MAX_RESTARTS
    w.check()
    assert len(w.restarts) == wd.MAX_RESTARTS
    assert not wd.is_watched(TEST_ACCOUNT_ID)


@pytest.mark.feature("BOT-06")
def test_neustarts_ausserhalb_des_fensters_zaehlen_nicht(watchdog):
    w = watchdog
    for _ in range(wd.MAX_RESTARTS):
        w.check()
        w.clock["now"] += 500  # 5 × 500 s = 2500 s > 30-min-Fenster
    w.check()
    assert len(w.restarts) == wd.MAX_RESTARTS + 1
    assert wd.is_watched(TEST_ACCOUNT_ID)


@pytest.mark.feature("BOT-06")
def test_geloeschtes_konto_wird_nicht_mehr_beobachtet(watchdog):
    watchdog.bot["exists"] = False
    watchdog.check()
    assert watchdog.restarts == [] and not wd.is_watched(TEST_ACCOUNT_ID)
