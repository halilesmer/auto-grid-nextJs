#!/usr/bin/env bash
# Funktionstests ausführen und docs/features/FEATURES.md aktualisieren.
#
#   scripts/features/run.sh                 unit + api + e2e (alles, was ohne VPS läuft)
#   scripts/features/run.sh unit [FILTER]   nur eine Ebene; FILTER = Feature-ID (ENG-05) oder Kategorie (ENG)
#   scripts/features/run.sh live [FILTER]   gegen den VPS-Worker (DEMO); Handelstests zusätzlich mit E2E_LIVE_DEMO=1
#   scripts/features/run.sh next            nächstes offenes Feature in Testreihenfolge
#   scripts/features/run.sh show ENG-05     Details + Status
#   scripts/features/run.sh sign ENG-13 bestanden|fehlgeschlagen ["Notiz"]
#   scripts/features/run.sh check           nur features.yaml prüfen
#   scripts/features/run.sh render          nur FEATURES.md neu erzeugen
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

run_pytest() {  # $1 = tier (unit|api)
  local tier="$1"
  if [ ! -d "$WORKER/tests/$tier" ]; then
    echo "• $tier: noch keine Tests (worker_python/tests/$tier fehlt) – übersprungen"
    return 0
  fi
  echo "• $tier: pytest ${filter:+(Filter $filter)}"
  (cd "$WORKER" && "$PY" -m pytest "tests/$tier" -q \
      --junitxml="$REPORTS/$tier.xml" ${filter:+--feature "$filter"}) || rc=1
}

run_playwright() {  # $1 = tier (e2e|live), $2 = Playwright-Projekt
  local tier="$1" project="$2"
  if [ ! -f "$FRONTEND/playwright.config.ts" ]; then
    echo "• $tier: noch keine Tests (playwright.config.ts fehlt) – übersprungen"
    return 0
  fi
  echo "• $tier: playwright --project=$project ${filter:+(Filter $filter)}"
  (cd "$FRONTEND" && PLAYWRIGHT_JSON_OUTPUT_NAME="$REPORTS/$tier.json" \
      npx playwright test --project="$project" --reporter=list,json \
      ${filter:+--grep "@$filter"}) || rc=1
}

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
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac

"$PY" "$GEN" || rc=1
exit $rc
