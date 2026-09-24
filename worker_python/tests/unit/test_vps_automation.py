"""UPD-06 pip nach Update · UPD-07 Auto-Update · BOT-07 Bots nach Neustart fortsetzen ·
VPS-05 Konsolen-Log + Windows-Skripte (ngrok-Watchdog, ASCII-PowerShell)."""
import asyncio
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

import src.api.bot_control as bot_control
import src.utils.auto_updater as auto_updater
import src.utils.bot_watchdog as wd
import src.utils.self_updater as updater
from src.utils import paths
from tests.conftest import TEST_ACCOUNT_ID, WORKER_ROOT


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


# --------------------------------------------------------------------------- UPD-06
@pytest.fixture
def repo_pair(tmp_path, monkeypatch):
    """origin (bare) + VPS-Klon. push(files) committet auf origin/main."""
    if shutil.which("git") is None:
        pytest.skip("git nicht installiert")
    origin, dev, vps = tmp_path / "origin.git", tmp_path / "dev", tmp_path / "vps"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(tmp_path, "clone", "-q", str(origin), str(dev))
    for repo in (dev,):
        git(repo, "config", "user.email", "t@example.com")
        git(repo, "config", "user.name", "Test")
    (dev / "worker_python").mkdir()
    (dev / "worker_python" / "requirements.txt").write_text("fastapi\n")
    (dev / "VERSION").write_text("v1\n")
    git(dev, "add", "-A")
    git(dev, "commit", "-q", "-m", "v1")
    git(dev, "push", "-q", "origin", "main")
    git(tmp_path, "clone", "-q", str(origin), str(vps))

    def push(files: dict):
        for name, content in files.items():
            (dev / name).write_text(content)
        git(dev, "commit", "-qam", "next")
        git(dev, "push", "-q", "origin", "main")

    monkeypatch.setattr(updater, "get_project_root", lambda: str(vps))
    pip_calls = []
    monkeypatch.setattr(
        updater, "_pip_install",
        lambda path: pip_calls.append(path) or SimpleNamespace(returncode=0, stdout="ok", stderr=""),
    )
    return SimpleNamespace(vps=vps, push=push, pip_calls=pip_calls)


@pytest.mark.feature("UPD-06")
def test_pip_nur_wenn_requirements_geaendert(repo_pair):
    repo_pair.push({"VERSION": "v2\n"})
    ok, message = updater.execute_git_pull("main")
    assert ok and repo_pair.pip_calls == []
    assert "pip" not in message

    repo_pair.push({"worker_python/requirements.txt": "fastapi\nhttpx\n", "VERSION": "v3\n"})
    ok, message = updater.execute_git_pull("main")
    assert ok and len(repo_pair.pip_calls) == 1
    assert repo_pair.pip_calls[0].endswith("requirements.txt")
    assert "pip install" in message


@pytest.mark.feature("UPD-06")
def test_pip_fehler_meldet_misserfolg(repo_pair, monkeypatch):
    monkeypatch.setattr(
        updater, "_pip_install",
        lambda path: SimpleNamespace(returncode=1, stdout="", stderr="No matching distribution for foo"),
    )
    repo_pair.push({"worker_python/requirements.txt": "foo\n"})
    ok, message = updater.execute_git_pull("main")
    # Code ist gezogen, aber ohne Paket kein Neustart (system.py/auto_updater starten nur bei ok)
    assert not ok and "No matching distribution" in message
    assert (repo_pair.vps / "worker_python" / "requirements.txt").read_text() == "foo\n"


# --------------------------------------------------------------------------- UPD-07
@pytest.fixture
def auto(monkeypatch):
    state = SimpleNamespace(
        branch="main", check=(True, (True, "v1", "v2")), behind=True, pull=(True, "ok"), pulled=0, restarts=0,
    )

    def fake_pull(branch):
        state.pulled += 1
        return state.pull

    def fake_restart():
        state.restarts += 1
        return True

    monkeypatch.setattr(auto_updater, "current_branch", lambda: state.branch)
    monkeypatch.setattr(auto_updater, "check_for_updates", lambda branch: state.check)
    monkeypatch.setattr(auto_updater, "_is_behind_origin", lambda: state.behind)
    monkeypatch.setattr(auto_updater, "execute_git_pull", fake_pull)
    monkeypatch.setattr(auto_updater, "schedule_restart", fake_restart)
    return state


@pytest.mark.feature("UPD-07")
def test_auto_update_zieht_und_startet_neu(auto):
    assert asyncio.run(auto_updater.tick()) is True
    assert (auto.pulled, auto.restarts) == (1, 1)


@pytest.mark.feature("UPD-07")
@pytest.mark.parametrize(
    "change",
    [
        {"branch": "feat/test"},                    # VPS testet gerade einen anderen Branch
        {"check": (True, (False, "v2", "v2"))},     # schon aktuell
        {"check": (False, "Bağlantı Hatası")},      # fetch fehlgeschlagen
        {"behind": False},                          # lokale Commits → sonst Neustart-Schleife
        {"pull": (False, "Git Çekme Hatası")},      # Pull gescheitert → kein Neustart
    ],
)
def test_auto_update_macht_nichts(auto, change):
    for key, value in change.items():
        setattr(auto, key, value)
    assert asyncio.run(auto_updater.tick()) is False
    assert auto.restarts == 0


@pytest.mark.feature("UPD-07")
def test_auto_update_nur_unter_watchdog(monkeypatch):
    monkeypatch.delenv(updater.SUPERVISED_ENV, raising=False)
    monkeypatch.delenv("AUTO_UPDATE_MINUTES", raising=False)
    assert auto_updater.is_enabled() is False
    monkeypatch.setenv(updater.SUPERVISED_ENV, "1")
    assert auto_updater.is_enabled() is True
    assert auto_updater.interval_minutes() == 5
    monkeypatch.setenv("AUTO_UPDATE_MINUTES", "0")
    assert auto_updater.is_enabled() is False


# --------------------------------------------------------------------------- BOT-07
@pytest.fixture
def clean_watch():
    wd._watched.clear()
    yield
    wd._watched.clear()


@pytest.mark.feature("BOT-07")
def test_watch_liste_wird_gespeichert(clean_watch):
    wd.watch(TEST_ACCOUNT_ID)
    wd.watch("2002", "Auto Grid")
    assert wd.load_persisted() == {TEST_ACCOUNT_ID: "Auto Grid", "2002": "Auto Grid"}
    wd.unwatch("2002")  # Stop
    assert wd.load_persisted() == {TEST_ACCOUNT_ID: "Auto Grid"}
    assert json.loads(Path(paths.get_watched_bots_path()).read_text()) == {TEST_ACCOUNT_ID: "Auto Grid"}


@pytest.mark.feature("BOT-07")
def test_kaputte_datei_ergibt_leere_liste():
    Path(paths.get_watched_bots_path()).write_text("{kaputt")
    assert wd.load_persisted() == {}


@pytest.fixture
def maintenance(monkeypatch, clean_watch):
    """startup_maintenance ohne echte Prozesse: laufende Bots + Startversuche steuerbar."""
    env = SimpleNamespace(running=set(), started=[], start_ok=True, accounts=[{"id": TEST_ACCOUNT_ID, "login": TEST_ACCOUNT_ID}])

    def fake_start(account_id, engine_name="Auto Grid"):
        env.started.append((account_id, engine_name))
        return env.start_ok

    monkeypatch.setattr(bot_control, "_is_elevated", lambda: False)
    monkeypatch.setattr(bot_control, "_load_accounts", lambda: env.accounts)
    monkeypatch.setattr(bot_control, "is_bot_running", lambda acc: str(acc) in env.running)
    monkeypatch.setattr(bot_control, "is_bot_outdated", lambda acc: False)
    monkeypatch.setattr(bot_control, "find_bot_processes", lambda acc: [])
    monkeypatch.setattr(bot_control, "start_bot_process", fake_start)
    monkeypatch.setattr(bot_control, "_log_step", lambda *a, **k: None)
    monkeypatch.setattr(wd, "_account_exists", lambda acc: any(str(a["login"]) == str(acc) for a in env.accounts))
    return env


@pytest.mark.feature("BOT-07")
def test_nach_neustart_wird_nicht_gestoppter_bot_fortgesetzt(maintenance):
    bot_control.startup_maintenance({TEST_ACCOUNT_ID: "Auto Grid"})
    assert maintenance.started == [(TEST_ACCOUNT_ID, "Auto Grid")]
    assert wd.is_watched(TEST_ACCOUNT_ID)
    assert wd.load_persisted() == {TEST_ACCOUNT_ID: "Auto Grid"}


@pytest.mark.feature("BOT-07")
def test_laufender_bot_wird_nur_uebernommen(maintenance):
    maintenance.running.add(TEST_ACCOUNT_ID)
    bot_control.startup_maintenance({TEST_ACCOUNT_ID: "Auto Grid"})
    assert maintenance.started == []
    assert wd.is_watched(TEST_ACCOUNT_ID)


@pytest.mark.feature("BOT-07")
def test_gestoppter_oder_geloeschter_bot_bleibt_aus(maintenance):
    bot_control.startup_maintenance({})  # vor dem Neustart gestoppt → nicht in der Liste
    assert maintenance.started == [] and not wd.is_watched(TEST_ACCOUNT_ID)

    bot_control.startup_maintenance({"9999": "Auto Grid"})  # Konto gibt es nicht mehr
    assert maintenance.started == [] and not wd.is_watched("9999")


@pytest.mark.feature("BOT-07")
def test_fehlgeschlagener_start_bleibt_unter_watchdog(maintenance):
    maintenance.start_ok = False  # z. B. MT5 nach Reboot noch nicht bereit
    bot_control.startup_maintenance({TEST_ACCOUNT_ID: "Auto Grid"})
    assert wd.is_watched(TEST_ACCOUNT_ID)  # Watchdog versucht es weiter (BOT-05/06)


# --------------------------------------------------------------------------- VPS-05
@pytest.mark.feature("VPS-05")
def test_konsolen_log_wird_kopiert_und_rotiert(tmp_path):
    from src.utils.console_tee import _RotatingSink, _Tee

    class Console:
        def __init__(self):
            self.text = ""

        def write(self, s):
            self.text += s
            return len(s)

        def flush(self):
            pass

        def isatty(self):
            return True

    log = tmp_path / "worker_console.log"
    console = Console()
    tee = _Tee(console, _RotatingSink(str(log), max_bytes=50))
    tee.write("Uvicorn running on http://0.0.0.0:8000\n")
    assert console.text == "Uvicorn running on http://0.0.0.0:8000\n"
    assert tee.isatty() is True
    tee.write("x" * 40 + "\n")  # > 50 Bytes → rotiert
    assert (tmp_path / "worker_console.log.1").exists()
    tee.write("neu\n")
    assert log.read_text() == "neu\n"


@pytest.mark.feature("VPS-05")
def test_windows_skripte():
    ngrok = Path(WORKER_ROOT, "run_ngrok_watchdog.bat").read_text(encoding="utf-8")
    assert "ngrok http 8000" in ngrok and "--log=logs\\ngrok.log" in ngrok and "goto loop" in ngrok
    start = Path(WORKER_ROOT, "start.bat").read_text(encoding="utf-8")
    assert "run_ngrok_watchdog.bat" in start and "run_uvicorn_watchdog.bat" in start
    cleanup = Path(WORKER_ROOT, "cleanup_old_instances.ps1").read_text(encoding="utf-8")
    assert "run_ngrok_watchdog.bat" in cleanup


@pytest.mark.feature("VPS-05")
@pytest.mark.parametrize(
    "script",
    ["ops/windows/vps.ps1", "ops/windows/setup_vps.ps1", "cleanup_old_instances.ps1",
     "start.bat", "run_uvicorn_watchdog.bat", "run_ngrok_watchdog.bat"],
)
def test_windows_skripte_sind_ascii(script):
    # PowerShell 5.1 liest .ps1 ohne BOM als ANSI; Umlaute würden Strings/Parser zerstören
    Path(WORKER_ROOT, script).read_bytes().decode("ascii")


@pytest.mark.feature("VPS-05")
def test_vps_skript_ruft_im_ssh_kontext_kein_git_auf():
    """Rechte-Regel: per SSH (evtl. als Administrator) nie git – nur Worker oder Aufgabe (Limited)."""
    vps = Path(WORKER_ROOT, "ops/windows/vps.ps1").read_text(encoding="ascii")
    code = "\n".join(line for line in vps.splitlines() if not line.lstrip().startswith("#"))
    assert "& git" not in code and "git.exe" not in code and "git pull" not in code
    # update-local läuft nur in der Aufgabe und bricht mit Adminrechten ab
    assert "Test-Elevated" in code and "self_updater update" in code
    setup = Path(WORKER_ROOT, "ops/windows/setup_vps.ps1").read_text(encoding="ascii")
    assert "-RunLevel Limited" in setup and "AutoGrid-Start" in setup and "AutoGrid-Update" in setup
