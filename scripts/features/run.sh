#!/usr/bin/env bash
# Funktionstests ausführen und docs/features/FEATURES.md aktualisieren.
#
#   scripts/features/run.sh                 unit + api + e2e (alles, was ohne VPS läuft)
#   scripts/features/run.sh ENG-05          ein Feature bzw. eine Kategorie (ZON) auf allen Ebenen ohne VPS
#   scripts/features/run.sh unit [FILTER]   nur eine Ebene; FILTER = Feature-ID (ENG-05) oder Kategorie (ENG)
#   scripts/features/run.sh live [FILTER]   gegen den VPS-Worker (DEMO); Handelstests zusätzlich mit E2E_LIVE_DEMO=1
#   scripts/features/run.sh next            nächstes offenes Feature in Testreihenfolge
#   scripts/features/run.sh show ENG-05     Details + Status
#   scripts/features/run.sh sign ENG-13 bestanden|fehlgeschlagen ["Notiz"]
#   scripts/features/run.sh check           nur features.yaml prüfen
#   scripts/features/run.sh render          nur FEATURES.md neu erzeugen
#
# Sperre (SYS-11, heavy_lock.sh): Läufe mit Playwright ohne Filter oder mit Kategorie-Filter
# (all, e2e, live, ZON) warten auf die maschinenweite Sperre, denn jeder baut next und startet
# viele Browser. Ein einzelnes Feature (run.sh ENG-05, run.sh e2e ENG-05) und unit/api laufen ohne Sperre.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER="$ROOT/worker_python"
FRONTEND="$ROOT/frontend_nextjs"
REPORTS="$ROOT/.feature-results"
GEN="$ROOT/scripts/features/update_checklist.py"

PY="$WORKER/.venv/bin/python"
[ -x "$PY" ] || PY="$(command -v python3)"
if ! "$PY" -c "import yaml" 2>/dev/null; then
  echo "pyyaml fehlt: $PY -m pip install -r worker_python/requirements-dev.txt" >&2
  exit 1
fi

mkdir -p "$REPORTS"
cmd="${1:-all}"
filter="${2:-}"
rc=0
ran_any=0   # mindestens eine Ebene hat mindestens einen Test ausgeführt (R3-08)

run_pytest() {  # $1 = tier (unit|api)
  local tier="$1"
  if [ ! -d "$WORKER/tests/$tier" ]; then
    echo "• $tier: noch keine Tests (worker_python/tests/$tier fehlt) – übersprungen"
    return 0
  fi
  echo "• $tier: pytest ${filter:+(Filter $filter)}"
  (cd "$WORKER" && "$PY" -m pytest "tests/$tier" -q \
      --junitxml="$REPORTS/$tier.xml" ${filter:+--feature "$filter"})
  local status=$?
  # 5 = keine Tests für diesen Filter auf dieser Ebene (kein Fehler)
  [ "$status" -eq 0 ] && ran_any=1
  [ "$status" -eq 0 ] || [ "$status" -eq 5 ] || rc=1
}

run_playwright() {  # $1 = tier (e2e|live), $2 = Playwright-Projekt
  local tier="$1" project="$2"
  if [ ! -f "$FRONTEND/playwright.config.ts" ]; then
    echo "• $tier: noch keine Tests (playwright.config.ts fehlt) – übersprungen"
    return 0
  fi
  echo "• $tier: playwright --project=$project ${filter:+(Filter $filter)}"
  local live=0
  [ "$tier" = live ] && live=1
  # Alten Bericht löschen: sonst läse pw_stats nach einem abgebrochenen Lauf die Zahlen des letzten (R3-08)
  rm -f "$REPORTS/$tier.json"
  (cd "$FRONTEND" && E2E_LIVE=$live PLAYWRIGHT_JSON_OUTPUT_NAME="$REPORTS/$tier.json" \
      npx playwright test --project="$project" --reporter=list,json --pass-with-no-tests \
      ${filter:+--grep "@$filter"}) || rc=1
  # Ohne Filter muss mindestens ein Test laufen; 0 Tests ist kein grüner Lauf (hooks/RULES.md §4.9).
  # Mit Filter darf eine einzelne Ebene leer sein (ENG-05 hat keine e2e-Tests), aber nicht alle zusammen.
  "$PY" "$ROOT/scripts/features/pw_stats.py" "$REPORTS/$tier.json" >/dev/null 2>&1
  local st=$?
  if [ ! -f "$REPORTS/$tier.json" ]; then
    echo "• $tier: kein Playwright-Bericht (Lauf abgebrochen?)" >&2; rc=1
  fi
  [ "$st" -ne 3 ] && ran_any=1   # 0 = Tests liefen, 1 = Tests fehlgeschlagen (rc steht schon auf 1)
  if [ "$st" -eq 3 ]; then
    if [ -z "$filter" ]; then
      echo "• $tier: KEIN Test ausgeführt" >&2; rc=1
    else
      echo "• $tier: kein Test für Filter $filter auf dieser Ebene"
    fi
  fi
}

# Nur ID/Kategorie angegeben (ENG-05, ZON): alle Ebenen ohne VPS, gefiltert
if [[ "$cmd" =~ ^[A-Z]{2,3}(-[0-9]{2})?$ ]]; then
  filter="$cmd"
  cmd=all
fi

# Schwerer Lauf? Playwright-Ebene und kein Einzel-Feature-Filter → Sperre
case "$cmd" in
  all|e2e|live)
    if ! [[ "$filter" =~ ^[A-Z]{2,3}-[0-9]{2}$ ]]; then
      # shellcheck source=heavy_lock.sh
      source "$ROOT/scripts/features/heavy_lock.sh"
      heavy_lock_acquire || exit $?
    fi ;;
esac
if [ "$cmd" = all ] || [ "$cmd" = e2e ]; then
  # shellcheck source=e2e_server.sh
  source "$ROOT/scripts/features/e2e_server.sh"
  E2E_PORT_NUM=$(e2e_port "$FRONTEND")
  _cleanup_server() { e2e_server_cleanup "$E2E_PORT_NUM" "$FRONTEND" exit; }
  if declare -F heavy_on_exit >/dev/null; then heavy_on_exit _cleanup_server; else trap _cleanup_server EXIT; fi
  e2e_server_cleanup "$E2E_PORT_NUM" "$FRONTEND" start || exit 1
fi

case "$cmd" in
  all)    run_pytest unit; run_pytest api; run_playwright e2e mocked ;;
  unit)   run_pytest unit ;;
  api)    run_pytest api ;;
  e2e)    run_playwright e2e mocked ;;
  live)   run_playwright live live-demo ;;
  next)   exec "$PY" "$GEN" --next ;;
  show)   exec "$PY" "$GEN" --show "${2:?ID fehlt}" ;;
  check)  exec "$PY" "$GEN" --check ;;
  sign)   exec "$PY" "$GEN" --sign "${2:?ID fehlt}" "${3:?STATUS fehlt}" ${4:+--notiz "$4"} ;;
  render) ;;
  *) sed -n '2,14p' "$0"; exit 2 ;;
esac

# Ein Filter (ID oder Kategorie), zu dem keine Ebene einen Test ausgeführt hat, ist ein Fehler (R3-08)
case "$cmd" in
  all|unit|api|e2e|live)
    if [ -n "$filter" ] && [ "$ran_any" -eq 0 ]; then
      echo "FEHLER: kein Test für den Filter \"$filter\" ausgeführt (Tippfehler im Kürzel? docs/features/features.yaml prüfen)" >&2
      rc=1
    fi ;;
esac

"$PY" "$GEN" || rc=1
exit $rc
