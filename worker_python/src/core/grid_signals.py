"""Bölge giriş sinyali: EMA trend filtresi, RSI geri çekilme, Bollinger bandı, spread filtresi.

Robot bir bölgede "rastgele" pozisyon açmasın diye kullanılır (entry_mode GRID_FILTER /
SIGNAL_MARKET, ya da order_type AUTO). Tüm açık göstergeler VE ile bağlanır:

    BUY  : Kapanış > EMA  ve  RSI < rsi_buy_below   ve  Kapanış <= alt bant
    SELL : Kapanış < EMA  ve  RSI > rsi_sell_above  ve  Kapanış >= üst bant

Hesap yalnızca KAPANMIŞ mumlarla yapılır (copy_rates_from_pos(..., 1, N)); sonuç son mumun
zamanına göre önbelleğe alınır, her döngüde yeniden hesaplanmaz. Spread her döngü kontrol
edilir (mum değil, anlık tick). Saf Python – numpy/pandas gerekmez, testte fake_mt5 ile çalışır.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from src.core.grid_helpers import get_mt5_timeframe
from src.core.state import state


@dataclass(slots=True)
class SignalResult:
    buy_ok: bool
    sell_ok: bool
    reason: str = ""
    values: dict = field(default_factory=dict)


# --------------------------------------------------------------------------- Göstergeler
def ema(closes: list[float], period: int) -> float | None:
    """Üstel hareketli ortalama; ilk değer SMA ile tohumlanır."""
    if period < 1 or len(closes) < period:
        return None
    k = 2.0 / (period + 1)
    value = sum(closes[:period]) / period
    for c in closes[period:]:
        value = c * k + value * (1 - k)
    return value


def rsi(closes: list[float], period: int) -> float | None:
    """Wilder RSI (MT5/TradingView ile aynı yumuşatma)."""
    if period < 1 or len(closes) < period + 1:
        return None
    gains, losses = [], []
    for prev, cur in zip(closes, closes[1:]):
        diff = cur - prev
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for g, l in zip(gains[period:], losses[period:]):
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


def bollinger(closes: list[float], period: int, deviation: float) -> tuple[float, float, float] | None:
    """(orta, üst, alt) – popülasyon standart sapması (MT5 iBands gibi)."""
    if period < 1 or len(closes) < period:
        return None
    window = closes[-period:]
    mid = sum(window) / period
    std = math.sqrt(sum((c - mid) ** 2 for c in window) / period)
    return mid, mid + deviation * std, mid - deviation * std


def bars_needed(config) -> int:
    periods = [2]
    if config.use_ema:
        periods.append(config.ema_period * 3)
    if config.use_rsi:
        periods.append(config.rsi_period * 5)
    if config.use_bollinger:
        periods.append(config.bb_period)
    return max(periods) + 1


def any_indicator(config) -> bool:
    return bool(config.use_ema or config.use_rsi or config.use_bollinger)


# --------------------------------------------------------------------------- Karar
def evaluate(closes: list[float], config) -> SignalResult:
    """Kapanmış mum kapanışlarından BUY/SELL onayı (spread hariç, saf fonksiyon)."""
    order_type = str(config.order_type).upper()
    allow_buy = order_type in ("BUY", "BOTH", "AUTO")
    allow_sell = order_type in ("SELL", "BOTH", "AUTO")

    if not any_indicator(config):
        if order_type == "AUTO":
            # Gösterge yokken yön seçilemez: AUTO hiçbir yöne açmaz
            return SignalResult(False, False, "AUTO: gösterge kapalı, yön seçilemiyor")
        return SignalResult(allow_buy, allow_sell, "gösterge kapalı")

    if not closes or len(closes) < bars_needed(config):
        return SignalResult(False, False, f"yetersiz mum ({len(closes or [])}/{bars_needed(config)})")

    close = closes[-1]
    buy_ok, sell_ok = allow_buy, allow_sell
    values: dict = {"close": close}
    parts: list[str] = []

    if config.use_ema:
        e = ema(closes, config.ema_period)
        values["ema"] = e
        buy_ok = buy_ok and close > e
        sell_ok = sell_ok and close < e
        parts.append(f"EMA{config.ema_period}={e:.5g}")
    if config.use_rsi:
        r = rsi(closes, config.rsi_period)
        values["rsi"] = r
        buy_ok = buy_ok and r < config.rsi_buy_below
        sell_ok = sell_ok and r > config.rsi_sell_above
        parts.append(f"RSI{config.rsi_period}={r:.1f}")
    if config.use_bollinger:
        bands = bollinger(closes, config.bb_period, config.bb_deviation)
        _, upper, lower = bands
        values["bb_upper"], values["bb_lower"] = upper, lower
        buy_ok = buy_ok and close <= lower
        sell_ok = sell_ok and close >= upper
        parts.append(f"BB[{lower:.5g}–{upper:.5g}]")

    if order_type == "AUTO" and buy_ok and sell_ok:
        # Aynı anda iki yöne yeni giriş yok (göstergeler normalde bunu zaten dışlar)
        buy_ok = sell_ok = False

    return SignalResult(buy_ok, sell_ok, f"Kapanış={close:.5g} " + " ".join(parts), values)


def _close_of(rate) -> float:
    if isinstance(rate, dict):
        return float(rate["close"])
    if isinstance(rate, tuple):
        return float(rate[4])
    return float(rate["close"])  # numpy structured row (gerçek MT5)


def _time_of(rate):
    try:
        if isinstance(rate, dict):
            return rate.get("time")
        if isinstance(rate, tuple):
            return rate[0]
        return rate["time"]
    except Exception:
        return None


def spread_blocked(mt5, config) -> tuple[bool, float | None]:
    """max_spread > 0 ve Ask−Bid bundan büyükse (True, spread)."""
    if config.max_spread <= 0 or mt5 is None:
        return False, None
    tick = mt5.symbol_info_tick(config.symbol)
    if tick is None:
        return False, None
    spread = float(tick.ask) - float(tick.bid)
    return spread > config.max_spread + 1e-12, spread


def get_signal(mt5, config, zone_idx: int) -> SignalResult:
    """Bölgenin güncel sinyali (mum önbellekli) + spread filtresi."""
    blocked, spread = spread_blocked(mt5, config)
    if blocked:
        return SignalResult(False, False, f"spread {spread:.5g} > {config.max_spread:.5g}")

    if not any_indicator(config):
        return evaluate([], config)

    tf = get_mt5_timeframe(mt5, config.signal_timeframe)
    count = bars_needed(config)
    rates = mt5.copy_rates_from_pos(config.symbol, tf, 1, count) if mt5 else None
    if rates is None or len(rates) == 0:
        return SignalResult(False, False, "mum verisi yok")

    key = (
        config.symbol, tf, _time_of(rates[-1]), len(rates), config.order_type,
        config.use_ema, config.ema_period, config.use_rsi, config.rsi_period,
        config.rsi_buy_below, config.rsi_sell_above,
        config.use_bollinger, config.bb_period, config.bb_deviation,
    )
    cached = state.signal_cache.get(zone_idx)
    if cached is not None and key[2] is not None and cached[0] == key:
        return cached[1]

    result = evaluate([_close_of(r) for r in rates], config)
    state.signal_cache[zone_idx] = (key, result)
    return result


def log_signal_change(zone_idx: int, result: SignalResult, log_message) -> None:
    """Sinyal durumu değiştiğinde tek satır (her döngü değil)."""
    status = (result.buy_ok, result.sell_ok)
    if state.signal_logged.get(zone_idx) == status:
        return
    state.signal_logged[zone_idx] = status
    mark = lambda ok: "✅" if ok else "⛔"  # noqa: E731
    log_message(
        f"📡 Sinyal: Bölge {zone_idx+1} | BUY {mark(result.buy_ok)} SELL {mark(result.sell_ok)} | {result.reason}"
    )
