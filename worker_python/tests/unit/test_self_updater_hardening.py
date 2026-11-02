"""UPD-07 Updater-Härtung: pip-Zeitlimit, kein Credential-Prompt, ein Pull zur Zeit,
veraltete Ref-Locks, unvollständiger Pull wird nachgeholt, Helfer-Aufräumen.

Nutzt das Repo-Setup und das hängende git aus test_self_updater_timeout.py.
"""
import asyncio
import json
import os
import shutil
import stat
import subprocess
import sys
import time

import psutil
import pytest

import src.utils.auto_updater as auto_updater
import src.utils.self_updater as updater
from src.utils.paths import get_update_lock_path, get_update_pending_path
from tests.unit.test_self_updater_timeout import git, vps, wait_until_gone  # noqa: F401

pytestmark = [
    pytest.mark.skipif(shutil.which("git") is None, reason="git nicht installiert"),
    pytest.mark.skipif(os.name == "nt", reason="das hängende git ist ein sh-Skript"),
]

FAKE_PIP_PYTHON = """#!/bin/sh
sleep 20 &
echo $! > "$HANG_PID_FILE"
sleep 20
"""


def push_requirements_change(vps):
    """origin bekommt einen dritten Commit, der worker_python/requirements.txt ändert."""
    dev = vps.parent / "dev"
    (dev / "worker_python").mkdir(exist_ok=True)
    (dev / "worker_python" / "requirements.txt").write_text("neues-paket\n")
    git(dev, "add", "-A")
    git(dev, "commit", "-qm", "v3 requirements")
    git(dev, "push", "-q", "origin", "main")


@pytest.mark.feature("UPD-07")
def test_haengendes_pip_install_ergibt_klares_zeitlimit_ergebnis(vps, monkeypatch, tmp_path):
    push_requirements_change(vps)
    fake_python = tmp_path / "fake-python"
    fake_python.write_text(FAKE_PIP_PYTHON)
    fake_python.chmod(fake_python.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setattr(sys, "executable", str(fake_python))
    monkeypatch.setattr(updater, "PIP_TIMEOUT_SEC", 1, raising=False)

    started = time.monotonic()
    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "pip install" in message
    assert "durduruldu" in message
    assert time.monotonic() - started < 15
    assert wait_until_gone(int((tmp_path / "grandchild.pid").read_text()))


@pytest.mark.feature("UPD-07")
def test_git_laeuft_ohne_credential_abfrage(vps, monkeypatch, tmp_path):
    log = tmp_path / "env.log"
    monkeypatch.setenv("ENV_LOG", str(log))
    monkeypatch.delenv("GIT_TERMINAL_PROMPT", raising=False)

    ok, _ = updater.check_for_updates("main")

    assert ok is True
    assert set(log.read_text().split()) == {"[0]"}


@pytest.mark.feature("UPD-07")
def test_zweiter_pull_wartet_nicht_sondern_meldet_laufendes_update(vps):
    lock = get_update_lock_path()
    with open(lock, "w") as f:
        json.dump({"pid": os.getpid(), "created": time.time()}, f)

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "sürüyor" in message
    assert (vps / "VERSION").read_text() == "v1\n"
    assert os.path.exists(lock)  # fremder Lock bleibt


@pytest.mark.feature("UPD-07")
def test_lock_eines_beendeten_prozesses_blockiert_nicht(vps):
    dead = subprocess.Popen([sys.executable, "-c", "pass"])
    dead.wait()
    with open(get_update_lock_path(), "w") as f:
        json.dump({"pid": dead.pid, "created": time.time()}, f)

    ok, _ = updater.execute_git_pull("main")

    assert ok is True
    assert (vps / "VERSION").read_text() == "v2\n"
    assert not os.path.exists(get_update_lock_path())


@pytest.mark.feature("UPD-07")
def test_sehr_alter_lock_blockiert_nicht(vps):
    with open(get_update_lock_path(), "w") as f:
        json.dump({"pid": os.getpid(), "created": time.time() - 3 * 3600}, f)

    ok, _ = updater.execute_git_pull("main")

    assert ok is True
    assert not os.path.exists(get_update_lock_path())


@pytest.mark.feature("UPD-07")
def test_lock_wird_auch_nach_fehlschlag_freigegeben(vps, monkeypatch):
    monkeypatch.setenv("HANG_ON", "fetch")

    ok, _ = updater.execute_git_pull("main")

    assert ok is False
    assert not os.path.exists(get_update_lock_path())


@pytest.mark.feature("UPD-07")
def test_veralteter_ref_lock_nach_kill_wird_entfernt_und_pull_klappt(vps, capsys):
    (vps / ".git" / "refs" / "heads" / "main.lock").write_text("")

    ok, _ = updater.execute_git_pull("main")

    assert ok is True
    assert (vps / "VERSION").read_text() == "v2\n"
    assert not (vps / ".git" / "refs" / "heads" / "main.lock").exists()
    assert "main.lock" in capsys.readouterr().out


@pytest.mark.feature("UPD-07")
def test_ref_lock_bleibt_wenn_ein_git_des_repos_laeuft(vps):
    # echtes git, das auf stdin wartet: läuft im Repo und heißt wirklich "git"
    process = subprocess.Popen([os.environ["REAL_GIT"], "cat-file", "--batch"], cwd=vps, stdin=subprocess.PIPE)
    time.sleep(0.5)
    try:
        (vps / ".git" / "refs" / "heads" / "main.lock").write_text("")

        ok, _ = updater.execute_git_pull("main")

        assert ok is False
        assert (vps / ".git" / "refs" / "heads" / "main.lock").exists()
    finally:
        process.kill()
        process.wait()


@pytest.mark.feature("UPD-07")
def test_haengendes_stash_pop_holt_pip_im_naechsten_lauf_nach(vps, monkeypatch):
    push_requirements_change(vps)
    (vps / "notes.txt").write_text("lokal geändert\n")
    pip_calls = []
    monkeypatch.setattr(updater, "_pip_install", lambda path: pip_calls.append(path) or subprocess.CompletedProcess([], 0, "", ""))
    monkeypatch.setenv("HANG_ON", "stash:pop")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git stash" in message
    assert pip_calls == []
    assert os.path.exists(get_update_pending_path())

    monkeypatch.setenv("HANG_ON", "")
    ok, _ = updater.execute_git_pull("main")

    assert ok is True
    assert len(pip_calls) == 1
    assert not os.path.exists(get_update_pending_path())


@pytest.mark.feature("UPD-07")
def test_tick_holt_unvollstaendigen_pull_nach_und_startet_neu(vps, monkeypatch):
    push_requirements_change(vps)
    (vps / "notes.txt").write_text("lokal geändert\n")
    pip_calls = []
    monkeypatch.setattr(updater, "_pip_install", lambda path: pip_calls.append(path) or subprocess.CompletedProcess([], 0, "", ""))
    monkeypatch.setenv("HANG_ON", "stash:pop")
    updater.execute_git_pull("main")
    monkeypatch.setenv("HANG_ON", "")
    monkeypatch.setenv(updater.SUPERVISED_ENV, "1")
    monkeypatch.setattr(auto_updater, "_configured_minutes", lambda: "5")
    restarts = []
    monkeypatch.setattr(auto_updater, "schedule_restart", lambda: restarts.append(1) or True)

    restarting = asyncio.run(auto_updater.tick())

    assert restarting is True
    assert len(pip_calls) == 1
    assert restarts == [1]
    assert not os.path.exists(get_update_pending_path())


@pytest.mark.feature("UPD-07")
def test_fehlgeschlagenes_pip_wird_im_naechsten_lauf_wiederholt(vps, monkeypatch):
    push_requirements_change(vps)
    results = [subprocess.CompletedProcess([], 1, "", "kaputt"), subprocess.CompletedProcess([], 0, "", "")]
    pip_calls = []
    monkeypatch.setattr(updater, "_pip_install", lambda path: pip_calls.append(path) or results.pop(0))

    ok, _ = updater.execute_git_pull("main")
    assert ok is False
    ok, _ = updater.execute_git_pull("main")

    assert ok is True
    assert len(pip_calls) == 2


@pytest.mark.feature("UPD-07")
def test_helfer_nach_beendetem_git_wird_beim_zeitlimit_aufgeraeumt(vps, monkeypatch, tmp_path):
    # git endet nach 1,5 s, der Helfer hält die Pipes bis zum Zeitlimit von 3 s: children() findet ihn dann nicht mehr
    monkeypatch.setenv("ORPHAN_ON", "fetch")

    ok, text = updater.check_for_updates("main")

    assert ok is False
    assert "git fetch" in text
    assert wait_until_gone(int((tmp_path / "grandchild.pid").read_text()))


@pytest.mark.feature("UPD-07")
def test_fehlschlag_im_folgelauf_behaelt_den_marker_des_fruehren_laufs(vps, monkeypatch):
    push_requirements_change(vps)
    results = [subprocess.CompletedProcess([], 1, "", "kaputt"), subprocess.CompletedProcess([], 0, "", "")]
    pip_calls = []
    monkeypatch.setattr(updater, "_pip_install", lambda path: pip_calls.append(path) or results.pop(0))
    updater.execute_git_pull("main")  # Pull steht, pip fehlgeschlagen: Marker
    monkeypatch.setenv("HANG_ON", "fetch")

    ok, _ = updater.execute_git_pull("main")  # Netz weg im Folgelauf

    assert ok is False
    assert os.path.exists(get_update_pending_path())
    monkeypatch.setenv("HANG_ON", "")
    ok, _ = updater.execute_git_pull("main")
    assert ok is True
    assert len(pip_calls) == 2


@pytest.mark.feature("UPD-07")
def test_lock_eines_anderen_halters_wird_beim_freigeben_nicht_geloescht(vps, monkeypatch):
    def take_over_during_pull(path):
        with open(get_update_lock_path(), "w") as f:
            json.dump({"pid": os.getpid(), "created": time.time(), "token": "fremd"}, f)
        return subprocess.CompletedProcess([], 0, "", "")

    push_requirements_change(vps)
    monkeypatch.setattr(updater, "_pip_install", take_over_during_pull)

    updater.execute_git_pull("main")

    assert os.path.exists(get_update_lock_path())
