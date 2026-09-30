"""ENG-12 Order-Sicherheit: safe_send_order (Volumen, Stops-Level, order_check, 10027, stille Ablehnung)."""
import pytest

from src.utils.trade_utils import TradeState, safe_send_order, snap_volume
from tests.fakes.fake_mt5 import Result


def _pending(m, price=96.9, tp=97.0, sl=0.0, volume=0.01, type_=None):
    req = {
        "action": m.TRADE_ACTION_PENDING,
        "symbol": "USOUSD",
        "volume": volume,
        "type": m.ORDER_TYPE_BUY_LIMIT if type_ is None else type_,
        "price": price,
        "tp": tp,
        "magic": 200001,
    }
    if sl:
        req["sl"] = sl
    return req


@pytest.mark.feature("ENG-12")
def test_volumen_wird_auf_den_lotschritt_normalisiert(fake_mt5):
    assert safe_send_order(fake_mt5, _pending(fake_mt5, volume=0.020000001)) is True
    assert fake_mt5.sent[-1]["volume"] == 0.02


@pytest.mark.feature("ENG-12")
def test_volumen_0_oder_unter_broker_minimum_wird_zum_minimum(fake_mt5):
    m = fake_mt5
    m.symbols["USOUSD"].volume_min = 0.1
    m.symbols["USOUSD"].volume_step = 0.1
    for raw in (0, 0.01, 0.04):
        assert safe_send_order(m, _pending(m, volume=raw)) is True
        assert m.sent[-1]["volume"] == 0.1  # nie 0 an den Broker
    assert safe_send_order(m, _pending(m, volume=999)) is True
    assert m.sent[-1]["volume"] == 50.0  # volume_max


@pytest.mark.feature("ENG-12")
def test_snap_volume_akzeptiert_objekt_und_dict_infos():
    info = {"vol_min": 0.5, "vol_step": 0.5, "vol_max": 10}
    assert snap_volume(0, info) == 0.5
    assert snap_volume(float("nan"), info) == 0.5
    assert snap_volume(1.2, info) == 1.0
    assert snap_volume(99, info) == 10.0
    # Auch ohne Lot-Schritt und mit sehr kleinem Minimum wird nie 0 daraus
    assert snap_volume(0, {"volume_min": 0.001}) == 0.001
    assert snap_volume(0.15, {"volume_min": 0.1, "volume_step": 0.1}) == 0.2  # halber Schritt wie im UI


@pytest.mark.feature("ENG-12")
def test_zu_nahe_tp_sl_werden_auf_stops_level_gezogen(fake_mt5):
    m = fake_mt5
    m.symbols["USOUSD"].trade_stops_level = 50  # 50 × 0.001 = 0.05 Mindestabstand
    assert safe_send_order(m, _pending(m, price=96.9, tp=96.92, sl=96.88)) is True
    sent = m.sent[-1]
    assert (sent["tp"], sent["sl"]) == (96.95, 96.85)

    assert safe_send_order(m, _pending(m, price=97.2, tp=97.18, sl=97.21, type_=m.ORDER_TYPE_SELL_LIMIT)) is True
    sent = m.sent[-1]
    assert (sent["tp"], sent["sl"]) == (97.15, 97.25)


@pytest.mark.feature("ENG-12")
def test_order_check_fehler_verhindert_das_senden(fake_mt5):
    fake_mt5.reject(10016)
    assert safe_send_order(fake_mt5, _pending(fake_mt5)) is False
    assert fake_mt5.sent == []


@pytest.mark.feature("ENG-12")
def test_10027_setzt_algo_trading_alarm(fake_mt5):
    fake_mt5.reject(10027)
    assert safe_send_order(fake_mt5, _pending(fake_mt5)) is False
    assert TradeState.algo_trading_disabled is True
    assert TradeState.last_error_message == "Algo Trading kapalı!"


@pytest.mark.feature("ENG-12")
def test_broker_ablehnung_wird_als_letzter_fehler_gemerkt(fake_mt5, monkeypatch):
    monkeypatch.setattr(fake_mt5, "order_send", lambda req: Result(retcode=10006, comment="Request rejected"))
    assert safe_send_order(fake_mt5, _pending(fake_mt5)) is False
    assert TradeState.last_error_message == "Reddedildi: 10006 - Request rejected"


@pytest.mark.feature("ENG-12")
def test_stille_ablehnung_wird_erkannt(fake_mt5):
    fake_mt5.silent_reject_next()
    assert safe_send_order(fake_mt5, _pending(fake_mt5)) is False
    assert "SESSIZ RET" in TradeState.last_error_message


@pytest.mark.feature("ENG-12")
def test_erfolg_setzt_alarme_zurueck(fake_mt5):
    TradeState.algo_trading_disabled = True
    TradeState.last_error_message = "alt"
    assert safe_send_order(fake_mt5, _pending(fake_mt5)) is True
    assert (TradeState.algo_trading_disabled, TradeState.last_error_message) == (False, "")


@pytest.mark.feature("ENG-12")
def test_ausnahme_im_terminal_bricht_nicht_ab(fake_mt5, monkeypatch):
    def boom(req):
        raise RuntimeError("IPC timeout")

    monkeypatch.setattr(fake_mt5, "order_send", boom)
    assert safe_send_order(fake_mt5, _pending(fake_mt5)) is False
    assert "IPC timeout" in TradeState.last_error_message
