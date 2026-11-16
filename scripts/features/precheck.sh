#!/usr/bin/env bash
# Prüfung vor dem ersten Push eines PRs: dasselbe wie CI (.github/workflows/tests.yml), in CI-Reihenfolge.
#
#   scripts/features/precheck.sh                  Katalog, Worker-pytest, lint, tsc, ALLE gemockten e2e-Tests
#   scripts/features/precheck.sh --grep @ZON-05   zusätzliche Playwright-Argumente (nur zum Prüfen des Skripts);
#                                                  die Ergebniszeile heißt dann „PRECHECK TEILLAUF“, nie „PRECHECK OK“
#
# Eine Wiederholung wie in CI: der e2e-Schritt setzt E2E_PRECHECK=1; playwright.config.ts nimmt dann dieselbe
# Konstante (CI_RETRIES) wie in CI. Ein oynak-Test (erst rot, bei der Wiederholung grün) lässt den Lauf grün,
# steht aber mit Datei:Zeile und Titel unter der e2e-Zeile. run.sh und ein Aufruf von Hand wiederholen nie
# (1116-A8.4, hooks/RULES.md §4.8).
# Der e2e-Lauf nimmt den Port dieses Checkouts (e2e/fixtures/env.ts, SYS-10), nie einen fremden Server.
# Bricht ab, wenn Playwright keinen Test ausgeführt hat (scripts/features/pw_stats.py).
# Ändert keine Dateien im Repo: Bericht unter .feature-results/precheck-e2e.json,
# FEATURES.md/results.json aktualisiert weiterhin scripts/features/run.sh.
# Dauer: rund 15 min (e2e ohne Shards). Läuft deshalb nicht im pre-push-Hook (hooks/RULES.md §4.8).
# Maschinenweite Sperre (SYS-11, heavy_lock.sh): der ganze Lauf wartet, bis kein anderer schwerer Lauf
# mehr läuft (HEAVY_LOCK=0 schaltet ab, in CI aus). Ein verwaister eigener Testserver auf dem Port
# wird vor dem e2e-Schritt und beim Exit beendet (e2e_server.sh).
#
#   scripts/features/precheck.sh --stop           beendet NUR den Lauf dieses Checkouts (SYS-16): sicherer
#                                                  Ersatz für `pkill -f`, das auch fremde Läufe trifft
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="${PRECHECK_PID_FILE:-$ROOT/.feature-results/precheck.pid}"

if [ "${1:-}" = "--stop" ]; then
  # Datei: "<pid> <ROOT>". Nur ein Lauf, dessen Datei diesen Checkout nennt und dessen Befehl precheck.sh ist.
  read -r pid pid_root < "$PID_FILE" 2>/dev/null || { echo "precheck.sh --stop: kein Lauf in diesem Checkout (keine PID-Datei)."; exit 0; }
  if [ "${pid_root:-}" != "$ROOT" ] || ! kill -0 "${pid:-0}" 2>/dev/null \
     || ! ps -o command= -p "$pid" 2>/dev/null | grep -q 'precheck.sh'; then
    echo "precheck.sh --stop: kein Lauf in diesem Checkout (PID ${pid:-?} gehört nicht zu diesem precheck.sh); nichts beendet."
    exit 0
  fi
  # Nachfahren vorher sammeln; zuerst den Lauf (sein Signal-Handler räumt Sperre und Testserver auf,
  # sobald der laufende Schritt endet), dann die Nachfahren.
  kids=""; todo="$pid"
  while [ -n "$todo" ]; do
    next=""
    for p in $todo; do
      for c in $(pgrep -P "$p" 2>/dev/null); do kids="$c $kids"; next="$next $c"; done
    done
    todo="$next"
  done
  kill -TERM "$pid" 2>/dev/null
  for c in $kids; do kill -TERM "$c" 2>/dev/null; done
  # Zombie (Z) zählt als beendet: der Elternprozess hat ihn nur noch nicht abgeholt
  alive() { kill -0 "$pid" 2>/dev/null && ! ps -o stat= -p "$pid" 2>/dev/null | grep -q '^Z'; }
  i=0
  while alive && [ "$i" -lt 40 ]; do sleep 0.5; i=$((i + 1)); done
  if alive; then echo "precheck.sh --stop: PID $pid läuft noch nach 20 s." >&2; exit 1; fi
  echo "precheck.sh --stop: Lauf (PID $pid) und $(echo $kids | wc -w | tr -d ' ') Kindprozesse beendet."
  exit 0
fi
WORKER="$ROOT/worker_python"
FRONTEND="$ROOT/frontend_nextjs"
REPORTS="$ROOT/.feature-results"
GEN="$ROOT/scripts/features/update_checklist.py"
STATS="$ROOT/scripts/features/pw_stats.py"
JSON="$REPORTS/precheck-e2e.json"

PY="$WORKER/.venv/bin/python"
[ -x "$PY" ] || PY="$(command -v python3)"
mkdir -p "$REPORTS"
# PID-Datei für --stop: gehört diesem Lauf, verschwindet beim Exit (nur wenn noch die eigene PID drinsteht)
echo "$$ $ROOT" > "$PID_FILE" 2>/dev/null
_cleanup_pid() { [ "$(cut -d' ' -f1 "$PID_FILE" 2>/dev/null)" = "$$" ] && rm -f "$PID_FILE"; return 0; }

# Python-Pakete prüfen, bevor die Sperre genommen wird: fehlen sie (z. B. neuer Worktree ohne Venv),
# würden Katalog und Worker nach der Wartezeit sofort fallen, der e2e-Lauf aber trotzdem ~18 min laufen.
# yaml = update_checklist.py (Katalog), pytest = Worker-Tests. Der Rückfall auf python3 bleibt (CI).
if ! "$PY" -c 'import yaml, pytest' 2>/dev/null; then
  {
    echo "precheck.sh: Python-Pakete fehlen (yaml und/oder pytest). Der Lauf endet, bevor er auf die Sperre wartet."
    echo "  gewähltes Python: $PY"
    if [ ! -x "$WORKER/.venv/bin/python" ]; then
      echo "  Es gibt kein $WORKER/.venv, daher der Rückfall auf python3."
    fi
    echo "  Lösung 1 (Worktree): ln -s <Haupt-Checkout>/worker_python/.venv \"$WORKER/.venv\""
    echo "  Lösung 2: \"$PY\" -m pip install -r \"$WORKER/requirements-dev.txt\""
  } >&2
  exit 1
fi

# shellcheck source=heavy_lock.sh
source "$ROOT/scripts/features/heavy_lock.sh"
# shellcheck source=e2e_server.sh
source "$ROOT/scripts/features/e2e_server.sh"
E2E_PORT_NUM=$(e2e_port "$FRONTEND")
_cleanup_server() { e2e_server_cleanup "$E2E_PORT_NUM" "$FRONTEND" exit; }
heavy_on_exit _cleanup_server
heavy_on_exit _cleanup_pid
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
  (cd "$FRONTEND" && E2E_PRECHECK=1 PLAYWRIGHT_JSON_OUTPUT_NAME="$JSON" \
      npx playwright test --project=mocked --reporter=dot,json "$@")
  local pw=$?
  local line
  local out
  out=$("$PY" "$STATS" "$JSON")
  local st=$?
  line=$(printf '%s\n' "$out" | head -n 1)
  E2E_LINE="${line:-kein Bericht}"
  echo "   $E2E_LINE"
  FLAKY_LINES=$(printf '%s\n' "$out" | tail -n +2 | grep '^oynak: ')
  # Null Tests ist immer ein Fehler, auch wenn Playwright 0 zurückgibt
  [ "$st" -eq 3 ] && return 3
  [ "$pw" -eq 0 ] && [ "$st" -eq 0 ] && return 0
  return 1
}

E2E_LINE=""
FLAKY_LINES=""
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
# Oynak-Tests (CI würde sie als „flaky“ grün melden): Namen unter die Ergebniszeile
[ -n "$FLAKY_LINES" ] && printf '%s\n' "$FLAKY_LINES" | sed 's/^/  /'
exit "$fail"
