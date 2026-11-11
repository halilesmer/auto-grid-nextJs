"""BKT-24: Pending Orders zum Fensterbeginn (market_sync: Filter, Kapsel-Regel, Vereinigung der zwei MT5-Aufrufe)."""
import calendar

import pytest

from src.utils import market_sync
from tests.fakes.fake_mt5 import FakeMT5, Order

pytestmark = pytest.mark.feature("BKT-24")

FROM = calendar.timegm((2026, 9, 28, 0, 0, 0))
TO = FROM + 1
ACCOUNT = {"login": 4242}


def row(**kw):
    base = {"ticket": 5001, "type": 2, "state": 2, "time_setup": FROM - 100, "time_setup_msc": (FROM - 100) * 1000,
            "time_done": FROM + 100, "time_done_msc": (FROM + 100) * 1000}
    base.update(kw)
    return base


def test_waiting_order_is_kept():
    assert market_sync.order_waits_in(row(), FROM, TO)


@pytest.mark.parametrize("change", [
    {"type": 0}, {"type": 1}, {"type": 6}, {"type": 7},        # Markt und Stop-Limit
    {"state": 5},                                               # REJECTED
    {"time_done": FROM - 1, "time_done_msc": FROM * 1000 - 1},  # vor dem Fenster beendet
    {"time_setup": FROM + 5, "time_setup_msc": (FROM + 5) * 1000},  # erst nach dem Fenster gesetzt
])
def test_dropped_orders(change):
    assert not market_sync.order_waits_in(row(**change), FROM, TO)


def test_done_exactly_at_from_is_kept():
    # Der Fuellung bei FROM liegt im Fenster: der Einstiegs-Deal ist dann kein Startzustand, die Order schon.
    assert market_sync.order_waits_in(row(time_done=FROM, time_done_msc=FROM * 1000), FROM, TO)


def test_setup_exactly_at_to_is_dropped():
    assert not market_sync.order_waits_in(row(time_setup=TO, time_setup_msc=TO * 1000), FROM, TO)


def test_open_order_waits_without_done_time():
    open_order = row(state=1, time_done=0, time_done_msc=0)
    assert market_sync.order_waits_in(open_order, FROM, TO)
    assert not market_sync.order_waits_in({**open_order, "time_setup_msc": TO * 1000}, FROM, TO)


def test_coverage_stops_at_oldest_open_order():
    now = FROM + 30 * 86400
    settle = now - market_sync.DEAL_SETTLE_SEC
    assert market_sync.live_orders_covered_to(FROM + 86400, now, []) == FROM + 86400
    assert market_sync.live_orders_covered_to(now, now, []) == settle
    opens = [row(time_setup=FROM + 500), row(time_setup=FROM + 200)]
    assert market_sync.live_orders_covered_to(FROM + 86400, now, opens) == FROM + 200


@pytest.mark.parametrize("by", ["setup", "done"])
def test_two_calls_find_the_order_in_both_range_meanings(by, monkeypatch):
    from src.utils import mt5_market as mm

    fake = FakeMT5()
    fake.account.login = 4242
    fake.history_range_by = by
    # Lange gewartet: gesetzt vor FROM, beendet nach TO
    fake.history[1] = Order(1, "XAUUSD", 2, 2600.0, 0.1, state=2, time_setup=FROM - 3600, time_setup_msc=(FROM - 3600) * 1000,
                            time_done=FROM + 7200, time_done_msc=(FROM + 7200) * 1000)
    monkeypatch.setattr(mm, "_connected", lambda account, collect: collect(fake))
    got = market_sync._fetch_live_orders(ACCOUNT, [(FROM, TO)])
    assert [o["ticket"] for o in got["orders"]] == [1]
    assert got["done"] == [(FROM, TO)]


def test_union_by_ticket_has_no_duplicates(monkeypatch):
    from src.utils import mt5_market as mm

    fake = FakeMT5()
    fake.account.login = 4242
    fake.history[1] = Order(1, "XAUUSD", 2, 2600.0, 0.1, state=2, time_setup=FROM - 10, time_setup_msc=(FROM - 10) * 1000,
                            time_done=FROM + 10, time_done_msc=(FROM + 10) * 1000)
    monkeypatch.setattr(mm, "_connected", lambda account, collect: collect(fake))
    got = market_sync._fetch_live_orders(ACCOUNT, [(FROM, TO)])
    assert len(got["orders"]) == 1 and len(fake.history_orders_calls) == 2


def test_terminal_in_other_account_is_refused(monkeypatch):
    from src.utils import mt5_market as mm

    fake = FakeMT5()
    fake.account.login = 1111
    fake.history[1] = Order(1, "XAUUSD", 2, 2600.0, 0.1, state=2, time_setup=FROM - 10, time_setup_msc=(FROM - 10) * 1000,
                            time_done=FROM + 10, time_done_msc=(FROM + 10) * 1000)
    monkeypatch.setattr(mm, "_connected", lambda account, collect: collect(fake))
    with pytest.raises(mm.MarketDataError):
        market_sync._fetch_live_orders(ACCOUNT, [(FROM, TO)])
    assert not getattr(fake, "history_orders_calls", [])
