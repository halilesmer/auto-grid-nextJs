"""Sembolün mesafe birimi: Forex pip, diğer araçlarda broker tick'i."""
import math
from numbers import Real


def distance_unit_of(info) -> tuple[str | None, float | None]:
    def get(key):
        return info.get(key) if isinstance(info, dict) else getattr(info, key, None)

    mode = get("trade_calc_mode")
    if not isinstance(mode, Real) or not math.isfinite(mode) or mode < 0 or int(mode) != mode:
        return None, None
    forex = mode in (0, 5)
    unit = "pips" if forex else "ticks"
    size = get("point") if forex else get("trade_tick_size")
    if not isinstance(size, Real) or not math.isfinite(size) or size <= 0:
        return unit, None
    if forex:
        digits = get("digits")
        if not isinstance(digits, Real) or not math.isfinite(digits) or digits < 0 or int(digits) != digits:
            return unit, None
        size *= 10 if digits in (3, 5) else 1
    return unit, float(size)
