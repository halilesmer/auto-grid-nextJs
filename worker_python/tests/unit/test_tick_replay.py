"""BKT-20: Rollover-/Sprung-Minuten für das selektive Tick-Replay (market_sync.replay_minutes, Blob-Kodierung)."""
import calendar

import pytest

from src.utils import market_sync

pytestmark = pytest.mark.feature("BKT-20")

A = calendar.timegm((2026, 9, 28, 0, 0, 0))
POINT = 0.01


def _tick(t_ms, bid, spread_pts):
    return {"time_msc": t_ms, "bid": round(bid, 2), "ask": round(bid + spread_pts * POINT, 2), "flags": 6}


def _day(minutes, extra=None, shift_from=None, shift=4.8):
    """Je Minute ein Tick (Spread 10); `extra`: {Minute: [(ms im Minute, Spread)]}; ab `shift_from` liegt der Bid um `shift` höher."""
    rows = []
    for k in range(minutes):
        bid = 2650.0 + (shift if shift_from is not None and k >= shift_from else 0.0)
        rows.append(_tick((A + 60 * k) * 1000, bid, 10))
        for ms, spread in (extra or {}).get(k, []):
            rows.append(_tick((A + 60 * k) * 1000 + ms, bid, spread))
    return rows


def _run(ticks, minutes, **kwargs):
    stats = market_sync.minute_spread_stats(ticks, POINT, A, A + 60 * minutes)
    return market_sync.replay_minutes(ticks, stats, POINT, A, A + 60 * minutes, **kwargs)


def test_spread_level_marks_rollover_minute_and_keeps_its_ticks():
    rows, dropped = _run(_day(60, {7: [(1000, 35)]}), 60)
    assert dropped == 0
    assert [(r[0], r[1]) for r in rows] == [(A + 420, "S")]
    minute, kind, ms, bid, ask = rows[0]
    assert ms == [0, 1000]
    assert bid == [265000, 265000] and ask == [265010, 265035]  # ganze Punkte


def test_normal_minutes_are_not_marked():
    rows, _ = _run(_day(60, {7: [(1000, 14)]}), 60)  # 1,4 × Median
    assert rows == []


def test_price_jump_marks_minute_even_with_normal_spread_and_uses_carried_tick():
    rows, _ = _run(_day(60, shift_from=9), 60)
    assert [(r[0], r[1]) for r in rows] == [(A + 540, "J")]  # Sprung vom Tick der Vorminute zum ersten Tick der Minute


def test_spread_and_jump_in_one_minute_is_sj():
    rows, _ = _run(_day(60, {9: [(2000, 35)]}, shift_from=9), 60)
    assert [(r[0], r[1]) for r in rows] == [(A + 540, "SJ")]


def test_short_piece_has_no_spread_rule_but_keeps_jump_rule():
    ticks = _day(10, {3: [(1000, 35)]}, shift_from=6)
    rows, _ = _run(ticks, 10)
    assert [(r[0], r[1]) for r in rows] == [(A + 360, "J")]


def test_budget_keeps_largest_ratio_and_counts_dropped():
    ticks = _day(60, {7: [(1000, 35)], 20: [(1000, 38)]})
    rows, dropped = _run(ticks, 60, max_ticks=2)
    assert [r[0] for r in rows] == [A + 1200] and dropped == 1


def test_invalid_ticks_are_ignored():
    ticks = _day(60) + [{"time_msc": (A + 60) * 1000 + 5, "bid": 0.0, "ask": 0.0, "flags": 0}]
    rows, _ = _run(sorted(ticks, key=lambda r: r["time_msc"]), 60)
    assert rows == []


def test_blob_round_trip():
    blob = market_sync.encode_replay([0, 1000], [265000, 265001], [265010, 265150])
    assert isinstance(blob, bytes)
    assert market_sync.decode_replay(blob) == ([0, 1000], [265000, 265001], [265010, 265150])
