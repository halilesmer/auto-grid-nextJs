"""Katalogprüfung: jeder `pruefung`-Schritt in features.yaml muss ein Text sein.

Ein Schritt mit `": "` im Text liest YAML als Ein-Schlüssel-Dictionary (2026-11-23: FRM-05, FRM-18, FRM-39).
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "features" / "update_checklist.py"


def _load():
    spec = importlib.util.spec_from_file_location("update_checklist", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _cats(yaml_steps: str) -> list[dict]:
    doc = f"""
kategorien:
  - id: ZZZ
    features:
      - id: ZZZ-01
        titel: t
        beschreibung: b
        tiers: [unit]
        erwartet: e
        pruefung:
{yaml_steps}
"""
    return yaml.safe_load(doc)["kategorien"]


def test_pruefung_dict_schritt_wird_gemeldet():
    mod = _load()
    # "Klicke: Speichern" → YAML macht daraus {"Klicke": "Speichern"}
    cats = _cats("          - Öffne die Seite\n          - Klicke: Speichern\n")
    problems = mod.validate(cats)
    assert any("ZZZ-01" in p and "Schritt 2" in p for p in problems), problems


def test_pruefung_text_schritte_sind_ok():
    mod = _load()
    cats = _cats('          - Öffne die Seite\n          - "Klicke: Speichern"\n')
    assert mod.validate(cats) == []


def test_check_beendet_mit_fehler_bei_dict_schritt(tmp_path):
    mod = _load()
    bad = tmp_path / "features.yaml"
    bad.write_text(
        "kategorien:\n  - id: ZZZ\n    features:\n      - id: ZZZ-01\n        titel: t\n"
        "        beschreibung: b\n        tiers: [unit]\n        erwartet: e\n"
        "        pruefung:\n          - Klicke: Speichern\n",
        encoding="utf-8",
    )
    code = (
        "import importlib.util,sys;"
        f"s=importlib.util.spec_from_file_location('u',{str(SCRIPT)!r});m=importlib.util.module_from_spec(s);s.loader.exec_module(m);"
        f"from pathlib import Path;m.CATALOG=Path({str(bad)!r});sys.argv=['u','--check'];sys.exit(m.main())"
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert r.returncode != 0
    assert "ZZZ-01" in r.stderr
