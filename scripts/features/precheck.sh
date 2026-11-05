#!/usr/bin/env bash
# Prüfung vor dem ersten Push eines PRs: dasselbe wie CI (.github/workflows/tests.yml), in CI-Reihenfolge.
#
#   scripts/features/precheck.sh                  Katalog, Worker-pytest, lint, tsc, ALLE gemockten e2e-Tests
#   scripts/features/precheck.sh --grep @ZON-05   zusätzliche Playwright-Argumente (nur zum Prüfen des Skripts)
#
# Der e2e-Lauf nimmt den Port dieses Checkouts (e2e/fixtures/env.ts, SYS-10), nie einen fremden Server.
# Bricht ab, wenn Playwright keinen Test ausgeführt hat (scripts/features/pw_stats.py).
# Ändert keine Dateien im Repo: Bericht unter .feature-results/precheck-e2e.json,
# FEATURES.md/results.json aktualisiert weiterhin scripts/features/run.sh.
# Dauer: rund 15 min (e2e ohne Shards). Läuft deshalb nicht im pre-push-Hook (hooks/RULES.md §4.8).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER="$ROOT/worker_python"
FRONTEND="$ROOT/frontend_nextjs"
REPORTS="$ROOT/.feature-results"
GEN="$ROOT/scripts/features/update_checklist.py"
STATS="$ROOT/scripts/features/pw_stats.py"
JSON="$REPORTS/precheck-e2e.json"

PY="$WORKER/.venv/bin/python"
[ -x "$PY" ] || PY="$(command -v python3)"
mkdir -p "$REPORTS"

start=$(date +%s)
results=()
fail=0

step() {  # $1 = Name, Rest = Befehl
  local name="$1"; shift
  echo "━━ $name"
  local t0=$(date +%s)
  "$@"
  local status=$?
  local dt=$(( $(date +%s) - t0 ))
  if [ "$status" -eq 0 ]; then
    results+=("$name ok (${dt}s)")
  else
    results+=("$name FEHLER (${dt}s)")
    fail=1
  fi
  return "$status"
}

catalog() { "$PY" "$GEN" --check; }
worker()  { (cd "$WORKER" && "$PY" -m pytest -q); }
lint()    { (cd "$FRONTEND" && npm run lint --silent); }
tsc()     { (cd "$FRONTEND" && npx tsc --noEmit); }
e2e() {
  rm -f "$JSON"
  local port
  port=$(cd "$FRONTEND" && node -p "require('./e2e/fixtures/env.ts').E2E_PORT" 2>/dev/null)
  echo "   Port ${port:-?} (E2E_PORT überschreibt)"
  (cd "$FRONTEND" && PLAYWRIGHT_JSON_OUTPUT_NAME="$JSON" \
      npx playwright test --project=mocked --reporter=dot,json "$@")
  local pw=$?
  local line
  line=$("$PY" "$STATS" "$JSON")
  local st=$?
  E2E_LINE="${line:-kein Bericht}"
  echo "   $E2E_LINE"
  # Null Tests ist immer ein Fehler, auch wenn Playwright 0 zurückgibt
  [ "$st" -eq 3 ] && return 3
  [ "$pw" -eq 0 ] && [ "$st" -eq 0 ] && return 0
  return 1
}

E2E_LINE=""
# CI-Reihenfolge: Katalog → Worker → lint + tsc → e2e. Ein Fehler stoppt nicht: alle Ergebnisse auf einmal.
step katalog catalog
step worker worker
step lint lint
step tsc tsc
step e2e e2e "$@"

total=$(( $(date +%s) - start ))
echo
if [ "$fail" -eq 0 ]; then
  echo "PRECHECK OK in ${total}s · ${results[*]} · e2e $E2E_LINE"
else
  echo "PRECHECK FEHLER in ${total}s · ${results[*]} · e2e ${E2E_LINE:-–}"
fi
exit "$fail"
