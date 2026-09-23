"""ENG-10 Bereinigung beim Verlassen der Zone (clear_on_exit)."""
import json

import pytest

from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone


def _enter_then_exit(m, zone, exit_bid):
    """Tick 1 im Bereich (Orders werden gesetzt), dann Kurs aus der Zone bewegen und Tick 2."""
    engine = EngineHarness(m, [zone])
    engine.tick()
    assert engine.active_zone_idx == 0 and m.robot_orders()
    pos = m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.5, tp=96.6, magic=MAGIC_ZONE_1)
    m.set_price("USOUSD", exit_bid, fill=False)
    engine.tick()
    return engine, pos


@pytest.mark.feature("ENG-10")
def test_austritt_loescht_orders_behaelt_positionen_und_meldet_auto_clear(fake_mt5, ui_state_file):
    zone = make_zone(order_type="BOTH", clear_on_exit=True, clear_scope="Sadece Bekleyen Emirler")
    engine, pos = _enter_then_exit(fake_mt5, zone, exit_bid=111.0)

    assert fake_mt5.robot_orders() == []
    assert pos in fake_mt5.positions
    assert json.loads(ui_state_file.read_text()) == {"0": "AUTO_CLEAR"}
    # im nächsten Tick liest die Engine AUTO_CLEAR ein; weit außerhalb entstehen keine Orders
    engine.tick()
    assert engine.active_zones_state.get(0) == "AUTO_CLEAR"
    assert fake_mt5.robot_orders() == []


@pytest.mark.feature("ENG-10")
def test_nur_sell_seite_wird_geraeumt(fake_mt5):
    m = fake_mt5
    zone = make_zone(order_type="BOTH", clear_on_exit=True, clear_target_side="Sadece SELL İşlemleri")
    engine = EngineHarness(m, [zone])
    engine.tick()
    m.set_price("USOUSD", 111.0, fill=False)
    engine.tick()
    # BUY-Orders weit unter dem Kurs verschwinden ohnehin durch das gleitende Fenster;
    # entscheidend: die SELL-Orders wurden über den Zonen-Austritt geräumt
    assert not [o for o in m.robot_orders() if o.type in m.SELL_TYPES]


@pytest.mark.feature("ENG-10")
def test_falsche_austrittsrichtung_raeumt_nicht_meldet_aber_auto_clear(fake_mt5, ui_state_file):
    m = fake_mt5
    zone = make_zone(order_type="BUY", clear_on_exit=True, clear_exit_side="SELL (Aşağı)",
                     min_price=90, max_price=97.2)
    engine = EngineHarness(m, [zone])
    engine.tick()
    before = {o.ticket for o in m.robot_orders()}
    m.set_price("USOUSD", 97.3, fill=False)  # Austritt nach OBEN
    engine.tick()
    assert json.loads(ui_state_file.read_text()) == {"0": "AUTO_CLEAR"}
    # nahe Orders (97.1/97.2) wurden nicht über den Austritt geräumt
    assert {o.ticket for o in m.robot_orders() if round(o.price_open, 3) in (97.1, 97.2)} <= before


@pytest.mark.feature("ENG-10")
def test_ohne_clear_on_exit_kein_auto_clear(fake_mt5, ui_state_file):
    zone = make_zone(order_type="BUY", clear_on_exit=False, min_price=90, max_price=97.2)
    engine = EngineHarness(fake_mt5, [zone])
    engine.tick()
    fake_mt5.set_price("USOUSD", 97.3, fill=False)
    engine.tick()
    assert not ui_state_file.exists()
    assert {97.1, 97.2} <= {round(o.price_open, 3) for o in fake_mt5.robot_orders()}


@pytest.mark.feature("ENG-10")
def test_kerzenschluss_ausloeser(fake_mt5, ui_state_file):
    m = fake_mt5
    zone = make_zone(order_type="BUY", clear_on_exit=True, exit_condition="Mum Kapanışı",
                     exit_timeframe="M15", min_price=90, max_price=100)
    m.set_closed_candle("USOUSD", m.TIMEFRAME_M15, 97.0)
    engine = EngineHarness(m, [zone])
    engine.tick()
    m.set_price("USOUSD", 101.0, fill=False)  # Tick draußen, Kerze noch drin
    engine.tick()
    assert not ui_state_file.exists()
    m.set_closed_candle("USOUSD", m.TIMEFRAME_M15, 100.5)  # Kerze schließt draußen
    engine.tick()
    assert json.loads(ui_state_file.read_text()) == {"0": "AUTO_CLEAR"}


@pytest.mark.feature("ENG-10")
@pytest.mark.xfail(
    strict=True,
    reason="Bekannter Fehler: Die UI speichert clear_scope='Tüm İşlemler', handle_zone_exit "
    "prüft aber nur auf 'Pozisyon'/'Tümü'/'Hepsi' → Positionen werden nie geschlossen",
)
def test_umfang_tuem_islemler_schliesst_auch_positionen(fake_mt5):
    zone = make_zone(order_type="BUY", clear_on_exit=True, clear_scope="Tüm İşlemler")
    _, pos = _enter_then_exit(fake_mt5, zone, exit_bid=111.0)
    assert pos not in fake_mt5.positions


@pytest.mark.feature("ENG-10")
@pytest.mark.xfail(
    strict=True,
    reason="Bekannter Fehler: Nach dem Räumen fällt manage_dynamic_grid auf zones[0] zurück; "
    "AUTO_CLEAR blockiert die Platzierung nicht (nur PAUSE). Liegt der Kurs knapp außerhalb, "
    "werden die Grenz-Orders jeden Tick gelöscht (Zombie) und sofort neu gesetzt",
)
def test_nach_austritt_werden_keine_orders_neu_gesetzt(fake_mt5):
    m = fake_mt5
    zone = make_zone(order_type="BUY", clear_on_exit=True, min_price=90, max_price=97.2)
    engine = EngineHarness(m, [zone])
    engine.tick()
    m.set_price("USOUSD", 97.3, fill=False)
    sent_before = len(m.sent)
    for _ in range(3):
        engine.tick()
    new_pending = [r for r in m.sent[sent_before:] if r["action"] == m.TRADE_ACTION_PENDING]
    assert new_pending == [], f"{len(new_pending)} neue Pending Orders in 3 Ticks nach dem Austritt"
