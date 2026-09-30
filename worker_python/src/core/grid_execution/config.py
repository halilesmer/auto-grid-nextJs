from dataclasses import dataclass
from typing import Callable

from src.core.grid_helpers import log_message as default_log_message
from src.core.grid_orders import BASE_MAGIC_NUMBER
from src.utils.trade_utils import snap_volume
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
    # Giriş modu: "grid" (kayan ızgara) veya "fractal" (yalnızca fraktal seviyelerinde emir, fractal_entry.py)
    entry_mode: str = "grid"
    fractal_timeframe: str = "H4"
    fractal_order_mode: str = "breakout"  # breakout: kırılım (Stop) · rebound: dönüş (Limit)
    fractal_sl_mode: str = "atr"  # atr · sar · opposite_fractal · buffer
    fractal_sl_buffer: float = 0.05
    fractal_atr_period: int = 14
    fractal_atr_multiplier: float = 1.5
    fractal_sar_step: float = 0.02
    fractal_sar_max: float = 0.2
    fractal_rr: float = 2.0  # TP = SL mesafesi × rr; 0 = TP yok
    # Yön başına en yeni kaç fraktala bekleyen emir konur (BUY / SELL); 1 = yalnızca en yeni fraktal
    fractal_order_count: int = 1
    sell_fractal_order_count: int = 1
    fractal_tp_by_money: bool = False  # True: TP = sabit tutar (hesap para birimi) → fiyat mesafesi
    fractal_tp_money: float = 10.0


ENTRY_MODES = ("grid", "fractal")
FRACTAL_TIMEFRAMES = ("M1", "M5", "M15", "M30", "H1", "H4", "D1")
FRACTAL_ORDER_MODES = ("breakout", "rebound")
FRACTAL_SL_MODES = ("atr", "sar", "opposite_fractal", "buffer")
FRACTAL_MAX_ORDERS = 20


def _fractal_count(value, default: int) -> int:
    try:
        return min(FRACTAL_MAX_ORDERS, max(1, int(value)))
    except (TypeError, ValueError, OverflowError):
        return default


def _choice(value, allowed: tuple, default: str) -> str:
    value = str(value if value is not None else default)
    return value if value in allowed else default


def is_fractal_zone(zone_dict: dict) -> bool:
    return isinstance(zone_dict, dict) and zone_dict.get("entry_mode") == "fractal"


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


MAX_LOT = 5.0  # motorun lot üst sınırı (broker volume_max'ından bağımsız güvenlik sınırı)

# Yükseltilen lotu her döngüde tekrar loglamamak için: (bölge, sembol, taraf, girilen, kullanılan)
_lot_raised_logged: set = set()


def _lot_of(raw, symbol: str, symbol_infos: dict | None, zone_idx: int, side: str,
            log_message: Callable[[str, str], None]) -> float:
    """Zonedeki lot değerini sembolün broker kurallarına oturtur. Lot asla 0 kalmaz: 0, negatif,
    boş veya geçersiz değer sembolün `volume_min`'ine (brokera göre değişir) yükselir; adım
    `volume_step`, üst sınır MAX_LOT ve `volume_max`. Sembol bilgisi yoksa 0,01 tabanı geçerli."""
    try:
        lot = float(raw)
    except (TypeError, ValueError):
        lot = 0.0
    if lot != lot:  # NaN
        lot = 0.0
    capped = min(MAX_LOT, lot)
    info = (symbol_infos or {}).get(symbol)
    result = snap_volume(capped, info) if info is not None else max(0.01, capped)
    if result > lot + 1e-9:
        key = (zone_idx, symbol, side, lot, result)
        if key not in _lot_raised_logged:
            if len(_lot_raised_logged) > 200:
                _lot_raised_logged.clear()
            _lot_raised_logged.add(key)
            log_message(
                f"Zone {zone_idx + 1}: {side} lot {lot:g} {symbol} için geçersiz/minimumun altında "
                f"→ {result:g} kullanılıyor",
                "WARNING",
            )
    return result


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
    tp_val = float(zone_dict.get("take_profit", 0.05))
    sl_val = float(zone_dict.get("stop_loss", 0.0))
    symbol = zone_dict.get("symbol", "").upper().strip()
    if not symbol:
        raise InvalidZoneConfigError(f"Zone {zone_idx + 1}: symbol is required")
    lot_val = _lot_of(zone_dict.get("lot_size", 0.01), symbol, symbol_infos, zone_idx, "BUY", log_message)

    is_sync = bool(zone_dict.get("sync_buy_sell", True))
    if is_sync:
        sell_grid_step = grid_step
        sell_lot_val = lot_val
        sell_tp_val = tp_val
        sell_sl_val = sl_val
        sell_pullback_distance = float(zone_dict.get("pullback_distance", 0.50))
    else:
        sell_grid_step = max(0.00001, float(zone_dict.get("sell_grid_step", grid_step)))
        raw_sell_lot = zone_dict.get("sell_lot_size")
        sell_lot_val = (
            lot_val
            if raw_sell_lot in (None, "")
            else _lot_of(raw_sell_lot, symbol, symbol_infos, zone_idx, "SELL", log_message)
        )
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

    entry_mode = _choice(zone_dict.get("entry_mode"), ENTRY_MODES, "grid")
    # Fraktal modunda ızgara/TP/SL alanları kullanılmaz; $ → fiyat dönüşümü (tick değeri
    # gerektirir) gereksiz yere hata fırlatmasın
    step_by_loss = bool(zone_dict.get("step_by_loss", False)) and entry_mode == "grid"
    # Ayrı SELL sayısı yalnızca "BOTH + eşit değil" iken geçerli (UI'de de ancak o zaman görünür)
    fractal_order_count = _fractal_count(zone_dict.get("fractal_order_count", 1), 1)
    sell_fractal_order_count = fractal_order_count
    if order_type == "BOTH" and not is_sync:
        sell_fractal_order_count = _fractal_count(
            zone_dict.get("sell_fractal_order_count", fractal_order_count), fractal_order_count
        )
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
        entry_mode=entry_mode,
        fractal_timeframe=_choice(zone_dict.get("fractal_timeframe"), FRACTAL_TIMEFRAMES, "H4"),
        fractal_order_mode=_choice(zone_dict.get("fractal_order_mode"), FRACTAL_ORDER_MODES, "breakout"),
        fractal_sl_mode=_choice(zone_dict.get("fractal_sl_mode"), FRACTAL_SL_MODES, "atr"),
        fractal_sl_buffer=max(0.0, float(zone_dict.get("fractal_sl_buffer", 0.05))),
        fractal_atr_period=max(1, int(zone_dict.get("fractal_atr_period", 14))),
        fractal_atr_multiplier=max(0.0, float(zone_dict.get("fractal_atr_multiplier", 1.5))),
        fractal_sar_step=max(0.001, float(zone_dict.get("fractal_sar_step", 0.02))),
        fractal_sar_max=max(0.001, float(zone_dict.get("fractal_sar_max", 0.2))),
        fractal_rr=max(0.0, float(zone_dict.get("fractal_rr", 2.0))),
        fractal_order_count=fractal_order_count,
        sell_fractal_order_count=sell_fractal_order_count,
        fractal_tp_by_money=bool(zone_dict.get("fractal_tp_by_money", False)),
        fractal_tp_money=max(0.0, float(zone_dict.get("fractal_tp_money", 10.0))),
    )