#!/usr/bin/env python3
"""Funktions-Checkliste: Testberichte einlesen und docs/features/FEATURES.md erzeugen.

Quellen:
  docs/features/features.yaml        Katalog (Reihenfolge = Testreihenfolge)
  docs/features/manual_results.yaml  manuelle Freigaben
  .feature-results/<tier>.xml|json   Testberichte (unit/api: pytest JUnit-XML, e2e/live: Playwright-JSON)
Ergebnis:
  docs/features/results.json         gesammelte Ergebnisse pro Feature und Ebene (wird zusammengeführt,
                                     damit ein Teillauf z. B. nur ZON-05 die übrigen Ergebnisse behält)
  docs/features/FEATURES.md          Checkliste

Aufruf (Python aus worker_python/.venv, braucht pyyaml):
  update_checklist.py                  Berichte einlesen + FEATURES.md schreiben
  update_checklist.py --check          nur den Katalog prüfen
  update_checklist.py --next           nächstes offenes Feature (in Testreihenfolge) anzeigen
  update_checklist.py --show ENG-05    Details + Status eines Features
  update_checklist.py --sign ENG-13 bestanden [--notiz "..."]   manuelles Ergebnis eintragen
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "features"
CATALOG = DOCS / "features.yaml"
MANUAL = DOCS / "manual_results.yaml"
RESULTS = DOCS / "results.json"
OUT = DOCS / "FEATURES.md"
REPORTS = ROOT / ".feature-results"

AUTO_TIERS = ("unit", "api", "e2e", "live")
ALL_TIERS = AUTO_TIERS + ("manuell",)
TIER_ICON = {"unit": "🧪 unit", "api": "🔌 api", "e2e": "🖥️ e2e", "live": "🌐 live", "manuell": "👤 manuell"}
STATUS_ICON = {"passed": "✅", "failed": "❌", "xfail": "🐞", "skipped": "⏭️", None: "⏳"}
ID_RE = re.compile(r"(?<![A-Za-z])([A-Z]{2,3}-\d{2})(?!\d)")

MANUAL_HEADER = """\
# Manuelle Testergebnisse – wird von update_checklist.py --sign geschrieben (oder von Hand).
# Format:
#   ENG-13:
#     status: bestanden      # oder: fehlgeschlagen
#     datum: 2026-09-24
#     notiz: optional
"""


# --------------------------------------------------------------------------- Katalog
def load_catalog() -> list[dict]:
    data = yaml.safe_load(CATALOG.read_text(encoding="utf-8"))
    return data["kategorien"]


def iter_features(cats: list[dict]):
    for cat in cats:
        for f in cat["features"]:
            yield cat, f


def validate(cats: list[dict]) -> list[str]:
    problems, seen = [], set()
    for cat in cats:
        for f in cat.get("features", []):
            fid = f.get("id", "?")
            if not re.fullmatch(rf"{cat['id']}-\d{{2}}", fid):
                problems.append(f"{fid}: ID passt nicht zur Kategorie {cat['id']} (Format {cat['id']}-NN)")
            if fid in seen:
                problems.append(f"{fid}: doppelte ID")
            seen.add(fid)
            for key in ("titel", "beschreibung", "tiers", "pruefung", "erwartet"):
                if not f.get(key):
                    problems.append(f"{fid}: Feld '{key}' fehlt")
            for t in f.get("tiers", []):
                if t not in ALL_TIERS:
                    problems.append(f"{fid}: unbekannte Ebene '{t}'")
            for path in f.get("code", []):
                if not (ROOT / path).exists():
                    problems.append(f"{fid}: Datei existiert nicht: {path}")
    return problems


# --------------------------------------------------------------------------- Berichte
def _merge_status(old: str | None, new: str) -> str:
    rank = {"failed": 4, "xfail": 3, "passed": 2, "skipped": 1}
    return new if old is None or rank[new] > rank[old] else old


def parse_junit(path: Path) -> dict[str, dict]:
    """pytest JUnit-XML → {feature: {"status", "tests"}}. Feature aus <property name="feature"> oder dem Testnamen."""
    out: dict[str, dict] = {}
    for case in ET.parse(path).getroot().iter("testcase"):
        ids = {p.get("value") for p in case.iter("property") if p.get("name") == "feature"}
        ids |= set(ID_RE.findall(case.get("name", "")))
        if not ids:
            continue
        if case.find("failure") is not None or case.find("error") is not None:
            status = "failed"
        elif (sk := case.find("skipped")) is not None:
            kind = (sk.get("type", "") + " " + sk.get("message", "")).lower()
            status = "xfail" if "xfail" in kind else "skipped"
        else:
            status = "passed"
        for fid in ids:
            entry = out.setdefault(fid, {"status": None, "tests": 0})
            entry["status"] = _merge_status(entry["status"], status)
            entry["tests"] += 1
    return out


def parse_playwright(path: Path) -> dict[str, dict]:
    """Playwright-JSON → {feature: {"status", "tests"}}. Feature aus Tags (@ENG-05) oder dem Testtitel."""
    out: dict[str, dict] = {}

    def walk(suite: dict):
        for spec in suite.get("specs", []):
            ids = {t.lstrip("@") for t in spec.get("tags", [])} | set(ID_RE.findall(spec.get("title", "")))
            ids = {i for i in ids if ID_RE.fullmatch(i)}
            for test in spec.get("tests", []):
                st, expected = test.get("status"), test.get("expectedStatus")
                if st == "skipped":
                    status = "skipped"
                elif st == "unexpected":
                    status = "failed"
                elif expected == "failed":
                    status = "xfail"
                else:  # expected / flaky
                    status = "passed"
                for fid in ids:
                    entry = out.setdefault(fid, {"status": None, "tests": 0})
                    entry["status"] = _merge_status(entry["status"], status)
                    entry["tests"] += 1
        for child in suite.get("suites", []):
            walk(child)

    for suite in json.loads(path.read_text(encoding="utf-8")).get("suites", []):
        walk(suite)
    return out


def ingest_reports(results: dict) -> list[str]:
    ingested = []
    if not REPORTS.is_dir():
        return ingested
    for path in sorted(REPORTS.iterdir()):
        tier = path.stem
        if tier not in AUTO_TIERS:
            continue
        if path.suffix == ".xml":
            parsed = parse_junit(path)
        elif path.suffix == ".json":
            parsed = parse_playwright(path)
        else:
            continue
        datum = dt.date.fromtimestamp(path.stat().st_mtime).isoformat()
        for fid, entry in parsed.items():
            results.setdefault(fid, {})[tier] = {"status": entry["status"], "tests": entry["tests"], "datum": datum}
        ingested.append(f"{path.name}: {len(parsed)} Features")
    return ingested


# --------------------------------------------------------------------------- Status
def load_manual() -> dict:
    if not MANUAL.exists():
        return {}
    return yaml.safe_load(MANUAL.read_text(encoding="utf-8")) or {}


def feature_state(f: dict, results: dict, manual: dict) -> dict:
    """Checkbox-Regel: kein Fehler, 'manuell' braucht Freigabe, und mindestens ein Nachweis.
    Fehlende Ebenen (⏳) verhindern das Häkchen nicht, machen es aber 'teilweise'."""
    tiers = {}
    for t in f["tiers"]:
        if t == "manuell":
            continue
        tiers[t] = (results.get(f["id"], {}).get(t) or {}).get("status")
    m = manual.get(f["id"]) or {}
    m_status = {"bestanden": "passed", "fehlgeschlagen": "failed"}.get(m.get("status"))
    if "manuell" in f["tiers"]:
        tiers["manuell"] = m_status

    statuses = list(tiers.values()) + ([m_status] if "manuell" not in f["tiers"] and m_status else [])
    failed = any(s in ("failed", "xfail") for s in statuses)
    evidence = any(s == "passed" for s in statuses)
    manual_ok = "manuell" not in f["tiers"] or m_status == "passed"
    checked = not failed and evidence and manual_ok
    complete = checked and all(s == "passed" for s in tiers.values())
    return {"tiers": tiers, "manual": m, "checked": checked, "complete": complete, "failed": failed}


# --------------------------------------------------------------------------- Ausgabe
def render(cats: list[dict], results: dict, manual: dict) -> str:
    today = dt.date.today().isoformat()
    states = {f["id"]: feature_state(f, results, manual) for _, f in iter_features(cats)}
    total = len(states)
    done = sum(s["checked"] for s in states.values())
    failed = sum(s["failed"] for s in states.values())
    known = sum(1 for _, f in iter_features(cats) if f.get("bekannter_fehler"))

    lines = [
        "# Auto Grid – Funktions-Checkliste",
        "",
        "> Automatisch erzeugt aus [`features.yaml`](features.yaml) – **nicht von Hand bearbeiten**.",
        "> Aktualisieren: `scripts/features/run.sh` (oder in Claude Code `/feature-test`).",
        "> Manuelles Ergebnis eintragen: `scripts/features/run.sh sign ENG-13 bestanden`.",
        "",
        f"**Stand:** {today} · **{done}/{total}** abgehakt · ❌ {failed} mit Fehlern · 🐞 {known} bekannte Fehler",
        "",
        "Legende: 🧪 unit · 🔌 api · 🖥️ e2e (gemockt) · 🌐 live (DEMO-Konto) · 👤 manuell — "
        "✅ bestanden · ❌ fehlgeschlagen · 🐞 bekannter Fehler (xfail) · ⏭️ übersprungen · ⏳ noch kein Ergebnis",
        "",
        "Häkchen = kein Fehler, mindestens ein bestandener Test bzw. manuelle Freigabe, und bei 👤 eine Freigabe. "
        "*(teilweise)* = es fehlen noch Ergebnisse auf anderen Ebenen.",
        "",
        "## Testreihenfolge",
        "",
        "| # | Kategorie | Stand |",
        "|---|---|---|",
    ]
    for i, cat in enumerate(cats, 1):
        n = len(cat["features"])
        d = sum(states[f["id"]]["checked"] for f in cat["features"])
        lines.append(f"| {i} | **{cat['id']}** – {cat['titel']} | {d}/{n} |")

    for i, cat in enumerate(cats, 1):
        lines += ["", f"## {i}. {cat['id']} – {cat['titel']}", ""]
        for f in cat["features"]:
            st = states[f["id"]]
            box = "x" if st["checked"] else " "
            badges = []
            for t, s in st["tiers"].items():
                badge = f"{TIER_ICON[t]} {STATUS_ICON[s]}"
                date = (results.get(f["id"], {}).get(t) or {}).get("datum") if t != "manuell" else st["manual"].get("datum")
                if date and s:
                    badge += f" {date}"
                badges.append(badge)
            if "manuell" not in f["tiers"] and st["manual"].get("status"):
                s = {"bestanden": "passed", "fehlgeschlagen": "failed"}[st["manual"]["status"]]
                badges.append(f"{TIER_ICON['manuell']} {STATUS_ICON[s]} {st['manual'].get('datum', '')}".rstrip())
            partial = " *(teilweise)*" if st["checked"] and not st["complete"] else ""
            lines.append(f"- [{box}] **{f['id']}** {f['titel']}{partial} — {' · '.join(badges)}")
            lines.append(f"  - {f['beschreibung']}")
            lines.append(f"  - **Prüfung:** {' → '.join(f['pruefung'])}")
            lines.append(f"  - **Erwartet:** {f['erwartet']}")
            if f.get("bekannter_fehler"):
                lines.append(f"  - 🐞 **Bekannter Fehler:** {f['bekannter_fehler']}")
            if st["manual"].get("notiz"):
                lines.append(f"  - 📝 {st['manual']['notiz']}")
    lines.append("")
    return "\n".join(lines)


def write_manual(manual: dict, cats: list[dict]) -> None:
    order = [f["id"] for _, f in iter_features(cats)]
    ordered = {k: manual[k] for k in sorted(manual, key=lambda k: order.index(k) if k in order else 999)}
    body = yaml.safe_dump(ordered, allow_unicode=True, sort_keys=False) if ordered else "{}\n"
    MANUAL.write_text(MANUAL_HEADER + body, encoding="utf-8")


def show(f: dict, cat: dict, results: dict, manual: dict) -> None:
    st = feature_state(f, results, manual)
    print(f"{f['id']} – {f['titel']}  [{cat['id']}: {cat['titel']}]")
    print(f"  {f['beschreibung']}")
    print(f"  Ebenen:   {', '.join(f'{t} {STATUS_ICON[s]}' for t, s in st['tiers'].items())}")
    print("  Prüfung:")
    for step in f["pruefung"]:
        print(f"    - {step}")
    print(f"  Erwartet: {f['erwartet']}")
    if f.get("bekannter_fehler"):
        print(f"  Bekannter Fehler: {f['bekannter_fehler']}")
    print(f"  Code:     {', '.join(f.get('code', []))}")


# --------------------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--next", action="store_true")
    ap.add_argument("--show", metavar="ID")
    ap.add_argument("--sign", nargs=2, metavar=("ID", "STATUS"))
    ap.add_argument("--notiz", default="")
    args = ap.parse_args()

    cats = load_catalog()
    problems = validate(cats)
    if problems:
        print("Katalogfehler in features.yaml:", *problems, sep="\n  - ", file=sys.stderr)
        return 1
    if args.check:
        print(f"features.yaml ok ({sum(1 for _ in iter_features(cats))} Features)")
        return 0

    results = json.loads(RESULTS.read_text(encoding="utf-8")) if RESULTS.exists() else {}
    manual = load_manual()
    by_id = {f["id"]: (cat, f) for cat, f in iter_features(cats)}

    if args.show:
        if args.show not in by_id:
            print(f"Unbekannte ID: {args.show}", file=sys.stderr)
            return 1
        cat, f = by_id[args.show]
        show(f, cat, results, manual)
        return 0

    if args.next:
        for cat, f in iter_features(cats):
            if not feature_state(f, results, manual)["checked"]:
                show(f, cat, results, manual)
                return 0
        print("Alle Features sind abgehakt 🎉")
        return 0

    if args.sign:
        fid, status = args.sign
        if fid not in by_id:
            print(f"Unbekannte ID: {fid}", file=sys.stderr)
            return 1
        if status not in ("bestanden", "fehlgeschlagen"):
            print("STATUS muss 'bestanden' oder 'fehlgeschlagen' sein", file=sys.stderr)
            return 1
        manual[fid] = {"status": status, "datum": dt.date.today().isoformat()}
        if args.notiz:
            manual[fid]["notiz"] = args.notiz
        write_manual(manual, cats)
        print(f"{fid}: manuell {status}")

    for line in ingest_reports(results):
        print(f"eingelesen: {line}")
    known = set(by_id)
    unknown = sorted(set(results) - known)
    if unknown:
        # Aus dem Katalog entfernte Features (oder Tippfehler in einem Test-Tag): Ergebnisse verwerfen
        print(f"Warnung: Ergebnisse für IDs ohne Katalogeintrag verworfen: {', '.join(unknown)}", file=sys.stderr)
        for fid in unknown:
            del results[fid]
    RESULTS.write_text(json.dumps(results, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    OUT.write_text(render(cats, results, manual), encoding="utf-8")
    done = sum(feature_state(f, results, manual)["checked"] for _, f in iter_features(cats))
    print(f"FEATURES.md geschrieben: {done}/{len(by_id)} abgehakt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
