from typing import Callable

from src.core.grid_helpers import normalize_price, normalize_volume, log_message as default_log_message
from src.core.grid_orders import cancel_order, remaining_lot_at_level
from .config import ZoneConfig
from .levels import LevelSets
from .exceptions import OrderValidationError, MT5ConnectionError


class OrderValidator:
    def __init__(
        self,
        mt5_module,
        symbol_infos: dict,
        log_message: Callable[[str, str], None] = default_log_message,
    ):
        self.mt5 = mt5_module
        self.symbol_infos = symbol_infos
        self.log = log_message

    def validate_and_cleanup(
        self,
        robot_orders: list,
        robot_positions: list,
        config: ZoneConfig,
        levels: LevelSets,
        zone_idx: int,
    ) -> int:
        if self.mt5 is None:
            raise MT5ConnectionError("MT5 module not available")

        buy_tolerance = config.grid_step * 0.4
        sell_tolerance = config.sell_grid_step * 0.4
        cancelled_count = 0

        for order in robot_orders:
            if order.magic != config.target_magic:
                continue

            order_price = normalize_price(order.price_open, config.symbol, self.symbol_infos)
            is_valid = False

            if order.type in [self.mt5.ORDER_TYPE_BUY_LIMIT, self.mt5.ORDER_TYPE_BUY_STOP]:
                is_valid = any(
                    abs(round(order_price, 5) - round(al, 5)) <= round(buy_tolerance, 5)
                    for al in levels.acceptable_buy
                )
                if is_valid:
                    expected_tp = normalize_price(order_price + config.take_profit, config.symbol, self.symbol_infos)
                    expected_sl = (
                        normalize_price(order_price - config.stop_loss, config.symbol, self.symbol_infos)
                        if config.stop_loss > 0
                        else 0.0
                    )

                    positions_at_level = [
                        p
                        for p in robot_positions
                        if p.magic == config.target_magic
                        and p.type == self.mt5.POSITION_TYPE_BUY
                        and abs(
                            round(normalize_price(p.price_open, config.symbol, self.symbol_infos), 5)
                            - round(order_price, 5)
                        )
                        <= round(buy_tolerance, 5)
                    ]

                    # Seviyede pozisyon varsa buradaki emir yalnızca kısmi dolum tamamlamasıdır:
                    # beklenen lot = açan emrin eksik kalan kısmı (ayarlardaki lot değil),
                    # grid_order_manager ile aynı hesap (remaining_lot_at_level)
                    expected_lot = (
                        remaining_lot_at_level(self.mt5, positions_at_level, config.symbol, self.symbol_infos)
                        if positions_at_level
                        else float(config.lot_size)
                    )

                    expected_lot_norm = (
                        normalize_volume(expected_lot, config.symbol, self.symbol_infos)
                        if expected_lot > 0
                        else 0.0
                    )

                    if (
                        expected_lot_norm == 0.0
                        or abs(float(order.volume_initial) - expected_lot_norm) > 0.00001
                        or abs(float(order.tp or 0.0) - float(expected_tp)) > 0.00001
                        or abs(float(order.sl or 0.0) - float(expected_sl)) > 0.00001
                    ):
                        is_valid = False

            elif order.type in [self.mt5.ORDER_TYPE_SELL_LIMIT, self.mt5.ORDER_TYPE_SELL_STOP]:
                is_valid = any(
                    abs(round(order_price, 5) - round(al, 5)) <= round(sell_tolerance, 5)
                    for al in levels.acceptable_sell
                )
                if is_valid:
                    expected_tp = normalize_price(order_price - config.sell_take_profit, config.symbol, self.symbol_infos)
                    expected_sl = (
                        normalize_price(order_price + config.sell_stop_loss, config.symbol, self.symbol_infos)
                        if config.sell_stop_loss > 0
                        else 0.0
                    )

                    positions_at_level = [
                        p
                        for p in robot_positions
                        if p.magic == config.target_magic
                        and p.type == self.mt5.POSITION_TYPE_SELL
                        and abs(
                            round(normalize_price(p.price_open, config.symbol, self.symbol_infos), 5)
                            - round(order_price, 5)
                        )
                        <= round(sell_tolerance, 5)
                    ]

                    # Seviyede pozisyon varsa buradaki emir yalnızca kısmi dolum tamamlamasıdır:
                    # beklenen lot = açan emrin eksik kalan kısmı (ayarlardaki lot değil),
                    # grid_order_manager ile aynı hesap (remaining_lot_at_level)
                    expected_lot = (
                        remaining_lot_at_level(self.mt5, positions_at_level, config.symbol, self.symbol_infos)
                        if positions_at_level
                        else float(config.sell_lot_size)
                    )

                    expected_lot_norm = (
                        normalize_volume(expected_lot, config.symbol, self.symbol_infos)
                        if expected_lot > 0
                        else 0.0
                    )

                    if (
                        expected_lot_norm == 0.0
                        or abs(float(order.volume_initial) - expected_lot_norm) > 0.00001
                        or abs(float(order.tp or 0.0) - float(expected_tp)) > 0.00001
                        or abs(float(order.sl or 0.0) - float(expected_sl)) > 0.00001
                    ):
                        is_valid = False

            if not is_valid:
                try:
                    if cancel_order(self.mt5, order):
                        cancelled_count += 1
                except Exception as e:
                    self.log(f"⚠️ Order cancel failed: {e}", "WARN")

        if cancelled_count > 0:
            self.log(f"🧹 Pencere Kaydı: Fiyattan uzaklaşan {cancelled_count} adet emir silindi.")

        return cancelled_count