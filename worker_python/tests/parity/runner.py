"""Musterlösungen (BKT-01): spielt ein Szenario mit dem echten Python-Bot ab und zeichnet die
Ereignisfolge auf. Der Bot-Nachbau im Browser (Schritt 7) muss dieselbe Folge liefern.

Szenario (tests/parity/scenarios/*.json, von make_scenarios.py erzeugt):
    symbol   {name, digits, point, spread_points, …weitere SymbolInfo-Felder}
    zones    Zonen wie in configs/settings_*.json
    start    Startzeit in MT5-Sekunden (= simulierte Uhr)
    history  {"H4": [Kerzen …]} abgeschlossene Kerzen vor dem Start (optional)
    ticks    [[Sekunden ab Start, Bid], …]; Ask = Bid + spread_points × point

Ablauf je Tick (docs/analyse-regeln.md §5: erst der Markt, dann der Bot):
    1. Uhr auf start + dt, Kurs setzen → der Broker füllt Pending Orders und löst TP/SL aus
    2. ein Bot-Durchlauf (manage_dynamic_grid wie im Live-Loop)

Kein Blick in die Zukunft: Kerzen jedes Zeitrahmens entstehen nur aus der Historie und den bis
jetzt gelaufenen Ticks (die laufende Kerze nur bis zum aktuellen Tick).

Ereignisse (ohne Ticketnummern, damit der Nachbau nicht dieselbe Nummerierung braucht):
    place   Pending Order gesetzt       {type, price, volume, tp, sl, magic, comment}
    market  Marktorder (Sofort-Einstieg) {type, price, volume, tp, sl, magic}
    cancel  Order gelöscht              {type, price, magic}
    modify  Order geändert              {type, price, tp, sl, magic}
    sltp    TP/SL einer Position        {type, open, tp, sl, magic}
    close   Bot schließt Position       {type, open, price, volume, magic}
    fill    Broker füllt Order          {type, price, volume, magic}
    exit    Broker schließt per TP/SL   {type, open, price, reason, volume, magic}
    active  aktive Zone je Symbol       {zones}
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

from src.core import clock
from src.core.state import state
from tests.fakes.fake_mt5 import FakeMT5
from tests.helpers import EngineHarness

ROOT = Path(__file__).resolve().parent
SCENARIOS = ROOT / "scenarios"
GOLDEN = ROOT / "golden"

TF_SECONDS = {"M1": 60, "M5": 300, "M15": 900, "M30": 1800, "H1": 3600, "H4": 14400, "D1": 86400}
TYPE_NAMES = {0: "BUY", 1: "SELL", 2: "BUY_LIMIT", 3: "SELL_LIMIT", 4: "BUY_STOP", 5: "SELL_STOP"}
POSITION_NAMES = {0: "BUY", 1: "SELL"}


class TimelineMT5(FakeMT5):
    """FakeMT5, dessen Kerzen nur aus Historie + bisherigen Ticks entstehen und dessen Uhr simuliert ist."""

    def __init__(self, scenario: dict):
        super().__init__()
        self.now = float(scenario["start"])
        self.clock = lambda: self.now
        sym = dict(scenario["symbol"])
        self.symbol = sym.pop("name")
        self.spread = sym.pop("spread_points", 10) * sym.get("point", 0.001)
        self.add_symbol(self.symbol, scenario["ticks"][0][1], **sym)
        self.history = {tf: [dict(b) for b in bars] for tf, bars in (scenario.get("history") or {}).items()}
        self.seen: list[tuple[float, float]] = []  # (Zeit, Bid) bisher gelaufener Ticks
        self.tf_by_const = {getattr(self, f"TIMEFRAME_{k}"): k for k in TF_SECONDS}

    def ask_for(self, bid: float) -> float:
        info = self.symbols[self.symbol]
        return round(bid + self.spread, info.digits)

    # ------------------------------------------------------------------ Kerzen ohne Zukunft
    def _bars(self, timeframe) -> list[dict]:
        name = self.tf_by_const.get(timeframe)
        if name is None:
            return []
        step = TF_SECONDS[name]
        bars = [dict(b) for b in self.history.get(name, [])]
        last_hist = bars[-1]["time"] if bars else None
        for t, bid in self.seen:
            start = int(t) // step * step
            if last_hist is not None and start <= last_hist:
                continue  # die Historie endet vor dem Start; ältere Ticks gibt es nicht
            if bars and bars[-1]["time"] == start:
                bar = bars[-1]
                bar["high"], bar["low"], bar["close"] = max(bar["high"], bid), min(bar["low"], bid), bid
                bar["tick_volume"] += 1
            else:
                bars.append({"time": start, "open": bid, "high": bid, "low": bid, "close": bid,
                             "tick_volume": 1, "spread": 0})
        return bars

    def copy_rates_from_pos(self, symbol, timeframe, start_pos, count):
        """Wie MT5: Position 0 = laufende Kerze (die mit dem aktuellen Tick), alt → neu."""
        if symbol != self.symbol:
            return None
        full = self._bars(timeframe)
        end = len(full) - start_pos
        if end <= 0:
            return None
        return [dict(b) for b in full[max(0, end - count): end]] or None

    def copy_rates_range(self, symbol, timeframe, date_from, date_to):
        bars = [b for b in self._bars(timeframe) if int(date_from) <= b["time"] <= int(date_to)]
        return bars or None

    def copy_rates_from(self, symbol, timeframe, date_from, count):
        bars = [b for b in self._bars(timeframe) if b["time"] <= int(date_from)]
        return bars[-count:] or None


class Recorder:
    def __init__(self, mt5: TimelineMT5, digits: int):
        self.mt5 = mt5
        self.digits = digits + 2
        self.events: list[dict] = []
        self.index = 0
        self.dt = 0.0
        original = mt5.order_send

        def order_send(request):
            before_orders = {o.ticket: o for o in mt5.orders}
            before_positions = {p.ticket: p for p in mt5.positions}
            result = original(request)
            if result.retcode == mt5.TRADE_RETCODE_DONE:
                self._bot_event(request, before_orders, before_positions)
            return result

        mt5.order_send = order_send

    def r(self, x) -> float:
        return round(float(x or 0.0), self.digits)

    def emit(self, kind: str, **data):
        self.events.append({"i": self.index, "t": self.dt, "ev": kind, **data})

    def _bot_event(self, req, orders, positions):
        m = self.mt5
        action = req.get("action")
        if action == m.TRADE_ACTION_PENDING:
            self.emit("place", type=TYPE_NAMES[req["type"]], price=self.r(req["price"]), volume=self.r(req["volume"]),
                      tp=self.r(req.get("tp")), sl=self.r(req.get("sl")), magic=req.get("magic", 0),
                      comment=req.get("comment", ""))
        elif action == m.TRADE_ACTION_REMOVE:
            o = orders.get(req["order"])
            if o:
                self.emit("cancel", type=TYPE_NAMES[o.type], price=self.r(o.price_open), magic=o.magic)
        elif action == m.TRADE_ACTION_MODIFY:
            o = orders.get(req["order"])
            if o:
                self.emit("modify", type=TYPE_NAMES[o.type], price=self.r(req.get("price", o.price_open)),
                          tp=self.r(req.get("tp")), sl=self.r(req.get("sl")), magic=o.magic)
        elif action == m.TRADE_ACTION_SLTP:
            p = positions.get(req["position"])
            if p:
                self.emit("sltp", type=POSITION_NAMES[p.type], open=self.r(p.price_open), tp=self.r(req.get("tp")),
                          sl=self.r(req.get("sl")), magic=p.magic)
        elif action == m.TRADE_ACTION_DEAL:
            if "position" in req:
                p = positions.get(req["position"])
                if p:
                    self.emit("close", type=POSITION_NAMES[p.type], open=self.r(p.price_open),
                              price=self.r(req.get("price")), volume=self.r(p.volume), magic=p.magic)
            else:
                self.emit("market", type=TYPE_NAMES[req["type"]], price=self.r(req.get("price")),
                          volume=self.r(req["volume"]), tp=self.r(req.get("tp")), sl=self.r(req.get("sl")),
                          magic=req.get("magic", 0))

    def market_step(self, bid: float):
        """Kurs setzen; Füllungen und TP/SL-Ausstiege des Brokers getrennt aufzeichnen.

        Erst füllen, dann TP/SL: so bleibt auch ein Ausstieg sichtbar, der im selben Tick auf die
        Füllung folgt (Kurslücke, enger SL).
        """
        m = self.mt5
        m.set_price(m.symbol, bid, m.ask_for(bid), fill=False)
        tick = m.ticks[m.symbol]
        orders = {o.ticket: o for o in m.orders}
        m._fill_pending(m.symbol)
        now_orders = {o.ticket for o in m.orders}
        filled_volume = {p.ticket: p.volume for p in m.positions}
        for ticket, o in orders.items():
            if ticket not in now_orders and o.state == m.ORDER_STATE_FILLED:
                self.emit("fill", type=TYPE_NAMES[o.type], price=self.r(o.price_open),
                          volume=self.r(filled_volume.get(ticket, o.volume_initial)), magic=o.magic)
        positions = {p.ticket: p for p in m.positions}
        m._trigger_tp_sl(m.symbol)
        now_positions = {p.ticket for p in m.positions}
        for ticket, p in positions.items():
            if ticket in now_positions:
                continue
            buy = p.type == m.POSITION_TYPE_BUY
            price = tick.bid if buy else tick.ask
            hit_tp = p.tp and ((buy and tick.bid >= p.tp) or (not buy and tick.ask <= p.tp))
            self.emit("exit", type=POSITION_NAMES[p.type], open=self.r(p.price_open), price=self.r(price),
                      reason="tp" if hit_tp else "sl", volume=self.r(p.volume), magic=p.magic)


def load(name: str) -> dict:
    return json.loads((SCENARIOS / f"{name}.json").read_text(encoding="utf-8"))


def scenario_names() -> list[str]:
    return sorted(p.stem for p in SCENARIOS.glob("*.json"))


def reset_bot_state():
    """Globaler Bot-Zustand und Zustandsdateien wie bei einem frischen Bot-Start."""
    import os

    from src.utils.paths import get_fractal_state_path, get_ui_state_path
    from src.utils.trade_utils import TradeState

    state.reset()
    state.zones = []
    state.active_symbols.clear()
    state.symbol_infos.clear()
    state.filling_mode.clear()
    state.remote_paused = False
    TradeState.algo_trading_disabled = False
    TradeState.last_error_message = ""
    TradeState.last_order_ticket = 0
    account = os.environ.get("ACTIVE_ACCOUNT_ID", "")
    for path in (get_ui_state_path(account), get_fractal_state_path(account)):
        if os.path.exists(path):
            os.remove(path)


def run(scenario: dict) -> list[dict]:
    """Spielt das Szenario ab (frischer Bot-Zustand); Rückgabe: Ereignisfolge."""
    reset_bot_state()
    scenario = copy.deepcopy(scenario)
    mt5 = TimelineMT5(scenario)
    digits = mt5.symbols[mt5.symbol].digits
    rec = Recorder(mt5, digits)
    engine = EngineHarness(mt5, scenario["zones"])
    state.zones = scenario["zones"]
    clock.set_clock(lambda: mt5.now)
    try:
        active = {}
        for i, (dt, bid) in enumerate(scenario["ticks"]):
            rec.index, rec.dt = i, dt
            mt5.now = scenario["start"] + dt
            mt5.seen.append((mt5.now, bid))
            rec.market_step(bid)
            engine.tick()
            if engine.active_zones != active:
                active = dict(engine.active_zones)
                rec.emit("active", zones={k: v for k, v in sorted(active.items())})
    finally:
        clock.set_clock(None)
    return rec.events


def golden_path(name: str) -> Path:
    return GOLDEN / f"{name}.json"


def write_golden(name: str, events: list[dict]):
    GOLDEN.mkdir(exist_ok=True)
    golden_path(name).write_text(json.dumps(events, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
