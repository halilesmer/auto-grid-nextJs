from typing import Callable

from src.core.grid_helpers import (
    normalize_price,
    log_message as default_log_message,
)
from src.core.grid_orders import send_pending_order_helper
from .config import ZoneConfig
from .levels import LevelSets
from .exceptions import OrderPlacementError, MT5ConnectionError


class OrderPlacer:
    def __init__(
        self,
        mt5_module,
        symbol_infos: dict,
        log_message: Callable[[str, str], None] = default_log_message,
    ):
        self.mt5 = mt5_module
        self.symbol_infos = symbol_infos
        self.log = log_message

    def place_missing_orders(
        self,
        config: ZoneConfig,
        levels: LevelSets,
        existing_buy_levels: set,
        existing_sell_levels: set,
        zone_idx: int,
        consecutive_errors: dict,
        active_zones_state: dict,
    ) -> int:
        if self.mt5 is None:
            raise MT5ConnectionError("MT5 module not available")

        buy_fill_tolerance = config.grid_step * 0.45
        sell_fill_tolerance = config.sell_grid_step * 0.45
        placed_count = 0

        for level_price in levels.desired_buy:
            if not any(
                abs(round(level_price, 5) - round(el, 5)) <= round(buy_fill_tolerance, 5)
                for el in existing_buy_levels
            ):
                tp_price = normalize_price(level_price + config.take_profit, config.symbol, self.symbol_infos)
                sl_price = (
                    normalize_price(level_price - config.stop_loss, config.symbol, self.symbol_infos)
                    if config.stop_loss > 0
                    else None
                )
                if send_pending_order_helper(
                    self.mt5,
                    level_price,
                    config.lot_size,
                    tp_price,
                    sl_price,
                    zone_idx,
                    "BUY",
                    config.symbol,
                    self.symbol_infos,
                    consecutive_errors,
                    active_zones_state,
                ):
                    placed_count += 1

        for level_price in levels.desired_sell:
            if not any(
                abs(round(level_price, 5) - round(el, 5)) <= round(sell_fill_tolerance, 5)
                for el in existing_sell_levels
            ):
                tp_price = normalize_price(level_price - config.sell_take_profit, config.symbol, self.symbol_infos)
                sl_price = (
                    normalize_price(level_price + config.sell_stop_loss, config.symbol, self.symbol_infos)
                    if config.sell_stop_loss > 0
                    else None
                )
                if send_pending_order_helper(
                    self.mt5,
                    level_price,
                    config.sell_lot_size,
                    tp_price,
                    sl_price,
                    zone_idx,
                    "SELL",
                    config.symbol,
                    self.symbol_infos,
                    consecutive_errors,
                    active_zones_state,
                ):
                    placed_count += 1

        if placed_count > 0:
            self.log(f"🌱 Ağ Tazelendi: TP olan/eksik {placed_count} adet emir yerleştirildi.")

        return placed_count