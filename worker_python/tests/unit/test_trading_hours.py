"""MET-04: Handelszeit-Tooltip – olağan işlem saatleri mum verisinden."""
import datetime

import pytest

from src.core import trading_hours
from src.core.grid_metrics import calculate_live_metrics

DAYS = ("2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-21")


class _Rates:
    TIMEFRAME_M5 = 5

    def __init__(self, bars):
        self.bars = bars
        self.calls = 0

    def copy_rates_from_pos(self, symbol, tf, pos, count):
        self.calls += 1
        return self.bars


def _bars(day_sessions, days=DAYS):
    """Her gün için [(başlangıç dk, bitiş dk), ...] aralığında M5 mumları; son gün 'bugün'."""
    out = []
    for d in days:
        base = datetime.datetime.fromisoformat(d).replace(tzinfo=datetime.timezone.utc)
        for a, b in day_sessions:
            for m in range(a, b, 5):
                out.append({"time": int((base + datetime.timedelta(minutes=m)).timestamp())})
    return out


@pytest.fixture(autouse=True)
def _clear_cache():
    trading_hours._cache.clear()


@pytest.mark.feature("MET-04")
def test_durchgehende_session():
    assert trading_hours.infer_trading_hours(_Rates(_bars([(120, 1440)])), "A") == "02:00-00:00"


@pytest.mark.feature("MET-04")
def test_mittagspause_ergibt_zwei_sessions():
    assert trading_hours.infer_trading_hours(_Rates(_bars([(60, 720), (780, 1200)])), "B") == "01:00-12:00, 13:00-20:00"


@pytest.mark.feature("MET-04")
def test_sessions_ueber_mitternacht_und_24h():
    assert trading_hours.infer_trading_hours(_Rates(_bars([(0, 60), (1380, 1440)])), "C") == "23:00-01:00"
    assert trading_hours.infer_trading_hours(_Rates(_bars([(0, 1440)])), "D") == "00:00-24:00"


@pytest.mark.feature("MET-04")
def test_zu_wenig_daten_oder_fehler_ergibt_none():
    assert trading_hours.infer_trading_hours(_Rates([]), "E") is None
    assert trading_hours.infer_trading_hours(_Rates(_bars([(120, 600)], days=("2026-09-16", "2026-09-17"))), "F") is None
    assert trading_hours.infer_trading_hours(_Rates([{"close": 1.0}]), "G") is None
    assert trading_hours.infer_trading_hours(None, "H") is None


@pytest.mark.feature("MET-04")
def test_ergebnis_wird_gecacht():
    m = _Rates(_bars([(120, 1440)]))
    trading_hours.infer_trading_hours(m, "A")
    trading_hours.infer_trading_hours(m, "A")
    assert m.calls == 1


@pytest.mark.feature("MET-04")
def test_metrik_zone_market_hours(fake_mt5, monkeypatch):
    monkeypatch.setattr(trading_hours, "infer_trading_hours", lambda mt5, sym: "02:00-00:00" if sym == "USOUSD" else None)
    metrics = calculate_live_metrics(fake_mt5, {"USOUSD"}, False, False, zones=[{"symbol": "USOUSD"}, {"symbol": "XAUUSD"}])
    assert metrics["zone_market_hours"] == {"0": "02:00-00:00"}
