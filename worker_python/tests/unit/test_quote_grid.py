"""BKT-22: Kursraster (quote_grid) und Ask-Extreme je Minute (minute_quote_extremes) aus den Ticks."""
import calendar

import pytest

from src.utils import market_sync

pytestmark = pytest.mark.feature("BKT-22")

A = calendar.timegm((2026, 11, 5, 0, 0, 0))
POINT = 0.001  # USOUSD-ähnlich: 3 Stellen, Raster 10 Punkte


def _tick(t_ms, bid_pts, ask_pts):
    return {"time_msc": t_ms, "bid": round(bid_pts * POINT, 3), "ask": round(ask_pts * POINT, 3), "flags": 6}


def _grid_ticks(count, step=10, bid_phase=7, spread=42, wobble=1):
    """`count` Ticks, Bid im Raster `step` (Phase `bid_phase`), Ask = Bid + spread; Kursschritte 1× und 2× step."""
    rows, bid = [], 90000 + bid_phase
    for k in range(count):
        bid += step * (wobble if k % 3 else -wobble) * (2 if k % 7 == 0 else 1)
        rows.append(_tick(A * 1000 + k * 500, bid, bid + spread))
    return rows


def test_grid_found_for_usousd_like_ticks():
    assert market_sync.quote_grid(_grid_ticks(300), POINT) == 10


def test_grid_found_for_wide_steps():
    rows = []
    bid = 1500000 + 9
    for k in range(300):
        bid += 50 * (2 if k % 4 == 0 else 1) * (1 if k % 3 else -1)
        rows.append(_tick(A * 1000 + k * 500, bid, bid + 1900))
    assert market_sync.quote_grid(rows, POINT) == 50


def test_fx_like_one_point_steps_have_no_grid():
    rows, bid = [], 91500
    steps = [1, 1, 2, -1, 1, -2, 3, 1, -1, 1]
    for k in range(300):
        bid += steps[k % len(steps)]
        rows.append(_tick(A * 1000 + k * 500, bid, bid + 10))
    assert market_sync.quote_grid(rows, POINT) == 1


def test_few_steps_do_not_count_as_grid():
    assert market_sync.quote_grid(_grid_ticks(20), POINT) == 1


def test_a_stray_tick_does_not_break_the_grid_but_many_do():
    rows = _grid_ticks(300)
    rows[100]["bid"] = round(rows[100]["bid"] + 0.003, 3)  # zwei Schritte ab diesem Tick ungerade
    assert market_sync.quote_grid(rows, POINT) == 10
    broken = _grid_ticks(300)
    for r in broken[::10]:
        r["bid"] = round(r["bid"] + 0.003, 3)
        r["ask"] = round(r["ask"] + 0.003, 3)
    assert market_sync.quote_grid(broken, POINT) == 1


def test_extremes_are_absolute_points_of_ticks_inside_the_minute_only():
    rows = [
        _tick((A - 5) * 1000, 90000, 90100),  # vor der Minute: zählt nicht
        _tick(A * 1000 + 1000, 90367, 90399),
        _tick(A * 1000 + 2000, 90267, 90309),
        _tick(A * 1000 + 3000, 90360, 90390),
        _tick((A + 60) * 1000, 91000, 91050),  # nächste Minute
    ]
    out = market_sync.minute_quote_extremes(rows, POINT, A, A + 120, 1)
    assert out[A][:2] == (90399, 90309)
    assert out[A + 60][:2] == (91050, 91050)


def test_minute_grid_is_one_when_phase_changes_inside_the_minute():
    ticks = [_tick(A * 1000 + 1000 * k, 90007 + 10 * k, 90049 + 10 * k) for k in range(5)]
    ticks.append(_tick(A * 1000 + 6000, 90007 + 3, 90049 + 3))  # Bid-Phase springt
    out = market_sync.minute_quote_extremes(ticks, POINT, A, A + 60, 10)
    assert out[A][2] == 1
    clean = market_sync.minute_quote_extremes(ticks[:5], POINT, A, A + 60, 10)
    assert clean[A][2] == 10


def test_minute_grid_is_one_when_day_grid_is_one():
    ticks = [_tick(A * 1000 + 1000, 91500, 91510)]
    assert market_sync.minute_quote_extremes(ticks, POINT, A, A + 60, 1)[A][2] == 1


def test_ticks_with_zero_quotes_are_ignored():
    rows = [_tick(A * 1000 + 1000, 0, 0), _tick(A * 1000 + 2000, 90367, 90399)]
    assert market_sync.minute_quote_extremes(rows, POINT, A, A + 60, 10)[A][:2] == (90399, 90399)


def test_minute_spread_stats_unchanged():
    rows = [_tick(A * 1000 + 1000, 90367, 90399), _tick(A * 1000 + 31000, 90367, 90409)]
    (minute, sa, sx, n), = market_sync.minute_spread_stats(rows, POINT, A, A + 60)
    assert (minute, sx, n) == (A, 42, 2)
