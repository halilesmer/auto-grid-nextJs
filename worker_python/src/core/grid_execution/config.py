from dataclasses import dataclass
from typing import Callable

from src.core.grid_helpers import log_message as default_log_message
from src.core.grid_orders import BASE_MAGIC_NUMBER
from .exceptions import InvalidZoneConfigError


@dataclass(slots=True)
class ZoneConfig:
    order_type: str
    min_price: float
    max_price: float
    grid_step: float
    lot_size: float
    take_profit: float
    stop_loss: float
    symbol: str
    sync_buy_sell: bool
    levels_below: int
    levels_above: int
    max_positions: int
    is_breakout: bool
    pullback_distance: float
    sell_grid_step: float
    sell_lot_size: float
    sell_take_profit: float
    sell_stop_loss: float
    sell_pullback_distance: float
    target_magic: int
    # Sinyal girişi (grid_signals): GRID = eski davranış, GRID_FILTER = grid emirleri sadece
    # sinyal onaylarsa, SIGNAL_MARKET = sinyal gelince piyasa emri
    entry_mode: str = "GRID"
    signal_timeframe: str = "M5"
    use_ema: bool = True
    ema_period: int = 50
    use_rsi: bool = True
    rsi_period: int = 14
    rsi_buy_below: float = 40.0
    rsi_sell_above: float = 60.0
    use_bollinger: bool = False
    bb_period: int = 20
    bb_deviation: float = 2.0
    max_spread: float = 0.0
    max_buy_positions: int = 0
    max_sell_positions: int = 0
    tp_mode: str = "PRICE"


ENTRY_MODES = ("GRID", "GRID_FILTER", "SIGNAL_MARKET")
TP_MODES = ("PRICE", "MONEY")


def max_positions_of(zone_dict: dict) -> int:
    """Bölgenin pozisyon sınırı (0 = sınırsız → 500). Max-pozisyon koruması (handler) ve kısmi
    dolum tamamlaması (grid_order_manager) aynı sınırı kullanmalı: biri emir koyup diğeri
    her döngüde silmesin (24.09: ~8.700 Sell-Stop gönder/sil döngüsü)."""
    return int(zone_dict.get("max_positions", 10)) or 500


def max_direction_of(zone_dict: dict, side: str) -> int:
    """Yön başına pozisyon sınırı (max_buy_positions / max_sell_positions). 0 = yön sınırı yok,
    yalnızca max_positions geçerli. Handler ve kısmi dolum tamamlaması aynı sınırı kullanır."""
    key = "max_buy_positions" if side == "BUY" else "max_sell_positions"
    val = max(0, int(zone_dict.get(key, 0) or 0))
    return val or max_positions_of(zone_dict)


def entry_mode_of(zone_dict: dict) -> str:
    mode = str(zone_dict.get("entry_mode", "GRID")).upper()
    return mode if mode in ENTRY_MODES else "GRID"


def _money_to_distance(money: float, lot: float, info) -> float | None:
    """Kâr tutarı (hesap para birimi) → fiyat mesafesi: money / (lot × tick_value / tick_size).
    Sembol bilgisi eksikse None."""
    if info is None or isinstance(info, dict):
        return None
    tick_value = float(getattr(info, "trade_tick_value", 0) or 0)
    tick_size = float(getattr(info, "trade_tick_size", 0) or getattr(info, "point", 0) or 0)
    if tick_value <= 0 or tick_size <= 0 or lot <= 0:
        return None
    return money * tick_size / (lot * tick_value)


def tp_distance_of(zone_dict: dict, side: str, symbol_infos: dict | None = None) -> float:
    """Bölgenin TP mesafesi (fiyat birimi). tp_mode = MONEY ise take_profit_money, bölgenin
    ayarlı lot'u (tam dolu pozisyon) ile fiyat mesafesine çevrilir; bekleyen emir, doğrulama,
    piyasa girişi ve açık pozisyon TP senkronu (grid_order_manager) aynı değeri kullanır –
    biri koyduğunu diğeri her döngü değiştirmesin. Sembol bilgisi yoksa fiyat TP'sine düşer."""
    is_sync = bool(zone_dict.get("sync_buy_sell", True))
    use_buy = side == "BUY" or is_sync
    price_tp = float(
        zone_dict.get("take_profit", 0.05)
        if use_buy
        else zone_dict.get("sell_take_profit", zone_dict.get("take_profit", 0.05))
    )
    if str(zone_dict.get("tp_mode", "PRICE")).upper() != "MONEY":
        return price_tp
    money = float(
        zone_dict.get("take_profit_money", 0)
        if use_buy
        else zone_dict.get("sell_take_profit_money", zone_dict.get("take_profit_money", 0))
    ) or 0.0
    lot = float(
        zone_dict.get("lot_size", 0.01)
        if use_buy
        else zone_dict.get("sell_lot_size", zone_dict.get("lot_size", 0.01))
    )
    lot = max(0.01, min(5.0, lot))
    symbol = str(zone_dict.get("symbol", "")).upper().strip()
    dist = _money_to_distance(money, lot, (symbol_infos or {}).get(symbol)) if money > 0 else None
    return dist if dist is not None else price_tp


def extract_zone_config(
    zone_dict: dict,
    zone_idx: int,
    log_message: Callable[[str, str], None] = default_log_message,
    symbol_infos: dict | None = None,
) -> ZoneConfig:
    if not isinstance(zone_dict, dict):
        raise InvalidZoneConfigError(f"Zone {zone_idx + 1}: config must be a dict")

    # Bilinmeyen order_type hata fırlatmaz: hiç seviye üretilmez ama pencere
    # dışı emir temizliği ve max-pozisyon koruması çalışmaya devam eder (eski davranış).
    order_type = str(zone_dict.get("order_type", "BUY")).upper()

    min_price = float(zone_dict.get("min_price", 0))
    max_price = float(zone_dict.get("max_price", 0))
    if min_price >= max_price:
        raise InvalidZoneConfigError(f"Zone {zone_idx + 1}: min_price must be < max_price")

    grid_step = max(0.00001, float(zone_dict.get("grid_step", 0.05)))
    lot_val = max(0.01, min(5.0, float(zone_dict.get("lot_size", 0.01))))
    tp_val = float(zone_dict.get("take_profit", 0.05))
    sl_val = float(zone_dict.get("stop_loss", 0.0))
    symbol = zone_dict.get("symbol", "").upper().strip()
    if not symbol:
        raise InvalidZoneConfigError(f"Zone {zone_idx + 1}: symbol is required")

    is_sync = bool(zone_dict.get("sync_buy_sell", True))
    if is_sync:
        sell_grid_step = grid_step
        sell_lot_val = lot_val
        sell_tp_val = tp_val
        sell_sl_val = sl_val
        sell_pullback_distance = float(zone_dict.get("pullback_distance", 0.50))
    else:
        sell_grid_step = max(0.00001, float(zone_dict.get("sell_grid_step", grid_step)))
        sell_lot_val = max(0.01, min(5.0, float(zone_dict.get("sell_lot_size", lot_val))))
        sell_tp_val = float(zone_dict.get("sell_take_profit", tp_val))
        sell_sl_val = float(zone_dict.get("sell_stop_loss", sl_val))
        sell_pullback_distance = float(
            zone_dict.get("sell_pullback_distance", zone_dict.get("pullback_distance", 0.50))
        )

    levels_below = int(zone_dict.get("levels_below", 5))
    levels_above = int(zone_dict.get("levels_above", 5))
    max_positions_allowed = max_positions_of(zone_dict)

    is_breakout = bool(zone_dict.get("is_breakout", False))
    pullback_distance = float(zone_dict.get("pullback_distance", 0.50))

    target_magic = BASE_MAGIC_NUMBER + zone_idx + 1

    tp_mode = str(zone_dict.get("tp_mode", "PRICE")).upper()
    if tp_mode not in TP_MODES:
        tp_mode = "PRICE"
    if tp_mode == "MONEY":
        tp_val = tp_distance_of(zone_dict, "BUY", symbol_infos)
        sell_tp_val = tp_distance_of(zone_dict, "SELL", symbol_infos)

    return ZoneConfig(
        order_type=order_type,
        min_price=min_price,
        max_price=max_price,
        grid_step=grid_step,
        lot_size=lot_val,
        take_profit=tp_val,
        stop_loss=sl_val,
        symbol=symbol,
        sync_buy_sell=is_sync,
        levels_below=levels_below,
        levels_above=levels_above,
        max_positions=max_positions_allowed,
        is_breakout=is_breakout,
        pullback_distance=pullback_distance,
        sell_grid_step=sell_grid_step,
        sell_lot_size=sell_lot_val,
        sell_take_profit=sell_tp_val,
        sell_stop_loss=sell_sl_val,
        sell_pullback_distance=sell_pullback_distance,
        target_magic=target_magic,
        entry_mode=entry_mode_of(zone_dict),
        signal_timeframe=str(zone_dict.get("signal_timeframe", "M5")),
        use_ema=bool(zone_dict.get("use_ema", True)),
        ema_period=max(2, int(zone_dict.get("ema_period", 50))),
        use_rsi=bool(zone_dict.get("use_rsi", True)),
        rsi_period=max(2, int(zone_dict.get("rsi_period", 14))),
        rsi_buy_below=float(zone_dict.get("rsi_buy_below", 40)),
        rsi_sell_above=float(zone_dict.get("rsi_sell_above", 60)),
        use_bollinger=bool(zone_dict.get("use_bollinger", False)),
        bb_period=max(2, int(zone_dict.get("bb_period", 20))),
        bb_deviation=max(0.1, float(zone_dict.get("bb_deviation", 2.0))),
        max_spread=max(0.0, float(zone_dict.get("max_spread", 0) or 0)),
        max_buy_positions=max_direction_of(zone_dict, "BUY"),
        max_sell_positions=max_direction_of(zone_dict, "SELL"),
        tp_mode=tp_mode,
    )