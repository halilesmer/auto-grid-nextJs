"""ENG-28 Fraktal-Setups: Vergabe der Setup-Nummer (sid) beim Speichern (POST /api/settings).

Wie die Zonen-Magic (ENG-27) vergibt die Nummer nur der Worker; ein Setup behält seine Nummer,
gelöschte Nummern werden nicht neu vergeben (die Statistik je Setup mischt sonst zwei Setups).
"""
import json

import pytest

from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import make_zone

URL = f"/api/settings/{TEST_ACCOUNT_ID}"


def _path(worker_dir):
    return worker_dir / "configs" / f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json"


def _zone(setups, **extra):
    return make_zone(id="a", entry_mode="fractal", fractal_setups=setups, **extra)


def _save(client, zone):
    res = client.post(URL, json={"settings": {"ZONES": [zone]}})
    assert res.json()["status"] == "saved"
    return client.get(URL).json()["settings"]["ZONES"][0]


def _sids(zone):
    return [s["sid"] for s in zone["fractal_setups"]]


@pytest.mark.feature("ENG-28")
def test_neue_setups_bekommen_fortlaufende_nummern(client, worker_dir):
    _path(worker_dir).write_text("{}", encoding="utf-8")
    saved = _save(client, _zone([{"fractal_timeframe": "M1"}, {"fractal_timeframe": "M5"}]))
    assert _sids(saved) == [2, 3]
    assert saved["fractal_setup_seq"] == 3
    assert [s["fractal_timeframe"] for s in saved["fractal_setups"]] == ["M1", "M5"]


@pytest.mark.feature("ENG-28")
def test_nummern_bleiben_und_werden_nach_loeschen_nicht_wiederverwendet(client, worker_dir):
    _path(worker_dir).write_text("{}", encoding="utf-8")
    saved = _save(client, _zone([{"fractal_timeframe": "M1"}, {"fractal_timeframe": "M5"}]))
    # Setup 3 gelöscht, Setup 2 geändert, ein neues dazu
    m1 = {**saved["fractal_setups"][0], "lot_size": 0.05}
    saved = _save(client, _zone([m1, {"fractal_timeframe": "H1"}]))
    assert _sids(saved) == [2, 4]
    assert saved["fractal_setups"][0]["lot_size"] == 0.05
    # Alle gelöscht: der Zähler bleibt, das nächste Setup bekommt 5
    saved = _save(client, _zone([]))
    assert saved["fractal_setups"] == [] and saved["fractal_setup_seq"] == 4
    assert _sids(_save(client, _zone([{"fractal_timeframe": "M15"}]))) == [5]


@pytest.mark.feature("ENG-28")
def test_nummer_und_zaehler_vom_client_werden_ignoriert(client, worker_dir):
    _path(worker_dir).write_text("{}", encoding="utf-8")
    saved = _save(client, _zone([{"sid": 50}, {"sid": 2}, {"sid": 2}, "kaputt"], fractal_setup_seq=90))
    assert _sids(saved) == [2, 3, 4]
    assert saved["fractal_setup_seq"] == 4
    # Doppelte Nummer eines bestehenden Setups: nur das erste behält sie
    saved = _save(client, _zone([{"sid": 3}, {"sid": 3}]))
    assert _sids(saved) == [3, 5]


@pytest.mark.feature("ENG-28")
def test_zweites_speichern_ohne_nummer_behaelt_sie_ueber_die_id(client, worker_dir):
    # Die Oberfläche kennt die Nummer noch nicht (Speichern ohne Neuladen): die id ordnet zu
    _path(worker_dir).write_text("{}", encoding="utf-8")
    assert _sids(_save(client, _zone([{"id": "s-a", "fractal_timeframe": "M1"}]))) == [2]
    saved = _save(client, _zone([{"id": "s-a", "fractal_timeframe": "M5"}, {"id": "s-b"}]))
    assert _sids(saved) == [2, 3]
    assert saved["fractal_setups"][0]["fractal_timeframe"] == "M5"


@pytest.mark.feature("ENG-28")
def test_behaltene_setups_werden_bereinigt(client, worker_dir):
    _path(worker_dir).write_text("{}", encoding="utf-8")
    _save(client, _zone([{"id": "a"}, {"id": "b"}]))  # Setups 2 und 3
    # 2 entfernt mit „Orders behalten“; 3 läuft noch, 7 und "x" gab es nie
    saved = _save(client, _zone([{"id": "b", "sid": 3}], fractal_kept_sids=[2, 3, 7, "x", 2]))
    assert saved["fractal_kept_sids"] == [2]
    saved = _save(client, _zone([{"id": "b", "sid": 3}], fractal_kept_sids=[]))
    assert "fractal_kept_sids" not in saved


@pytest.mark.feature("ENG-28")
def test_zone_ohne_setups_bleibt_unveraendert(client, worker_dir):
    _path(worker_dir).write_text(json.dumps({}), encoding="utf-8")
    saved = _save(client, make_zone(id="a"))
    assert "fractal_setups" not in saved and "fractal_setup_seq" not in saved
