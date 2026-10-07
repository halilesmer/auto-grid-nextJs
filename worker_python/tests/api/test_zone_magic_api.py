"""ENG-27 Feste Magic-Nummer je Zone: Vergabe beim Speichern (POST /api/settings).

Die Nummer vergibt nur der Worker; bestehende Zonen behalten ihre, gelöschte Nummern werden
nicht neu vergeben. Das Umziehen des Zonen-Status beim Löschen macht der Bot beim Neuladen
der Einstellungen (tests/unit/test_eng_zone_magic.py).
"""
import json

import pytest

from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import make_zone

URL = f"/api/settings/{TEST_ACCOUNT_ID}"


def _settings_path(worker_dir):
    return worker_dir / "configs" / f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json"


def _write(worker_dir, data):
    path = _settings_path(worker_dir)
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _saved(worker_dir):
    return json.loads(_settings_path(worker_dir).read_text(encoding="utf-8"))


def _magics(worker_dir):
    # Datei speichert Symbol → Setups (ZON-19); jedes Setup ist eine Zone
    return {s["id"]: s["magic"] for g in _saved(worker_dir)["SYMBOLS"] for s in g["setups"]}


def _save_zones(client, *zones):
    res = client.post(URL, json={"settings": {"ZONES": list(zones)}})
    assert res.json()["status"] == "saved"


@pytest.mark.feature("ENG-27")
def test_neue_zonen_bekommen_fortlaufende_nummern(client, worker_dir):
    _write(worker_dir, {})
    _save_zones(client, make_zone(id="a"), make_zone(id="b"))
    assert _magics(worker_dir) == {"a": 200001, "b": 200002}
    assert _saved(worker_dir)["ZONE_MAGIC_MAX"] == 200002
    # GET liefert die Nummer mit (nur lesend im Frontend)
    assert [s["magic"] for s in client.get(URL).json()["settings"]["SYMBOLS"][0]["setups"]] == [200001, 200002]


@pytest.mark.feature("ENG-27")
def test_alte_zonen_ohne_nummer_behalten_ihre_bisherige(client, worker_dir):
    # Datei von vor ENG-27: keine magic → heutige Nummer = 200000 + Platz + 1
    _write(worker_dir, {"ZONES": [make_zone(id="a"), make_zone(id="b"), make_zone(id="c")]})
    _save_zones(client, make_zone(id="a"), make_zone(id="c"))  # b gelöscht
    assert _magics(worker_dir) == {"a": 200001, "c": 200003}  # c behält 200003, rutscht nicht auf 200002


@pytest.mark.feature("ENG-27")
def test_loeschen_verschiebt_nichts_und_nummern_werden_nicht_wiederverwendet(client, worker_dir):
    _write(worker_dir, {})
    _save_zones(client, make_zone(id="a"), make_zone(id="b"))
    _save_zones(client, make_zone(id="b"))  # a gelöscht
    assert _magics(worker_dir) == {"b": 200002}

    _save_zones(client, make_zone(id="b"), make_zone(id="new"))
    assert _magics(worker_dir) == {"b": 200002, "new": 200003}  # nicht 200001 (gehörte a)


@pytest.mark.feature("ENG-27")
def test_nummern_vom_client_werden_ignoriert(client, worker_dir):
    _write(worker_dir, {})
    _save_zones(client, make_zone(id="a"))
    # Client schickt eine fremde Nummer und eine Kopie mit derselben Nummer
    _save_zones(
        client,
        make_zone(id="a", magic=200500),
        make_zone(id="b", magic=200001),
    )
    client.post(URL, json={"settings": {"ZONE_MAGIC_MAX": 200000}})
    assert _magics(worker_dir) == {"a": 200001, "b": 200002}
    assert _saved(worker_dir)["ZONE_MAGIC_MAX"] == 200002


@pytest.mark.feature("ENG-27")
def test_doppelte_zonen_id_bekommt_eine_eigene_nummer(client, worker_dir):
    _write(worker_dir, {})
    _save_zones(client, make_zone(id="a"))
    _save_zones(client, make_zone(id="a"), make_zone(id="a"))
    zones = _saved(worker_dir)["SYMBOLS"][0]["setups"]  # beide USOUSD
    assert [z["magic"] for z in zones] == [200001, 200002]


@pytest.mark.feature("ENG-27")
def test_speichern_ohne_zonen_vergibt_trotzdem_nummern(client, worker_dir):
    _write(worker_dir, {"ZONES": [make_zone(id="a"), make_zone(id="b")]})
    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.0}})
    assert _magics(worker_dir) == {"a": 200001, "b": 200002}


@pytest.mark.feature("ENG-27")
def test_bereich_erschoepft_vergibt_freie_nummer_zuletzt_geloeschte_als_letzte(worker_dir):
    from src.utils.zone_magic import assign_zone_magics

    previous = {"ZONE_MAGIC_MAX": 200999, "ZONES": [make_zone(id="a", magic=200001), make_zone(id="b", magic=200002)]}
    merged = {"ZONES": [make_zone(id="b"), make_zone(id="new")]}  # a im selben Speichern gelöscht
    assign_zone_magics(previous, merged)
    # 200001 gehörte a (Orders evtl. noch nicht weg) → erst die nächste freie Nummer
    assert [z["magic"] for z in merged["ZONES"]] == [200002, 200003]
    assert merged["ZONE_MAGIC_MAX"] == 200999


@pytest.mark.feature("ENG-27")
def test_kaputtes_zone_magic_max_wird_neu_berechnet(worker_dir):
    from src.utils.zone_magic import assign_zone_magics

    previous = {"ZONE_MAGIC_MAX": 999999, "ZONES": [make_zone(id="a", magic=200004)]}
    merged = {"ZONES": [make_zone(id="a"), make_zone(id="b")]}
    assign_zone_magics(previous, merged)
    assert [z["magic"] for z in merged["ZONES"]] == [200004, 200005]


@pytest.mark.feature("ENG-27")
def test_zonen_ohne_id_werden_ueber_den_platz_zugeordnet(worker_dir):
    from src.utils.zone_magic import assign_zone_magics

    old = make_zone(); old.pop("id")
    previous = {"ZONES": [old]}
    new = make_zone(); new.pop("id")
    merged = {"ZONES": [new]}
    assign_zone_magics(previous, merged)
    assert merged["ZONES"][0]["magic"] == 200001


@pytest.mark.feature("ENG-27")
def test_speichern_wiederholt_wenn_die_datei_kurz_gesperrt_ist(client, worker_dir, monkeypatch):
    """Windows: liest der Bot die Datei gerade, verweigert os.replace kurz den Zugriff."""
    import src.api.settings as settings_api

    real_replace = settings_api.os.replace
    calls = {"n": 0}

    def flaky_replace(src, dst):
        calls["n"] += 1
        if calls["n"] == 1:
            raise PermissionError("in use")
        return real_replace(src, dst)

    monkeypatch.setattr(settings_api.os, "replace", flaky_replace)
    _write(worker_dir, {})
    _save_zones(client, make_zone(id="a"))
    assert _magics(worker_dir) == {"a": 200001}
    assert not list((worker_dir / "configs").glob("*.tmp"))  # kein Rest
