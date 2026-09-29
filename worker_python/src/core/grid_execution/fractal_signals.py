"""Fraktal / ATR / Parabolic SAR — saf fonksiyonlar (MT5 bağımsız, test edilebilir).

`rates` eskiden yeniye sıralı mum listesidir (MT5 copy_rates_* çıktısı: numpy structured array
ya da test sahtesindeki dict listesi); her mumdan yalnızca `r["time"]`, `r["high"]`, `r["low"]`,
`r["close"]` okunur. Hesaplar MT5'in yerleşik göstergeleriyle aynı kuralı izler ki grafikte
görülen değerlerle bot aynı seviyeyi kullansın.
"""
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Fractal:
    index: int  # rates içindeki mum indeksi
    time: int  # mumun açılış zamanı (epoch saniye) → fraktalın kimliği
    price: float  # üst fraktalda mumun High'ı, alt fraktalda Low'u
    high: float  # fraktal mumunun High'ı
    low: float  # fraktal mumunun Low'u


def _f(bar, key) -> float:
    return float(bar[key])


def find_fractals(rates) -> tuple[list[Fractal], list[Fractal]]:
    """Onaylanmış Bill-Williams fraktalları (5 mum): (üst, alt), eskiden yeniye.

    MT5 Fractals.mq5 ile aynı: üst fraktal High[i] > sağdaki iki mumun High'ı ve >= soldaki iki
    mumun High'ı; alt fraktal simetrik. Sağdaki iki mum da listede olmalı, yani `rates` yalnızca
    kapanmış mumları içermeli (oluşan mum fraktalı onaylayamaz)."""
    ups: list[Fractal] = []
    downs: list[Fractal] = []
    n = len(rates)
    for i in range(2, n - 2):
        h = _f(rates[i], "high")
        lo = _f(rates[i], "low")
        t = int(rates[i]["time"])
        if (
            h > _f(rates[i + 1], "high")
            and h > _f(rates[i + 2], "high")
            and h >= _f(rates[i - 1], "high")
            and h >= _f(rates[i - 2], "high")
        ):
            ups.append(Fractal(i, t, h, h, lo))
        if (
            lo < _f(rates[i + 1], "low")
            and lo < _f(rates[i + 2], "low")
            and lo <= _f(rates[i - 1], "low")
            and lo <= _f(rates[i - 2], "low")
        ):
            downs.append(Fractal(i, t, lo, h, lo))
    return ups, downs


def atr(rates, period: int) -> list[float | None]:
    """Average True Range, MT5 ATR.mq5 gibi True Range'in basit ortalaması (SMA).
    İlk `period` mum için None."""
    period = max(1, int(period))
    out: list[float | None] = [None] * len(rates)
    trs: list[float] = []
    for i in range(len(rates)):
        h, lo = _f(rates[i], "high"), _f(rates[i], "low")
        if i == 0:
            tr = h - lo
        else:
            pc = _f(rates[i - 1], "close")
            tr = max(h, pc) - min(lo, pc)
        trs.append(tr)
        if i >= period:
            out[i] = sum(trs[i - period + 1 : i + 1]) / period
    return out


def parabolic_sar(rates, step: float = 0.02, maximum: float = 0.2) -> tuple[list[float | None], list[bool]]:
    """Wilder Parabolic SAR. Dönüş: (sar, is_long), uzunluk len(rates) + 1.

    Son eleman oluşan (henüz kapanmamış) mumun SAR'ıdır: yalnızca kapanmış mumlardan hesaplanır ve
    MT5'te o mumun noktası olarak görünür → açık pozisyonun SL'i için kullanılan değer."""
    n = len(rates)
    sar: list[float | None] = [None] * (n + 1)
    longs: list[bool] = [True] * (n + 1)
    if n < 2:
        return sar, longs
    step = max(1e-6, float(step))
    maximum = max(step, float(maximum))

    high = [_f(r, "high") for r in rates]
    low = [_f(r, "low") for r in rates]
    is_long = high[1] + low[1] >= high[0] + low[0]
    ep = max(high[0], high[1]) if is_long else min(low[0], low[1])
    cur = min(low[0], low[1]) if is_long else max(high[0], high[1])
    af = step
    sar[1], longs[1] = cur, is_long

    for i in range(2, n + 1):
        nxt = cur + af * (ep - cur)
        # SAR önceki iki mumun aralığına giremez
        if is_long:
            nxt = min(nxt, low[i - 1], low[i - 2])
        else:
            nxt = max(nxt, high[i - 1], high[i - 2])
        if i == n:  # oluşan mum: dönüş kontrolü yapılamaz
            sar[i], longs[i] = nxt, is_long
            break
        if is_long and low[i] < nxt:
            is_long, nxt, ep, af = False, ep, low[i], step
        elif not is_long and high[i] > nxt:
            is_long, nxt, ep, af = True, ep, high[i], step
        elif is_long and high[i] > ep:
            ep, af = high[i], min(af + step, maximum)
        elif not is_long and low[i] < ep:
            ep, af = low[i], min(af + step, maximum)
        cur = nxt
        sar[i], longs[i] = cur, is_long
    return sar, longs
