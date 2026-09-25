"""Ganze Engine-Ticks (grid_orchestrator.manage_dynamic_grid) gegen den FakeMT5.

ENG-05 Platzierung LIMIT/STOP + TP/SL · ENG-06 Validierung/Bereinigung · ENG-07 Max-Positionen
ENG-08 Teilausführung + TP/SL-Resync · ENG-09 Zombie-Orders · ENG-11 Auto-Pause nach 3 Ablehnungen
"""
import json

import pytest

from tests.helpers import MAGIC_ZONE_1, EngineHarness, make_zone, prices


# --------------------------------------------------------------------------- ENG-05
@pytest.mark.feature("ENG-05")
def test_buy_grid_limit_unter_stop_ueber_dem_kurs(fake_mt5):
    m = fake_mt5
    EngineHarness(m, [make_zone(order_type="BUY", take_profit=0.1)]).tick()

    orders = m.robot_orders(MAGIC_ZONE_1)
    assert prices(orders) == [96.7, 96.8, 96.9, 97.1, 97.2, 97.3]
    for o in orders:
        expected_type = m.ORDER_TYPE_BUY_LIMIT if o.price_open < 97.01 else m.ORDER_TYPE_BUY_STOP
        assert o.type == expected_type
        assert round(o.tp, 3) == round(o.price_open + 0.1, 3)
        assert o.sl == 0.0
        assert o.volume_initial == 0.01
        assert o.comment == "AutoGrid_Z1"


@pytest.mark.feature("ENG-05")
def test_sell_grid_mit_stop_loss(fake_mt5):
    m = fake_mt5
    EngineHarness(m, [make_zone(order_type="SELL", take_profit=0.2, stop_loss=0.5, levels_below=2, levels_above=2)]).tick()

    orders = m.robot_orders(MAGIC_ZONE_1)
    assert prices(orders) == [96.8, 96.9, 97.1, 97.2]
    for o in orders:
        expected_type = m.ORDER_TYPE_SELL_LIMIT if o.price_open > 97.0 else m.ORDER_TYPE_SELL_STOP
        assert o.type == expected_type
        assert round(o.tp, 3) == round(o.price_open - 0.2, 3)
        assert round(o.sl, 3) == round(o.price_open + 0.5, 3)


@pytest.mark.feature("ENG-05")
def test_zweiter_tick_setzt_keine_doppelten_orders(fake_mt5):
    engine = EngineHarness(fake_mt5, [make_zone(order_type="BOTH")])
    engine.tick()
    sent_after_first = len(fake_mt5.sent)
    engine.tick()
    engine.tick()
    assert len(fake_mt5.sent) == sent_after_first
    assert len(fake_mt5.robot_orders()) == 12  # je 6 BUY und 6 SELL


@pytest.mark.feature("ENG-05")
def test_grid_gleitet_nach_fuellung_mit(fake_mt5):
    m = fake_mt5
    engine = EngineHarness(m, [make_zone(order_type="BUY")])
    engine.tick()
    m.set_price("USOUSD", 96.85)  # ask 96.86 → Buy-Limit 96.9 wird gefüllt
    assert prices(m.robot_positions()) == [96.9]

    engine.tick()
    # neuer Anker 96.9: fehlende Level 96.6 (Limit) und 97.0 (Stop) kommen dazu,
    # 96.9 wird wegen der offenen Position NICHT erneut gesetzt, 97.3 bleibt im Puffer
    assert prices(m.robot_orders()) == [96.6, 96.7, 96.8, 97.0, 97.1, 97.2, 97.3]
    new_970 = next(o for o in m.robot_orders() if round(o.price_open, 3) == 97.0)
    assert new_970.type == m.ORDER_TYPE_BUY_STOP


@pytest.mark.feature("ENG-05")
def test_manuelle_position_belegt_ein_level(fake_mt5):
    m = fake_mt5
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.9, magic=0)  # manuell, keine Robot-Magic
    EngineHarness(m, [make_zone(order_type="BUY")]).tick()
    assert 96.9 not in prices(m.robot_orders())


@pytest.mark.feature("ENG-05")
def test_inaktive_zone_setzt_keine_orders(fake_mt5):
    EngineHarness(fake_mt5, [make_zone(is_active=False)]).tick()
    assert fake_mt5.robot_orders() == []


# --------------------------------------------------------------------------- ENG-06
@pytest.mark.feature("ENG-06")
def test_order_mit_falschem_tp_lot_oder_weit_weg_wird_ersetzt(fake_mt5):
    m = fake_mt5
    wrong_tp = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, 0.01, tp=97.5, magic=MAGIC_ZONE_1)
    wrong_lot = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.8, 0.05, tp=96.9, magic=MAGIC_ZONE_1)
    far_away = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 91.0, 0.01, tp=91.1, magic=MAGIC_ZONE_1)

    EngineHarness(m, [make_zone(order_type="BUY", take_profit=0.1)]).tick()

    tickets = {o.ticket for o in m.orders}
    assert not tickets & {wrong_tp.ticket, wrong_lot.ticket, far_away.ticket}
    assert prices(m.robot_orders()) == [96.7, 96.8, 96.9, 97.1, 97.2, 97.3]
    by_price = {round(o.price_open, 3): o for o in m.robot_orders()}
    assert round(by_price[96.9].tp, 3) == 97.0
    assert by_price[96.8].volume_initial == 0.01


@pytest.mark.feature("ENG-06")
def test_tp_aenderung_in_den_einstellungen_setzt_orders_neu(fake_mt5):
    zone = make_zone(order_type="BUY", take_profit=0.1)
    engine = EngineHarness(fake_mt5, [zone])
    engine.tick()
    zone["take_profit"] = 0.3
    engine.tick()
    assert all(round(o.tp - o.price_open, 3) == 0.3 for o in fake_mt5.robot_orders())
    assert len(fake_mt5.robot_orders()) == 6


# --------------------------------------------------------------------------- ENG-07
@pytest.mark.feature("ENG-07")
def test_max_positionen_loescht_pending_orders_der_zone(fake_mt5, robot_log):
    m = fake_mt5
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.9, tp=97.0, magic=MAGIC_ZONE_1)
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.8, tp=96.9, magic=MAGIC_ZONE_1)
    m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.7, tp=96.8, magic=MAGIC_ZONE_1)
    other_zone = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.7, tp=96.8, magic=200002)

    EngineHarness(m, [make_zone(order_type="BUY", max_positions=2), make_zone(id="z2")]).tick()

    assert m.robot_orders(MAGIC_ZONE_1) == []
    assert other_zone in m.orders
    assert any("Maksimum pozisyon" in line for line in robot_log())


# --------------------------------------------------------------------------- ENG-08
@pytest.mark.feature("ENG-08")
def test_tp_sl_offener_positionen_wird_nachgezogen(fake_mt5):
    m = fake_mt5
    pos = m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.9, tp=99.0, magic=MAGIC_ZONE_1)
    EngineHarness(m, [make_zone(order_type="BUY", take_profit=0.1, stop_loss=0.5)]).tick()
    assert (round(pos.tp, 3), round(pos.sl, 3)) == (97.0, 96.4)


@pytest.mark.feature("ENG-08")
def test_teilausfuehrung_restlot_wird_nachgesendet(fake_mt5):
    m = fake_mt5
    # Order über 0.03 wurde nur mit 0.01 gefüllt, der Rest ist verfallen
    m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.9, volume=0.01, tp=97.0, magic=MAGIC_ZONE_1, order_volume=0.03)
    engine = EngineHarness(m, [make_zone(order_type="BUY", lot_size=0.03)])
    engine.tick()

    rest = [o for o in m.robot_orders() if round(o.price_open, 3) == 96.9]
    assert len(rest) == 1 and rest[0].volume_initial == 0.02
    # stabil: der nächste Tick löscht die Rest-Order nicht wieder
    engine.tick()
    assert [o.ticket for o in m.robot_orders() if round(o.price_open, 3) == 96.9] == [rest[0].ticket]

    # Rest wird gefüllt → Level komplett (0.01 + 0.02 = Order-Volumen 0.03), kein weiterer Nachschub
    m.set_price("USOUSD", 96.88)
    sent_before = len(m.sent)
    engine.tick()
    assert sorted(p.volume for p in m.robot_positions() if round(p.price_open, 3) == 96.9) == [0.01, 0.02]
    assert not [r for r in m.sent[sent_before:] if r.get("volume") and round(r["price"], 3) == 96.9]


@pytest.mark.feature("ENG-08")
def test_teilausfuehrung_im_echten_ablauf(fake_mt5):
    """Die Engine setzt 0.02, der Broker füllt nur 0.01: das Restlot wird genau einmal nachgesendet."""
    m = fake_mt5
    engine = EngineHarness(m, [make_zone(order_type="BUY", lot_size=0.02)])
    engine.tick()
    m.partial_fill_next(0.01)
    m.set_price("USOUSD", 96.85)  # Buy-Limit 96.9 wird (teilweise) gefüllt
    assert [p.volume for p in m.robot_positions()] == [0.01]

    engine.tick()
    rest = [o for o in m.robot_orders() if round(o.price_open, 3) == 96.9]
    assert len(rest) == 1 and rest[0].volume_initial == 0.01


@pytest.mark.feature("ENG-08")
def test_lot_erhoehung_ist_keine_teilausfuehrung(fake_mt5, robot_log):
    """24.09.: lot_size 0.01 → 0.02 geändert. Voll gefüllte 0.01-Positionen galten als „halb
    gefüllt“; für jede ging eine „Rest“-Order raus (Kısmi Dolum)."""
    m = fake_mt5
    for price in (96.5, 96.6, 96.7):
        m.add_position("USOUSD", m.POSITION_TYPE_BUY, price, volume=0.01, tp=price + 0.1, magic=MAGIC_ZONE_1)
    engine = EngineHarness(m, [make_zone(order_type="BUY", lot_size=0.02)])
    engine.tick()
    engine.tick()

    assert not [o for o in m.robot_orders() if round(o.price_open, 3) in (96.5, 96.6, 96.7)]
    assert not any("Kısmi Dolum" in line for line in robot_log())
    # neue Grid-Orders bekommen das neue Lot
    assert {o.volume_initial for o in m.robot_orders()} == {0.02}


@pytest.mark.feature("ENG-08")
def test_keine_gesendet_geloescht_schleife_am_positionslimit(fake_mt5, robot_log):
    """24.09.: 14 Positionen bei max_positions 10. Der Nachschub setzte Orders, die
    Max-Positionen-Sperre löschte sie im selben Tick wieder: ~8.700 Sell-Stops in einer Stunde."""
    m = fake_mt5
    for price in (97.5, 97.6, 97.7):  # teilweise gefüllte SELLs (Order 0.02, gefüllt 0.01)
        m.add_position("USOUSD", m.POSITION_TYPE_SELL, price, volume=0.01, tp=price - 0.1, magic=MAGIC_ZONE_1,
                       order_volume=0.02)
    engine = EngineHarness(m, [make_zone(order_type="SELL", lot_size=0.02, max_positions=3)])
    for _ in range(5):
        engine.tick()

    pending_or_removed = [r for r in m.sent if r["action"] in (m.TRADE_ACTION_PENDING, m.TRADE_ACTION_REMOVE)]
    assert pending_or_removed == []
    assert m.robot_orders() == []
    assert not any("Kısmi Dolum" in line for line in robot_log())
    # die Sperre meldet sich einmal, nicht bei jedem Tick
    assert sum("Maksimum pozisyon" in line for line in robot_log()) == 1


@pytest.mark.feature("ENG-08")
def test_tp_hinter_dem_kurs_wird_nicht_endlos_gesendet(fake_mt5, robot_log):
    """24.09.: TP verkleinert, der Kurs stand schon über dem neuen TP einer BUY-Position →
    MT5 lehnt ab (10016 Invalid stops), der Bot schickte es trotzdem jeden Tick (1.083×)."""
    m = fake_mt5  # Bid 97.000
    pos = m.add_position("USOUSD", m.POSITION_TYPE_BUY, 96.5, tp=97.5, magic=MAGIC_ZONE_1)
    engine = EngineHarness(m, [make_zone(order_type="BUY", take_profit=0.05, max_positions=1)])
    for _ in range(3):
        engine.tick()

    assert not [r for r in m.sent if r["action"] == m.TRADE_ACTION_SLTP]
    assert round(pos.tp, 3) == 97.5
    assert sum("TP/SL Bekliyor" in line for line in robot_log()) == 1

    # Kurs fällt unter den neuen TP → jetzt gültig und wird gesetzt
    m.set_price("USOUSD", 96.52)
    engine.tick()
    assert round(pos.tp, 3) == 96.55


# --------------------------------------------------------------------------- ENG-09
@pytest.mark.feature("ENG-09")
def test_orders_inaktiver_oder_symbolfremder_zonen_werden_geloescht(fake_mt5):
    m = fake_mt5
    m.add_symbol("XAUUSD", bid=2600.0, digits=2, point=0.01)
    inactive_zone_order = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.5, magic=200002)
    wrong_symbol_order = m.add_order("XAUUSD", m.ORDER_TYPE_BUY_LIMIT, 2500.0, magic=MAGIC_ZONE_1)
    unknown_zone_order = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.4, magic=200009)
    manual_order = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.3, magic=0)

    EngineHarness(m, [make_zone(order_type="BUY"), make_zone(id="z2", is_active=False)]).tick()

    remaining = set(o.ticket for o in m.orders)
    assert inactive_zone_order.ticket not in remaining
    assert wrong_symbol_order.ticket not in remaining
    assert unknown_zone_order.ticket not in remaining
    assert manual_order.ticket in remaining  # manuelle Orders fasst der Robot nie an


@pytest.mark.feature("ENG-09")
def test_pausierte_zone_raeumt_ihre_orders_ab(fake_mt5, ui_state_file):
    engine = EngineHarness(fake_mt5, [make_zone(order_type="BUY")])
    engine.tick()
    assert len(fake_mt5.robot_orders()) == 6

    ui_state_file.write_text(json.dumps({"0": "PAUSE"}))  # Zonen-Button „Pause“ im Dashboard
    engine.tick()
    assert fake_mt5.robot_orders() == []
    engine.tick()
    assert fake_mt5.robot_orders() == []  # bleibt leer, solange pausiert


# --------------------------------------------------------------------------- ENG-11
@pytest.mark.feature("ENG-11")
def test_drei_ablehnungen_pausieren_die_zone(fake_mt5, ui_state_file, robot_log):
    m = fake_mt5
    m.reject(10016, times=100)
    engine = EngineHarness(m, [make_zone(order_type="BUY")])
    engine.tick()

    assert m.robot_orders() == []
    assert engine.active_zones_state[0] == "PAUSE"
    assert json.loads(ui_state_file.read_text()) == {"0": "PAUSE"}
    assert engine.consecutive_errors.get(0, 0) < 3
    assert any("üst üste 3 işlem reddedildi" in line for line in robot_log())

    checks_before = len(m.checked)
    engine.tick()  # pausiert → keine weiteren Versuche
    assert len(m.checked) == checks_before


@pytest.mark.feature("ENG-11")
def test_erfolg_setzt_fehlerzaehler_zurueck(fake_mt5):
    fake_mt5.reject(10016, times=2)
    engine = EngineHarness(fake_mt5, [make_zone(order_type="BUY")])
    engine.tick()
    assert engine.active_zones_state.get(0) != "PAUSE"
    assert engine.consecutive_errors.get(0) == 0
    assert len(fake_mt5.robot_orders()) == 4  # 2 abgelehnt, 4 gesetzt
