from src.utils.trade_utils import TradeState
from src.core.grid_helpers import is_market_open
from src.core import trading_hours

BASE_MAGIC_NUMBER = 200000


def calculate_live_metrics(mt5, active_symbols, connection_lost, remote_paused, zone_states=None, zones=None):
    zone_symbols = {
        str(i): str(z.get("symbol") or "").upper().strip()
        for i, z in enumerate(zones or [])
    }
    metrics = {
        # Bölge başına piyasa durumu (her sembolün işlem saati farklı): {"0": True, ...}
        "zone_market_open": {
            i: bool(sym) and is_market_open(mt5, sym) for i, sym in zone_symbols.items()
        },
        # Motorun bölge durumları ({"0": "AUTO_CLEAR", ...}); arayüz bölgede uyarı + "Yeniden Başlat" gösterir
        "zone_states": {str(k): v for k, v in (zone_states or {}).items()},
        "profit": 0.0,
        "open_positions": 0,
        "pending_orders": 0,
        "current_price": 0.0,
        # Sembol başına anlık fiyat (bölge kartları kendi sembolünü gösterir)
        "symbol_prices": {},
        "algo_trading_error": TradeState.algo_trading_disabled,
        "order_rejected_alarm": bool(TradeState.last_error_message),
        "last_error": TradeState.last_error_message,
        "remote_paused": remote_paused,
        "mt5_connected": True,
        "connection_lost": connection_lost,
        "market_open": (
            any(is_market_open(mt5, sym) for sym in active_symbols)
            if active_symbols
            else False
        ),
    }

    if mt5 is None:
        metrics["mt5_connected"] = False
        return metrics

    terminal_info = mt5.terminal_info()
    if terminal_info is None or not getattr(terminal_info, "connected", False):
        metrics["mt5_connected"] = False
        metrics["market_open"] = False
        metrics["zone_market_open"] = {i: False for i in zone_symbols}
        return metrics

    metrics["mt5_connected"] = True
    # Bölge başına olağan işlem saati (mum verisinden tahmin, önbellekli): {"0": "02:00-00:00"}
    hours = {i: trading_hours.infer_trading_hours(mt5, sym) for i, sym in zone_symbols.items()}
    metrics["zone_market_hours"] = {i: h for i, h in hours.items() if h}
    if not terminal_info.trade_allowed:
        metrics["algo_trading_error"] = True

    positions = mt5.positions_get()
    if positions:
        robot_pos = [
            p
            for p in positions
            if BASE_MAGIC_NUMBER <= p.magic < BASE_MAGIC_NUMBER + 1000
        ]
        metrics["open_positions"] = len(robot_pos)
        metrics["profit"] = round(sum(pos.profit for pos in robot_pos), 2)

    orders = mt5.orders_get()
    if orders:
        robot_orders = [
            o for o in orders if BASE_MAGIC_NUMBER <= o.magic < BASE_MAGIC_NUMBER + 1000
        ]
        metrics["pending_orders"] = len(robot_orders)

    if active_symbols:
        for sym in sorted(active_symbols):
            tick = mt5.symbol_info_tick(sym)
            if tick:
                metrics["symbol_prices"][sym] = tick.bid
        if metrics["symbol_prices"]:
            first = sorted(active_symbols)[0]
            metrics["current_price"] = metrics["symbol_prices"].get(
                first, next(iter(metrics["symbol_prices"].values()))
            )

    return metrics
