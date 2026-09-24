"""LOG-01 … LOG-03 Logs · LOG-06 MT5-Log-Tab · UPD-01 Update-Prüfung · SYS-03 Plattform · SYS-04 MT5-Scanner."""
import io
import json
import sys
import zipfile

import pytest

from tests.conftest import TEST_ACCOUNT_ID

LOGS_URL = f"/api/logs/{TEST_ACCOUNT_ID}"


@pytest.fixture
def account_logs(worker_dir):
    """Log-Ordner des Testkontos mit Robot-Log, MT5-Kopien (UTF-16) und Bot-Metriken."""
    d = worker_dir / "logs" / TEST_ACCOUNT_ID
    (d / "mt5_terminal").mkdir(parents=True, exist_ok=True)
    (d / f"err_{TEST_ACCOUNT_ID}.log").write_text(
        "".join(f"[2026-09-24 08:00:{i:02d}] [INFO] Zeile {i}\n" for i in range(30)), encoding="utf-8"
    )
    (d / "mt5_terminal" / "MT5_Terminal_20260923.log").write_bytes("﻿alt 1\r\nalt 2\r\n".encode("utf-16-le"))
    (d / "mt5_terminal" / "MT5_Terminal_20260924.log").write_bytes(
        "﻿NQ\t0\tTrades\tbuy limit 0.01 USOUSD\r\nKR\t0\tTrades\tdone\r\n".encode("utf-16-le")
    )
    (d / f"met_{TEST_ACCOUNT_ID}.json").write_text(json.dumps({"mt5_connected": True, "open_positions": 3}))
    (worker_dir / "data" / f"state_{TEST_ACCOUNT_ID}.json").write_text("{}")
    (worker_dir / "configs" / f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json").write_text("{}")
    return d


@pytest.fixture
def bot_running(monkeypatch):
    import src.api.logs as logs_api

    state = {"running": False}
    monkeypatch.setattr(logs_api, "is_bot_running", lambda acc: state["running"])
    return state


# --------------------------------------------------------------------------- LOG-01
@pytest.mark.feature("LOG-01")
def test_logs_liefern_robot_mt5_und_metriken(client, account_logs, bot_running):
    bot_running["running"] = True
    body = client.get(LOGS_URL, params={"log_type": "all", "lines": 5}).json()
    assert body["robot_log"] == [f"[2026-09-24 08:00:{i:02d}] [INFO] Zeile {i}" for i in range(25, 30)]
    assert body["metrics"] == {"mt5_connected": True, "open_positions": 3}
    assert body["bot_running"] is True


@pytest.mark.feature("LOG-01")
def test_gestoppter_bot_meldet_nicht_verbunden(client, account_logs, bot_running):
    body = client.get(LOGS_URL, params={"log_type": "metrics"}).json()
    assert body["bot_running"] is False and body["metrics"]["mt5_connected"] is False
    assert "robot_log" not in body


# --------------------------------------------------------------------------- LOG-06
@pytest.mark.feature("LOG-06")
def test_mt5_tab_liest_neueste_kopie_utf16(client, account_logs, bot_running):
    body = client.get(LOGS_URL, params={"log_type": "mt5"}).json()
    assert body["mt5_log"] == ["NQ\t0\tTrades\tbuy limit 0.01 USOUSD", "KR\t0\tTrades\tdone"]


# --------------------------------------------------------------------------- LOG-02
@pytest.mark.feature("LOG-02")
def test_logs_leeren_kuerzt_nur_log_dateien(client, account_logs):
    assert client.delete(LOGS_URL).json()["status"] == "success"
    assert (account_logs / f"err_{TEST_ACCOUNT_ID}.log").read_text() == ""
    assert json.loads((account_logs / f"met_{TEST_ACCOUNT_ID}.json").read_text())["open_positions"] == 3


# --------------------------------------------------------------------------- LOG-03
@pytest.mark.feature("LOG-03")
def test_zip_download_enthaelt_logs_state_und_settings(client, account_logs):
    res = client.get(f"/api/logs/download/{TEST_ACCOUNT_ID}")
    assert res.status_code == 200 and res.headers["content-type"] == "application/zip"
    assert f"MT5_Logs_and_Configs_{TEST_ACCOUNT_ID}.zip" in res.headers["content-disposition"]
    names = set(zipfile.ZipFile(io.BytesIO(res.content)).namelist())
    assert {
        f"logs/err_{TEST_ACCOUNT_ID}.log",
        f"logs/met_{TEST_ACCOUNT_ID}.json",
        "logs/mt5_terminal/MT5_Terminal_20260924.log",
        f"state_{TEST_ACCOUNT_ID}.json",
        f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json",
    } <= names


# --------------------------------------------------------------------------- UPD-01
@pytest.mark.feature("UPD-01")
def test_update_pruefung(client, monkeypatch):
    import src.api.system as system

    monkeypatch.setattr(system, "check_for_updates", lambda branch: (True, (True, "v0.7.61", "v0.7.62")))
    assert client.get("/api/system/update/check").json() == {
        "has_update": True, "local_ver": "v0.7.61", "remote_ver": "v0.7.62"}

    monkeypatch.setattr(system, "check_for_updates", lambda branch: (False, "kein git"))
    body = client.get("/api/system/update/check").json()
    assert body["has_update"] is False and body["error"] == "kein git"


# --------------------------------------------------------------------------- SYS-03
@pytest.mark.feature("SYS-03")
def test_plattform(client, monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    assert client.get("/api/system/platform").json() == {"platform": "win32", "is_windows": True}
    monkeypatch.setattr(sys, "platform", "darwin")
    assert client.get("/api/system/platform").json()["is_windows"] is False


# --------------------------------------------------------------------------- SYS-04
@pytest.mark.feature("SYS-04")
def test_mt5_scanner_findet_terminals(client, monkeypatch, tmp_path):
    program_files = tmp_path / "ProgramFiles"
    for folder in ("MetaTrader 5", "MT5_EC_Demo", "Andere App"):
        (program_files / folder).mkdir(parents=True)
        (program_files / folder / "terminal64.exe").write_text("")
    (program_files / "MT5_ohne_exe").mkdir()
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("ProgramFiles", str(program_files))
    monkeypatch.setenv("ProgramFiles(x86)", str(tmp_path / "gibt-es-nicht"))

    paths = client.get("/api/system/scan-mt5").json()["paths"]
    assert sorted(p.split("/")[-2] for p in paths) == ["MT5_EC_Demo", "MetaTrader 5"]


@pytest.mark.feature("SYS-04")
def test_mt5_scanner_ausserhalb_windows_leer(client, monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    assert client.get("/api/system/scan-mt5").json() == {"paths": [], "platform": "darwin"}
