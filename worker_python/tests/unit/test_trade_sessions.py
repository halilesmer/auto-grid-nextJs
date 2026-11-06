"""BKT-21: Handelsseiten des Brokers (autogrid_trade_sessions.json aus dem MQL5-Export) für den Backtest."""
import json

import pytest

from src.utils import trade_sessions

DAY = [[7200, 86400]]  # 02:00–24:00
WEEK = [[], DAY, DAY, DAY, DAY, [[7200, 79200]], []]  # So … Sa


def write(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def doc(symbols=None, server="Fake-Demo"):
    return {"version": 1, "server": server, "exported_at": "2026-11-06 10:00", "symbols": symbols or {"XAUUSD": WEEK}}


@pytest.fixture(autouse=True)
def fresh_cache():
    trade_sessions.reset_cache()


@pytest.mark.feature("BKT-21")
def test_gueltige_datei_liefert_wochenplan(tmp_path):
    file = write(tmp_path / "s.json", doc())
    assert trade_sessions.sessions_for("XAUUSD", "Fake-Demo", file) == WEEK


@pytest.mark.feature("BKT-21")
def test_server_wird_ohne_gross_klein_verglichen(tmp_path):
    file = write(tmp_path / "s.json", doc(server="FAKE-demo"))
    assert trade_sessions.sessions_for("XAUUSD", "fake-DEMO", file) == WEEK


@pytest.mark.feature("BKT-21")
def test_unbekanntes_symbol_ist_none(tmp_path):
    file = write(tmp_path / "s.json", doc())
    assert trade_sessions.sessions_for("EURUSD", "Fake-Demo", file) is None


@pytest.mark.feature("BKT-21")
def test_datei_fehlt_ist_none(tmp_path):
    assert trade_sessions.sessions_for("XAUUSD", "Fake-Demo", tmp_path / "nope.json") is None


@pytest.mark.feature("BKT-21")
def test_kaputtes_json_ist_none(tmp_path):
    file = tmp_path / "s.json"
    file.write_text("{nicht json", encoding="utf-8")
    assert trade_sessions.sessions_for("XAUUSD", "Fake-Demo", file) is None


@pytest.mark.feature("BKT-21")
@pytest.mark.parametrize(
    "bad",
    [
        WEEK[:6],  # nur 6 Tage
        [[], [[0, 86401]], [], [], [], [], []],  # Ende > 24 h
        [[], [[100, 100]], [], [], [], [], []],  # leer (von = bis)
        [[], [[3600, 7200], [7000, 8000]], [], [], [], [], []],  # überlappt
        [[], [[7200, 8000], [3600, 4000]], [], [], [], [], []],  # nicht sortiert
        [[], [[-1, 100]], [], [], [], [], []],  # negativ
        [[], [["a", 100]], [], [], [], [], []],  # keine Zahl
    ],
)
def test_ungueltiger_plan_ist_none(tmp_path, bad):
    file = write(tmp_path / "s.json", doc({"XAUUSD": bad}))
    assert trade_sessions.sessions_for("XAUUSD", "Fake-Demo", file) is None


@pytest.mark.feature("BKT-21")
def test_anderer_server_ist_none(tmp_path):
    file = write(tmp_path / "s.json", doc(server="Anderer-Broker"))
    assert trade_sessions.sessions_for("XAUUSD", "Fake-Demo", file) is None


@pytest.mark.feature("BKT-21")
def test_aenderung_der_datei_wird_neu_gelesen(tmp_path):
    import os

    file = write(tmp_path / "s.json", doc())
    assert trade_sessions.sessions_for("XAUUSD", "Fake-Demo", file) == WEEK
    other = [[], [[0, 3600]], [], [], [], [], []]
    write(file, doc({"XAUUSD": other}))
    stat = os.stat(file)
    os.utime(file, (stat.st_atime, stat.st_mtime + 5))
    assert trade_sessions.sessions_for("XAUUSD", "Fake-Demo", file) == other


@pytest.mark.feature("BKT-21")
def test_standardpfad_kommt_aus_umgebung_oder_appdata(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOGRID_TRADE_SESSIONS_FILE", str(tmp_path / "x.json"))
    assert trade_sessions.default_path() == tmp_path / "x.json"
    monkeypatch.delenv("AUTOGRID_TRADE_SESSIONS_FILE")
    monkeypatch.setenv("APPDATA", str(tmp_path / "AppData"))
    path = trade_sessions.default_path()
    assert path is not None and path.name == "autogrid_trade_sessions.json" and "Common" in path.parts
    monkeypatch.delenv("APPDATA")
    assert trade_sessions.default_path() is None
