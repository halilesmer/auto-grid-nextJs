"""In-Memory-Ersatz für das MetaTrader5-Paket (nur Windows) – für Tests auf Mac/CI.

Bildet genau die Teile der MT5-API nach, die die Grid-Engine benutzt: Konstanten,
Symbole/Ticks, Orders/Positionen, order_check/order_send, copy_rates_from_pos.

Zusätzlich gibt es Test-Hebel:
    set_price(sym, bid)       Kurs bewegen → Pending Orders füllen, TP/SL auslösen
    reject(retcode, times)    nächste order_check-Aufrufe ablehnen (z. B. 10016, 10027)
    silent_reject_next()      order_send meldet OK, Order erscheint aber nicht im Buch
    set_closed_candle(...)    Schlusskurs der letzten geschlossenen Kerze (exit_condition)
    add_order/add_position    Ausgangslage aufbauen (auch manuelle Orders ohne Robot-Magic);
                              add_position(order_volume=...) = Position aus teilweise gefüllter Order
    partial_fill_next(vol)    nächste Füllung einer Pending Order nur mit `vol` (Rest verfällt, IOC)
    history                   Order-Historie (gefüllt/gelöscht) für history_orders_get
    sent                      Liste aller order_send-Requests
"""
from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field


# --------------------------------------------------------------------------- Datentypen
@dataclass
class SymbolInfo:
    name: str
    point: float = 0.001
    digits: int = 3
    volume_min: float = 0.01
    volume_max: float = 50.0
    volume_step: float = 0.01
    trade_stops_level: int = 0
    trade_mode: int = 4  # SYMBOL_TRADE_MODE_FULL
    visible: bool = True
    filling_mode: int = 2  # Bitmaske: 1 = FOK, 2 = IOC
    trade_contract_size: float = 1000.0
    description: str = ""


@dataclass
class Tick:
    bid: float
    ask: float
    time_msc: int = 0


@dataclass
class Order:
    ticket: int
    symbol: str
    type: int
    price_open: float
    volume_initial: float
    tp: float = 0.0
    sl: float = 0.0
    magic: int = 0
    comment: str = ""
    volume_current: float | None = None

    def __post_init__(self):
        if self.volume_current is None:
            self.volume_current = self.volume_initial


@dataclass
class Position:
    ticket: int
    symbol: str
    type: int
    price_open: float
    volume: float
    tp: float = 0.0
    sl: float = 0.0
    magic: int = 0
    profit: float = 0.0
    comment: str = ""
    identifier: int = 0  # Positions-ID = Ticket der eröffnenden Order (wie im echten Paket)

    def __post_init__(self):
        if not self.identifier:
            self.identifier = self.ticket


@dataclass
class TerminalInfo:
    connected: bool = True
    trade_allowed: bool = True
    data_path: str = ""


@dataclass
class AccountInfo:
    login: int = 1001
    server: str = "Fake-Demo"
    trade_mode: int = 0  # ACCOUNT_TRADE_MODE_DEMO


@dataclass
class Result:
    retcode: int
    order: int = 0
    comment: str = ""


@dataclass
class _Rejection:
    retcode: int
    remaining: int


# --------------------------------------------------------------------------- Fake
class FakeMT5:
    # Positions-/Ordertypen (Werte wie im echten Paket)
    POSITION_TYPE_BUY = 0
    POSITION_TYPE_SELL = 1
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    ORDER_TYPE_BUY_LIMIT = 2
    ORDER_TYPE_SELL_LIMIT = 3
    ORDER_TYPE_BUY_STOP = 4
    ORDER_TYPE_SELL_STOP = 5
    # Trade-Aktionen
    TRADE_ACTION_DEAL = 1
    TRADE_ACTION_PENDING = 5
    TRADE_ACTION_SLTP = 6
    TRADE_ACTION_MODIFY = 7
    TRADE_ACTION_REMOVE = 8
    ORDER_TIME_GTC = 0
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_RETURN = 2
    TRADE_RETCODE_DONE = 10009
    SYMBOL_TRADE_MODE_DISABLED = 0
    SYMBOL_TRADE_MODE_FULL = 4
    ACCOUNT_TRADE_MODE_DEMO = 0
    ACCOUNT_TRADE_MODE_REAL = 2
    # Zeitrahmen
    TIMEFRAME_M1 = 1
    TIMEFRAME_M5 = 5
    TIMEFRAME_M15 = 15
    TIMEFRAME_M30 = 30
    TIMEFRAME_H1 = 16385
    TIMEFRAME_H4 = 16388
    TIMEFRAME_D1 = 16408

    BUY_TYPES = (ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_BUY_STOP)
    SELL_TYPES = (ORDER_TYPE_SELL_LIMIT, ORDER_TYPE_SELL_STOP)

    def __init__(self):
        self.symbols: dict[str, SymbolInfo] = {}
        self.ticks: dict[str, Tick] = {}
        self.orders: list[Order] = []
        self.positions: list[Position] = []
        self.terminal = TerminalInfo()
        self.account = AccountInfo()
        self.sent: list[dict] = []
        self.checked: list[dict] = []
        self.closed_candles: dict[tuple[str, int], float] = {}
        self.shutdown_called = False
        self.initialize_calls = 0
        self.login_calls = 0
        self._tickets = itertools.count(1000)
        self._rejections: list[_Rejection] = []
        self._silent_reject = 0
        self._partial_fills: list[float] = []
        self.history: dict[int, Order] = {}
        self._last_error = (1, "Success")

    # ------------------------------------------------------------------ Aufbau (Test-Hebel)
    def add_symbol(self, name: str, bid: float, ask: float | None = None, **info) -> SymbolInfo:
        self.symbols[name] = SymbolInfo(name=name, **info)
        self.set_price(name, bid, ask, fill=False)
        return self.symbols[name]

    def set_price(self, symbol: str, bid: float, ask: float | None = None, fill: bool = True):
        """Setzt den Kurs. Mit fill=True werden Pending Orders ausgeführt und TP/SL ausgelöst."""
        info = self.symbols[symbol]
        ask = round(bid + 10 * info.point, info.digits) if ask is None else ask
        self.ticks[symbol] = Tick(bid=bid, ask=ask, time_msc=int(time.time() * 1000))
        if fill:
            self._fill_pending(symbol)
            self._trigger_tp_sl(symbol)

    def set_tick_age(self, symbol: str, seconds: float):
        """Letzten Tick künstlich altern lassen (Markt geschlossen / keine Ticks)."""
        self.ticks[symbol].time_msc = int((time.time() - seconds) * 1000)

    def set_closed_candle(self, symbol: str, timeframe: int, close: float):
        self.closed_candles[(symbol, timeframe)] = close

    def add_order(self, symbol, type, price, volume=0.01, tp=0.0, sl=0.0, magic=0, comment="") -> Order:
        order = Order(next(self._tickets), symbol, type, price, volume, tp, sl, magic, comment)
        self.orders.append(order)
        return order

    def add_position(self, symbol, type, price, volume=0.01, tp=0.0, sl=0.0, magic=0, profit=0.0,
                     order_volume: float | None = None) -> Position:
        """Offene Position samt eröffnender Order in der Historie. order_volume > volume =
        die Order wurde nur teilweise gefüllt (Rest verfallen)."""
        pos = Position(next(self._tickets), symbol, type, price, volume, tp, sl, magic, profit)
        order_type = self.ORDER_TYPE_BUY if type == self.POSITION_TYPE_BUY else self.ORDER_TYPE_SELL
        self.history[pos.identifier] = Order(pos.identifier, symbol, order_type, price,
                                             order_volume if order_volume is not None else volume,
                                             tp, sl, magic, volume_current=0.0)
        self.positions.append(pos)
        return pos

    def partial_fill_next(self, volume: float, times: int = 1):
        """Die nächsten `times` Füllungen von Pending Orders nur mit `volume` (Rest verfällt)."""
        self._partial_fills.extend([volume] * times)

    def reject(self, retcode: int, times: int = 1):
        """Die nächsten `times` order_check-Aufrufe liefern `retcode` statt 0."""
        self._rejections.append(_Rejection(retcode, times))

    def silent_reject_next(self, times: int = 1):
        self._silent_reject += times

    # Abfragen für Assertions
    def robot_orders(self, magic: int | None = None) -> list[Order]:
        return [o for o in self.orders if 200000 <= o.magic < 201000 and (magic is None or o.magic == magic)]

    def robot_positions(self, magic: int | None = None) -> list[Position]:
        return [p for p in self.positions if 200000 <= p.magic < 201000 and (magic is None or p.magic == magic)]

    # ------------------------------------------------------------------ MT5-API
    def initialize(self, **kwargs):
        self.initialize_calls += 1
        return self.terminal.connected

    def login(self, login, password=None, server=None):
        self.login_calls += 1
        return self.terminal.connected

    def shutdown(self):
        self.shutdown_called = True

    def last_error(self):
        return self._last_error

    def terminal_info(self):
        return self.terminal if self.terminal.connected else None

    def account_info(self):
        return self.account

    def symbol_select(self, symbol, enable=True):
        return symbol in self.symbols

    def symbol_info(self, symbol):
        return self.symbols.get(symbol)

    def symbols_get(self):
        return list(self.symbols.values())

    def symbol_info_tick(self, symbol):
        return self.ticks.get(symbol)

    def orders_get(self, ticket=None, symbol=None):
        items = [o for o in self.orders if (ticket is None or o.ticket == ticket) and (symbol is None or o.symbol == symbol)]
        return tuple(items)

    def positions_get(self, ticket=None, symbol=None):
        items = [p for p in self.positions if (ticket is None or p.ticket == ticket) and (symbol is None or p.symbol == symbol)]
        return tuple(items)

    def history_orders_get(self, ticket=None, position=None):
        if ticket is not None:
            order = self.history.get(ticket)
            return (order,) if order else ()
        if position is not None:
            return tuple(o for t, o in self.history.items() if t == position)
        return tuple(self.history.values())

    def copy_rates_from_pos(self, symbol, timeframe, start_pos, count):
        close = self.closed_candles.get((symbol, timeframe))
        if close is None:
            return None
        return [{"close": close}]

    def order_check(self, request):
        self.checked.append(dict(request))
        if self._rejections:
            rej = self._rejections[0]
            rej.remaining -= 1
            if rej.remaining <= 0:
                self._rejections.pop(0)
            return Result(retcode=rej.retcode, comment="rejected by FakeMT5")
        return Result(retcode=0)

    def order_send(self, request):
        self.sent.append(dict(request))
        action = request.get("action")

        if action == self.TRADE_ACTION_PENDING:
            if self._silent_reject:
                self._silent_reject -= 1
                return Result(retcode=self.TRADE_RETCODE_DONE, order=next(self._tickets))
            order = self.add_order(
                request["symbol"], request["type"], request["price"], request["volume"],
                request.get("tp", 0.0), request.get("sl", 0.0), request.get("magic", 0), request.get("comment", ""),
            )
            return Result(retcode=self.TRADE_RETCODE_DONE, order=order.ticket)

        if action == self.TRADE_ACTION_REMOVE:
            removed = [o for o in self.orders if o.ticket == request["order"]]
            self.orders = [o for o in self.orders if o.ticket != request["order"]]
            for o in removed:
                self.history[o.ticket] = o
            return Result(retcode=self.TRADE_RETCODE_DONE if removed else 10013)

        if action == self.TRADE_ACTION_SLTP:
            for p in self.positions:
                if p.ticket == request["position"]:
                    p.tp, p.sl = request.get("tp", 0.0), request.get("sl", 0.0)
                    return Result(retcode=self.TRADE_RETCODE_DONE)
            return Result(retcode=10013)

        if action == self.TRADE_ACTION_DEAL:
            if "position" in request:  # Position schließen
                self.positions = [p for p in self.positions if p.ticket != request["position"]]
                return Result(retcode=self.TRADE_RETCODE_DONE)
            pos_type = self.POSITION_TYPE_BUY if request["type"] == self.ORDER_TYPE_BUY else self.POSITION_TYPE_SELL
            pos = self.add_position(request["symbol"], pos_type, request["price"], request["volume"],
                                    request.get("tp", 0.0), request.get("sl", 0.0), request.get("magic", 0))
            return Result(retcode=self.TRADE_RETCODE_DONE, order=pos.ticket)

        return Result(retcode=10013, comment="unsupported action")

    # ------------------------------------------------------------------ Markt-Simulation
    def _fill_pending(self, symbol):
        tick = self.ticks[symbol]
        still_open = []
        for o in self.orders:
            if o.symbol != symbol:
                still_open.append(o)
                continue
            filled = (
                (o.type == self.ORDER_TYPE_BUY_LIMIT and tick.ask <= o.price_open)
                or (o.type == self.ORDER_TYPE_BUY_STOP and tick.ask >= o.price_open)
                or (o.type == self.ORDER_TYPE_SELL_LIMIT and tick.bid >= o.price_open)
                or (o.type == self.ORDER_TYPE_SELL_STOP and tick.bid <= o.price_open)
            )
            if filled:
                pos_type = self.POSITION_TYPE_BUY if o.type in self.BUY_TYPES else self.POSITION_TYPE_SELL
                volume = o.volume_current
                if self._partial_fills:
                    volume = min(volume, self._partial_fills.pop(0))
                self.positions.append(Position(o.ticket, o.symbol, pos_type, o.price_open, volume,
                                               o.tp, o.sl, o.magic, 0.0, o.comment))
                o.volume_current = 0.0
                self.history[o.ticket] = o
            else:
                still_open.append(o)
        self.orders = still_open

    def _trigger_tp_sl(self, symbol):
        tick = self.ticks[symbol]
        remaining = []
        for p in self.positions:
            if p.symbol == symbol:
                if p.type == self.POSITION_TYPE_BUY and ((p.tp and tick.bid >= p.tp) or (p.sl and tick.bid <= p.sl)):
                    continue
                if p.type == self.POSITION_TYPE_SELL and ((p.tp and tick.ask <= p.tp) or (p.sl and tick.ask >= p.sl)):
                    continue
            remaining.append(p)
        self.positions = remaining
