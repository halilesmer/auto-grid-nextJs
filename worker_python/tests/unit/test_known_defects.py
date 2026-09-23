"""Bekannte Fehler ohne eigene Testdatei (xfail strict: wird der Fehler behoben, schlägt der Test
als XPASS fehl → Marker entfernen und bekannter_fehler in docs/features/features.yaml löschen)."""
import os

import pytest

from src.core.grid_execution.config import extract_zone_config
from src.utils.self_updater import get_project_root
from tests.helpers import make_zone


@pytest.mark.feature("SET-06")
@pytest.mark.xfail(strict=True, reason="Bekannter Fehler: GLOBAL_GRID_STEP u. a. werden von der Engine nie gelesen")
def test_zone_ohne_grid_step_nutzt_globalen_standard():
    settings = {"GLOBAL_GRID_STEP": 0.25, "ZONES": [make_zone()]}
    zone = settings["ZONES"][0]
    del zone["grid_step"]
    # Erwartet: Fallback auf den globalen Wert; tatsächlich fest verdrahtet 0.05
    assert extract_zone_config(zone, 0).grid_step == settings["GLOBAL_GRID_STEP"]


@pytest.mark.feature("UPD-05")
@pytest.mark.xfail(strict=True, reason="Bekannter Fehler: hard_restart_server verweist auf scripts/launcher.py, das fehlt")
def test_launcher_fuer_neustart_nach_update_existiert():
    assert os.path.exists(os.path.join(get_project_root(), "scripts", "launcher.py"))
