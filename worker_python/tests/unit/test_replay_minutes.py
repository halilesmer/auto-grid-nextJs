"""BKT-23: Trigger-Minuten-Replay (market_sync.parse_replay_minutes, tick_rows_by_minute)."""
import calendar

import pytest

from src.utils import market_sync

pytestmark = pytest.mark.feature("BKT-23")

A = calendar.timegm((2026, 9, 28, 0, 0, 0))


def test_parse_deltas_from_start():
    assert market_sync.parse_replay_minutes(A, "0,5,1,10") == [A, A + 300, A + 360, A + 960]
    assert market_sync.parse_replay_minutes(A, "3") == [A + 180]


@pytest.mark.parametrize("start,m", [
    (A + 1, "1"),            # Start nicht auf der Minute
    (A, ""),                 # leer
    (A, "a,b"),              # keine Zahl
    (A, "1,-2"),             # negativ
    (A, "1,0"),              # doppelte Minute
    (A, "1,,2"),             # Leerfeld
    (A, ",".join(["1"] * (market_sync.REPLAY_REQ_MAX_MINUTES + 1))),  # zu viele
    (A, "1," + str(market_sync.REPLAY_REQ_MAX_SPAN_SEC // 60 + 1)),   # Spanne zu groß
])
def test_parse_rejects(start, m):
    with pytest.raises(ValueError):
        market_sync.parse_replay_minutes(start, m)


def test_tick_rows_by_minute_points_and_offsets():
    rows = [
        {"time_msc": A * 1000 + 5, "bid": 1.00010, "ask": 1.00020, "flags": 6},
        {"time_msc": A * 1000 + 59_999, "bid": 1.00011, "ask": 1.00021, "flags": 6},
        {"time_msc": (A + 60) * 1000, "bid": 1.00012, "ask": 1.00022, "flags": 6},
        {"time_msc": (A + 120) * 1000, "bid": 0.0, "ask": 0.0, "flags": 6},  # ungültig
    ]
    out = market_sync.tick_rows_by_minute(rows, 0.00001)
    assert out[A] == ([5, 59_999], [100010, 100011], [100020, 100021])
    assert out[A + 60] == ([0], [100012], [100022])
    assert A + 120 not in out
