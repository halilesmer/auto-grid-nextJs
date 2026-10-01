"""ENG-27 Feste Magic-Nummer je Zone: Löschen einer Zone verschiebt die anderen nicht.

Szenario überall: Zone 1 (Magic 200001) wurde gelöscht, Zone 2 (Magic 200002) steht jetzt an
Listenplatz 0. Früher galt magic = 200000 + Platz + 1 – die Engine hätte die Orders/Positionen
von Zone 2 als fremd behandelt und die der gelöschten Zone 1 mit den Einstellungen von Zone 2
verwaltet.
"""
import json
import os

import pytest

from src.core.grid_orders import fractal_comment, zone_index_by_magic, zone_magic
from src.core.state import state
from tests.conftest import TEST_ACCOUNT_ID
from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone, prices

MAGIC_ZONE_2 = 200002


def _zone2(**overrides):
    return make_zone(id="z2", magic=MAGIC_ZONE_2, **overrides)


# --------------------------------------------------------------------------- Helfer
@pytest.mark.feature("ENG-27")
def test_magic_aus_der_zone_sonst_aus_der_reihenfolge():
    assert zone_magic({"magic": 200007}, 0) == 200007
    assert zone_magic({"magic": "200007"}, 0) == 200007
    # fehlend/ungültig/außerhalb 200001..200999 → bisherige Formel
    for raw in (None, True, "x", 200000, 201000, -5):
        assert zone_magic({"magic": raw}, 2) == 200003
    assert zone_magic({}, 0) == MAGIC_ZONE_1
    assert zone_index_by_magic([_zone2(), make_zone(id="z3", magic=200005)]) == {MAGIC_ZONE_2: 0, 200005: 1}
    # gelöschte Zone 1: ihre Magic gehört zu keinem Listenplatz mehr
    assert MAGIC_ZONE_1 not in zone_index_by_magic([_zone2()])


@pytest.mark.feature("ENG-27")
def test_fraktal_kommentar_traegt_die_zonennummer_aus_der_magic():
    assert fractal_comment(MAGIC_ZONE_2, "U", 1700000000) == "AutoGrid_Z2_FU1700000000"
    assert fractal_comment(MAGIC_ZONE_1, "D", 5) == "AutoGrid_Z1_FD5"  # alte Zonen: unverändert


# --------------------------------------------------------------------------- Orders
@pytest.mark.feature("ENG-27")
def test_neue_orders_tragen_die_feste_magic(fake_mt5):
    m = fake_mt5
    EngineHarness(m, [_zone2(order_type="BUY")]).tick()

    assert m.robot_orders(MAGIC_ZONE_1) == []
    orders = m.robot_orders(MAGIC_ZONE_2)
    assert prices(orders) == [96.7, 96.8, 96.9, 97.1, 97.2, 97.3]
    assert {o.comment for o in orders} == {"AutoGrid_Z2"}


@pytest.mark.feature("ENG-27")
def test_orders_der_zone_bleiben_die_der_geloeschten_zone_gehen(fake_mt5):
    m = fake_mt5
    own = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, tp=97.0, magic=MAGIC_ZONE_2)
    deleted = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 95.0, tp=95.1, magic=MAGIC_ZONE_1)

    EngineHarness(m, [_zone2(order_type="BUY", take_profit=0.1)]).tick()

    tickets = {o.ticket for o in m.orders}
    assert own.ticket in tickets  # früher als „Zone 2 existiert nicht“ gelöscht
    assert deleted.ticket not in tickets  # Zombie der gelöschten Zone
    assert prices(m.robot_orders(MAGIC_ZONE_2)) == [96.7, 96.8, 96.9, 97.1, 97.2, 97.3]


# --------------------------------------------------------------------------- Positionen
@pytest.mark.feature("ENG-27")
def test_tp_sl_nur_fuer_positionen_der_eigenen_zone(fake_mt5):
    m = fake_mt5
    own = m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.5, tp=99.0, magic=MAGIC_ZONE_2)
    deleted = m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.5, tp=99.0, magic=MAGIC_ZONE_1)

    EngineHarness(m, [_zone2(order_type="BUY", take_profit=1.0)]).tick()

    assert round(own.tp, 3) == 97.5  # eigene Zone: TP nachgezogen
    assert deleted.tp == 99.0  # früher bekam sie den TP von Zone 2


@pytest.mark.feature("ENG-27")
def test_zonen_ausstieg_raeumt_die_orders_der_festen_magic(fake_mt5):
    m = fake_mt5
    zone = _zone2(order_type="BUY", clear_on_exit=True, min_price=90, max_price=97.2)
    engine = EngineHarness(m, [zone])
    engine.tick()
    assert m.robot_orders(MAGIC_ZONE_2)

    m.set_price("USOUSD", 99.0, fill=False)
    engine.tick()
    assert engine.active_zones_state[0] == "AUTO_CLEAR"
    assert m.robot_orders(MAGIC_ZONE_2) == []


# --------------------------------------------------------------------------- Start / Verschwunden
@pytest.mark.feature("ENG-27")
def test_start_ordnet_vorhandene_orders_ueber_die_magic_zu(fake_mt5, ui_state_file):
    from src.core.startup import run_startup_checks

    m = fake_mt5
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.5, magic=MAGIC_ZONE_2)
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 95.0, magic=MAGIC_ZONE_1)  # gelöschte Zone
    state.zones = [_zone2()]
    state.active_symbols.add("USOUSD")
    state.symbol_infos["USOUSD"] = m.symbols["USOUSD"]

    assert run_startup_checks(m) is True
    assert state.active_zones_state == {0: "START"}


@pytest.mark.feature("ENG-27")
def test_verschwundene_order_einer_geloeschten_zone_zaehlt_nicht(fake_mt5):
    from src.core.grid_execution.vanished import check_vanished_orders

    state.placed_orders[555] = (MAGIC_ZONE_1, 0.0, 95.0)  # Zone 1 inzwischen gelöscht
    state.placed_orders[556] = (MAGIC_ZONE_2, 0.0, 96.0)

    counts = check_vanished_orders(fake_mt5, [_zone2()], [], [], {})
    assert counts == {0: 1}  # nur die Order von Zone 2 (jetzt Platz 0)
    assert state.placed_orders == {}


# --------------------------------------------------------------------------- Neuladen der Einstellungen
def _write_settings(zones):
    from src.utils import paths

    path = os.path.join(paths.CONFIGS_DIR, f"settings_{TEST_ACCOUNT_ID}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"LOOP_INTERVAL_SECONDS": 1.0, "ZONES": zones}, f)


A = dict(id="a", magic=MAGIC_ZONE_1)
B = dict(id="b", magic=MAGIC_ZONE_2)
C = dict(id="c", magic=200003)


@pytest.mark.feature("ENG-27")
def test_neuladen_nach_loeschen_traegt_den_zustand_ueber_die_magic_um(ui_state_file):
    from src.core.grid_zone_state import rekey_zone_state

    old = [make_zone(**A), make_zone(**B), make_zone(**C)]
    new = [make_zone(**B), make_zone(**C)]  # Zone a gelöscht
    state.active_zones.update({"USOUSD": 0})
    state.active_zones_state.update({0: "AUTO_CLEAR", 1: "PAUSE", 2: "START"})
    state.fractal_tracked.update({1: {77: ("k", "U", 5)}})
    state.instant_entry_sent.update({(0, "SELL"): 2.0, (1, "BUY"): 1.0})
    state.vanished_times.update({2: [3.0]})
    state.consecutive_errors.update({0: 2, 1: 1})
    state.limit_warned_zones.update({1: 5})
    ui_state_file.parent.mkdir(parents=True, exist_ok=True)
    ui_state_file.write_text(json.dumps({"0": "AUTO_CLEAR", "1": "PAUSE", "2": "START"}))

    assert rekey_zone_state(state, old, new) is True

    assert state.active_zones == {}  # die aktive Zone war a → nicht auf b übertragen
    assert state.active_zones_state == {0: "PAUSE", 1: "START"}
    assert state.fractal_tracked == {0: {77: ("k", "U", 5)}}
    assert state.instant_entry_sent == {(0, "BUY"): 1.0}
    assert state.vanished_times == {1: [3.0]}
    assert state.consecutive_errors == {0: 1}
    assert state.limit_warned_zones == {0: 5}
    assert json.loads(ui_state_file.read_text()) == {"0": "PAUSE", "1": "START"}


@pytest.mark.feature("ENG-27")
def test_neuladen_ohne_aenderung_oder_beim_ersten_laden_laesst_alles_stehen(ui_state_file):
    from src.core.grid_zone_state import rekey_zone_state

    zones = [make_zone(**A), make_zone(**B)]
    state.active_zones_state.update({1: "PAUSE"})
    ui_state_file.parent.mkdir(parents=True, exist_ok=True)
    ui_state_file.write_text(json.dumps({"1": "PAUSE"}))

    assert rekey_zone_state(state, [], zones) is False  # erster Ladevorgang: Reihenfolge unbekannt
    assert rekey_zone_state(state, zones, zones + [make_zone(**C)]) is False  # nur angehängt
    assert state.active_zones_state == {1: "PAUSE"}
    assert json.loads(ui_state_file.read_text()) == {"1": "PAUSE"}


@pytest.mark.feature("ENG-27")
def test_geloeschte_aktive_zone_loest_keinen_ausstieg_beim_nachbarn_aus(fake_mt5, monkeypatch, ui_state_file):
    """Echter Loop-Pfad (wrappers): Zone a ist aktiv und wird gelöscht. Früher galt danach
    Zone b (jetzt Platz 0) als aktiv; da der Kurs außerhalb ihres Bereichs liegt, lief ihr
    Zonen-Ausstieg: Positionen geschlossen, AUTO_CLEAR bis zum manuellen Neustart."""
    import src.core.wrappers as wrappers

    m = fake_mt5
    monkeypatch.setattr(wrappers, "mt5", m)
    zone_a = make_zone(**A, order_type="BUY", min_price=90, max_price=100)
    zone_b = make_zone(**B, order_type="BUY", min_price=100, max_price=110, clear_on_exit=True,
                       clear_scope="Tüm İşlemler")
    pos_b = m.add_position("USOUSD", m.POSITION_TYPE_BUY, 101.0, tp=101.1, magic=MAGIC_ZONE_2)

    _write_settings([zone_a, zone_b])
    wrappers.load_dynamic_settings()
    state.symbol_infos["USOUSD"] = m.symbols["USOUSD"]
    assert wrappers.manage_dynamic_grid() is True
    assert state.active_zones == {"USOUSD": 0}  # Kurs 97 liegt in Zone a

    _write_settings([zone_b])  # Zone a gelöscht (Magic von b bleibt 200002)
    wrappers.load_dynamic_settings()
    assert state.active_zones == {}
    assert wrappers.manage_dynamic_grid() is True

    assert pos_b in m.positions  # nicht geschlossen
    assert state.active_zones_state.get(0) != "AUTO_CLEAR"
    assert "AUTO_CLEAR" not in (ui_state_file.read_text() if ui_state_file.exists() else "")


@pytest.mark.feature("ENG-27")
def test_pausierte_zone_bleibt_nach_dem_loeschen_davor_pausiert(fake_mt5, monkeypatch, ui_state_file):
    import src.core.wrappers as wrappers

    m = fake_mt5
    monkeypatch.setattr(wrappers, "mt5", m)
    _write_settings([make_zone(**A, order_type="BUY"), make_zone(**B, order_type="BUY")])
    wrappers.load_dynamic_settings()
    state.symbol_infos["USOUSD"] = m.symbols["USOUSD"]
    ui_state_file.parent.mkdir(parents=True, exist_ok=True)
    ui_state_file.write_text(json.dumps({"0": "START", "1": "PAUSE"}))  # b pausiert
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, magic=MAGIC_ZONE_2)

    _write_settings([make_zone(**B, order_type="BUY")])  # a gelöscht
    wrappers.load_dynamic_settings()
    assert json.loads(ui_state_file.read_text()) == {"0": "PAUSE"}
    wrappers.manage_dynamic_grid()
    # b erbt nicht das START von a: pausiert → Orders weg, keine neuen
    assert m.robot_orders(MAGIC_ZONE_2) == []


@pytest.mark.feature("ENG-27")
def test_unlesbare_einstellungen_behalten_die_letzten_zonen(fake_mt5, monkeypatch, robot_log):
    """Früher: Lesefehler → ZONES [] → alle Robot-Orders galten als Zombies und wurden gelöscht."""
    import src.core.wrappers as wrappers
    from src.utils import paths

    monkeypatch.setattr(wrappers, "mt5", fake_mt5)
    _write_settings([make_zone(**A), make_zone(**B)])
    wrappers.load_dynamic_settings()
    assert [z["id"] for z in state.zones] == ["a", "b"]

    path = os.path.join(paths.CONFIGS_DIR, f"settings_{TEST_ACCOUNT_ID}.json")
    with open(path, "w", encoding="utf-8") as f:
        f.write('{"ZONES": [')  # halb geschrieben / kaputt
    wrappers.load_dynamic_settings()
    wrappers.load_dynamic_settings()
    assert [z["id"] for z in state.zones] == ["a", "b"]
    assert sum("Ayar dosyası okunamadı" in line for line in robot_log()) == 1  # einmal, nicht je Tick

    _write_settings([make_zone(**B)])  # wieder lesbar → normal weiter
    wrappers.load_dynamic_settings()
    assert [z["id"] for z in state.zones] == ["b"]


@pytest.mark.feature("ENG-27")
def test_gesperrte_status_datei_wird_spaeter_umgezogen_bis_dahin_gilt_der_speicher(
    monkeypatch, ui_state_file
):
    import src.core.grid_zone_state as zs

    old = [make_zone(**A), make_zone(**B)]
    new = [make_zone(**B)]
    ui_state_file.parent.mkdir(parents=True, exist_ok=True)
    ui_state_file.write_text(json.dumps({"0": "START", "1": "PAUSE"}))
    state.active_zones_state.update({0: "START", 1: "PAUSE"})

    def locked(*_args, **_kwargs):
        raise PermissionError("in use")

    real_remap = zs.remap_ui_states
    monkeypatch.setattr(zs, "remap_ui_states", locked)
    assert zs.rekey_zone_state(state, old, new) is True
    assert state.ui_remap_pending == old
    assert state.active_zones_state == {0: "PAUSE"}

    # Bis zum Umzug liest der Bot die (noch alte) Datei nicht: b bleibt pausiert
    zs.process_zone_commands(new, state.active_zones_state)
    assert state.active_zones_state == {0: "PAUSE"}

    monkeypatch.setattr(zs, "remap_ui_states", real_remap)  # Sperre weg (undo() würde auch die Testpfade zurücksetzen)
    assert zs.rekey_zone_state(state, new, new) is False  # nächstes Neuladen: keine Änderung …
    assert state.ui_remap_pending is None  # … aber der Datei-Umzug wird nachgeholt
    assert json.loads(ui_state_file.read_text()) == {"0": "PAUSE"}
