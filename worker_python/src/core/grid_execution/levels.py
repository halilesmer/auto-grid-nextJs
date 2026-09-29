from dataclasses import dataclass
from typing import Callable

from src.core.grid_helpers import normalize_price, log_message as default_log_message
from .config import ZoneConfig


@dataclass(slots=True)
class LevelSets:
    desired_buy: list[float]
    desired_sell: list[float]
    acceptable_buy: list[float]
    acceptable_sell: list[float]


def generate_levels(
    config: ZoneConfig,
    current_avg_price: float,
    robot_positions: list,
    symbol_infos: dict,
    mt5_module,
    log_message: Callable[[str, str], None] = default_log_message,
) -> LevelSets:
    buy_anchor_price = round(current_avg_price / config.grid_step) * config.grid_step
    sell_anchor_price = round(current_avg_price / config.sell_grid_step) * config.sell_grid_step

    desired_buy_levels: list[float] = []
    desired_sell_levels: list[float] = []
    acceptable_buy_levels: list[float] = []
    acceptable_sell_levels: list[float] = []
    buffer_steps = 2

    z_min = round(config.min_price, 5)
    z_max = round(config.max_price, 5)

    target_magic = config.target_magic

    for pos in robot_positions:
        if pos.magic == target_magic:
            if pos.type == mt5_module.POSITION_TYPE_BUY:
                acceptable_buy_levels.append(
                    normalize_price(pos.price_open, config.symbol, symbol_infos)
                )
            elif pos.type == mt5_module.POSITION_TYPE_SELL:
                acceptable_sell_levels.append(
                    normalize_price(pos.price_open, config.symbol, symbol_infos)
                )

    if config.order_type in ("BUY", "BOTH", "AUTO"):
        if not config.is_breakout:
            for i in range(1, config.levels_below + 1):
                p = buy_anchor_price - (i * config.grid_step)
                if z_min <= round(p, 5) <= z_max:
                    desired_buy_levels.append(normalize_price(p, config.symbol, symbol_infos))

        for i in range(1, config.levels_above + 1):
            p = buy_anchor_price + (i * config.grid_step)
            if config.is_breakout and round(p - current_avg_price, 5) < round(config.pullback_distance, 5):
                continue
            if z_min <= round(p, 5) <= z_max:
                desired_buy_levels.append(normalize_price(p, config.symbol, symbol_infos))

        for i in range(-config.levels_below - buffer_steps, config.levels_above + buffer_steps + 1):
            level_p = buy_anchor_price + (i * config.grid_step)
            if config.is_breakout and level_p < current_avg_price:
                continue
            acceptable_buy_levels.append(normalize_price(level_p, config.symbol, symbol_infos))

    if config.order_type in ("SELL", "BOTH", "AUTO"):
        if not config.is_breakout:
            for i in range(1, config.levels_above + 1):
                p = sell_anchor_price + (i * config.sell_grid_step)
                if z_min <= round(p, 5) <= z_max:
                    desired_sell_levels.append(normalize_price(p, config.symbol, symbol_infos))

        for i in range(1, config.levels_below + 1):
            p = sell_anchor_price - (i * config.sell_grid_step)
            if config.is_breakout and round(current_avg_price - p, 5) < round(config.sell_pullback_distance, 5):
                continue
            if z_min <= round(p, 5) <= z_max:
                desired_sell_levels.append(normalize_price(p, config.symbol, symbol_infos))

        for i in range(-config.levels_below - buffer_steps, config.levels_above + buffer_steps + 1):
            level_p = sell_anchor_price + (i * config.sell_grid_step)
            if config.is_breakout and level_p > current_avg_price:
                continue
            acceptable_sell_levels.append(normalize_price(level_p, config.symbol, symbol_infos))

    return LevelSets(
        desired_buy=desired_buy_levels,
        desired_sell=desired_sell_levels,
        acceptable_buy=acceptable_buy_levels,
        acceptable_sell=acceptable_sell_levels,
    )