"""BKT-01 Musterlösungen und BKT-09 Zukunftsdaten-Test (tests/parity, docs/analyse-regeln.md §5).

- Jedes Szenario wird mit dem echten Python-Bot abgespielt; die Ereignisfolge muss der gespeicherten
  Musterlösung (tests/parity/golden/<name>.json) gleichen. Ändert sich die Bot-Logik bewusst:
  `pytest tests/unit/test_parity_golden.py --update-golden` und den Nachbau im Browser anpassen.
- Zukunftsdaten: Ab Tick k werden alle späteren Kurse verändert. Alle Ereignisse vor k müssen gleich
  bleiben, sonst hätte der Bot (oder die Kerzenbildung) in die Zukunft geschaut.
- pyround.json hält Pythons round() für Grenzfälle fest (Bankrundung, Binärdarstellung), damit der
  Nachbau im Browser dieselbe Rundung bekommt.
"""
import json
import random

import pytest

from tests.parity import runner

NAMES = runner.scenario_names()
PYROUND_CASES = [
    (0.5, 0), (1.5, 0), (2.5, 0), (-0.5, 0), (-2.5, 0), (0.125, 2), (0.375, 2), (2.675, 2), (1.005, 2),
    (97.0005, 3), (97.1005, 3), (96.9995, 3), (0.1 + 0.2, 2), (1e-9, 3), (123.4565, 3), (2650.125, 2),
    (0.045, 2), (1.0000000000000002, 5), (99.99999, 3), (-96.8505, 3), (7.0e-4, 3), (0.0005, 3),
]


@pytest.fixture
def update_golden(request):
    return request.config.getoption("--update-golden")


@pytest.mark.feature("BKT-01")
def test_es_gibt_genug_szenarien():
    assert len(NAMES) >= 16


@pytest.mark.feature("BKT-01")
@pytest.mark.parametrize("name", NAMES)
def test_ereignisfolge_gleicht_der_musterloesung(name, update_golden):
    events = runner.run(runner.load(name))
    kinds = {e["ev"] for e in events}
    assert "place" in kinds or "market" in kinds, "Szenario ohne Bot-Aktion prüft nichts"
    if update_golden or not runner.golden_path(name).exists():
        runner.write_golden(name, events)
        if not update_golden:
            pytest.fail(f"Musterlösung {name} fehlte und wurde geschrieben; Test erneut ausführen")
        return
    expected = json.loads(runner.golden_path(name).read_text(encoding="utf-8"))
    if events != expected:
        first = next((i for i, (a, b) in enumerate(zip(events, expected)) if a != b), min(len(events), len(expected)))
        pytest.fail(
            f"{name}: Ereignis #{first} weicht ab\n"
            f"  erwartet: {expected[first] if first < len(expected) else '—'}\n"
            f"  erhalten: {events[first] if first < len(events) else '—'}\n"
            f"  ({len(expected)} erwartet, {len(events)} erhalten)"
        )


@pytest.mark.feature("BKT-01")
@pytest.mark.parametrize("name", NAMES)
def test_wiederholung_ergibt_dieselbe_folge(name):
    scenario = runner.load(name)
    assert runner.run(scenario) == runner.run(scenario)


@pytest.mark.feature("BKT-09")
@pytest.mark.parametrize("name", NAMES)
def test_spaetere_kurse_aendern_fruehere_entscheidungen_nicht(name):
    scenario = runner.load(name)
    original = runner.run(scenario)
    rng = random.Random(name)
    n = len(scenario["ticks"])
    # Rauschen nach einem/zwei Dritteln und ein harter Sprung direkt nach der ersten Bot-Aktion
    first_action = next(e["i"] for e in original if e["ev"] in ("place", "market"))
    cuts = [(n // 3, None), (2 * n // 3, None), (min(first_action + 1, n - 1), 1.5)]
    for k, shift in cuts:
        changed = json.loads(json.dumps(scenario))
        for tick in changed["ticks"][k:]:
            tick[1] = round(tick[1] + (shift if shift is not None else rng.uniform(-0.6, 0.6)), 3)
        events = runner.run(changed)
        before = [e for e in original if e["i"] < k]
        assert [e for e in events if e["i"] < k] == before
        # Die Änderung wirkt danach wirklich (sonst prüft der Test nichts)
        assert events != original


@pytest.mark.feature("BKT-01")
def test_python_rundung_ist_festgehalten(update_golden):
    path = runner.GOLDEN / "pyround.json"
    cases = [[x, n, round(x, n)] for x, n in PYROUND_CASES]
    if update_golden or not path.exists():
        path.write_text(json.dumps(cases, indent=1) + "\n", encoding="utf-8")
    assert json.loads(path.read_text(encoding="utf-8")) == cases
