"""NWS-01: Wirtschaftskalender aus der MQL5-Dienstdatei (autogrid_calendar.json)."""
import json
import os

import pytest

from src.utils import econ_calendar as ec

# Server GMT+2 (Demo-Server, erfundene Werte); absichtlich unsortiert
DOC = {
    "version": 2, "service": True, "server": "Demo-Server",
    "time_trade_server": "2026.11.08 09:45:07", "time_gmt": "2026.11.08 07:45:07",
    "written_at": "2026.11.08 09:45:07", "change_id": 7,
    "events": [
        {"value_id": 3, "event_id": 30, "event_code": "unemployment-rate", "title": "Arbeitslosenquote", "country": "DE",
         "currency": "EUR", "importance": "moderate", "time": "2026.11.10 16:00", "time_mode": "datetime",
         "sector": "jobs", "unit": "percentage", "multiplier": "none", "actual": None, "forecast": 3.1, "prev": 3.0,
         "revised_prev": None, "impact_type": "none"},
        {"value_id": 1, "event_id": 10, "event_code": "cpi-mm", "title": "CPI m/m", "country": "US", "currency": "USD",
         "importance": "high", "time": "2026.11.10 15:30", "time_mode": "datetime", "sector": "price",
         "unit": "percentage", "multiplier": "none", "actual": 0.4, "forecast": 0.5, "prev": 0.6,
         "revised_prev": None, "impact_type": "negative"},
        {"value_id": 2, "event_id": 20, "event_code": "summit", "title": "EU Gipfeltreffen", "country": "EU",
         "currency": "EUR", "importance": "high", "time": "2026.11.09 00:00", "time_mode": "allday", "sector": "business",
         "unit": "none", "multiplier": "none", "actual": None, "forecast": None, "prev": None,
         "revised_prev": None, "impact_type": "none"},
    ],
}


@pytest.fixture
def cal(tmp_path):
    path = tmp_path / "cal.json"
    path.write_text(json.dumps(DOC), encoding="utf-8")
    return path


@pytest.mark.feature("NWS-01")
def test_zeiten_in_utc_und_sortiert(cal):
    res = ec.load_events(cal)
    assert res["available"] and res["source"] == "mt5"
    assert [e["id"] for e in res["events"]] == [2, 1, 3]
    assert res["events"][1]["time"] == "2026-11-10T13:30:00Z"  # 15:30 Server = 13:30 UTC


@pytest.mark.feature("NWS-01")
def test_forecast_direction_und_ters_indikator(cal):
    by_id = {e["id"]: e for e in ec.load_events(cal)["events"]}
    assert by_id[1]["forecast_direction"] == "down"   # 0,5 < 0,6
    assert by_id[3]["forecast_direction"] == "down"   # Arbeitslosenquote steigt -> umgekehrt
    assert by_id[2]["forecast_direction"] is None
    assert ec.forecast_direction(1.0, 1.0) == "flat"


@pytest.mark.feature("NWS-01")
def test_filter(cal):
    res = ec.load_events(cal, importance={"high"}, currencies={"USD"})
    assert [e["id"] for e in res["events"]] == [1]


@pytest.mark.feature("NWS-01")
def test_stale_nach_fuenf_minuten(cal):
    now = os.path.getmtime(cal)
    assert ec.load_events(cal, now=now + 60)["stale"] is False
    assert ec.load_events(cal, now=now + 301)["stale"] is True


@pytest.mark.feature("NWS-01")
def test_cp1252_und_steuerzeichen(tmp_path):
    doc = json.loads(json.dumps(DOC))
    doc["events"][0]["title"] = "Erstanträge\nauf Hilfe"
    text = json.dumps(doc, ensure_ascii=False).replace("\\n", "\n")  # rohes Zeilenende im String
    path = tmp_path / "cal.json"
    path.write_bytes(text.encode("cp1252"))
    res = ec.load_events(path)
    assert res["available"]
    assert any(e["title"] == "Erstanträge\nauf Hilfe" for e in res["events"])


@pytest.mark.feature("NWS-01")
def test_datei_fehlt_oder_kaputt(tmp_path):
    assert ec.load_events(tmp_path / "nein.json") == {
        "events": [], "stale": True, "available": False, "source": "mt5", "generated_at": None}
    bad = tmp_path / "bad.json"
    bad.write_text("{halb", encoding="utf-8")
    assert ec.load_events(bad)["available"] is False
