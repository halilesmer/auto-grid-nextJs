"""NWS-01: GET /api/news/events."""
import json

import pytest

from tests.unit.test_econ_calendar import DOC


@pytest.mark.feature("NWS-01")
def test_route(tmp_path, monkeypatch, client):
    path = tmp_path / "cal.json"
    path.write_text(json.dumps(DOC), encoding="utf-8")
    monkeypatch.setenv("AUTOGRID_CALENDAR_FILE", str(path))
    body = client.get("/api/news/events", params={"impact": "high", "currencies": "usd"}).json()
    assert [e["id"] for e in body["events"]] == [1] and body["available"] is True
    body = client.get("/api/news/events", params={"from": "2026-11-10T00:00:00Z", "to": "2026-11-10T13:59:00Z"}).json()
    assert [e["id"] for e in body["events"]] == [1]
    assert client.get("/api/news/events", params={"impact": "huge"}).status_code == 422


@pytest.mark.feature("NWS-01")
def test_ohne_datei_leer_statt_fehler(tmp_path, monkeypatch, client):
    monkeypatch.setenv("AUTOGRID_CALENDAR_FILE", str(tmp_path / "nein.json"))
    res = client.get("/api/news/events")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is False and body["events"] == [] and body["source"] == "mt5"
