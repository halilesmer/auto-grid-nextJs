import os
import json
from src.core.grid_helpers import (
    get_current_market_price,
    get_mt5_timeframe,
    log_message,
)
from src.core.grid_orders import get_all_robot_orders, get_all_robot_positions
from src.utils.paths import get_ui_state_path

from .grid_zone_selector import (
    detect_zone_entry,
    is_zone_exited,
    zone_symbol_of,
)
from .grid_zone_state import STOPPED_ZONE_STATES, process_zone_commands
from .grid_order_manager import (
    clean_zombie_orders,
    process_partial_fills_and_tpsl,
    handle_zone_exit,
)
from .grid_execution.handler import handle_sliding_grid
from .grid_execution.vanished import check_vanished_orders
from .legacy_setup_orders import cancel_legacy_orders, without_legacy_orders
from .spread_guard import refresh_spread_guard


def _is_enabled(zone):
    return str(zone.get("is_active", True)).lower() != "false"


def _zone_symbols(zones):
    """Bölgelerdeki semboller, ilk görünme sırasıyla (boş semboller atlanır)."""
    symbols = []
    for zone in zones:
        sym = zone_symbol_of(zone)
        if sym and sym not in symbols:
            symbols.append(sym)
    return symbols


def manage_dynamic_grid(
    mt5,
    zones,
    active_zones,
    remote_paused,
    symbol_infos,
    consecutive_errors,
    active_zones_state,
    filling_mode,
    legacy_orders_mode="",
):
    """Bir motor turu. Her etkin bölge (kurgu) kendi magic'i ve durumuyla bağımsız işlem görür;
    aynı sembolün birden çok bölgesi aynı anda çalışır (ENG-01, backtest ile aynı).
    active_zones: bölge indeksi → sembol; bu turda grid'i yönetilen bölgeler (fiyat bölge
    dışındaysa da). Bir sonraki turda bu bölgeler için çıkış kontrolü yapılır (eski davranış).
    Dönüş: (ok, active_zones)."""
    process_zone_commands(zones, active_zones_state)
    active_zones = dict(active_zones or {})

    refresh_spread_guard(mt5, zones, symbol_infos)

    if remote_paused:
        return True, active_zones

    # Silinen / pasifleştirilen / sembolü değişen bölgeleri unut
    for idx, sym in list(active_zones.items()):
        if not (0 <= idx < len(zones)) or not _is_enabled(zones[idx]) or zone_symbol_of(zones[idx]) != sym:
            del active_zones[idx]

    robot_positions = get_all_robot_positions(mt5)
    robot_orders = get_all_robot_orders(mt5)
    if robot_positions is None or robot_orders is None:
        return False, active_zones

    symbols = _zone_symbols(zones)
    if not symbols:
        return False, active_zones

    prices = {}
    for sym in symbols:
        buy = get_current_market_price(mt5, sym, "BUY")
        sell = get_current_market_price(mt5, sym, "SELL")
        if buy is not None and sell is not None:
            prices[sym] = (buy + sell) / 2.0
    if not prices:
        return False, active_zones

    clean_zombie_orders(mt5, robot_orders, zones, active_zones_state)
    # Kaldırılan ek kurguların emirleri yalnızca kullanıcı onayıyla silinir (ENG-29)
    cancel_legacy_orders(mt5, legacy_orders_mode, log_message)
    robot_orders = get_all_robot_orders(mt5)
    robot_positions = get_all_robot_positions(mt5)
    if robot_orders is None or robot_positions is None:
        return False, active_zones

    # Bot silmeden kaybolan emirler: logla, sel olursa bölgeyi durdur (ENG-25)
    check_vanished_orders(mt5, zones, robot_orders, robot_positions, active_zones_state)

    process_partial_fills_and_tpsl(
        mt5,
        robot_positions,
        robot_orders,
        zones,
        symbol_infos,
        active_zones_state,
        consecutive_errors,
    )

    ok = len(prices) == len(symbols)
    for idx, zone in enumerate(zones):
        sym = zone_symbol_of(zone)
        if sym not in prices or not _is_enabled(zone):
            continue
        zone_ok, entered = _manage_zone(
            mt5,
            zone,
            idx,
            idx in active_zones,
            prices[sym],
            symbol_infos,
            consecutive_errors,
            active_zones_state,
            filling_mode,
        )
        ok = ok and zone_ok
        if entered:
            active_zones[idx] = sym
        else:
            active_zones.pop(idx, None)

    return ok, active_zones


def _manage_zone(
    mt5,
    zone,
    zone_idx,
    entered,
    current_avg_price,
    symbol_infos,
    consecutive_errors,
    active_zones_state,
    filling_mode,
):
    """Tek bölge: çıkış kontrolü, giriş tespiti ve kayan grid. Fiyat bölgede değilse de
    (giriş yok) bölge kendi grid'ini yönetir; backtest tek bölgeyle aynı davranır.
    Dönüş: (ok, bölge active_zones'ta kalır mı: grid yönetildiyse ya da girildiyse)."""
    zone_symbol = zone_symbol_of(zone)

    robot_orders = get_all_robot_orders(mt5)
    robot_positions = get_all_robot_positions(mt5)
    if robot_orders is None or robot_positions is None:
        return False, entered

    if entered:
        exit_cond = zone.get("exit_condition", "Anlık Fiyat")

        close_price = current_avg_price
        if exit_cond != "Anlık Fiyat":
            tf_str = zone.get("exit_timeframe", "M15")
            tf = get_mt5_timeframe(mt5, tf_str)
            rates = mt5.copy_rates_from_pos(zone_symbol, tf, 1, 1) if mt5 else None
            if rates is not None and len(rates) > 0:
                close_price = (
                    rates[0]["close"]
                    if isinstance(rates[0], dict)
                    else getattr(
                        rates[0],
                        "close",
                        (
                            rates[0][4]
                            if isinstance(rates[0], tuple)
                            else rates[0]["close"]
                        ),
                    )
                )

        is_exited = is_zone_exited(mt5, zone, current_avg_price, zone_symbol)

        if is_exited:
            should_mark_cleared = handle_zone_exit(
                mt5,
                zone,
                zone_idx,
                robot_orders,
                robot_positions,
                filling_mode,
                current_avg_price,
                close_price,
                exit_cond,
            )

            # Arayüze "DURDURULDU" bilgisini yalnızca clear_on_exit açıksa ilet
            # (eski davranış). Kapalıysa bölgenin bekleyen emirleri korunur.
            if should_mark_cleared:
                # Hafızada da hemen işaretle: aynı turda bölge sınırda tekrar emir
                # koymasın (dosya ancak sonraki turda okunur).
                active_zones_state[zone_idx] = "AUTO_CLEAR"
                account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
                states_file = get_ui_state_path(account_id)
                try:
                    bg_states = {}
                    if os.path.exists(states_file):
                        with open(states_file, "r", encoding="utf-8") as f:
                            bg_states = json.load(f)
                    bg_states[str(zone_idx)] = "AUTO_CLEAR"
                    tmp_file = states_file + ".tmp"
                    with open(tmp_file, "w", encoding="utf-8") as f:
                        json.dump(bg_states, f)
                    os.replace(tmp_file, states_file)
                except Exception:
                    pass

            entered = False

    entered = detect_zone_entry(mt5, zone, zone_idx, entered)

    is_zone_active = _is_enabled(zone)
    # Sadece PAUSE değil: AUTO_CLEAR/CLEAR bölgesi de emir koymamalı. Aksi halde
    # clean_zombie_orders her tur siliyor, burada her tur yeniden konuyordu.
    if active_zones_state.get(zone_idx) in STOPPED_ZONE_STATES:
        is_zone_active = False
    if not is_zone_active:
        return True, entered

    # Kaldırılan ek kurguların emirleri bölgenin emri sayılmaz: fraktal/ızgara onları silmez (ENG-29)
    robot_orders = without_legacy_orders(get_all_robot_orders(mt5))
    robot_positions = get_all_robot_positions(mt5)
    if robot_orders is None or robot_positions is None:
        return False, True

    handle_sliding_grid(
        mt5,
        zone,
        zone_idx,
        robot_positions,
        robot_orders,
        symbol_infos,
        consecutive_errors,
        active_zones_state,
        current_avg_price,
    )

    return True, True
