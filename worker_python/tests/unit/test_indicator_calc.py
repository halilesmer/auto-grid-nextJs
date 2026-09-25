"""MET-03 Indikatoren (RSI/MACD) für den WS-Stream: Fallback auf reines pandas.

Auf dem VPS scheiterte `import pandas_ta` mit OSError („Could not find/load shared object
file“, llvmlite-DLL ohne VC++ Redistributable). Der Fallback fing nur ImportError ab, RSI/MACD
im Stream waren dann None.
"""
import builtins
import math
import sys
import types

import pandas as pd
import pytest

import src.core.indicator_calc as ic


def _kerzen(n: int = 60) -> pd.DataFrame:
    return pd.DataFrame({"close": [100 + 2 * math.sin(i / 3) + 0.05 * i for i in range(n)]})


def _erwartet() -> dict:
    df = ic.calculate_macd(ic.calculate_rsi(_kerzen(), 14), 12, 26, 9)
    last = df.iloc[-1]
    return {"rsi": last["RSI_14"], "macd": last["MACD_12_26_9"],
            "macd_signal": last["MACDs_12_26_9"], "macd_hist": last["MACDh_12_26_9"]}


def _pruefe_fallback_werte(result: dict) -> None:
    assert result == pytest.approx(_erwartet())
    assert 0 < result["rsi"] < 100
    assert result["macd"] != 0.0 and result["macd_hist"] == pytest.approx(result["macd"] - result["macd_signal"])


@pytest.fixture
def ta_ungeprueft(monkeypatch):
    """Jeder Test beginnt, als wäre pandas_ta noch nie importiert worden."""
    monkeypatch.setattr(ic, "_pandas_ta_ok", None)
    monkeypatch.delitem(sys.modules, "pandas_ta", raising=False)


@pytest.mark.feature("MET-03")
@pytest.mark.parametrize("fehler", [
    OSError("Could not find/load shared object file"),  # llvmlite.dll ohne VC++ Redistributable
    ImportError("No module named 'pandas_ta'"),
])
def test_import_fehler_von_pandas_ta_nutzt_reines_pandas(monkeypatch, ta_ungeprueft, fehler):
    versuche = []
    original_import = builtins.__import__

    def import_mit_fehler(name, *args, **kwargs):
        if name == "pandas_ta" or name.startswith("pandas_ta."):
            versuche.append(name)
            raise fehler
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_mit_fehler)

    _pruefe_fallback_werte(ic.get_latest_indicators(_kerzen()))
    # Der WS-Stream ruft jede Sekunde auf: der gescheiterte Import wird nicht wiederholt
    _pruefe_fallback_werte(ic.get_latest_indicators(_kerzen()))
    assert len(versuche) == 1


@pytest.mark.feature("MET-03")
def test_rechenfehler_in_pandas_ta_nutzt_reines_pandas(monkeypatch, ta_ungeprueft):
    # Import klappt, aber die Berechnung scheitert (z. B. pandas_ta passt nicht zur numpy-Version)
    monkeypatch.setitem(sys.modules, "pandas_ta", types.ModuleType("pandas_ta"))

    def kaputt(self):
        raise RuntimeError("pandas_ta kaputt")

    monkeypatch.setattr(pd.DataFrame, "ta", property(kaputt), raising=False)

    _pruefe_fallback_werte(ic.get_latest_indicators(_kerzen()))


@pytest.mark.feature("MET-03")
def test_zu_wenig_kerzen_liefert_nullen():
    assert ic.get_latest_indicators(_kerzen(20)) == {"rsi": 0.0, "macd": 0.0, "macd_signal": 0.0, "macd_hist": 0.0}
    assert ic.get_latest_indicators(None)["rsi"] == 0.0
