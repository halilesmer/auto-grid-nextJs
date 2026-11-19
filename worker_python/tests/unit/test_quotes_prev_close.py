"""FRM-29: Vortagsschluss, wenn die Tageskerze des laufenden Tages fehlt (Brent, Sitzung noch nicht eröffnet)."""
from types import SimpleNamespace

import pytest

from src.utils.mt5_market import collect_quotes

pytestmark = pytest.mark.feature("FRM-29")

DAY = 86400


class StubMT5:
    TIMEFRAME_D1 = 16408

    def __init__(self, bars, tick_time):
        self._bars, self._tick_time = bars, tick_time

    def account_info(self):
        return SimpleNamespace(login=1)

    def symbol_info(self, name):
        return SimpleNamespace(digits=3)

    def symbol_info_tick(self, name):
        return SimpleNamespace(last=0, bid=94.163, time=self._tick_time)

    def copy_rates_from_pos(self, name, tf, pos, count):
        return self._bars[-count:]


def run(bars, tick_time):
    return collect_quotes(StubMT5(bars, tick_time), {"login": 1}, ["X"])["X"]


def test_missing_today_bar_uses_last_bar_as_previous_close():
    # Brent: D1-Historie hat 10-30 und 11-18, aber noch keine Kerze für heute (11-19)
    bars = [{"time": 100 * DAY, "close": 116.712}, {"time": 119 * DAY, "close": 93.104}]
    assert run(bars, 120 * DAY + 3600)["prev_close"] == 93.104


def test_today_bar_present_uses_second_last_bar():
    bars = [{"time": 118 * DAY, "close": 93.104}, {"time": 119 * DAY, "close": 94.0}]
    assert run(bars, 119 * DAY + 3600)["prev_close"] == 93.104
