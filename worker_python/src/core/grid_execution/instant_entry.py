"""Anında ilk pozisyon (`instant_entry`): bölgenin bir yönünde (BUY/SELL) açık pozisyon yoksa
o yönde hemen piyasa emriyle bir pozisyon açılır — bot başlarken ve o yönün tüm pozisyonları
kapandıktan sonra (ör. TP). Ardından grid bu pozisyondan itibaren kurulur (levels.py, çapa)."""
from typing import Callable

from src.core.grid_helpers import (
    get_current_market_price,
    normalize_price,
    normalize_volume,
    log_message as default_log_message,
)
from src.core.grid_orders import MAX_DEVIATION, zone_number
from src.core import clock
from src.core.state import state
from src.utils.trade_utils import safe_send_order
from .config import ZoneConfig

# Reddedilen / henüz görünmeyen emirden sonra her döngüde yeniden göndermeyi önler
RETRY_SECONDS = 30.0


def open_instant_positions(
    mt5,
    config: ZoneConfig,
    zone_idx: int,
    robot_positions: list,
    current_avg_price: float,
    symbol_infos: dict,
    log_message: Callable[[str, str], None] = default_log_message,
    now: Callable[[], float] | None = None,
) -> int:
    if not config.instant_entry or mt5 is None:
        return 0
    now = now or clock.monotonic
    # Fiyat bölge dışındaysa (sembolün ilk bölgesine düşülmüş) pozisyon açma
    if not (config.min_price <= current_avg_price <= config.max_price):
        return 0

    zone_positions = [p for p in robot_positions if p.magic == config.target_magic]
    opened = 0
    for side in ("BUY", "SELL"):
        if config.order_type not in (side, "BOTH"):
            continue
        if len(zone_positions) + opened >= config.max_positions:
            break
        is_buy = side == "BUY"
        pos_type = mt5.POSITION_TYPE_BUY if is_buy else mt5.POSITION_TYPE_SELL
        key = (zone_idx, side)
        if any(p.type == pos_type for p in zone_positions):
            # Pozisyon görünür oldu: fren kalkar, TP ile kapanınca hemen yeniden açılabilir
            state.instant_entry_sent.pop(key, None)
            continue
        last = state.instant_entry_sent.get(key)
        if last is not None and now() - last < RETRY_SECONDS:
            continue

        price = get_current_market_price(mt5, config.symbol, side)
        if price is None:
            continue
        lot = config.lot_size if is_buy else config.sell_lot_size
        tp = config.take_profit if is_buy else config.sell_take_profit
        sl = config.stop_loss if is_buy else config.sell_stop_loss
        sign = 1 if is_buy else -1
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": config.symbol,
            "volume": normalize_volume(lot, config.symbol, symbol_infos),
            "type": mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
            "price": price,
            "deviation": MAX_DEVIATION,
            "magic": config.target_magic,
            "comment": f"AutoGrid_Z{zone_number(config.target_magic)}_Start",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": state.filling_mode.get(config.symbol, mt5.ORDER_FILLING_IOC),
            "tp": normalize_price(price + sign * tp, config.symbol, symbol_infos) if tp > 0 else 0.0,
        }
        if sl > 0:
            request["sl"] = normalize_price(price - sign * sl, config.symbol, symbol_infos)

        state.instant_entry_sent[key] = now()
        if safe_send_order(mt5, request, log_message):
            opened += 1
            log_message(
                f"🚀 Anında Giriş: Bölge {zone_idx + 1} | {side} {request['volume']} lot @ {price} açıldı."
            )
    return opened
