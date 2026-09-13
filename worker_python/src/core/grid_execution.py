from src.core.grid_helpers import (
    log_message,
    normalize_price,
    normalize_volume,
)
from src.core.grid_orders import (
    BASE_MAGIC_NUMBER,
    cancel_order,
    get_existing_levels_by_direction,
    send_pending_order_helper,
)

def handle_sliding_grid(
    mt5,
    active_zone,
    active_zone_idx,
    robot_positions,
    robot_orders,
    symbol_infos,
    consecutive_errors,
    active_zones_state,
    current_avg_price,
):
    z_type = active_zone.get("order_type", "BUY")
    z_min = float(active_zone.get("min_price", 0))
    z_max = float(active_zone.get("max_price", 0))
    grid_step = max(0.00001, float(active_zone.get("grid_step", 0.05)))
    lot_val = max(0.01, min(5.0, float(active_zone.get("lot_size", 0.01))))
    tp_val = float(active_zone.get("take_profit", 0.05))
    sl_val = float(active_zone.get("stop_loss", 0.0))
    zone_symbol = active_zone.get("symbol", "").upper().strip()

    is_sync = bool(active_zone.get("sync_buy_sell", True))
    if is_sync:
        sell_grid_step, sell_lot_val, sell_tp_val, sell_sl_val = (
            grid_step,
            lot_val,
            tp_val,
            sl_val,
        )
        sell_pullback_distance = float(active_zone.get("pullback_distance", 0.50))
    else:
        sell_grid_step = max(
            0.00001, float(active_zone.get("sell_grid_step", grid_step))
        )
        sell_lot_val = max(
            0.01, min(5.0, float(active_zone.get("sell_lot_size", lot_val)))
        )
        sell_tp_val = float(active_zone.get("sell_take_profit", tp_val))
        sell_sl_val = float(active_zone.get("sell_stop_loss", sl_val))
        sell_pullback_distance = float(
            active_zone.get(
                "sell_pullback_distance", active_zone.get("pullback_distance", 0.50)
            )
        )

    levels_below = int(active_zone.get("levels_below", 5))
    levels_above = int(active_zone.get("levels_above", 5))
    max_positions_allowed = int(active_zone.get("max_positions", 10)) or 500

    is_breakout = bool(active_zone.get("is_breakout", False))
    pullback_distance = float(active_zone.get("pullback_distance", 0.50))

    target_magic = BASE_MAGIC_NUMBER + active_zone_idx + 1
    current_open_positions = len(
        [p for p in robot_positions if p.magic == target_magic]
    )

    if current_open_positions >= max_positions_allowed:
        log_message(
            f"⚠️ DİKKAT: Bölge {active_zone_idx+1} Maksimum pozisyon sınırına ulaştı ({max_positions_allowed}).",
            "WARN",
        )
        silinen = sum(
            1 for o in robot_orders if o.magic == target_magic and cancel_order(mt5, o)
        )
        if silinen > 0:
            log_message(
                f"🛡️ Güvenlik Koruması: Sınır aşıldığı için {silinen} bekleyen emir temizlendi."
            )
        return True

    buy_anchor_price = round(current_avg_price / grid_step) * grid_step
    sell_anchor_price = round(current_avg_price / sell_grid_step) * sell_grid_step

    desired_buy_levels, desired_sell_levels = [], []
    acceptable_buy_levels, acceptable_sell_levels = [], []
    buffer_steps = 2

    for pos in robot_positions:
        if pos.magic == target_magic:
            if pos.type == mt5.POSITION_TYPE_BUY:
                acceptable_buy_levels.append(
                    normalize_price(pos.price_open, zone_symbol, symbol_infos)
                )
            elif pos.type == mt5.POSITION_TYPE_SELL:
                acceptable_sell_levels.append(
                    normalize_price(pos.price_open, zone_symbol, symbol_infos)
                )

    if z_type in ["BUY", "BOTH"]:
        if not is_breakout:
            for i in range(1, levels_below + 1):
                p = buy_anchor_price - (i * grid_step)
                if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                    desired_buy_levels.append(
                        normalize_price(p, zone_symbol, symbol_infos)
                    )
        for i in range(1, levels_above + 1):
            p = buy_anchor_price + (i * grid_step)
            if is_breakout and round(p - current_avg_price, 5) < round(
                pullback_distance, 5
            ):
                continue
            if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                desired_buy_levels.append(normalize_price(p, zone_symbol, symbol_infos))
        for i in range(-levels_below - buffer_steps, levels_above + buffer_steps + 1):
            level_p = buy_anchor_price + (i * grid_step)
            if is_breakout and level_p < current_avg_price:
                continue
            acceptable_buy_levels.append(
                normalize_price(level_p, zone_symbol, symbol_infos)
            )

    if z_type in ["SELL", "BOTH"]:
        if not is_breakout:
            for i in range(1, levels_above + 1):
                p = sell_anchor_price + (i * sell_grid_step)
                if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                    desired_sell_levels.append(
                        normalize_price(p, zone_symbol, symbol_infos)
                    )
        for i in range(1, levels_below + 1):
            p = sell_anchor_price - (i * sell_grid_step)
            if is_breakout and round(current_avg_price - p, 5) < round(
                sell_pullback_distance, 5
            ):
                continue
            if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                desired_sell_levels.append(
                    normalize_price(p, zone_symbol, symbol_infos)
                )
        for i in range(-levels_below - buffer_steps, levels_above + buffer_steps + 1):
            level_p = sell_anchor_price + (i * sell_grid_step)
            if is_breakout and level_p > current_avg_price:
                continue
            acceptable_sell_levels.append(
                normalize_price(level_p, zone_symbol, symbol_infos)
            )

    buy_tolerance = grid_step * 0.4
    sell_tolerance = sell_grid_step * 0.4
    silinen_emir_sayisi = 0

    for order in robot_orders:
        if order.magic != target_magic:
            continue
        order_price = normalize_price(order.price_open, zone_symbol, symbol_infos)
        is_valid = False

        if order.type in [mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP]:
            is_valid = any(
                abs(round(order_price, 5) - round(al, 5)) <= round(buy_tolerance, 5)
                for al in acceptable_buy_levels
            )
            if is_valid:
                expected_tp = normalize_price(
                    order_price + tp_val, zone_symbol, symbol_infos
                )
                expected_sl = (
                    normalize_price(order_price - sl_val, zone_symbol, symbol_infos)
                    if sl_val > 0
                    else 0.0
                )
                pos_vol = sum(
                    p.volume
                    for p in robot_positions
                    if p.magic == target_magic
                    and p.type == mt5.POSITION_TYPE_BUY
                    and abs(
                        round(
                            normalize_price(p.price_open, zone_symbol, symbol_infos), 5
                        )
                        - round(order_price, 5)
                    )
                    <= round(buy_tolerance, 5)
                )
                expected_lot = (
                    max(0.0, round(float(lot_val) - pos_vol, 8))
                    if pos_vol > 0
                    else float(lot_val)
                )
                sym_info = symbol_infos.get(zone_symbol)
                v_min = (
                    getattr(
                        sym_info,
                        "volume_min",
                        (
                            sym_info.get("vol_min", 0.01)
                            if isinstance(sym_info, dict)
                            else 0.01
                        ),
                    )
                    if sym_info
                    else 0.01
                )
                if expected_lot < v_min:
                    expected_lot = 0.0
                expected_lot_norm = (
                    normalize_volume(expected_lot, zone_symbol, symbol_infos)
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

        elif order.type in [mt5.ORDER_TYPE_SELL_LIMIT, mt5.ORDER_TYPE_SELL_STOP]:
            is_valid = any(
                abs(round(order_price, 5) - round(al, 5)) <= round(sell_tolerance, 5)
                for al in acceptable_sell_levels
            )
            if is_valid:
                expected_tp = normalize_price(
                    order_price - sell_tp_val, zone_symbol, symbol_infos
                )
                expected_sl = (
                    normalize_price(
                        order_price + sell_sl_val, zone_symbol, symbol_infos
                    )
                    if sell_sl_val > 0
                    else 0.0
                )
                pos_vol = sum(
                    p.volume
                    for p in robot_positions
                    if p.magic == target_magic
                    and p.type == mt5.POSITION_TYPE_SELL
                    and abs(
                        round(
                            normalize_price(p.price_open, zone_symbol, symbol_infos), 5
                        )
                        - round(order_price, 5)
                    )
                    <= round(sell_tolerance, 5)
                )
                expected_lot = (
                    max(0.0, round(float(sell_lot_val) - pos_vol, 8))
                    if pos_vol > 0
                    else float(sell_lot_val)
                )
                sym_info = symbol_infos.get(zone_symbol)
                if expected_lot < (sym_info.volume_min if sym_info else 0.01):
                    expected_lot = 0.0
                expected_lot_norm = (
                    normalize_volume(expected_lot, zone_symbol, symbol_infos)
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
            cancel_order(mt5, order)
            silinen_emir_sayisi += 1

    if silinen_emir_sayisi > 0:
        log_message(
            f"🧹 Pencere Kaydı: Fiyattan uzaklaşan {silinen_emir_sayisi} adet emir silindi."
        )

    exist_buy_levels, exist_sell_levels = get_existing_levels_by_direction(
        mt5, grid_step, sell_grid_step, zone_symbol, symbol_infos
    )
    eklenen_emir_sayisi = 0
    buy_fill_tolerance = grid_step * 0.45
    sell_fill_tolerance = sell_grid_step * 0.45

    for level_price in desired_buy_levels:
        if not any(
            abs(round(level_price, 5) - round(el, 5)) <= round(buy_fill_tolerance, 5)
            for el in exist_buy_levels
        ):
            tp_price = normalize_price(level_price + tp_val, zone_symbol, symbol_infos)
            sl_price = (
                normalize_price(level_price - sl_val, zone_symbol, symbol_infos)
                if sl_val > 0
                else None
            )
            if send_pending_order_helper(
                mt5,
                level_price,
                lot_val,
                tp_price,
                sl_price,
                active_zone_idx,
                "BUY",
                zone_symbol,
                symbol_infos,
                consecutive_errors,
                active_zones_state,
            ):
                eklenen_emir_sayisi += 1

    for level_price in desired_sell_levels:
        if not any(
            abs(round(level_price, 5) - round(el, 5)) <= round(sell_fill_tolerance, 5)
            for el in exist_sell_levels
        ):
            tp_price = normalize_price(
                level_price - sell_tp_val, zone_symbol, symbol_infos
            )
            sl_price = (
                normalize_price(level_price + sell_sl_val, zone_symbol, symbol_infos)
                if sell_sl_val > 0
                else None
            )
            if send_pending_order_helper(
                mt5,
                level_price,
                sell_lot_val,
                tp_price,
                sl_price,
                active_zone_idx,
                "SELL",
                zone_symbol,
                symbol_infos,
                consecutive_errors,
                active_zones_state,
            ):
                eklenen_emir_sayisi += 1

    if eklenen_emir_sayisi > 0:
        log_message(
            f"🌱 Ağ Tazelendi: TP olan/eksik {eklenen_emir_sayisi} adet emir yerleştirildi."
        )

    return True
