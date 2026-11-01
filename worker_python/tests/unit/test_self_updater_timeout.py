"""UPD-07 Automatisches Update: ein hängendes git darf den Update-Lauf nicht für immer anhalten.

Der Lauf (`tick()`) wartete ohne Zeitlimit auf git, ohne Log-Zeile; sichtbar war das nur an einem
alten `checked_at` in GET /system/worker/status.

Die Tests nutzen echte Git-Repos in tmp und ein `git` vor dem echten im PATH, das beim gewählten
Unterbefehl hängt und ein Enkelkind startet, das stdout/stderr erbt. So hält auch
git-remote-https auf dem VPS die Pipes offen, nachdem git selbst beendet wurde.
"""
import asyncio
import os
import shutil
import stat
import subprocess
import time

import psutil
import pytest

import src.utils.auto_updater as auto_updater
import src.utils.self_updater as updater

pytestmark = [
    pytest.mark.skipif(shutil.which("git") is None, reason="git nicht installiert"),
    pytest.mark.skipif(os.name == "nt", reason="das hängende git ist ein sh-Skript"),
]

SECRET_URL = "https://geheimer-token@example.invalid/repo.git"

HANGING_GIT = """#!/bin/sh
case " $HANG_ON " in
  *" $1 "*|*" $1:$2 "*)
    if [ -n "$HANG_AFTER_WORK" ]; then
      "$REAL_GIT" "$@" >/dev/null 2>&1
      : > .git/index.lock
    fi
    sleep 20 &
    echo $! > "$HANG_PID_FILE"
    sleep 20
    exit 0
    ;;
esac
exec "$REAL_GIT" "$@"
"""


def git(cwd, *args):
    env = {**os.environ, "HANG_ON": ""}
    return subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True).stdout


@pytest.fixture
def vps(tmp_path, monkeypatch):
    """VPS-Klon auf v1, origin auf v2, git im PATH hängt bei $HANG_ON, Zeitlimits 3 s (Reserve für langsame Läufe in der vollen Suite)."""
    real_git = shutil.which("git")
    origin = tmp_path / "origin.git"
    dev = tmp_path / "dev"
    clone = tmp_path / "vps"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(tmp_path, "clone", "-q", str(origin), str(dev))
    git(dev, "config", "user.email", "t@example.com")
    git(dev, "config", "user.name", "Test")
    (dev / "VERSION").write_text("v1\n")
    (dev / "notes.txt").write_text("basis\n")
    git(dev, "add", "-A")
    git(dev, "commit", "-q", "-m", "v1")
    git(dev, "push", "-q", "origin", "main")
    git(tmp_path, "clone", "-q", str(origin), str(clone))
    git(clone, "config", "user.email", "t@example.com")
    git(clone, "config", "user.name", "VPS")
    (dev / "VERSION").write_text("v2\n")
    git(dev, "commit", "-qam", "v2")
    git(dev, "push", "-q", "origin", "main")

    wrapper_dir = tmp_path / "bin"
    wrapper_dir.mkdir()
    wrapper = wrapper_dir / "git"
    wrapper.write_text(HANGING_GIT)
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setenv("PATH", f"{wrapper_dir}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setenv("REAL_GIT", real_git)
    monkeypatch.setenv("HANG_PID_FILE", str(tmp_path / "grandchild.pid"))
    monkeypatch.setattr(updater, "get_project_root", lambda: str(clone))
    monkeypatch.setattr(updater, "is_elevated", lambda: False)
    monkeypatch.setattr(updater, "GIT_NETWORK_TIMEOUT_SEC", 3)
    monkeypatch.setattr(updater, "GIT_LOCAL_TIMEOUT_SEC", 3)
    return clone


def wait_until_gone(pid):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        try:
            if psutil.Process(pid).status() == psutil.STATUS_ZOMBIE:
                return True
        except psutil.NoSuchProcess:
            return True
        time.sleep(0.05)
    return False


@pytest.mark.feature("UPD-07")
def test_haengendes_fetch_beendet_die_pruefung_mit_fehlertext(vps, monkeypatch, tmp_path):
    monkeypatch.setenv("HANG_ON", "fetch")

    started = time.monotonic()
    ok, text = updater.check_for_updates("main")

    assert ok is False
    assert "git fetch" in text
    # Unter den 20 s des hängenden Prozesses: die Pipes des Enkels halten den Aufruf nicht auf
    assert time.monotonic() - started < 10
    assert wait_until_gone(int((tmp_path / "grandchild.pid").read_text()))


@pytest.mark.feature("UPD-07")
def test_fehlertext_des_zeitlimits_enthaelt_keinen_token(vps, monkeypatch):
    (vps / "github_token.txt").write_text(SECRET_URL)
    monkeypatch.setenv("HANG_ON", "remote")

    ok, text = updater.check_for_updates("main")

    assert ok is False
    assert "git remote" in text
    assert "geheimer-token" not in text


@pytest.mark.feature("UPD-07")
def test_haengendes_git_show_ist_ein_fehler_und_kein_erfolg(vps, monkeypatch):
    monkeypatch.setenv("HANG_ON", "show")

    ok, text = updater.check_for_updates("main")

    assert ok is False
    assert "git show" in text


@pytest.mark.feature("UPD-07")
def test_haengendes_fetch_stellt_lokale_aenderungen_wieder_her(vps, monkeypatch):
    (vps / "notes.txt").write_text("lokal geändert\n")
    monkeypatch.setenv("HANG_ON", "fetch")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git fetch" in message
    assert (vps / "VERSION").read_text() == "v1\n"
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"
    assert git(vps, "stash", "list") == ""


@pytest.mark.feature("UPD-07")
def test_beendeter_pull_mit_altem_index_lock_kehrt_zum_stand_davor_zurueck(vps, monkeypatch):
    # git wird hart beendet, nachdem HEAD schon auf v2 steht: index.lock bleibt liegen
    head_before = git(vps, "rev-parse", "HEAD")
    (vps / "notes.txt").write_text("lokal geändert\n")
    monkeypatch.setenv("HANG_ON", "pull")
    monkeypatch.setenv("HANG_AFTER_WORK", "1")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git pull" in message
    assert git(vps, "rev-parse", "HEAD") == head_before
    assert (vps / "VERSION").read_text() == "v1\n"
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"
    assert not (vps / ".git" / "index.lock").exists()
    assert git(vps, "stash", "list") == ""


@pytest.mark.feature("UPD-07")
def test_haengendes_stash_laesst_die_arbeitskopie_stehen_und_der_naechste_lauf_klappt(vps, monkeypatch):
    (vps / "notes.txt").write_text("lokal geändert\n")
    monkeypatch.setenv("HANG_ON", "stash:push")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git stash" in message
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"

    monkeypatch.setenv("HANG_ON", "")
    ok, _ = updater.execute_git_pull("main")
    assert ok is True
    assert (vps / "VERSION").read_text() == "v2\n"
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"


@pytest.mark.feature("UPD-07")
def test_nach_beendetem_stash_pop_setzt_kein_reset_die_lokale_aenderung_zurueck(vps, monkeypatch):
    # pop ist fertig, der Stash also schon weg: ein reset würde die Änderung endgültig löschen
    (vps / "notes.txt").write_text("lokal geändert\n")
    monkeypatch.setenv("HANG_ON", "stash:pop")
    monkeypatch.setenv("HANG_AFTER_WORK", "1")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git stash" in message
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"


@pytest.mark.feature("UPD-07")
def test_haengender_diff_nach_dem_pull_stellt_den_stand_davor_wieder_her(vps, monkeypatch):
    monkeypatch.setenv("HANG_ON", "diff")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git diff" in message
    assert (vps / "VERSION").read_text() == "v1\n"


@pytest.mark.feature("UPD-07")
def test_haengendes_zuruecksetzen_nennt_den_liegen_gebliebenen_stash(vps, monkeypatch):
    (vps / "notes.txt").write_text("lokal geändert\n")
    monkeypatch.setenv("HANG_ON", "fetch reset")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git fetch" in message
    assert "git reset" in message
    assert "auto-stash-before-pull" in message
    assert "auto-stash-before-pull" in git(vps, "stash", "list")


@pytest.mark.feature("UPD-07")
def test_nach_gespeichertem_stash_beendetes_git_spielt_die_aenderung_zurueck(vps, monkeypatch):
    # stash push ist fertig, git hängt danach: die Änderung liegt nur noch im Stash
    (vps / "notes.txt").write_text("lokal geändert\n")
    monkeypatch.setenv("HANG_ON", "stash:push")
    monkeypatch.setenv("HANG_AFTER_WORK", "1")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git stash" in message
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"
    assert git(vps, "stash", "list") == ""


@pytest.mark.feature("UPD-07")
def test_nicht_loeschbares_index_lock_wird_gemeldet_statt_zu_werfen(vps, monkeypatch):
    # Ein Ordner lässt sich wie eine gesperrte Windows-Datei nicht mit os.remove löschen
    (vps / ".git" / "index.lock").mkdir()
    monkeypatch.setenv("HANG_ON", "pull")

    ok, message = updater.execute_git_pull("main")

    assert ok is False
    assert "git pull" in message
    assert "Geri alma tamamlanamadı" in message


@pytest.mark.feature("UPD-07")
def test_haengendes_fetch_steht_als_check_failed_im_status(vps, monkeypatch):
    monkeypatch.setattr(auto_updater, "_last_run", {"result": None, "detail": "", "checked_at": None})
    monkeypatch.setenv("HANG_ON", "fetch")

    assert asyncio.run(auto_updater.tick()) is False

    status = auto_updater.status()
    assert status["result"] == "check_failed"
    assert "git fetch" in status["detail"]
    assert status["checked_at"] is not None


class _StopLoop(Exception):
    pass


@pytest.mark.feature("UPD-07")
def test_haengendes_rev_parse_haelt_die_update_schleife_nicht_an(vps, monkeypatch):
    sleeps = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 2:
            raise _StopLoop

    monkeypatch.setattr(auto_updater.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(auto_updater, "_last_run", {"result": None, "detail": "", "checked_at": None})
    monkeypatch.setenv(updater.SUPERVISED_ENV, "1")
    monkeypatch.setenv(auto_updater.INTERVAL_ENV, "5")
    monkeypatch.setenv("HANG_ON", "rev-parse")

    with pytest.raises(_StopLoop):
        asyncio.run(auto_updater.run_auto_updater())

    status = auto_updater.status()
    assert status["result"] == "check_failed"
    assert "git rev-parse" in status["detail"]
