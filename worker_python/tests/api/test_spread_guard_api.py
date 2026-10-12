"""ENG-31: Spread-Einstellungen werden genau gespeichert oder mit 422 abgelehnt."""
import pytest
from tests.helpers import make_zone

pytestmark = pytest.mark.feature("ENG-31")
URL = "/api/settings/1001"


@pytest.mark.parametrize("cfg,mode", [
    ({"enabled": True, "mode": "fixed", "max_spread": 0.00012}, "grid"),
    ({"enabled": True, "mode": "relative", "multiplier": 3, "bootstrap": "wait"}, "fractal"),
    ({"enabled": True, "mode": "relative", "multiplier": 2, "bootstrap": "manual", "initial_spread": 0.00015}, "grid"),
    ({"enabled": True, "mode": "grid", "grid_percent": 20}, "grid"),
])
def test_rundweg_auch_kleine_preisabstaende(client, cfg, mode):
    zone = make_zone(spread_guard=cfg, entry_mode=mode)
    result = client.post(URL, json={"settings": {"SYMBOLS": [{"symbol": "USOUSD", "setups": [zone]}]}})
    assert result.status_code == 200
    assert client.get(URL).json()["settings"]["SYMBOLS"][0]["setups"][0]["spread_guard"] == cfg


@pytest.mark.parametrize("cfg,mode", [
    ({"enabled": "yes", "mode": "fixed", "max_spread": 1}, "grid"),
    ({"enabled": True, "mode": "bad", "max_spread": 1}, "grid"),
    ({"enabled": True, "mode": "fixed"}, "grid"),
    ({"enabled": True, "mode": "fixed", "max_spread": 0}, "grid"),
    ({"enabled": True, "mode": "fixed", "max_spread": -1}, "grid"),
    ({"enabled": True, "mode": "fixed", "max_spread": True}, "grid"),
    ({"enabled": True, "mode": "relative", "multiplier": 3, "bootstrap": "bad"}, "grid"),
    ({"enabled": True, "mode": "relative", "multiplier": 3, "bootstrap": "manual"}, "grid"),
    ({"enabled": True, "mode": "grid", "grid_percent": 20}, "fractal"),
    ([], "grid"),
])
def test_ungueltige_konfiguration_aendert_datei_nicht(client, cfg, mode):
    assert client.post(URL, json={"settings": {"SYMBOLS": [{"symbol": "USOUSD", "setups": [make_zone()]}]}}).status_code == 200
    before = client.get(URL).json()["settings"]
    res = client.post(URL, json={"settings": {"SYMBOLS": [{"symbol": "USOUSD", "setups": [make_zone(spread_guard=cfg, entry_mode=mode)]}]}})
    assert res.status_code == 422
    assert client.get(URL).json()["settings"] == before


def test_anderes_setting_erhaelt_schutz(client):
    cfg = {"enabled": True, "mode": "fixed", "max_spread": 0.00012}
    client.post(URL, json={"settings": {"SYMBOLS": [{"symbol": "USOUSD", "setups": [make_zone(spread_guard=cfg)]}]}})
    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2}})
    assert client.get(URL).json()["settings"]["SYMBOLS"][0]["setups"][0]["spread_guard"] == cfg


@pytest.mark.feature("ENG-30")
def test_spread_und_pip_tick_anzahl_behalten_gemeinsam_praezision(client):
    cfg = {"enabled": True, "mode": "fixed", "max_spread": 0.00012}
    zone = make_zone(entry_mode="fractal", spread_guard=cfg,
                     fractal_next_loss=3.3333333333333335, fractal_next_loss_mode="pips",
                     fractal_next_loss_unit_version=1)
    assert client.post(URL, json={"settings": {"SYMBOLS": [{"symbol": "USOUSD", "setups": [zone]}]}}).status_code == 200
    result = client.get(URL).json()["settings"]["SYMBOLS"][0]["setups"][0]
    assert result["spread_guard"] == cfg
    assert result["fractal_next_loss"] == 3.3333333333333335
    assert result["fractal_next_loss_unit_version"] == 1
