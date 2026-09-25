from typing import Callable

from src.core.grid_helpers import normalize_price, log_message as default_log_message
from src.core.grid_orders import (
    cancel_order,
    get_existing_levels_by_direction,
    send_market_order_helper,
)
from src.core.grid_signals import get_signal, log_signal_change
from src.core.state import state

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
        config: ZoneConfig = extract_zone_config(
            active_zone, active_zone_idx, log_message, symbol_infos=symbol_infos
        )

        current_open_positions = len(
            [p for p in robot_positions if p.magic == config.target_magic]
        )

        if current_open_positions >= config.max_positions:
            # Her döngü değil, yalnızca sınıra ulaşınca / sayı değişince (24.09: saniyede bir satır)
            if state.limit_warned_zones.get(active_zone_idx) != current_open_positions:
                state.limit_warned_zones[active_zone_idx] = current_open_positions
                log_message(
                    f"⚠️ DİKKAT: Bölge {active_zone_idx+1} Maksimum pozisyon sınırına ulaştı "
                    f"({current_open_positions}/{config.max_positions}). Yeni emir konmuyor.",
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
        state.limit_warned_zones.pop(active_zone_idx, None)

        buy_allowed, sell_allowed = _entry_permissions(
            mt5_module, config, active_zone, active_zone_idx, robot_positions, log_message
        )

        if config.entry_mode == "SIGNAL_MARKET":
            _handle_signal_market(
                mt5_module, config, active_zone_idx, robot_orders, symbol_infos,
                consecutive_errors, active_zones_state, current_avg_price,
                buy_allowed, sell_allowed, log_message,
            )
            return True

        levels: LevelSets = generate_levels(
            config, current_avg_price, robot_positions, symbol_infos, mt5_module, log_message
        )
        _restrict_levels(
            mt5_module, config, active_zone, levels, robot_positions, symbol_infos,
            current_avg_price, buy_allowed, sell_allowed,
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


def _count_by_side(mt5_module, config: ZoneConfig, robot_positions: list) -> tuple[int, int]:
    zone_positions = [p for p in robot_positions if p.magic == config.target_magic]
    buys = sum(1 for p in zone_positions if p.type == mt5_module.POSITION_TYPE_BUY)
    return buys, len(zone_positions) - buys


def _entry_permissions(mt5_module, config, zone_dict, zone_idx, robot_positions, log_message):
    """Yeni giriş izni (buy, sell): yön sınırı + (sinyal modunda / AUTO'da) gösterge sinyali.
    order_type AUTO, entry_mode GRID olsa da sinyali kullanır (yön başka türlü seçilemez)."""
    buys, sells = _count_by_side(mt5_module, config, robot_positions)
    buy_allowed = buys < config.max_buy_positions
    sell_allowed = sells < config.max_sell_positions

    if config.entry_mode != "GRID" or config.order_type == "AUTO":
        signal = get_signal(mt5_module, config, zone_idx)
        log_signal_change(zone_idx, signal, log_message)
        buy_allowed = buy_allowed and signal.buy_ok
        sell_allowed = sell_allowed and signal.sell_ok
    return buy_allowed, sell_allowed


def _restrict_levels(
    mt5_module, config, zone_dict, levels: LevelSets, robot_positions, symbol_infos,
    current_avg_price, buy_allowed, sell_allowed,
):
    """İzin yoksa o yönün grid seviyelerini kaldırır → OrderValidator bekleyen emirleri siler.
    Açık yön sınırı varsa (max_*_positions > 0) yalnızca boş slot kadar, fiyata en yakın
    seviyeler kalır; aynı anda dolup sınırı aşmasınlar. Pozisyon fiyatları kabul listesinde
    kalır (kısmi dolum tamamlama emri silinmesin)."""
    buys, sells = _count_by_side(mt5_module, config, robot_positions)

    def position_prices(pos_type):
        return [
            normalize_price(p.price_open, config.symbol, symbol_infos)
            for p in robot_positions
            if p.magic == config.target_magic and p.type == pos_type
        ]

    def restrict(side, allowed, count):
        desired_attr, accept_attr = (
            ("desired_buy", "acceptable_buy") if side == "BUY" else ("desired_sell", "acceptable_sell")
        )
        pos_type = mt5_module.POSITION_TYPE_BUY if side == "BUY" else mt5_module.POSITION_TYPE_SELL
        explicit = int(zone_dict.get("max_buy_positions" if side == "BUY" else "max_sell_positions", 0) or 0)
        desired = getattr(levels, desired_attr)
        if not allowed:
            setattr(levels, desired_attr, [])
            setattr(levels, accept_attr, position_prices(pos_type))
        elif explicit > 0:
            free = max(0, explicit - count)
            kept = sorted(desired, key=lambda p: abs(p - current_avg_price))[:free]
            setattr(levels, desired_attr, kept)
            setattr(levels, accept_attr, kept + position_prices(pos_type))

    restrict("BUY", buy_allowed, buys)
    restrict("SELL", sell_allowed, sells)


def _handle_signal_market(
    mt5_module, config, zone_idx, robot_orders, symbol_infos, consecutive_errors,
    active_zones_state, current_avg_price, buy_allowed, sell_allowed, log_message,
):
    """SIGNAL_MARKET: grid seviyesi/bekleyen emir yok; sinyal + boş slot varsa piyasa emri.
    Döngü başına yön başına en fazla bir giriş."""
    cancelled = sum(
        1 for o in robot_orders if o.magic == config.target_magic and cancel_order(mt5_module, o)
    )
    if cancelled > 0:
        log_message(f"🧹 Sinyal Modu: Bölge {zone_idx+1} için {cancelled} bekleyen emir silindi.")

    if not (config.min_price <= current_avg_price <= config.max_price):
        return

    if buy_allowed and config.order_type in ("BUY", "BOTH", "AUTO"):
        if send_market_order_helper(
            mt5_module, config.lot_size, config.take_profit, config.stop_loss, zone_idx, "BUY",
            config.symbol, symbol_infos, consecutive_errors, active_zones_state, state.filling_mode,
        ):
            log_message(f"📈 Sinyal Girişi: Bölge {zone_idx+1} BUY {config.lot_size} lot, TP +{config.take_profit:.5g}")
    if sell_allowed and config.order_type in ("SELL", "BOTH", "AUTO"):
        if send_market_order_helper(
            mt5_module, config.sell_lot_size, config.sell_take_profit, config.sell_stop_loss, zone_idx,
            "SELL", config.symbol, symbol_infos, consecutive_errors, active_zones_state, state.filling_mode,
        ):
            log_message(
                f"📉 Sinyal Girişi: Bölge {zone_idx+1} SELL {config.sell_lot_size} lot, TP -{config.sell_take_profit:.5g}"
            )
