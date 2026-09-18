from src.core.grid_helpers import (
    log_message,
    get_current_market_price,
    get_mt5_timeframe,
)


def is_zone_exited(
    mt5,
    zone: dict,
    current_avg_price: float,
    zone_symbol: str,
) -> bool:
    exit_cond = zone.get("exit_condition", "Anlık Fiyat")
    z_min = float(zone.get("min_price", 0))
    z_max = float(zone.get("max_price", 0))

    if exit_cond == "Anlık Fiyat":
        return round(current_avg_price, 5) < round(z_min, 5) or round(
            current_avg_price, 5
        ) > round(z_max, 5)

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
    else:
        close_price = current_avg_price

    return round(close_price, 5) < round(z_min, 5) or round(close_price, 5) > round(
        z_max, 5
    )


def get_active_zone(mt5, zones):
    for i, zone in enumerate(zones):
        if str(zone.get("is_active", True)).lower() == "false":
            continue
        z_sym = zone.get("symbol", "").upper().strip()
        if not z_sym:
            continue
        bid = get_current_market_price(mt5, z_sym, "SELL")
        ask = get_current_market_price(mt5, z_sym, "BUY")
        if bid is None or ask is None:
            continue
        tick_price = (bid + ask) / 2.0
        z_min = float(zone.get("min_price", 0))
        z_max = float(zone.get("max_price", 0))
        cond = zone.get("exit_condition", "Anlık Fiyat")

        if cond == "Anlık Fiyat":
            if round(z_min, 5) <= round(tick_price, 5) <= round(z_max, 5):
                return zone, i
        else:
            tf_str = zone.get("exit_timeframe", "M15")
            tf = get_mt5_timeframe(mt5, tf_str)
            rates = mt5.copy_rates_from_pos(z_sym, tf, 1, 1) if mt5 else None
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
            else:
                close_price = tick_price

            if round(z_min, 5) <= round(close_price, 5) <= round(z_max, 5):
                return zone, i
    return None, None


def detect_zone_entry(mt5, zones, active_zone, active_zone_idx):
    if active_zone is not None:
        return active_zone, active_zone_idx

    new_zone, new_zone_idx = get_active_zone(mt5, zones)
    if new_zone is not None:
        log_message(
            f"📍 Yeni Bölgeye Girildi: Bölge {new_zone_idx+1} ({new_zone.get('min_price')}-{new_zone.get('max_price')})"
        )
        return new_zone, new_zone_idx

    return None, None