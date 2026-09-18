from typing import Callable

from src.core.grid_helpers import log_message as default_log_message
from src.core.grid_orders import (
    cancel_order,
    get_existing_levels_by_direction,
)

from .config import extract_zone_config, ZoneConfig
from .levels import generate_levels, LevelSets
from .validation import OrderValidator
from .placement import OrderPlacer
from .exceptions import (
    OrderValidationError,
    OrderPlacementError,
    MT5ConnectionError,
)


def handle_sliding_grid(
    mt5_module,
    active_zone: dict,
    active_zone_idx: int,
    robot_positions: list,
    robot_orders: list,
    symbol_infos: dict,
    consecutive_errors: dict,
    active_zones_state: dict,
    current_avg_price: float,
    log_message: Callable[[str, str], None] = default_log_message,
) -> bool:
    try:
        config: ZoneConfig = extract_zone_config(active_zone, active_zone_idx, log_message)

        current_open_positions = len(
            [p for p in robot_positions if p.magic == config.target_magic]
        )

        if current_open_positions >= config.max_positions:
            log_message(
                f"⚠️ DİKKAT: Bölge {active_zone_idx+1} Maksimum pozisyon sınırına ulaştı ({config.max_positions}).",
                "WARN",
            )
            cancelled = sum(
                1 for o in robot_orders if o.magic == config.target_magic and cancel_order(mt5_module, o)
            )
            if cancelled > 0:
                log_message(
                    f"🛡️ Güvenlik Koruması: Sınır aşıldığı için {cancelled} bekleyen emir temizlendi."
                )
            return True

        levels: LevelSets = generate_levels(
            config, current_avg_price, robot_positions, symbol_infos, mt5_module, log_message
        )

        validator = OrderValidator(mt5_module, symbol_infos, log_message)
        validator.validate_and_cleanup(robot_orders, robot_positions, config, levels, active_zone_idx)

        exist_buy_levels, exist_sell_levels = get_existing_levels_by_direction(
            mt5_module, config.grid_step, config.sell_grid_step, config.symbol, symbol_infos
        )

        placer = OrderPlacer(mt5_module, symbol_infos, log_message)
        placer.place_missing_orders(
            config,
            levels,
            exist_buy_levels,
            exist_sell_levels,
            active_zone_idx,
            consecutive_errors,
            active_zones_state,
        )

        return True

    except (OrderValidationError, OrderPlacementError, MT5ConnectionError) as e:
        log_message(f"⚠️ Zone {active_zone_idx+1} error: {e}", "ERROR")
        consecutive_errors[active_zone_idx] = consecutive_errors.get(active_zone_idx, 0) + 1
        return False

    except Exception as e:
        log_message(f"🚨 Unexpected error in zone {active_zone_idx+1}: {e}", "ERROR")
        return False