from src.core.grid_helpers import (
    log_message,
    normalize_price,
)
from src.core.grid_orders import (
    BASE_MAGIC_NUMBER,
    MAX_DEVIATION,
    cancel_order,
    get_all_robot_orders,
    get_all_robot_positions,
    modify_position_tp_sl,
    send_pending_order_helper,
)
from src.utils.trade_utils import safe_send_order


def clean_zombie_orders(mt5, robot_orders, zones, active_zones_state):
    for order in robot_orders:
        order_zone_idx = order.magic - BASE_MAGIC_NUMBER - 1
        is_zone_active = False
        zone_sym = ""
        if 0 <= order_zone_idx < len(zones):
            is_zone_active = (
                str(zones[order_zone_idx].get("is_active", True)).lower() != "false"
            )
            zone_sym = str(zones[order_zone_idx].get("symbol", "")).upper().strip()

        if active_zones_state.get(order_zone_idx) in ["PAUSE", "AUTO_CLEAR", "CLEAR"]:
            is_zone_active = False

        if not is_zone_active or (zone_sym and order.symbol != zone_sym):
            dir_str = (
                "BUY"
                if order.type in [mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP]
                else "SELL"
            )
            log_message(
                f"🧹 Mutlak Temizlik: Bölge {order_zone_idx+1} pasif/uyumsuz olduğu için {dir_str} emri iptal ediliyor. (Bilet: {order.ticket}, Sembol: {order.symbol})"
            )
            cancel_order(mt5, order)


def process_partial_fills_and_tpsl(
    mt5,
    robot_positions,
    robot_orders,
    zones,
    symbol_infos,
    active_zones_state,
    consecutive_errors,
):
    processed_prices = set()
    for pos in robot_positions:
        pos_zone_idx = pos.magic - BASE_MAGIC_NUMBER - 1
        if not (0 <= pos_zone_idx < len(zones)):
            continue
        z_data = zones[pos_zone_idx]
        zone_sym = str(z_data.get("symbol", "")).upper().strip()
        if not zone_sym or pos.symbol != zone_sym:
            continue

        direction = "BUY" if pos.type == mt5.POSITION_TYPE_BUY else "SELL"
        is_sync = bool(z_data.get("sync_buy_sell", True))
        base_lot = float(z_data.get("lot_size", 0.01))

        if direction == "BUY" or is_sync:
            target_lot = max(0.01, min(5.0, base_lot))
            tp_val = float(z_data.get("take_profit", 0.05))
            sl_val = float(z_data.get("stop_loss", 0.0))
        else:
            target_lot = max(
                0.01, min(5.0, float(z_data.get("sell_lot_size", base_lot)))
            )
            tp_val = float(
                z_data.get("sell_take_profit", z_data.get("take_profit", 0.05))
            )
            sl_val = float(z_data.get("sell_stop_loss", z_data.get("stop_loss", 0.0)))

        expected_tp = (
            normalize_price(pos.price_open + tp_val, zone_sym, symbol_infos)
            if direction == "BUY"
            else normalize_price(pos.price_open - tp_val, zone_sym, symbol_infos)
        )
        expected_sl = 0.0
        if sl_val > 0:
            expected_sl = (
                normalize_price(pos.price_open - sl_val, zone_sym, symbol_infos)
                if direction == "BUY"
                else normalize_price(pos.price_open + sl_val, zone_sym, symbol_infos)
            )

        pos_tp = pos.tp if pos.tp else 0.0
        pos_sl = pos.sl if pos.sl else 0.0

        if (
            abs(float(pos_tp) - float(expected_tp)) > 0.00001
            or abs(float(pos_sl) - float(expected_sl)) > 0.00001
        ):
            log_message(
                f"🔄 Açık Pozisyon Güncellemesi: Bölge {pos_zone_idx+1} | Bilet {pos.ticket} için yeni TP/SL ayarlanıyor."
            )
            modify_position_tp_sl(mt5, pos, expected_tp, expected_sl, symbol_infos)

        grid_step_tmp = float(z_data.get("grid_step", 0.05))
        sell_grid_step_tmp = float(z_data.get("sell_grid_step", grid_step_tmp))
        tolerance_step = (
            grid_step_tmp * 0.4 if direction == "BUY" else sell_grid_step_tmp * 0.4
        )

        is_processed = any(
            direction == p_dir
            and abs(round(pos.price_open, 5) - round(p_price, 5))
            <= round(tolerance_step, 5)
            for p_dir, p_price in processed_prices
        )

        if not is_processed:
            processed_prices.add((direction, pos.price_open))
            total_pos_volume = sum(
                p.volume
                for p in robot_positions
                if p.magic == pos.magic
                and p.type == pos.type
                and abs(round(p.price_open, 5) - round(pos.price_open, 5))
                <= round(tolerance_step, 5)
            )
            remaining_lot = round(target_lot - total_pos_volume, 8)
            sym_info = symbol_infos.get(zone_sym)
            vol_min = (
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

            if remaining_lot >= vol_min:
                has_pending = any(
                    o.magic == pos.magic
                    and abs(round(o.price_open, 5) - round(pos.price_open, 5))
                    <= round(tolerance_step, 5)
                    for o in robot_orders
                )
                is_pos_zone_active = (
                    str(z_data.get("is_active", True)).lower() != "false"
                )
                if active_zones_state.get(pos_zone_idx) in [
                    "PAUSE",
                    "AUTO_CLEAR",
                    "CLEAR",
                ]:
                    is_pos_zone_active = False

                if not has_pending and is_pos_zone_active:
                    log_message(
                        f"🔄 Kısmi Dolum: Bölge {pos_zone_idx+1} | Kalan {remaining_lot} lot ({direction}) emir gönderiliyor."
                    )
                    send_pending_order_helper(
                        mt5,
                        pos.price_open,
                        remaining_lot,
                        expected_tp,
                        expected_sl if expected_sl > 0 else None,
                        pos_zone_idx,
                        direction,
                        zone_sym,
                        symbol_infos,
                        consecutive_errors,
                        active_zones_state,
                    )


def handle_zone_exit(
    mt5,
    active_zone: dict,
    active_zone_idx: int,
    robot_orders,
    robot_positions,
    filling_mode: dict,
    current_avg_price: float,
    close_price: float,
    exit_cond: str,
):
    """
    Bölge çıkışında temizlik yapar.
    Dönüş: True -> bölge 'clear_on_exit' ile pasife alınmalı (AUTO_CLEAR yazılmalı),
           False -> 'clear_on_exit' kapalı, bölgenin emirlerine dokunulmaz.
    """
    if not active_zone.get("clear_on_exit", True):
        return False

    z_min = float(active_zone.get("min_price", 0))
    z_max = float(active_zone.get("max_price", 0))
    ref_price = current_avg_price if exit_cond == "Anlık Fiyat" else close_price
    actual_exit_dir = "BUY (Yukarı)" if ref_price > z_max else "SELL (Aşağı)"
    trigger_side = active_zone.get("clear_exit_side", "Farketmez")

    if trigger_side != "Farketmez" and trigger_side != actual_exit_dir:
        log_message(
            f"ℹ️ Fiyat bölgeden çıktı ({actual_exit_dir}) ancak temizlik '{trigger_side}' ayarlandığı için işlemler pas geçildi. Bölge pasif duruma alınıyor."
        )
        return True

    scope = active_zone.get("clear_scope", "Sadece Bekleyen Emirler")
    target = active_zone.get("clear_target_side", "Farketmez (Hepsi)")
    target_magic = BASE_MAGIC_NUMBER + active_zone_idx + 1

    log_message(
        f"🧹 Bölge ({z_min}-{z_max}) DIŞINA ÇIKILDI! ({actual_exit_dir}). Kapsam: {scope} | Kapatılacak Yön: {target}"
    )

    silinen_emir_sayisi = 0
    for order in robot_orders:
        if order.magic == target_magic:
            if (
                target == "Farketmez (Hepsi)"
                or (
                    target == "Sadece BUY İşlemleri"
                    and order.type
                    in [
                        mt5.ORDER_TYPE_BUY_LIMIT,
                        mt5.ORDER_TYPE_BUY_STOP,
                    ]
                )
                or (
                    target == "Sadece SELL İşlemleri"
                    and order.type
                    in [
                        mt5.ORDER_TYPE_SELL_LIMIT,
                        mt5.ORDER_TYPE_SELL_STOP,
                    ]
                )
            ):
                cancel_order(mt5, order)
                silinen_emir_sayisi += 1

    log_message(f"🧹 Toplam {silinen_emir_sayisi} adet bekleyen {target} emri temizlendi.")

    if "Pozisyon" in scope or "Tümü" in scope or "Hepsi" in scope:
        kapatilan_poz_sayisi = 0
        for pos in robot_positions:
            if pos.magic == target_magic:
                if (
                    target == "Farketmez (Hepsi)"
                    or (
                        target == "Sadece BUY İşlemleri"
                        and pos.type == mt5.POSITION_TYPE_BUY
                    )
                    or (
                        target == "Sadece SELL İşlemleri"
                        and pos.type == mt5.POSITION_TYPE_SELL
                    )
                ):
                    tick = mt5.symbol_info_tick(pos.symbol)
                    if tick:
                        close_type = (
                            mt5.ORDER_TYPE_SELL
                            if pos.type == mt5.POSITION_TYPE_BUY
                            else mt5.ORDER_TYPE_BUY
                        )
                        close_price_val = (
                            tick.bid
                            if pos.type == mt5.POSITION_TYPE_BUY
                            else tick.ask
                        )
                        req = {
                            "action": mt5.TRADE_ACTION_DEAL,
                            "position": pos.ticket,
                            "symbol": pos.symbol,
                            "volume": pos.volume,
                            "type": close_type,
                            "price": close_price_val,
                            "deviation": MAX_DEVIATION,
                            "magic": pos.magic,
                            "comment": "Zone_Exit_Close",
                            "type_time": mt5.ORDER_TIME_GTC,
                            "type_filling": filling_mode.get(
                                pos.symbol, mt5.ORDER_FILLING_IOC
                            ),
                        }
                        safe_send_order(mt5, req, log_message)
                        kapatilan_poz_sayisi += 1
        log_message(f"💥 Toplam {kapatilan_poz_sayisi} adet {target} açık pozisyonu kapatıldı.")

    return True