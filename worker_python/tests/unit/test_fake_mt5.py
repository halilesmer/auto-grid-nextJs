"""Selbsttest des FakeMT5 – die ENG-Tests sind nur so gut wie dieser Broker-Ersatz."""


def test_pending_orders_werden_beim_kursdurchgang_gefuellt(fake_mt5):
    m = fake_mt5
    bl = m.add_order("USOUSD", m.ORDER_TYPE_BUY_LIMIT, 96.9, magic=200001, tp=97.0)
    bs = m.add_order("USOUSD", m.ORDER_TYPE_BUY_STOP, 97.2, magic=200001)
    sl = m.add_order("USOUSD", m.ORDER_TYPE_SELL_LIMIT, 97.2, magic=200001)
    ss = m.add_order("USOUSD", m.ORDER_TYPE_SELL_STOP, 96.8, magic=200001)

    m.set_price("USOUSD", 96.88)  # ask 96.89 ≤ 96.9 → Buy-Limit gefüllt
    assert {p.ticket for p in m.positions} == {bl.ticket}
    assert m.positions[0].tp == 97.0

    m.set_price("USOUSD", 97.25)  # Buy-Stop + Sell-Limit gefüllt, TP 97.0 der ersten Position erreicht
    tickets = {p.ticket for p in m.positions}
    assert tickets == {bs.ticket, sl.ticket}
    assert ss in m.orders


def test_ablehnung_und_stille_ablehnung(fake_mt5):
    m = fake_mt5
    m.reject(10016, times=2)
    assert m.order_check({}).retcode == 10016
    assert m.order_check({}).retcode == 10016
    assert m.order_check({}).retcode == 0

    m.silent_reject_next()
    res = m.order_send({"action": m.TRADE_ACTION_PENDING, "symbol": "USOUSD", "type": m.ORDER_TYPE_BUY_LIMIT,
                        "price": 96.0, "volume": 0.01})
    assert res.retcode == 10009 and m.orders_get(ticket=res.order) == ()
