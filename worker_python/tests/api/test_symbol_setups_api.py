"""ZON-19 Symbol mit Setups: Speicherformat, Migration und Abwärtskompatibilität (POST/GET /api/settings).

Gespeichert wird `SYMBOLS: [{symbol, setups: [...]}]`; jedes Setup ist eine frühere Zone mit
ihrer Magic. Eine alte Datei (`ZONES`) wird beim ersten Speichern umgestellt, vorher kommt eine
Kopie nach configs/backup/. GET liefert beide Formen, damit die heutige Oberfläche (liest und
schickt `ZONES`) weiterläuft.
"""
import json

import pytest

from src.utils import market_db
from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import make_zone

URL = f"/api/settings/{TEST_ACCOUNT_ID}"
FILE_NAME = f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.json"


def _settings_path(worker_dir):
    return worker_dir / "configs" / FILE_NAME


def _write(worker_dir, data):
    path = _settings_path(worker_dir)
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _saved(worker_dir):
    return json.loads(_settings_path(worker_dir).read_text(encoding="utf-8"))


def _setup(**fields):
    """Setup wie gespeichert: Zonenfelder ohne `symbol` (das steht am Symbol)."""
    zone = make_zone(**fields)
    del zone["symbol"]
    return zone


LEGACY = {
    "LOOP_INTERVAL_SECONDS": 1.0,
    "ZONE_MAGIC_MAX": 200003,
    "ZONES": [
        make_zone(id="a", symbol="XAUUSD", magic=200001),
        make_zone(id="b", symbol="EURUSD", magic=200002),
        make_zone(id="c", symbol="XAUUSD", magic=200003),
    ],
}


@pytest.mark.feature("ZON-19")
def test_alte_datei_wird_beim_speichern_nach_symbol_gruppiert_und_magics_bleiben(client, worker_dir):
    _write(worker_dir, LEGACY)
    assert client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.0}}).status_code == 200

    assert _saved(worker_dir) == {
        "LOOP_INTERVAL_SECONDS": 2.0,
        "ZONE_MAGIC_MAX": 200003,
        "SYMBOLS": [
            {"symbol": "XAUUSD", "setups": [_setup(id="a", magic=200001), _setup(id="c", magic=200003)]},
            {"symbol": "EURUSD", "setups": [_setup(id="b", magic=200002)]},
        ],
    }


@pytest.mark.feature("ZON-19")
def test_vor_der_umstellung_liegt_die_alte_datei_als_kopie_in_backup(client, worker_dir):
    _write(worker_dir, LEGACY)
    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.0}})
    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 3.0}})  # schon umgestellt: keine neue Kopie

    backups = sorted(p.name for p in (worker_dir / "configs" / "backup").iterdir())
    assert backups == [f"settings_{TEST_ACCOUNT_ID}_Auto_Grid.before-symbols.json"]
    backup = json.loads((worker_dir / "configs" / "backup" / backups[0]).read_text(encoding="utf-8"))
    assert backup == LEGACY


@pytest.mark.feature("ZON-19")
def test_get_auf_alte_datei_liefert_beide_formen_und_schreibt_nichts(client, worker_dir):
    path = _write(worker_dir, LEGACY)
    before = path.read_text(encoding="utf-8")

    settings = client.get(URL).json()["settings"]

    # ZONES in Engine-Reihenfolge (alte Datei: wie gespeichert), SYMBOLS gruppiert
    assert [z["id"] for z in settings["ZONES"]] == ["a", "b", "c"]
    assert [(s["symbol"], [x["id"] for x in s["setups"]]) for s in settings["SYMBOLS"]] == [
        ("XAUUSD", ["a", "c"]),
        ("EURUSD", ["b"]),
    ]
    assert path.read_text(encoding="utf-8") == before
    assert not (worker_dir / "configs" / "backup").exists()


@pytest.mark.feature("ZON-19")
def test_neue_oberflaeche_speichert_symbols_neues_setup_bekommt_die_naechste_magic(client, worker_dir):
    _write(worker_dir, LEGACY)
    symbols = client.get(URL).json()["settings"]["SYMBOLS"]
    symbols[1]["setups"].append(_setup(id="d"))  # EURUSD: zweites Setup

    assert client.post(URL, json={"settings": {"SYMBOLS": symbols}}).status_code == 200

    saved = _saved(worker_dir)
    assert "ZONES" not in saved
    assert [(s["symbol"], [(x["id"], x["magic"]) for x in s["setups"]]) for s in saved["SYMBOLS"]] == [
        ("XAUUSD", [("a", 200001), ("c", 200003)]),
        ("EURUSD", [("b", 200002), ("d", 200004)]),
    ]
    # GET: ZONES in Engine-Reihenfolge = Symbol für Symbol
    zones = client.get(URL).json()["settings"]["ZONES"]
    assert [(z["id"], z["symbol"], z["magic"]) for z in zones] == [
        ("a", "XAUUSD", 200001),
        ("c", "XAUUSD", 200003),
        ("b", "EURUSD", 200002),
        ("d", "EURUSD", 200004),
    ]


@pytest.mark.feature("ZON-19")
def test_alte_oberflaeche_schickt_zones_mit_veralteten_symbols_zones_gilt(client, worker_dir):
    _write(worker_dir, LEGACY)
    settings = client.get(URL).json()["settings"]  # enthält ZONES und SYMBOLS
    settings["ZONES"] = [z for z in settings["ZONES"] if z["id"] != "a"]  # Zone a gelöscht, nur in ZONES

    client.post(URL, json={"settings": settings})

    saved = _saved(worker_dir)
    assert [(s["symbol"], [x["id"] for x in s["setups"]]) for s in saved["SYMBOLS"]] == [
        ("EURUSD", ["b"]),
        ("XAUUSD", ["c"]),
    ]


@pytest.mark.feature("ZON-19")
def test_symbol_am_setup_vom_client_wird_vom_symbol_ueberschrieben(client, worker_dir):
    _write(worker_dir, {})
    setup = make_zone(id="a", symbol="EURUSD")  # falsches Symbol im Setup
    client.post(URL, json={"settings": {"SYMBOLS": [{"symbol": "XAUUSD", "setups": [setup]}]}})

    assert [(z["id"], z["symbol"]) for z in client.get(URL).json()["settings"]["ZONES"]] == [("a", "XAUUSD")]


@pytest.mark.feature("ZON-19")
@pytest.mark.parametrize(
    "symbols",
    [
        "XAUUSD",
        [{"symbol": "XAUUSD"}],
        [{"symbol": "XAUUSD", "setups": "a"}],
        [{"setups": []}],
    ],
)
def test_kaputte_symbols_werden_mit_422_abgelehnt_und_die_datei_bleibt(client, worker_dir, symbols):
    path = _write(worker_dir, LEGACY)
    before = path.read_text(encoding="utf-8")

    assert client.post(URL, json={"settings": {"SYMBOLS": symbols}}).status_code == 422
    assert path.read_text(encoding="utf-8") == before


@pytest.mark.feature("ZON-19")
def test_kaputte_symbols_neben_zones_stoeren_nicht_weil_zones_gilt(client, worker_dir):
    _write(worker_dir, LEGACY)

    res = client.post(URL, json={"settings": {"ZONES": LEGACY["ZONES"], "SYMBOLS": "kaputt"}})

    assert res.status_code == 200
    assert [s["symbol"] for s in _saved(worker_dir)["SYMBOLS"]] == ["XAUUSD", "EURUSD"]


@pytest.mark.feature("ZON-19")
def test_gestoppter_bot_ui_state_folgt_der_neuen_reihenfolge(client, worker_dir, ui_state_file):
    # Bot läuft nicht: er kennt beim ersten Laden die alte Reihenfolge nicht, also zieht die API um
    _write(worker_dir, LEGACY)
    ui_state_file.parent.mkdir(parents=True, exist_ok=True)
    ui_state_file.write_text(json.dumps({"0": "START", "1": "PAUSE"}))  # b (EURUSD) pausiert

    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.0}})  # neu: a, c, b

    assert json.loads(ui_state_file.read_text()) == {"0": "START", "2": "PAUSE"}


@pytest.mark.feature("ZON-19")
def test_laufender_bot_zieht_ui_state_selbst_um_die_api_nicht(client, worker_dir, ui_state_file, monkeypatch):
    import src.api.settings as settings_api

    monkeypatch.setattr(settings_api, "is_bot_running", lambda _id: True)
    _write(worker_dir, LEGACY)
    ui_state_file.parent.mkdir(parents=True, exist_ok=True)
    ui_state_file.write_text(json.dumps({"0": "START", "1": "PAUSE"}))

    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.0}})

    # unverändert: der Bot trägt beim Neuladen über die Magic um (rekey_zone_state, ENG-27)
    assert json.loads(ui_state_file.read_text()) == {"0": "START", "1": "PAUSE"}


@pytest.mark.feature("ZON-19")
def test_fraktal_kurgunummern_bleiben_bei_der_umstellung(client, worker_dir):
    zone = make_zone(id="a", symbol="XAUUSD", magic=200001, fractal_setup_seq=3,
                     fractal_setups=[{"id": "s2", "sid": 2}, {"id": "s3", "sid": 3}])
    _write(worker_dir, {"ZONE_MAGIC_MAX": 200001, "ZONES": [zone]})
    symbols = client.get(URL).json()["settings"]["SYMBOLS"]
    symbols[0]["setups"][0]["fractal_setups"].append({"id": "s-new"})

    client.post(URL, json={"settings": {"SYMBOLS": symbols}})

    setup = _saved(worker_dir)["SYMBOLS"][0]["setups"][0]
    assert [(s["id"], s["sid"]) for s in setup["fractal_setups"]] == [("s2", 2), ("s3", 3), ("s-new", 4)]


@pytest.mark.feature("ZON-19")
def test_zonenregister_fuehrt_setups_mit_symbol_und_umstellung_macht_keine_neue_version(client, worker_dir):
    _write(worker_dir, LEGACY)
    market_db.record_zones(TEST_ACCOUNT_ID, LEGACY["ZONES"])  # Register-Stand vor ZON-19: Version 1 je Zone

    client.post(URL, json={"settings": {"LOOP_INTERVAL_SECONDS": 2.0}})  # Umstellung
    client.post(URL, json={"settings": {"SYMBOLS": client.get(URL).json()["settings"]["SYMBOLS"]}})

    reg = market_db.zone_registry(TEST_ACCOUNT_ID)
    assert [(r["magic"], r["zone_id"], r["symbol"], r["deleted_at"]) for r in reg] == [
        (200001, "a", "XAUUSD", None),
        (200002, "b", "EURUSD", None),
        (200003, "c", "XAUUSD", None),
    ]
    for magic in (200001, 200002, 200003):
        assert [v["version"] for v in market_db.zone_versions(TEST_ACCOUNT_ID, magic)] == [1]
