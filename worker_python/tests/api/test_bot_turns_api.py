"""ENG-35: Tur telemetrisi: kayıt, yazma hatası, GET /api/bot/{id}/turns (erişim, aralık)."""
import gzip
import os
import time

import pytest

from tests.api.conftest import account

pytestmark = pytest.mark.feature("ENG-35")

DAY = 86400000
BASE = (int(time.time() * 1000) // DAY - 5) * DAY + 3_600_000  # 5 gün önce, gün başı + 1 sa (UTC)


@pytest.fixture
def multi(client, seed_accounts, monkeypatch):
    from src.api import auth, users_store

    admin = "admin-" + "key-for-tests"
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin)
    anna, anna_key = users_store.create_user("Anna")
    _, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"], mt5_path=""), account("1002", mt5_path=""))
    return {"anna": {"X-API-Key": anna_key}, "ben": {"X-API-Key": ben_key}, "admin": {"X-API-Key": admin}}


def _record(account_id, rows):
    from src.utils.turn_log import TurnRecorder

    rec = TurnRecorder(account_id)
    for r in rows:
        rec.add(*r)
    rec.flush()


def test_roundtrip_compact_and_sorted(client, multi):
    _record("1001", [(BASE, 2105, "t", 3), (BASE + 2105, 2100, "t", 2), (BASE + 5000, 40, "m", 0)])
    res = client.get(f"/api/bot/1001/turns?from={BASE}&to={BASE + 10000}", headers=multi["anna"])
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 3 and body["t0"] == BASE
    assert body["dt"] == [2105, 2895]
    assert body["dur"] == [2105, 2100, 40]
    assert body["kind"] == ["t", "t", "m"]
    assert body["pre"] == [3, 2, 0]
    assert "1001" == body["account_id"]


def test_half_open_range_and_two_days(client, multi):
    _record("1001", [(BASE, 1, "t", 0), (BASE + DAY, 1, "t", 0), (BASE + 2 * DAY - 1, 1, "t", 0)])
    body = client.get(f"/api/bot/1001/turns?from={BASE}&to={BASE + 2 * DAY}", headers=multi["admin"]).json()
    assert body["count"] == 3
    body = client.get(f"/api/bot/1001/turns?from={BASE}&to={BASE + DAY}", headers=multi["admin"]).json()
    assert body["count"] == 1


def test_range_limit_and_validation(client, multi):
    assert client.get(f"/api/bot/1001/turns?from={BASE}&to={BASE + 2 * DAY + 1}", headers=multi["admin"]).status_code == 422
    assert client.get(f"/api/bot/1001/turns?from={BASE}&to={BASE}", headers=multi["admin"]).status_code == 422
    assert client.get("/api/bot/1001/turns", headers=multi["admin"]).status_code == 422


def test_foreign_account_404_and_no_key_401(client, multi):
    _record("1001", [(BASE, 1, "t", 0)])
    q = f"?from={BASE}&to={BASE + 1000}"
    assert client.get("/api/bot/1001/turns" + q, headers=multi["ben"]).status_code == 404
    assert client.get("/api/bot/1002/turns" + q, headers=multi["anna"]).status_code == 404
    assert client.get("/api/bot/1001/turns" + q).status_code == 401
    assert client.get("/api/bot/9999/turns" + q, headers=multi["anna"]).status_code == 404


def test_empty_without_files(client, multi):
    body = client.get(f"/api/bot/1001/turns?from={BASE}&to={BASE + 1000}", headers=multi["anna"]).json()
    assert body["count"] == 0 and body["t0"] is None and body["dt"] == []


def test_write_failure_never_raises_and_prints_nothing(worker_dir, monkeypatch, capsys):
    from src.utils import turn_log

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(turn_log, "get_turns_dir", boom)
    rec = turn_log.TurnRecorder("1001")
    for i in range(turn_log.FLUSH_ROWS * 2 + 1):
        rec.add(BASE + i, 1, "t")
    rec.flush()
    out = capsys.readouterr()
    assert out.out == "" and out.err == "" and rec.errors >= 1


def test_prune_removes_only_old_files(worker_dir):
    from src.utils import turn_log
    from src.utils.paths import get_turns_dir

    now = int(time.time() * 1000)
    d = get_turns_dir("1001")
    os.makedirs(d)
    for ms in (now - 40 * DAY, now):
        with open(os.path.join(d, f"turns_{turn_log._day_of(ms)}.csv.gz"), "wb") as fh:
            fh.write(gzip.compress(b"1,1,t,0\n"))
    turn_log.prune_old(d)
    assert os.listdir(d) == [f"turns_{turn_log._day_of(now)}.csv.gz"]


def test_appended_members_and_torn_tail(worker_dir):
    from src.utils import turn_log
    from src.utils.paths import get_turns_dir

    _record("1001", [(BASE, 1, "t", 0)])
    _record("1001", [(BASE + 1, 2, "t", 0)])
    path = os.path.join(get_turns_dir("1001"), f"turns_{turn_log._day_of(BASE)}.csv.gz")
    assert len(turn_log.read_turns("1001", BASE, BASE + 10)) == 2
    with open(path, "ab") as fh:  # yarım yazılmış üye
        fh.write(gzip.compress(b"x" * 500 + bytes(range(256)))[:-9])
    assert len(turn_log.read_turns("1001", BASE, BASE + 10)) == 2
    with open(path, "ab") as fh:  # bozuk üyenin ardına yeni üye
        fh.write(gzip.compress(f"{BASE + 2},3,t,0\n".encode()))
    assert len(turn_log.read_turns("1001", BASE, BASE + 10)) >= 2  # 500 vermez


def test_partial_line_and_bad_line_skipped(worker_dir):
    from src.utils import turn_log
    from src.utils.paths import get_turns_dir

    d = get_turns_dir("1001")
    os.makedirs(d)
    data = f"{BASE},5,t,1\nbad,line\n{BASE + 1},x,t,0\n{BASE + 2},7,t,3\n{BASE + 3},9,t,3".encode()
    with open(os.path.join(d, f"turns_{turn_log._day_of(BASE)}.csv.gz"), "wb") as fh:
        fh.write(gzip.compress(data))
    rows = turn_log.read_turns("1001", BASE, BASE + 100)
    assert [r[0] for r in rows] == [BASE, BASE + 2]


def test_range_across_midnight(worker_dir):
    from src.utils import turn_log

    midnight = (BASE // DAY + 1) * DAY
    _record("1001", [(midnight - 1000, 1, "t", 0), (midnight + 1000, 1, "t", 0)])
    assert len(turn_log.read_turns("1001", midnight - 5000, midnight + 5000)) == 2


def test_huge_from_is_422(client, multi):
    assert client.get("/api/bot/1001/turns?from=99999999999999999", headers=multi["admin"]).status_code == 422


def test_time_based_handoff(worker_dir, monkeypatch):
    from src.utils import turn_log

    rec = turn_log.TurnRecorder("1001")
    rec.add(BASE, 1, "t")
    monkeypatch.setattr(turn_log, "FLUSH_SECONDS", 0)
    rec.add(BASE + 1, 1, "t")
    rec.flush()
    assert len(turn_log.read_turns("1001", BASE, BASE + 10)) == 2


def test_main_loop_records_turns_without_changing_flow(worker_dir, monkeypatch):
    from src.core import loop
    from src.core.state import state
    from src.utils.paths import get_turns_dir

    calls = {"n": 0}

    def fake_manage():
        calls["n"] += 1
        if calls["n"] == 3:
            state.is_running = False

    monkeypatch.setattr(loop, "load_dynamic_settings", lambda: None)
    monkeypatch.setattr(loop, "run_startup_checks", lambda m: True)
    monkeypatch.setattr(loop, "check_connection_health", lambda *a: (True, 0))
    monkeypatch.setattr(loop, "check_remote_commands_wrapper", lambda: None)
    monkeypatch.setattr(loop, "manage_dynamic_grid", fake_manage)
    monkeypatch.setattr(loop, "netting_conflict", lambda *a: None)
    monkeypatch.setattr(loop, "_cleanup", lambda m: None)
    monkeypatch.setattr(loop, "log_message", lambda *a, **k: None)
    monkeypatch.setattr(loop.time, "sleep", lambda s: None)
    monkeypatch.setattr(state, "active_symbols", [], raising=False)
    monkeypatch.setattr(state, "initial_cleanup_done", True, raising=False)
    loop.main_loop(object(), "1001", "pw", "srv")
    assert calls["n"] == 3
    from src.utils.turn_log import read_turns

    now = int(time.time() * 1000)
    rows = read_turns("1001", now - 60000, now + 60000)
    assert [r[2] for r in rows] == ["t", "t", "t"]
    assert all(r[3] >= 0 for r in rows)
    assert os.path.isdir(get_turns_dir("1001"))


@pytest.mark.parametrize("kind", ["c", "m", "n"])
def test_main_loop_skip_kinds(worker_dir, monkeypatch, kind):
    from src.core import loop
    from src.core.state import state
    from src.utils.turn_log import read_turns

    manage_calls = []

    def stop_sleep(s):
        state.is_running = False

    monkeypatch.setattr(loop, "load_dynamic_settings", lambda: None)
    monkeypatch.setattr(loop, "run_startup_checks", lambda m: True)
    monkeypatch.setattr(loop, "check_connection_health", lambda *a: (kind != "c", 0))
    monkeypatch.setattr(loop, "check_remote_commands_wrapper", lambda: None)
    monkeypatch.setattr(loop, "manage_dynamic_grid", lambda: manage_calls.append(1))
    monkeypatch.setattr(loop, "netting_conflict", lambda *a: "x" if kind == "n" else None)
    monkeypatch.setattr(loop, "is_market_open", lambda m, s: kind != "m")
    monkeypatch.setattr(loop, "refresh_spread_guard", lambda *a: None)
    monkeypatch.setattr(loop, "_cleanup", lambda m: None)
    monkeypatch.setattr(loop, "log_message", lambda *a, **k: None)
    monkeypatch.setattr(loop.time, "sleep", stop_sleep)
    monkeypatch.setattr(state, "active_symbols", ["EURUSD"], raising=False)
    monkeypatch.setattr(state, "initial_cleanup_done", True, raising=False)
    loop.main_loop(object(), "1001", "pw", "srv")
    now = int(time.time() * 1000)
    assert [r[2] for r in read_turns("1001", now - 60000, now + 60000)] == [kind]
    assert manage_calls == []
