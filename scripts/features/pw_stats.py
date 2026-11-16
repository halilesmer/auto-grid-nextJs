#!/usr/bin/env python3
"""Playwright-JSON-Bericht prüfen: Zahlen ausgeben, bei 0 ausgeführten Tests fehlschlagen.

    pw_stats.py <report.json>

Ausgabe: erste Zeile "ran=N passed=N failed=N flaky=N skipped=N"; danach je oynak-Test
(Playwright-Status "flaky": erst fehlgeschlagen, dann bei der Wiederholung bestanden) eine Zeile
"oynak: <Datei>:<Zeile> <Titel>" (Titel mit Describe-Pfad).
Exit 0 = mindestens ein Test lief und keiner ist fehlgeschlagen,
     1 = mindestens ein Test fehlgeschlagen oder Bericht fehlt,
     3 = kein Test lief (expected + unexpected + flaky == 0, hooks/RULES.md §4.9).
"""
import json
import sys


def flaky_tests(suites, path=(), top=True):
    """Alle Specs mit mindestens einem Test im Status "flaky": (Datei, Zeile, Titelpfad).

    Die Suites der obersten Ebene sind die Dateien; ihr Titel (der Dateiname) kommt nicht in den Titelpfad.
    """
    found = []
    for suite in suites or []:
        sub = path if top else path + (suite.get("title", ""),)
        for spec in suite.get("specs", []):
            if any(t.get("status") == "flaky" for t in spec.get("tests", [])):
                title = " › ".join(p for p in sub + (spec.get("title", ""),) if p)
                found.append((spec.get("file", "?"), spec.get("line", 0), title))
        found += flaky_tests(suite.get("suites"), sub, top=False)
    return found


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    try:
        with open(sys.argv[1], encoding="utf-8") as fh:
            report = json.load(fh)
        stats = report.get("stats", {})
    except (OSError, ValueError) as exc:
        print(f"pw_stats: Bericht nicht lesbar: {exc}", file=sys.stderr)
        return 1
    passed = int(stats.get("expected", 0))
    failed = int(stats.get("unexpected", 0))
    flaky = int(stats.get("flaky", 0))
    skipped = int(stats.get("skipped", 0))
    ran = passed + failed + flaky
    print(f"ran={ran} passed={passed} failed={failed} flaky={flaky} skipped={skipped}")
    for file, line, title in flaky_tests(report.get("suites")):
        print(f"oynak: {file}:{line} {title}")
    if ran == 0:
        print("pw_stats: KEIN Test ausgeführt – das ist kein grüner Lauf (Filter/Grep prüfen, hooks/RULES.md §4.9).", file=sys.stderr)
        return 3
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
