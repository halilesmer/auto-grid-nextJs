"""Gemeinsame pytest-Fixtures für die Worker-Tests (laufen auf Mac/CI ohne MetaTrader5).

- Jeder Test bekommt eigene logs/, configs/, data/ Ordner (tmp_path) – nichts landet im Repo.
- `fake_mt5` ist ein In-Memory-Broker (tests/fakes/fake_mt5.py).
- `--feature ENG-05` bzw. `--feature ENG` führt nur Tests mit passendem @pytest.mark.feature aus.
- Die Feature-ID wird als JUnit-Property geschrieben → docs/features/FEATURES.md.
"""
import os
import sys
from pathlib import Path

import pytest

WORKER_ROOT = Path(__file__).resolve().parent.parent
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

from tests.fakes.fake_mt5 import FakeMT5  # noqa: E402
from tests.helpers import make_zone  # noqa: E402,F401  (Fixture-Module importieren es von hier oder tests.helpers)

TEST_ACCOUNT_ID = "1001"


# --------------------------------------------------------------------------- Feature-Filter
def pytest_addoption(parser):
    parser.addoption(
        "--feature",
        action="store",
        default=None,
        help="Nur Tests dieser Feature-ID (ENG-05) oder Kategorie (ENG) ausführen",
    )


def _feature_ids(item) -> list[str]:
    return [m.args[0] for m in item.iter_markers(name="feature") if m.args]


def pytest_collection_modifyitems(config, items):
    wanted = config.getoption("--feature")
    selected, deselected = [], []
    for item in items:
        ids = _feature_ids(item)
        for fid in ids:
            item.user_properties.append(("feature", fid))
        if wanted and not any(fid == wanted or fid.startswith(wanted + "-") for fid in ids):
            deselected.append(item)
        else:
            selected.append(item)
    if deselected:
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected


# --------------------------------------------------------------------------- Isolation
@pytest.fixture(autouse=True)
def isolated_worker_dirs(tmp_path, monkeypatch):
    """Leitet alle Worker-Pfade (logs/configs/data) in ein Temp-Verzeichnis um."""
    import src.utils.paths as paths

    logs, configs, data = tmp_path / "logs", tmp_path / "configs", tmp_path / "data"
    for d in (logs, configs, data):
        d.mkdir()
    monkeypatch.setattr(paths, "LOGS_DIR", str(logs))
    monkeypatch.setattr(paths, "CONFIGS_DIR", str(configs))
    monkeypatch.setattr(paths, "DATA_DIR", str(data))
    monkeypatch.setenv("ACTIVE_ACCOUNT_ID", TEST_ACCOUNT_ID)
    return tmp_path


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    """safe_send_order wartet 0,1 s auf den Broker – in Tests unnötig."""
    import src.utils.trade_utils as trade_utils

    monkeypatch.setattr(trade_utils.time, "sleep", lambda *_: None)


@pytest.fixture(autouse=True)
def reset_trade_state():
    from src.utils.trade_utils import TradeState

    TradeState.algo_trading_disabled = False
    TradeState.last_error_message = ""
    yield
    TradeState.algo_trading_disabled = False
    TradeState.last_error_message = ""


@pytest.fixture(autouse=True)
def reset_grid_state():
    """Der globale GridState (src/core/state.py) darf nicht zwischen Tests lecken."""
    from src.core.state import state

    state.reset()
    state.zones = []
    state.active_symbols.clear()
    state.symbol_infos.clear()
    state.filling_mode.clear()
    state.remote_paused = False
    yield
    state.reset()


# --------------------------------------------------------------------------- Helfer
@pytest.fixture
def fake_mt5():
    """Broker mit USOUSD (3 Digits, Kurs 97,000/97,010) – genug für die meisten Grid-Tests."""
    mt5 = FakeMT5()
    mt5.add_symbol("USOUSD", bid=97.000, ask=97.010, digits=3, point=0.001)
    return mt5


@pytest.fixture
def ui_state_file():
    """Pfad der ui_state-Datei des Testkontos (Zonenbefehle START/PAUSE/AUTO_CLEAR)."""
    from src.utils.paths import get_ui_state_path

    return Path(get_ui_state_path(TEST_ACCOUNT_ID))


@pytest.fixture
def robot_log():
    """Liest das Robot-Log (err_<id>.log) des Testkontos als Zeilenliste."""
    from src.utils.paths import get_err_log_path

    def _read() -> list[str]:
        path = get_err_log_path(TEST_ACCOUNT_ID)
        if not os.path.exists(path):
            return []
        with open(path, encoding="utf-8") as f:
            return f.read().splitlines()

    return _read
