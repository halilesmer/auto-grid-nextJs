#!/usr/bin/env bash
# Verwaister e2e-Testserver (SYS-11): wird ein Lauf hart beendet (kill -9, App-Neustart, Exit 137),
# bleibt sein `next start` auf dem Port des Checkouts liegen und blockiert den nächsten Lauf.
#
#   source scripts/features/e2e_server.sh
#   e2e_port <frontend-dir>                    Port dieses Checkouts (e2e/fixtures/env.ts, SYS-10)
#   e2e_server_cleanup <port> <frontend-dir> start|exit
#
# Regeln:
#   - Nur ein lauschender Prozess, dessen cwd (lsof) genau <frontend-dir> ist, wird beendet.
#   - Hat er einen laufenden `playwright`-Vorfahren, gehört er zu einem aktiven Lauf: nicht anfassen
#     (start: Fehler, exit: in Ruhe lassen).
#   - Ein fremder Prozess (anderes cwd) wird nie beendet: start → klare Fehlermeldung, Rückgabe 1.
#   - E2E_REUSE=1: der eigene Server ist gewollt (playwright.config.ts), nichts beenden.

_es_log() { echo "[e2e-server] $*" >&2; }

e2e_port() {
  (cd "$1" && node -p "require('./e2e/fixtures/env.ts').E2E_PORT" 2>/dev/null)
}

_es_cwd() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1; }

_es_has_playwright_ancestor() {
  local p n=0
  p=$(ps -o ppid= -p "$1" 2>/dev/null | tr -d ' ')
  while [ -n "$p" ] && [ "$p" -gt 1 ] && [ "$n" -lt 32 ]; do
    ps -o command= -p "$p" 2>/dev/null | grep -q 'playwright' && return 0
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
    n=$((n + 1))
  done
  return 1
}

e2e_server_cleanup() {  # $1 port, $2 frontend-dir, $3 start|exit
  local port="$1" dir mode="${3:-start}" pid cwd rc=0
  [ -n "$port" ] || return 0
  [ "${E2E_REUSE:-}" = "1" ] && return 0
  command -v lsof >/dev/null || return 0
  dir=$(cd "$2" && pwd -P)
  for pid in $(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u); do
    cwd=$(_es_cwd "$pid")
    if [ "$cwd" != "$dir" ]; then
      if [ "$mode" = start ]; then
        _es_log "Port $port ist belegt von pid $pid ($(ps -o command= -p "$pid" | cut -c1-60)), cwd ${cwd:-?}."
        _es_log "Fremder Prozess, wird nicht beendet. Port freimachen oder E2E_PORT setzen."
        rc=1
      fi
      continue
    fi
    if _es_has_playwright_ancestor "$pid"; then
      if [ "$mode" = start ]; then
        _es_log "Port $port: Server pid $pid gehört zu einem laufenden Playwright-Lauf in diesem Checkout."
        rc=1
      fi
      continue
    fi
    _es_log "verwaister Testserver auf Port $port (pid $pid, cwd dieses Checkouts) wird beendet"
    kill "$pid" 2>/dev/null
    local i=0
    while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 20 ]; do sleep 0.25; i=$((i + 1)); done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
  done
  return "$rc"
}
