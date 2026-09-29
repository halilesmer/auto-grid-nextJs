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
    step_by_loss: bool = False
    instant_entry: bool = False


def money_per_price_unit(symbol: str, symbol_infos: dict | None) -> float | None:
    """1 lot pozisyonun fiyat 1,0 birim hareket ettiğinde kazandığı/kaybettiği tutar
    (hesap para birimi). MT5: trade_tick_value / trade_tick_size; yoksa kontrat büyüklüğü."""
    info = (symbol_infos or {}).get(symbol)
    if info is None:
        return None
    tick_value = float(getattr(info, "trade_tick_value", 0) or 0)
    tick_size = float(getattr(info, "trade_tick_size", 0) or 0)
    if tick_value > 0 and tick_size > 0:
        return tick_value / tick_size
    contract = float(getattr(info, "trade_contract_size", 0) or 0)
    return contract if contract > 0 else None


def money_to_price_distance(amount: float, lot: float, symbol: str, symbol_infos: dict | None) -> float | None:
    """"Zarara göre aralık": tutar ($) → fiyat mesafesi. `lot` hacimli bir pozisyon bu mesafede
    tam `amount` kadar zarar eder. Sembolün fiyat adımına (point) yuvarlanır, en az 1 point.
    Sembol bilgisi yoksa None."""
    per_unit = money_per_price_unit(symbol, symbol_infos)
    if not per_unit or lot <= 0:
        return None
    distance = float(amount) / (lot * per_unit)
    info = symbol_infos.get(symbol)
    point = float(getattr(info, "point", 0) or 0)
    if point > 0:
        distance = max(point, round(round(distance / point) * point, int(getattr(info, "digits", 5))))
    return distance


def max_positions_of(zone_dict: dict) -> int:
    """Bölgenin pozisyon sınırı (0 = sınırsız → 500). Max-pozisyon koruması (handler) ve kısmi
    dolum tamamlaması (grid_order_manager) aynı sınırı kullanmalı: biri emir koyup diğeri
    her döngüde silmesin (24.09: ~8.700 Sell-Stop gönder/sil döngüsü)."""
    return int(zone_dict.get("max_positions", 10)) or 500


def extract_zone_config(
    zone_dict: dict,
    zone_idx: int,
    log_message: Callable[[str, str], None] = default_log_message,
    symbol_infos: dict | None = None,
) -> ZoneConfig:
    """`step_by_loss` açıksa grid_step / sell_grid_step / pullback / TP / SL değerleri fiyat
    değil tutar ($) olarak girilmiştir; burada ilgili lot ile fiyat mesafesine çevrilir
    (symbol_infos gerekir). Döngünün geri kalanı yalnızca fiyat mesafesi görür."""
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

    step_by_loss = bool(zone_dict.get("step_by_loss", False))
    if step_by_loss:
        def _conv(amount: float, lot: float) -> float:
            d = money_to_price_distance(amount, lot, symbol, symbol_infos)
            if d is None:
                raise InvalidZoneConfigError(
                    f"Zone {zone_idx + 1}: {symbol} için tick değeri yok, zarara göre aralık hesaplanamıyor"
                )
            return d

        def _conv0(amount: float, lot: float) -> float:
            # Pullback / TP / SL 0 olabilir (= yok); 0'ı 1 point'e yükseltme
            return _conv(amount, lot) if amount > 0 else 0.0

        grid_step = _conv(grid_step, lot_val)
        sell_grid_step = _conv(sell_grid_step, sell_lot_val)
        pullback_distance = _conv0(pullback_distance, lot_val)
        sell_pullback_distance = _conv0(sell_pullback_distance, sell_lot_val)
        tp_val = _conv0(tp_val, lot_val)
        sl_val = _conv0(sl_val, lot_val)
        sell_tp_val = _conv0(sell_tp_val, sell_lot_val)
        sell_sl_val = _conv0(sell_sl_val, sell_lot_val)

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
        step_by_loss=step_by_loss,
        instant_entry=bool(zone_dict.get("instant_entry", False)),
    )