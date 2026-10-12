"""ENG-31 Spread-Schutz: keine Einstiege, eigene Pending Orders löschen."""
import pytest

from src.core.state import state
from tests.helpers import EngineHarness, make_zone
from src.core import clock

pytestmark = pytest.mark.feature("ENG-31")


def guarded(**fields):
    return make_zone(magic=200001, spread_guard={"enabled": True, "mode": "fixed", "max_spread": 0.005, **fields})


def test_spread_loescht_nur_eigene_orders_auch_remote_pause(fake_mt5):
    own = fake_mt5.add_order("USOUSD", fake_mt5.ORDER_TYPE_BUY_LIMIT, 96, magic=200001)
    manual = fake_mt5.add_order("USOUSD", fake_mt5.ORDER_TYPE_BUY_LIMIT, 95, magic=0)
    other = fake_mt5.add_order("USOUSD", fake_mt5.ORDER_TYPE_BUY_LIMIT, 94, magic=200002)
    h = EngineHarness(fake_mt5, [guarded(), make_zone(id="other", magic=200002)])
    h.remote_paused = True
    h.tick()
    assert own not in fake_mt5.orders
    assert manual in fake_mt5.orders
    assert other in fake_mt5.orders


def test_spread_verhindert_soforteinstieg(fake_mt5):
    z = guarded()
    z["instant_entry"] = True
    EngineHarness(fake_mt5, [z]).tick()
    assert fake_mt5.positions == []
    assert fake_mt5.orders == []


def test_tpsl_bleibt_aktiv_aber_keine_teilfuellung(fake_mt5):
    p = fake_mt5.add_position("USOUSD", fake_mt5.POSITION_TYPE_BUY, 97, magic=200001,
                              volume=0.01, order_volume=0.02)
    EngineHarness(fake_mt5, [guarded()]).tick()
    assert p in fake_mt5.positions
    assert p.tp == pytest.approx(97.1)
    assert fake_mt5.orders == []


def test_gleiche_grenze_erlaubt_orders(fake_mt5):
    EngineHarness(fake_mt5, [guarded(max_spread=0.01)]).tick()
    assert len(fake_mt5.orders) > 0


@pytest.fixture
def simulated_clock(fake_mt5):
    now = [1700000000.0]
    fake_mt5.clock = lambda: now[0]
    clock.set_clock(lambda: now[0])
    fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
    yield now
    clock.set_clock(None)


def test_erholung_braucht_30_sekunden_und_unter_80_prozent(fake_mt5, simulated_clock):
    h = EngineHarness(fake_mt5, [guarded()])
    h.tick()
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    assert fake_mt5.orders == []
    simulated_clock[0] += 29
    h.tick()
    assert fake_mt5.orders == []
    fake_mt5.set_price("USOUSD", 97, 97.004, fill=False)  # genau 80 % setzt den Timer zurück
    h.tick()
    simulated_clock[0] += 1
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    simulated_clock[0] += 30
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    assert len(fake_mt5.orders) > 0
    assert state.spread_guard.status[200001]["blocked"] is False


def test_manuelle_pause_bleibt_nach_erholung(fake_mt5, simulated_clock, ui_state_file):
    ui_state_file.write_text('{"0":"PAUSE"}')
    h = EngineHarness(fake_mt5, [guarded()])
    h.tick()
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    simulated_clock[0] += 30
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    assert not state.spread_guard.status[200001]["blocked"]
    assert h.active_zones_state[0] == "PAUSE"
    assert fake_mt5.orders == []


@pytest.mark.parametrize("bad", ["missing", "stale", "crossed", "nan", "future"])
def test_ungueltiger_tick_loescht_und_sperrt(fake_mt5, simulated_clock, bad):
    own = fake_mt5.add_order("USOUSD", fake_mt5.ORDER_TYPE_BUY_LIMIT, 96, magic=200001)
    if bad == "missing":
        fake_mt5.ticks.pop("USOUSD")
    elif bad == "stale":
        fake_mt5.set_tick_age("USOUSD", 61)
    elif bad == "crossed":
        fake_mt5.ticks["USOUSD"].ask = 96
    elif bad == "nan":
        fake_mt5.ticks["USOUSD"].ask = float("nan")
    else:
        fake_mt5.ticks["USOUSD"].time_msc += 1000
    EngineHarness(fake_mt5, [guarded(max_spread=0.02)]).tick()
    assert own not in fake_mt5.orders
    assert state.spread_guard.status[200001]["reason"] == "invalid_tick"
    assert fake_mt5.orders == []


@pytest.mark.parametrize("bootstrap", ["wait", "manual"])
def test_lernen_60_minuten_ein_sample_pro_minute(fake_mt5, simulated_clock, bootstrap):
    h = EngineHarness(fake_mt5, [guarded(mode="relative", multiplier=3, bootstrap=bootstrap, initial_spread=0.01)])
    h.remote_paused = True
    h.tick()
    h.tick()
    assert state.spread_guard.status[200001]["samples"] == 1
    assert state.spread_guard.status[200001]["blocked"] is (bootstrap == "wait")
    for _ in range(59):
        simulated_clock[0] += 60
        fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
        h.tick()
    status = state.spread_guard.status[200001]
    assert status["samples"] == 60
    assert status["reference"] == 0.01
    assert status["limit"] == 0.03
    simulated_clock[0] += 30
    fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
    h.tick()
    assert not state.spread_guard.status[200001]["blocked"]


def test_referenz_steigt_nicht_bei_hohem_spread_und_wird_geladen(fake_mt5, simulated_clock):
    from src.core.spread_guard import SpreadGuard

    h = EngineHarness(fake_mt5, [guarded(mode="relative", multiplier=3, bootstrap="manual", initial_spread=0.01)])
    h.remote_paused = True
    for _ in range(60):
        fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
        h.tick()
        simulated_clock[0] += 60
    for _ in range(120):
        fake_mt5.set_price("USOUSD", 97, 97.2, fill=False)
        h.tick()
        simulated_clock[0] += 60
    assert state.spread_guard.status[200001]["limit"] == 0.03
    assert state.spread_guard.histories["USOUSD"]["reference"] == 0.01
    state.spread_guard = SpreadGuard()
    h.tick()
    assert state.spread_guard.status[200001]["samples"] == 60
    assert state.spread_guard.status[200001]["limit"] == 0.03
    simulated_clock[0] += 86400
    fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
    state.spread_guard = SpreadGuard()
    h.tick()
    assert state.spread_guard.status[200001]["reference"] is None
    assert state.spread_guard.status[200001]["samples"] == 1  # neue Lernrunde nach Ablauf der 24 Stunden
    assert state.spread_guard.status[200001]["limit"] == 0.03  # Sperrgrenze bleibt trotz neuer Lernrunde erhalten
    assert state.spread_guard.status[200001]["blocked"]


def test_neustart_verkuerzt_erholung_nicht(fake_mt5, simulated_clock):
    from src.core.spread_guard import SpreadGuard

    h = EngineHarness(fake_mt5, [guarded()])
    h.tick()
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    simulated_clock[0] += 20
    state.spread_guard = SpreadGuard()
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    simulated_clock[0] += 10
    h.tick()
    assert fake_mt5.orders == []
    simulated_clock[0] += 20
    fake_mt5.set_price("USOUSD", 97, 97.003, fill=False)
    h.tick()
    assert len(fake_mt5.orders) > 0


@pytest.mark.parametrize("money,percent,expected", [(False, 10, 0.005), (True, 10, 0.0005)])
def test_grid_grenze_nimmt_kleineren_effektiven_abstand(fake_mt5, money, percent, expected):
    z = guarded(mode="grid", grid_percent=percent)
    z.update(order_type="BOTH", sync_buy_sell=False, grid_step=0.2, sell_grid_step=0.05,
             step_by_loss=money, lot_size=0.01, sell_lot_size=0.005)
    EngineHarness(fake_mt5, [z]).tick()
    assert state.spread_guard.status[200001]["limit"] == pytest.approx(expected)
    assert fake_mt5.orders == []


def test_spread_aendert_sich_zwischen_check_und_send(fake_mt5, simulated_clock):
    original = fake_mt5.order_check
    def check(request):
        result = original(request)
        if request["action"] in (fake_mt5.TRADE_ACTION_PENDING, fake_mt5.TRADE_ACTION_DEAL):
            fake_mt5.set_price("USOUSD", 97, 97.5, fill=False)
        return result
    fake_mt5.order_check = check
    h = EngineHarness(fake_mt5, [guarded(max_spread=0.02)])
    h.tick()
    assert fake_mt5.orders == []
    assert h.consecutive_errors == {}
    assert h.active_zones_state.get(0) != "PAUSE"


def test_fehlgeschlagene_stornierung_wird_wiederholt(fake_mt5):
    from tests.fakes.fake_mt5 import Result

    own = fake_mt5.add_order("USOUSD", fake_mt5.ORDER_TYPE_BUY_LIMIT, 96, magic=200001)
    original = fake_mt5.order_send
    fail = [True]
    def send(request):
        if request["action"] == fake_mt5.TRADE_ACTION_REMOVE and fail[0]:
            fail[0] = False
            return Result(retcode=10013)
        return original(request)
    fake_mt5.order_send = send
    h = EngineHarness(fake_mt5, [guarded()])
    h.remote_paused = True
    h.tick()
    assert own in fake_mt5.orders
    h.tick()
    assert own not in fake_mt5.orders


def test_magic_bleibt_nach_umordnung_unabhaengig(fake_mt5, simulated_clock):
    z = guarded()
    other = make_zone(id="other", magic=200007)
    h = EngineHarness(fake_mt5, [z, other])
    h.remote_paused = True
    h.tick()
    h.zones = [other, z]
    h.tick()
    assert state.spread_guard.status[200001]["blocked"]
    assert 200007 not in state.spread_guard.status
    h.zones = [other]
    h.tick()
    assert state.spread_guard.status == {}


def test_zweite_symbol_referenz_und_konto_bleiben_getrennt(fake_mt5, simulated_clock, monkeypatch):
    from src.core.spread_guard import SpreadGuard

    fake_mt5.add_symbol("TEST", bid=10, ask=10.02, digits=3, point=0.001)
    cfg = {"enabled": True, "mode": "relative", "multiplier": 3, "bootstrap": "manual", "initial_spread": 0.01}
    z = guarded(**cfg)
    h = EngineHarness(fake_mt5, [z, make_zone(id="other", symbol="TEST", magic=200002, spread_guard=cfg)])
    h.remote_paused = True
    h.tick()
    assert state.spread_guard.histories["USOUSD"]["samples"][0][1] == 0.01
    assert state.spread_guard.histories["TEST"]["samples"][0][1] == 0.02
    monkeypatch.setenv("ACTIVE_ACCOUNT_ID", "1002")
    state.spread_guard = SpreadGuard()
    h.tick()
    assert state.spread_guard.status[200001]["samples"] == 1


def test_abgelaufene_lerndaten_werden_ohne_deadlock_neu_gelernt(fake_mt5, simulated_clock):
    h = EngineHarness(fake_mt5, [guarded(mode="relative", multiplier=3, bootstrap="wait")])
    h.remote_paused = True
    for _ in range(61):
        fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
        h.tick()
        simulated_clock[0] += 60
    fake_mt5.set_price("USOUSD", 97, 97.2, fill=False)
    h.tick()
    simulated_clock[0] += 86400
    fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
    h.tick()
    assert state.spread_guard.status[200001]["samples"] == 1
    assert state.spread_guard.status[200001]["reason"] == "learning"


def test_metriken_enthalten_magic_und_spread_status(fake_mt5):
    from src.core.grid_metrics import calculate_live_metrics

    zone = guarded()
    EngineHarness(fake_mt5, [zone]).tick()
    m = calculate_live_metrics(fake_mt5, {"USOUSD"}, False, False, {}, [zone])
    assert m["spread_guards"]["200001"]["reason"] == "high"
    assert m["spread_guards"]["200001"]["spread"] == 0.01
    assert m["spread_guards"]["200001"]["limit"] == 0.005


def test_defekte_lerndatei_startet_sicher_neu(fake_mt5):
    from src.utils.paths import get_spread_state_path
    from pathlib import Path

    Path(get_spread_state_path("1001")).write_text('{"histories":{"USOUSD":{"samples":[[1,"bad"]]}}}')
    EngineHarness(fake_mt5, [guarded(mode="relative", multiplier=3, bootstrap="wait")]).tick()
    assert state.spread_guard.status[200001]["blocked"]
    assert state.spread_guard.status[200001]["samples"] == 1
    assert fake_mt5.orders == []


def test_null_konfiguration_bleibt_ausgeschaltet(fake_mt5):
    EngineHarness(fake_mt5, [make_zone(magic=200001, spread_guard=None)]).tick()
    assert state.spread_guard.status == {}
    assert fake_mt5.orders


def test_manueller_start_lernt_trotz_hohem_spread_weiter(fake_mt5, simulated_clock):
    h = EngineHarness(fake_mt5, [guarded(mode="relative", multiplier=3, bootstrap="manual", initial_spread=0.001)])
    h.remote_paused = True
    for _ in range(60):
        fake_mt5.set_price("USOUSD", 97, 97.01, fill=False)
        h.tick()
        simulated_clock[0] += 60
    status = state.spread_guard.status[200001]
    assert status["samples"] == 60
    assert status["reference"] == 0.01
    assert status["limit"] == 0.003
    assert status["blocked"]
