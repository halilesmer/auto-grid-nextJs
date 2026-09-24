"""UPD-02 Update anwenden: git pull über das Dashboard, auch wenn er unterwegs scheitert.

Auf dem VPS brach `git pull` ab, weil Windows Dateien in docs/features nicht überschreiben ließ
(„unable to unlink old …“). Zurück blieben halb aktualisierte Dateien (VERSION auf der neuen
Version, HEAD auf der alten) und der Stash „auto-stash-before-pull“ mit den lokalen Änderungen.
Jetzt wird bei einem Fehler der Zustand vor dem Pull wiederhergestellt.

Die Tests nutzen echte Git-Repos in tmp; das Scheitern entsteht wie auf dem VPS durch einen
Ordner, in dem git keine Dateien ersetzen darf.
"""
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

import src.utils.self_updater as updater

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="git nicht installiert")


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


@pytest.fixture
def repos(tmp_path, monkeypatch):
    """origin (bare) + VPS-Klon auf v1; origin bekommt danach v2 (VERSION + docs/features)."""
    origin = tmp_path / "origin.git"
    dev = tmp_path / "dev"
    vps = tmp_path / "vps"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(tmp_path, "clone", "-q", str(origin), str(dev))
    for repo in (dev,):
        git(repo, "config", "user.email", "t@example.com")
        git(repo, "config", "user.name", "Test")
    (dev / "docs" / "features").mkdir(parents=True)
    (dev / "VERSION").write_text("v1\n")
    (dev / "docs" / "features" / "FEATURES.md").write_text("alt\n")
    (dev / "notes.txt").write_text("basis\n")
    git(dev, "add", "-A")
    git(dev, "commit", "-q", "-m", "v1")
    git(dev, "push", "-q", "origin", "main")
    git(tmp_path, "clone", "-q", str(origin), str(vps))
    git(vps, "config", "user.email", "t@example.com")
    git(vps, "config", "user.name", "VPS")

    (dev / "VERSION").write_text("v2\n")
    (dev / "docs" / "features" / "FEATURES.md").write_text("neu\n")
    git(dev, "commit", "-qam", "v2")
    git(dev, "push", "-q", "origin", "main")

    monkeypatch.setattr(updater, "get_project_root", lambda: str(vps))
    locked = vps / "docs" / "features"
    yield vps, locked
    os.chmod(locked, stat.S_IRWXU)


def lock(folder: Path):
    # Keine Schreibrechte im Ordner → git kann FEATURES.md nicht ersetzen (wie „unlink … Invalid argument“)
    os.chmod(folder, stat.S_IRUSR | stat.S_IXUSR)


@pytest.mark.feature("UPD-02")
def test_erfolgreicher_pull_behaelt_lokale_aenderungen(repos):
    vps, _ = repos
    (vps / "notes.txt").write_text("lokal geändert\n")
    ok, _ = updater.execute_git_pull("main")
    assert ok
    assert (vps / "VERSION").read_text() == "v2\n"
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"
    assert git(vps, "stash", "list") == ""


@pytest.mark.feature("UPD-02")
@pytest.mark.skipif(os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0),
                    reason="Ordner-Sperre per chmod nur als normaler POSIX-Benutzer")
def test_gescheiterter_pull_stellt_den_stand_davor_wieder_her(repos):
    vps, locked = repos
    head_before = git(vps, "rev-parse", "HEAD")
    (vps / "notes.txt").write_text("lokal geändert\n")
    (vps / "neu_lokal.txt").write_text("untracked\n")
    lock(locked)

    ok, message = updater.execute_git_pull("main")

    assert not ok and "Git Çekme Hatası" in message
    assert git(vps, "rev-parse", "HEAD") == head_before
    # keine halb aktualisierten Dateien, lokale Änderungen zurück, kein Stash liegen geblieben
    assert (vps / "VERSION").read_text() == "v1\n"
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"
    assert (vps / "neu_lokal.txt").read_text() == "untracked\n"
    assert git(vps, "stash", "list") == ""

    # Nach dem Beheben der Rechte klappt das Update
    os.chmod(locked, stat.S_IRWXU)
    ok, _ = updater.execute_git_pull("main")
    assert ok and (vps / "VERSION").read_text() == "v2\n"
    assert (vps / "notes.txt").read_text() == "lokal geändert\n"


@pytest.mark.feature("UPD-02")
@pytest.mark.skipif(os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0),
                    reason="Ordner-Sperre per chmod nur als normaler POSIX-Benutzer")
def test_gescheiterter_pull_ohne_lokale_aenderungen(repos):
    vps, locked = repos
    lock(locked)
    ok, _ = updater.execute_git_pull("main")
    assert not ok
    assert git(vps, "status", "--porcelain") == ""
    assert (vps / "VERSION").read_text() == "v1\n"
    assert git(vps, "stash", "list") == ""
