"""ENG-29 Fraktal-Zusatz-Setups entfernt: Speichern räumt die alten Felder auf, die Entscheidung
über die übrig gebliebenen Pending Orders (LEGACY_SETUP_ORDERS) wird gespeichert und geprüft."""
import json

import pytest

from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import make_zone

URL = f"/api/settings/{TEST_ACCOUNT_ID}"


def _path(worker_dir):
    return worker_dir / "configs" / f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json"


def _old_zone():
    return make_zone(id="a", entry_mode="fractal", magic=200001, fractal_setup_seq=3, fractal_kept_sids=[3],
                     fractal_setups=[{"id": "s2", "sid": 2, "fractal_timeframe": "M15"}])


@pytest.mark.feature("ENG-29")
def test_speichern_entfernt_alte_setup_felder(client, worker_dir):
    _path(worker_dir).write_text(json.dumps({"ZONE_MAGIC_MAX": 200001, "ZONES": [_old_zone()]}), encoding="utf-8")

    res = client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.0}})

    assert res.json()["status"] == "saved"
    setup = json.loads(_path(worker_dir).read_text(encoding="utf-8"))["SYMBOLS"][0]["setups"][0]
    assert setup["id"] == "a" and setup["entry_mode"] == "fractal" and setup["magic"] == 200001
    assert "fractal_setups" not in setup
    assert "fractal_setup_seq" not in setup
    assert "fractal_kept_sids" not in setup


@pytest.mark.feature("ENG-29")
def test_entscheidung_wird_gespeichert_und_zonen_bleiben(client, worker_dir):
    _path(worker_dir).write_text(json.dumps({"ZONE_MAGIC_MAX": 200001, "ZONES": [_old_zone()]}), encoding="utf-8")

    res = client.post(URL, json={"settings": {"LEGACY_SETUP_ORDERS": "delete"}})

    assert res.json()["status"] == "saved"
    settings = client.get(URL).json()["settings"]
    assert settings["LEGACY_SETUP_ORDERS"] == "delete"
    assert [s["id"] for s in settings["SYMBOLS"][0]["setups"]] == ["a"]


@pytest.mark.feature("ENG-29")
def test_ungueltige_entscheidung_wird_abgelehnt(client, worker_dir):
    _path(worker_dir).write_text(json.dumps({"ZONES": [_old_zone()]}), encoding="utf-8")

    res = client.post(URL, json={"settings": {"LEGACY_SETUP_ORDERS": "maybe"}})

    assert res.status_code == 422
    assert "LEGACY_SETUP_ORDERS" not in json.loads(_path(worker_dir).read_text(encoding="utf-8"))
