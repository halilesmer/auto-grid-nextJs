#!/usr/bin/env bash
# Prüfung vor dem ersten Push eines PRs: dasselbe wie CI (.github/workflows/tests.yml), in CI-Reihenfolge.
#
#   scripts/features/precheck.sh                  Katalog, Worker-pytest, lint, tsc, ALLE gemockten e2e-Tests
#   scripts/features/precheck.sh --grep @ZON-05   zusätzliche Playwright-Argumente (nur zum Prüfen des Skripts);
#                                                  die Ergebniszeile heißt dann „PRECHECK TEILLAUF“, nie „PRECHECK OK“
#
# Der e2e-Lauf nimmt den Port dieses Checkouts (e2e/fixtures/env.ts, SYS-10), nie einen fremden Server.
# Bricht ab, wenn Playwright keinen Test ausgeführt hat (scripts/features/pw_stats.py).
# Ändert keine Dateien im Repo: Bericht unter .feature-results/precheck-e2e.json,
# FEATURES.md/results.json aktualisiert weiterhin scripts/features/run.sh.
# Dauer: rund 15 min (e2e ohne Shards). Läuft deshalb nicht im pre-push-Hook (hooks/RULES.md §4.8).
# Maschinenweite Sperre (SYS-11, heavy_lock.sh): der ganze Lauf wartet, bis kein anderer schwerer Lauf
# mehr läuft (HEAVY_LOCK=0 schaltet ab, in CI aus). Ein verwaister eigener Testserver auf dem Port
# wird vor dem e2e-Schritt und beim Exit beendet (e2e_server.sh).
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

# shellcheck source=heavy_lock.sh
source "$ROOT/scripts/features/heavy_lock.sh"
# shellcheck source=e2e_server.sh
source "$ROOT/scripts/features/e2e_server.sh"
E2E_PORT_NUM=$(e2e_port "$FRONTEND")
_cleanup_server() { e2e_server_cleanup "$E2E_PORT_NUM" "$FRONTEND" exit; }
heavy_on_exit _cleanup_server
lock_t0=$(date +%s)
heavy_lock_acquire || exit $?
LOCK_WAIT=$(( $(date +%s) - lock_t0 ))

start=$(date +%s)
results=()
fail=0

step() {  # $1 = Name, Rest = Befehl
  local name="$1"; shift
  echo "━━ $name"
  heavy_lock_step "$name"
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
  local port="$E2E_PORT_NUM"
  echo "   Port ${port:-?} (E2E_PORT überschreibt)"
  e2e_server_cleanup "$port" "$FRONTEND" start || return 1
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
# Mit zusätzlichen Playwright-Argumenten (--grep …) läuft nur ein Teil der Tests: das ist kein
# vollständiger Vorab-Check und darf nicht „PRECHECK OK“ heißen (R3-07).
label="PRECHECK"
[ "$#" -gt 0 ] && label="PRECHECK TEILLAUF (nur e2e mit: $*)"
echo
if [ "$fail" -eq 0 ]; then
  if [ "$#" -gt 0 ]; then
    echo "$label, kein vollständiger Check, nicht vor dem Push verwenden · in ${total}s (Sperre ${LOCK_WAIT}s gewartet) · ${results[*]} · e2e $E2E_LINE"
  else
    echo "PRECHECK OK in ${total}s (Sperre ${LOCK_WAIT}s gewartet) · ${results[*]} · e2e $E2E_LINE"
  fi
else
  echo "$label FEHLER in ${total}s (Sperre ${LOCK_WAIT}s gewartet) · ${results[*]} · e2e ${E2E_LINE:-–}"
fi
exit "$fail"
