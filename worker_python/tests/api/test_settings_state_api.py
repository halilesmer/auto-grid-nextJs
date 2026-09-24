"""SET-01 Laden · SET-04 Bereinigen · SET-05 Merge · ZON-08 Start/Pause pro Zone (ui-state)."""
import json

import pytest

from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import make_zone

URL = f"/api/settings/{TEST_ACCOUNT_ID}"


def _write_settings(worker_dir, data, name=f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json"):
    path = worker_dir / "configs" / name
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


# --------------------------------------------------------------------------- SET-01
@pytest.mark.feature("SET-01")
def test_ohne_datei_leere_einstellungen(client):
    assert client.get(URL).json() == {"account_id": TEST_ACCOUNT_ID, "settings": {}}


@pytest.mark.feature("SET-01")
def test_flache_datei_mit_motorname(client, worker_dir):
    _write_settings(worker_dir, {"LOOP_INTERVAL_SECONDS": 1.0, "ZONES": [make_zone()]})
    body = client.get(URL).json()
    assert body["file"] == f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json"
    assert body["settings"]["ZONES"][0]["symbol"] == "USOUSD"
    assert client.get(URL).headers["cache-control"].startswith("no-store")


@pytest.mark.feature("SET-01")
def test_verschachtelte_alte_datei_wird_ausgepackt(client, worker_dir):
    _write_settings(worker_dir, {"settings": {"settings": {"LOOP_INTERVAL_SECONDS": 2.0}}},
                    name=f"settings_{TEST_ACCOUNT_ID}.json")
    assert client.get(URL).json()["settings"] == {"LOOP_INTERVAL_SECONDS": 2.0}


# --------------------------------------------------------------------------- SET-05
@pytest.mark.feature("SET-05")
def test_speichern_fuehrt_zusammen_statt_zu_ueberschreiben(client, worker_dir):
    path = _write_settings(worker_dir, {"LOOP_INTERVAL_SECONDS": 1.0, "ZONES": [make_zone()]})
    assert client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.5}}).json()["status"] == "saved"
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["LOOP_INTERVAL_SECONDS"] == 2.5 and saved["ZONES"][0]["id"] == "zone-test"


@pytest.mark.feature("SET-05")
def test_verschachtelte_nutzlast_wird_flach_gespeichert(client, worker_dir):
    client.post(URL, json={"settings": {"settings": {"LOOP_INTERVAL_SECONDS": 3.0}}})
    files = list((worker_dir / "configs").glob(f"settings_{TEST_ACCOUNT_ID}*.json"))
    assert len(files) == 1
    assert json.loads(files[0].read_text(encoding="utf-8")) == {"LOOP_INTERVAL_SECONDS": 3.0}


# --------------------------------------------------------------------------- SET-04
@pytest.mark.feature("SET-04")
def test_speichern_rundet_fliesskomma(client, worker_dir):
    path = _write_settings(worker_dir, {})
    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 1.00000001,
                                        "ZONES": [make_zone(lot_size=0.0100000001)]}})
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["LOOP_INTERVAL_SECONDS"] == 1.0 and saved["ZONES"][0]["lot_size"] == 0.01


# --------------------------------------------------------------------------- ZON-08
@pytest.mark.feature("ZON-08")
def test_zonen_befehle_werden_gespeichert_und_gelesen(client, ui_state_file):
    url = f"/api/ui-state/{TEST_ACCOUNT_ID}"
    assert client.get(url).json()["states"] == {}

    res = client.post(url, json={"settings": {"states": {"0": "start", "1": "PAUSE", "x": "START"}}})
    assert res.json()["states"] == {"0": "START", "1": "PAUSE"}  # nur Zonen-Indizes, groß geschrieben

    client.post(url, json={"settings": {"states": {"1": "START"}}})  # zusammenführen, nicht ersetzen
    assert client.get(url).json()["states"] == {"0": "START", "1": "START"}
    assert json.loads(ui_state_file.read_text()) == {"0": "START", "1": "START"}


@pytest.mark.feature("ZON-08")
def test_zonen_befehle_auch_ohne_states_huelle(client):
    url = f"/api/ui-state/{TEST_ACCOUNT_ID}"
    client.post(url, json={"settings": {"2": "pause"}})
    assert client.get(url).json()["states"] == {"2": "PAUSE"}
