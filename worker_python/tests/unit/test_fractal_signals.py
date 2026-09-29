"""ENG-19 Fraktal-Erkennung, ATR und Parabolic SAR (grid_execution/fractal_signals.py)."""
import pytest

from src.core.grid_execution.fractal_signals import atr, find_fractals, parabolic_sar


def bars(hl, t0=1_700_000_000, step=14_400):
    """[(high, low), …] → Kerzen alt → neu (close = Mitte)."""
    return [
        {"time": t0 + i * step, "open": (h + lo) / 2, "high": h, "low": lo, "close": (h + lo) / 2}
        for i, (h, lo) in enumerate(hl)
    ]


@pytest.mark.feature("ENG-19")
def test_fuenf_kerzen_fraktal_oben_und_unten():
    rates = bars([(10, 8), (11, 9), (13, 9.5), (12, 8.5), (11.5, 7), (12, 7.5), (12.2, 8)])
    ups, downs = find_fractals(rates)
    assert [(f.index, f.price) for f in ups] == [(2, 13)]
    assert [(f.index, f.price) for f in downs] == [(4, 7)]
    assert ups[0].time == rates[2]["time"]
    assert (downs[0].high, downs[0].low) == (11.5, 7)


@pytest.mark.feature("ENG-19")
def test_nur_bestaetigt_die_letzten_zwei_kerzen_fehlen_rechts():
    # Kerze 3 wäre ein Hoch, hat aber nur eine Kerze rechts
    rates = bars([(10, 8), (10.5, 8.5), (11, 9), (12, 9.5), (11, 9.2)])
    assert find_fractals(rates) == ([], [])


@pytest.mark.feature("ENG-19")
def test_gleich_hoch_links_erlaubt_rechts_nicht():
    # Wie MT5 Fractals.mq5: >= links, > rechts
    left_equal = bars([(10, 9), (12, 9), (12, 9), (11, 9), (10, 9)])
    assert [f.index for f in find_fractals(left_equal)[0]] == [2]
    right_equal = bars([(10, 9), (11, 9), (12, 9), (12, 9), (10, 9)])
    assert [f.index for f in find_fractals(right_equal)[0]] == []


@pytest.mark.feature("ENG-19")
def test_atr_ist_sma_der_true_range():
    rates = bars([(10, 9), (11, 10), (12, 10.5), (11, 9)])
    # TR: 1 · max(11,9.5)−min(10,9.5)=1.5 · max(12,10.5)−min(10.5,10.5)=1.5 · max(11,11.25)−min(9,11.25)=2.25
    values = atr(rates, 2)
    assert values[:2] == [None, None]
    assert values[2] == pytest.approx(1.5)
    assert values[3] == pytest.approx((1.5 + 2.25) / 2)


@pytest.mark.feature("ENG-19")
def test_parabolic_sar_handrechnung_aufwaertstrend():
    rates = bars([(10, 9), (11, 10), (12, 11), (13, 12)])
    sar, longs = parabolic_sar(rates, 0.02, 0.2)
    assert len(sar) == len(rates) + 1  # letzte = laufende Kerze
    assert sar[1:] == pytest.approx([9, 9, 9.12, 9.3528])
    assert all(longs[1:])


@pytest.mark.feature("ENG-19")
def test_parabolic_sar_dreht_auf_extrempunkt():
    rates = bars([(10, 9), (11, 10), (12, 11), (13, 12), (9, 8)])
    sar, longs = parabolic_sar(rates, 0.02, 0.2)
    assert longs[4] is False
    assert sar[4] == pytest.approx(13)  # SAR springt auf das letzte Hoch (EP)
