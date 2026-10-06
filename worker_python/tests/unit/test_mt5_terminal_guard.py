"""ACC-11 Ein Konto meldet sich nie im MT5-Terminal eines anderen Kontos an.

Nachgestellt ist der 29.09.2026, 20:41:34: Terminal T34 (Konto A, Bot läuft) wurde
kurz auf Konto B angemeldet. Die Verbindung für B lief ohne gültigen mt5_path;
initialize() ohne Pfad hängt sich an irgendein laufendes Terminal, login() stellt dessen
Konto um. Der Bot von A verlor die Verbindung und hätte, wäre das Terminal auf B
geblieben, dort mit seinen Zonen gehandelt. Im Test ist A = OTHER_LOGIN und B = LOGIN.
"""
import json
import os

import pytest

import src.core.reconnection as reconnection
import src.core.startup as startup
import src.utils.mt5_connection as mc
from src.core.state import state
from src.utils import mt5_terminal_guard as guard
from src.utils import paths
from tests.unit.test_mt5_connect import LOGIN, mt5_env  # noqa: F401 (Fixture)

OTHER_LOGIN = 2002


def _write_accounts(accounts):
    os.makedirs(paths.CONFIGS_DIR, exist_ok=True)
    with open(os.path.join(paths.CONFIGS_DIR, "accounts.json"), "w", encoding="utf-8") as f:
        json.dump(accounts, f)


def _exe(tmp_path, name):
    folder = tmp_path / name
    folder.mkdir()
    exe = folder / "terminal64.exe"
    exe.write_text("")
    return str(exe)


# --------------------------------------------------------------------------- Zuordnung
@pytest.mark.feature("ACC-11")
def test_terminal_eines_anderen_kontos_wird_erkannt(fake_mt5, tmp_path):
    own, other = _exe(tmp_path, "MT5_15"), _exe(tmp_path, "MT5_34")
    _write_accounts([
        {"login": OTHER_LOGIN, "mt5_path": other},
        {"login": LOGIN, "mt5_path": own},
    ])

    fake_mt5.terminal.path = os.path.dirname(other)
    assert guard.foreign_terminal_owner(fake_mt5, LOGIN) == (OTHER_LOGIN, os.path.dirname(other))
    assert f"{OTHER_LOGIN} hesabına ait" in guard.foreign_terminal_error(fake_mt5, LOGIN)

    fake_mt5.terminal.path = os.path.dirname(own)
    assert guard.foreign_terminal_owner(fake_mt5, LOGIN) is None


@pytest.mark.feature("ACC-11")
@pytest.mark.parametrize(
    "terminal_path, accounts",
    [
        ("", [{"login": OTHER_LOGIN, "mt5_path": "C:/MT5_34/terminal64.exe"}]),  # Pfad unbekannt
        ("C:/MT5_99", [{"login": OTHER_LOGIN, "mt5_path": "C:/MT5_34/terminal64.exe"}]),  # niemandes Terminal
        # Mehrere Konten teilen bewusst ein Terminal: das eigene Konto darf sich dort anmelden
        ("C:/MT5_34", [{"login": OTHER_LOGIN, "mt5_path": "C:/MT5_34/terminal64.exe"},
                       {"login": LOGIN, "mt5_path": "C:/MT5_34/terminal64.exe"}]),
    ],
)
def test_kein_fremdes_terminal(fake_mt5, terminal_path, accounts):
    fake_mt5.terminal.path = terminal_path
    assert guard.foreign_terminal_owner(fake_mt5, LOGIN, accounts) is None


@pytest.mark.feature("ACC-11")
def test_fehlender_pfad_ist_ein_fehler(tmp_path):
    assert guard.missing_path_error("") is None
    assert guard.missing_path_error(None) is None
    assert guard.missing_path_error(_exe(tmp_path, "MT5_15")) is None
    assert guard.missing_path_error(str(tmp_path / "fehlt" / "terminal64.exe")).startswith("[CONFIG]")


# --------------------------------------------------------------------------- Worker (/start, Symbole)
@pytest.mark.feature("ACC-11")
def test_worker_verbindet_nicht_ueber_fehlenden_pfad(mt5_env, tmp_path):
    sim, clock, account, logs = mt5_env
    account["mt5_path"] = str(tmp_path / "MT5_15" / "terminal64.exe")  # gelöscht/umbenannt

    ok, _, detail = mc.connect_to_mt5_with_timeout(account, 120)

    assert not ok and detail.startswith("[CONFIG]")
    assert sim.initialize_calls == 0 and sim.login_calls == 0


@pytest.mark.feature("ACC-11")
def test_worker_meldet_sich_nicht_im_terminal_eines_anderen_kontos_an(mt5_env, tmp_path):
    """Der Fall vom 29.09.: kein mt5_path → initialize() landet im laufenden T34."""
    sim, clock, account, logs = mt5_env
    sim.start_terminal(age=600, boot_sec=5)  # T34 läuft längst
    t34 = _exe(tmp_path, "MT5_34")
    _write_accounts([{"login": OTHER_LOGIN, "mt5_path": t34}, {**account, "mt5_path": ""}])
    sim.terminal.path = os.path.dirname(t34)
    account["mt5_path"] = ""

    ok, _, detail = mc.connect_to_mt5_with_timeout(account, 120)

    assert not ok and detail.startswith("[TERMINAL]")
    assert sim.login_calls == 0
    assert sim.shutdown_called


@pytest.mark.feature("ACC-11")
def test_worker_meldet_sich_im_eigenen_terminal_an(mt5_env, tmp_path):
    sim, clock, account, logs = mt5_env
    sim.start_terminal(age=600, boot_sec=5)
    _write_accounts([{"login": OTHER_LOGIN, "mt5_path": _exe(tmp_path, "MT5_34")}, account])
    sim.terminal.path = os.path.dirname(account["mt5_path"])

    ok, _, detail = mc.connect_to_mt5_with_timeout(account, 120)

    assert ok, detail
    assert sim.login_calls == 1


# --------------------------------------------------------------------------- Bot (Reconnect)
@pytest.mark.feature("ACC-11")
def test_bot_reconnect_ohne_gueltigen_pfad_verbindet_nicht(fake_mt5, tmp_path, robot_log):
    ok = startup._reconnect_mt5(fake_mt5, LOGIN, "pw", "srv", mt5_path=str(tmp_path / "fehlt.exe"))

    assert ok is False
    assert fake_mt5.initialize_calls == 0 and fake_mt5.login_calls == 0
    assert any("[CONFIG]" in line for line in robot_log())


@pytest.mark.feature("ACC-11")
def test_bot_reconnect_meldet_sich_nicht_im_fremden_terminal_an(fake_mt5, tmp_path):
    t34 = _exe(tmp_path, "MT5_34")
    _write_accounts([{"login": OTHER_LOGIN, "mt5_path": t34}, {"login": LOGIN, "mt5_path": ""}])
    fake_mt5.terminal.path = os.path.dirname(t34)

    assert startup._reconnect_mt5(fake_mt5, LOGIN, "pw", "srv", max_retries=1) is False
    assert fake_mt5.login_calls == 0


@pytest.mark.feature("ACC-11")
def test_bot_handelt_nicht_wenn_sein_terminal_auf_ein_anderes_konto_umgestellt_wurde(fake_mt5, monkeypatch, robot_log):
    """T34 ist noch verbunden, aber auf Konto B angemeldet: nicht handeln, eigenes Konto zurückholen."""
    fake_mt5.account.login = LOGIN
    calls = []
    monkeypatch.setattr(reconnection, "_reconnect_mt5", lambda *a, **k: calls.append(a) or False)

    assert reconnection.check_connection_health(fake_mt5, OTHER_LOGIN, "pw", "srv", 0) == (False, 1)
    assert calls and calls[0][1] == OTHER_LOGIN
    assert state.connection_lost is True
    assert any(f"başka bir hesaba ({LOGIN})" in line for line in robot_log())

    # Eigenes Konto wieder angemeldet → weiter
    fake_mt5.account.login = OTHER_LOGIN
    assert reconnection.check_connection_health(fake_mt5, OTHER_LOGIN, "pw", "srv", 1) == (True, 0)
    assert state.connection_lost is False


@pytest.mark.feature("ACC-11")
def test_fremdes_konto_bei_algo_trading_aus_wird_trotzdem_erkannt(fake_mt5, monkeypatch):
    fake_mt5.account.login = LOGIN
    fake_mt5.terminal.trade_allowed = False
    calls = []
    monkeypatch.setattr(reconnection, "_reconnect_mt5", lambda *a, **k: calls.append(a) or True)

    assert reconnection.check_connection_health(fake_mt5, OTHER_LOGIN, "pw", "srv", 0) == (True, 0)
    assert calls


@pytest.mark.feature("ACC-11")
def test_bot_trennt_sich_vom_fremden_terminal(fake_mt5, tmp_path):
    """Abgelehnt → shutdown, damit Fernbefehle/_cleanup nicht die Orders des fremden Kontos löschen."""
    t34 = _exe(tmp_path, "MT5_34")
    _write_accounts([{"login": OTHER_LOGIN, "mt5_path": t34}, {"login": LOGIN, "mt5_path": ""}])
    fake_mt5.terminal.path = os.path.dirname(t34)

    startup._reconnect_mt5(fake_mt5, LOGIN, "pw", "srv", max_retries=1)
    assert fake_mt5.shutdown_called


@pytest.mark.feature("ACC-11")
def test_fernbefehle_erst_nach_der_kontopruefung(monkeypatch):
    """Ist die Verbindung/das Konto nicht in Ordnung, werden keine Fernbefehle (GRID:STOP …) gelesen."""
    import src.core.loop as loop

    remote_calls = []
    monkeypatch.setattr(loop, "load_dynamic_settings", lambda: None)
    monkeypatch.setattr(loop, "run_startup_checks", lambda m: True)
    monkeypatch.setattr(loop, "_cleanup", lambda m: None)
    monkeypatch.setattr(loop, "check_remote_commands_wrapper", lambda: remote_calls.append(1))

    def unhealthy(*a, **k):
        state.is_running = False  # nur eine Runde
        return False, 1

    monkeypatch.setattr(loop, "check_connection_health", unhealthy)
    loop.main_loop(object(), OTHER_LOGIN, "pw", "srv")

    assert remote_calls == []
