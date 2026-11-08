"""NWS-01: GET /api/news/events."""
import pytest

from tests.unit.test_econ_calendar import DOC, put, with_lang


@pytest.mark.feature("NWS-01")
def test_route(tmp_path, monkeypatch, client):
    put(tmp_path, "de", with_lang("de"))
    monkeypatch.setenv("AUTOGRID_CALENDAR_DIR", str(tmp_path))
    body = client.get("/api/news/events", params={"impact": "high", "currencies": "usd"}).json()
    assert [e["id"] for e in body["events"]] == [1] and body["available"] is True
    body = client.get("/api/news/events", params={"from": "2026-11-10T00:00:00Z", "to": "2026-11-10T13:59:00Z"}).json()
    assert [e["id"] for e in body["events"]] == [1]
    assert client.get("/api/news/events", params={"impact": "huge"}).status_code == 422
    assert client.get("/api/news/events", params={"lang": "fr"}).status_code == 422


@pytest.mark.feature("NWS-01")
def test_lang_waehlt_titel(tmp_path, monkeypatch, client):
    put(tmp_path, "de", with_lang("de"))
    put(tmp_path, "en", with_lang("en", {3: "Unemployment Rate"}))
    monkeypatch.setenv("AUTOGRID_CALENDAR_DIR", str(tmp_path))
    body = client.get("/api/news/events", params={"lang": "en"}).json()
    assert body["languages"] == ["de", "en"]
    ev = {e["id"]: e for e in body["events"]}
    assert ev[3]["title"] == "Unemployment Rate" and ev[3]["titles"]["de"] == "Arbeitslosenquote"


@pytest.mark.feature("NWS-01")
def test_ohne_datei_leer_statt_fehler(tmp_path, monkeypatch, client):
    monkeypatch.setenv("AUTOGRID_CALENDAR_DIR", str(tmp_path / "nein"))
    res = client.get("/api/news/events")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is False and body["events"] == [] and body["source"] == "mt5"
