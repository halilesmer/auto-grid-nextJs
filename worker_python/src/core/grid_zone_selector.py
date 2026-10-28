from src.core.grid_helpers import (
    log_message,
    zone_log_id,
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


def zone_symbol_of(zone: dict) -> str:
    return str(zone.get("symbol", "")).upper().strip()


def zone_contains_price(mt5, zone):
    """Bölgenin fiyatı (orta fiyat ya da çıkış mumunun kapanışı) aralığında mı?
    Sembolün tick'i yoksa False."""
    z_sym = zone_symbol_of(zone)
    bid = get_current_market_price(mt5, z_sym, "SELL")
    ask = get_current_market_price(mt5, z_sym, "BUY")
    if bid is None or ask is None:
        return False
    tick_price = (bid + ask) / 2.0
    z_min = float(zone.get("min_price", 0))
    z_max = float(zone.get("max_price", 0))

    if zone.get("exit_condition", "Anlık Fiyat") == "Anlık Fiyat":
        price = tick_price
    else:
        tf = get_mt5_timeframe(mt5, zone.get("exit_timeframe", "M15"))
        rates = mt5.copy_rates_from_pos(z_sym, tf, 1, 1) if mt5 else None
        if rates is not None and len(rates) > 0:
            price = (
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
            price = tick_price
    return round(z_min, 5) <= round(price, 5) <= round(z_max, 5)


def get_active_zone(mt5, zones, symbol=None):
    """Fiyatı içeren ilk aktif bölge. symbol verilirse yalnızca o sembolün bölgeleri
    aranır (indeksler yine tüm listeye göre). Motor bunu artık kullanmaz: her bölge
    kendi girişini kendisi tespit eder (detect_zone_entry)."""
    for i, zone in enumerate(zones):
        if str(zone.get("is_active", True)).lower() == "false":
            continue
        z_sym = zone_symbol_of(zone)
        if not z_sym or (symbol is not None and z_sym != symbol):
            continue
        if zone_contains_price(mt5, zone):
            return zone, i
    return None, None


def detect_zone_entry(mt5, zone, zone_idx, entered):
    """Tek bölgenin girişi: bölge zaten girilmişse True; sonra kursu içeriyorsa girer (loglar)."""
    if entered:
        return True
    if not zone_contains_price(mt5, zone):
        return False
    log_message(
        f"📍 Yeni Bölgeye Girildi: Bölge {zone_idx+1} {zone_symbol_of(zone)} ({zone.get('min_price')}-{zone.get('max_price')})",
        zone_id=zone_log_id(zone, zone_idx),
    )
    return True
