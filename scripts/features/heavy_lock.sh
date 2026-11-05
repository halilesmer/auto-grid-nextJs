#!/usr/bin/env bash
# Maschinenweite Sperre für schwere Testläufe (SYS-11): auf diesem Mac läuft immer nur EIN
# voller e2e-Lauf / next build / precheck, egal aus welchem Worktree.
#
#   scripts/features/heavy_lock.sh <befehl …>     als Hülle: wartet, nimmt die Sperre, führt den Befehl aus
#   source scripts/features/heavy_lock.sh         als Bibliothek: heavy_lock_acquire / heavy_lock_release
#
# Sperre: Verzeichnis /tmp/gridrobot-heavy.lock (mkdir ist atomar), darin `owner`:
#   "<pid> <worktree-name> <HH:MM:SS UTC>"
# Dasselbe Verzeichnis und Format wie das frühere Übergangsskript heavy-run.sh, beide sehen sich.
#
# Umgebung:
#   HEAVY_LOCK=0             keine Sperre (bewusst parallel, z. B. ein einzelner Spec)
#   CI=…                     keine Sperre (in CI hat jeder Job seine eigene Maschine)
#   HEAVY_LOCK_TIMEOUT=<s>   höchstens so lange warten, dann Exit 75 (Standard: unbegrenzt)
#   HEAVY_LOCK_DIR=<pfad>    anderes Sperrverzeichnis (nur für Tests)
#   HEAVY_LOCK_POLL=<s>      Prüfintervall beim Warten (Standard 5)
#   HEAVY_LOCK_MAX_HOLD=<s>  hält jemand die Sperre länger (Standard 2700 = 45 min), warnt der Wartende
#                            mit Halter, Prozess, letztem Schritt und CPU-Fortschritt des Prozessbaums
#   HEAVY_LOCK_BREAK=1       nach MAX_HOLD den Prozessbaum des Halters beenden und die Sperre nehmen
#   HEAVY_LOCK_SKIP_MEM_CHECK=1  Speicherprüfung vor dem Lauf auslassen
#   HEAVY_LOCK_SWAP_MAX=<%>  (90) und HEAVY_LOCK_MEM_MIN=<%> (20): nach dem Nehmen der Sperre startet
#                            der Lauf nicht (Exit 76), wenn Swap ≥ SWAP_MAX UND freier Speicher
#                            (kern.memorystatus_level) < MEM_MIN; nur macOS. Swap allein reicht nicht:
#                            macOS gibt Swap erst frei, wenn die Seiten wieder gebraucht werden.
#
# Fortschritt: precheck.sh schreibt mit heavy_lock_step <name> den laufenden Schritt nach <sperre>/step.
#
# Veraltete Sperre: lebt der Prozess aus `owner` nicht mehr (kill -0), wird sie gelöscht.
# Ein Sperrverzeichnis ohne `owner` gilt nach 60 s als verwaist.
# Wiedereintritt: hält ein Vorfahr dieses Prozesses die Sperre (z. B. heavy_lock.sh precheck.sh),
# läuft der Befehl ohne erneutes Warten.
# Freigabe per trap bei Exit, Fehler und INT/TERM/HUP; der Exit-Code des Befehls bleibt erhalten.
# kill -9 lässt sich nicht abfangen: dann räumt der nächste Wartende die Sperre (kill -0).

HEAVY_LOCK_DIR="${HEAVY_LOCK_DIR:-/tmp/gridrobot-heavy.lock}"
_HL_HELD=0          # 1 = dieser Prozess hat die Sperre angelegt und gibt sie frei
_HL_EXIT_HOOKS=()   # weitere Aufräumfunktionen (heavy_on_exit)

_hl_log() { echo "[heavy-lock] $*" >&2; }

_hl_mtime() {  # GNU (CI) zuerst, dann BSD (macOS)
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0
}

_hl_tree() {  # $1 = pid; der Prozess und alle Nachfahren
  local p c
  echo "$1"
  for c in $(pgrep -P "$1" 2>/dev/null); do _hl_tree "$c"; done
}

_hl_cpu_secs() {  # CPU-Sekunden des ganzen Prozessbaums von $1
  local t=0 v
  for v in $(ps -o time= -p "$(_hl_tree "$1" | paste -sd, -)" 2>/dev/null); do
    # [[dd-]hh:]mm:ss[.cc]
    v=${v%%.*}
    t=$(( t + $(echo "$v" | awk -F'[-:]' '{s=0; for(i=1;i<=NF;i++) s=s*60+$i; if (NF==4) s=$1*86400+$2*3600+$3*60+$4; print s}') ))
  done
  echo "$t"
}

# Laufenden Schritt für Wartende sichtbar machen (ändert owner nicht)
heavy_lock_step() {
  [ "$_HL_HELD" = 1 ] || return 0
  echo "$1 $(date -u +%H:%M:%S)" > "$HEAVY_LOCK_DIR/step" 2>/dev/null || true
}

_hl_hold_report() {  # $1 owner, $2 age (s); Warnung bei MAX_HOLD
  local pid=${1%% *} step cpu
  step=$(cat "$HEAVY_LOCK_DIR/step" 2>/dev/null)
  cpu=$(_hl_cpu_secs "$pid")
  _hl_log "WARNUNG: Sperre seit $(( $2 / 60 )) min gehalten (> $(( ${HEAVY_LOCK_MAX_HOLD:-2700} / 60 )) min): $1"
  _hl_log "  Prozess: $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-100)"
  _hl_log "  letzter Schritt: ${step:-unbekannt} · CPU des Prozessbaums: ${cpu}s (+$(( cpu - ${_HL_LAST_CPU:-$cpu} ))s seit der letzten Meldung)"
  _hl_log "  beenden: im Besitzer-Worktree den Lauf stoppen, oder hier HEAVY_LOCK_BREAK=1 (beendet pid $pid samt Nachfahren)"
  _HL_LAST_CPU=$cpu
}

_hl_break() {  # $1 owner; Prozessbaum des Halters beenden, Sperre löschen
  local pid=${1%% *} tree
  tree=$(_hl_tree "$pid" | tr '\n' ' ')
  _hl_log "HEAVY_LOCK_BREAK=1: beende Prozessbaum des Halters ($1): $tree"
  kill $tree 2>/dev/null
  local i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 40 ]; do sleep 0.25; i=$((i + 1)); done
  kill -9 $tree 2>/dev/null
  [ "$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)" = "$1" ] && rm -rf "$HEAVY_LOCK_DIR"
}

# Speicherdruck vor dem Lauf (nur macOS). 0 = ok, 1 = zu wenig Speicher
heavy_mem_check() {
  [ "${HEAVY_LOCK_SKIP_MEM_CHECK:-0}" = 1 ] && return 0
  local level swap used total pct
  level=$(sysctl -n kern.memorystatus_level 2>/dev/null) || return 0
  swap=$(sysctl -n vm.swapusage 2>/dev/null) || return 0
  total=$(echo "$swap" | awk '{gsub("M","",$3); print int($3)}')
  used=$(echo "$swap" | awk '{gsub("M","",$6); print int($6)}')
  [ -n "$level" ] && [ "${total:-0}" -gt 0 ] || return 0
  pct=$(( used * 100 / total ))
  if [ "$pct" -ge "${HEAVY_LOCK_SWAP_MAX:-90}" ] && [ "$level" -lt "${HEAVY_LOCK_MEM_MIN:-20}" ]; then
    _hl_log "ABBRUCH: zu wenig Speicher: Swap ${used}M/${total}M (${pct}%), freier Speicher ${level}%."
    _hl_log "  Andere Läufe/Apps beenden und neu starten, oder HEAVY_LOCK_SKIP_MEM_CHECK=1."
    return 1
  fi
  return 0
}

_hl_is_ancestor() {  # $1 = pid; wahr, wenn $1 dieser Prozess oder ein Vorfahr ist
  local p=$$ n=0
  while [ -n "$p" ] && [ "$p" -gt 1 ] && [ "$n" -lt 64 ]; do
    [ "$p" = "$1" ] && return 0
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
    n=$((n + 1))
  done
  return 1
}

_hl_skip() {
  [ "${HEAVY_LOCK:-1}" = "0" ] && { _hl_log "HEAVY_LOCK=0: ohne Sperre"; return 0; }
  [ -n "${CI:-}" ] && return 0
  return 1
}

# Nimmt die Sperre. Rückgabe 0 = Sperre gehalten (oder übersprungen), 75 = Zeitlimit,
# 76 = Speicher zu knapp (Sperre wieder frei).
heavy_lock_acquire() {
  _hl_skip && return 0
  local poll="${HEAVY_LOCK_POLL:-5}" timeout="${HEAVY_LOCK_TIMEOUT:-0}"
  local start now waited owner owner_pid age last_msg=-1
  start=$(date +%s)
  local name
  name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
  while ! mkdir "$HEAVY_LOCK_DIR" 2>/dev/null; do
    owner=$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)
    owner_pid=${owner%% *}
    if [ -n "$owner_pid" ] && _hl_is_ancestor "$owner_pid"; then
      _hl_log "Sperre hält schon ein Vorfahr (pid $owner_pid), weiter ohne Warten"
      return 0
    fi
    if [ -n "$owner_pid" ] && ! kill -0 "$owner_pid" 2>/dev/null; then
      # Zwei Wartende können dieselbe tote Sperre sehen: nur löschen, wenn owner noch derselbe ist,
      # sonst hätte der andere schon eine neue Sperre angelegt.
      if [ "$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)" = "$owner" ]; then
        _hl_log "veraltete Sperre gelöscht (pid $owner_pid lebt nicht mehr: $owner)"
        rm -rf "$HEAVY_LOCK_DIR"
      fi
      continue
    fi
    now=$(date +%s)
    if [ -f "$HEAVY_LOCK_DIR/owner" ]; then
      age=$(( now - $(_hl_mtime "$HEAVY_LOCK_DIR/owner") ))
    else
      age=$(( now - $(_hl_mtime "$HEAVY_LOCK_DIR") ))
    fi
    if [ -z "$owner_pid" ] && [ -d "$HEAVY_LOCK_DIR" ] && [ "$age" -gt 60 ]; then
      _hl_log "verwaiste Sperre ohne owner (${age}s) gelöscht"
      rm -rf "$HEAVY_LOCK_DIR"
      continue
    fi
    waited=$(( now - start ))
    if [ "$timeout" -gt 0 ] && [ "$waited" -ge "$timeout" ]; then
      _hl_log "Zeitlimit ${timeout}s erreicht, Sperre hält: ${owner:-?} (seit $((age / 60)) min)"
      return 75
    fi
    if [ -n "$owner_pid" ] && [ "$age" -ge "${HEAVY_LOCK_MAX_HOLD:-2700}" ] && [ "${HEAVY_LOCK_BREAK:-0}" = 1 ]; then
      _hl_hold_report "$owner" "$age"
      _hl_break "$owner"
      continue
    fi
    if [ $(( waited / 120 )) -ne "$last_msg" ]; then  # alle 2 min eine Zeile
      last_msg=$(( waited / 120 ))
      _hl_log "warte seit $((waited / 60)) min; Sperre hält: ${owner:-?} (seit $((age / 60)) min)"
      if [ -n "$owner_pid" ] && [ "$age" -ge "${HEAVY_LOCK_MAX_HOLD:-2700}" ]; then
        _hl_hold_report "$owner" "$age"
      fi
    fi
    sleep "$poll"
  done
  echo "$$ $name $(date -u +%H:%M:%S)" > "$HEAVY_LOCK_DIR/owner"
  _HL_HELD=1
  local waited_total=$(( $(date +%s) - start ))
  _hl_log "Sperre genommen nach ${waited_total}s Warten (pid $$, $name)"
  trap '_hl_on_exit' EXIT
  trap '_hl_on_signal 129' HUP
  trap '_hl_on_signal 130' INT
  trap '_hl_on_signal 143' TERM
  if ! heavy_mem_check; then
    heavy_lock_release
    return 76
  fi
  return 0
}

# Gibt die Sperre frei, aber nur die eigene (nie die eines anderen Prozesses).
heavy_lock_release() {
  [ "$_HL_HELD" = 1 ] || return 0
  local owner_pid
  owner_pid=$(cut -d' ' -f1 "$HEAVY_LOCK_DIR/owner" 2>/dev/null)
  [ "$owner_pid" = "$$" ] && rm -rf "$HEAVY_LOCK_DIR"
  _HL_HELD=0
}

# Weitere Aufräumfunktion für Exit/Signal registrieren (läuft vor der Freigabe der Sperre).
heavy_on_exit() { _HL_EXIT_HOOKS+=("$1"); trap '_hl_on_exit' EXIT; }

_hl_on_exit() {
  local status=$? h
  for h in "${_HL_EXIT_HOOKS[@]+"${_HL_EXIT_HOOKS[@]}"}"; do "$h" || true; done
  _HL_EXIT_HOOKS=()
  heavy_lock_release
  return "$status"
}

_hl_on_signal() { exit "$1"; }  # exit löst den EXIT-trap aus

# Als Hülle aufgerufen (nicht per source)
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ $# -ge 1 ] || { sed -n '2,8p' "$0"; exit 2; }
  heavy_lock_acquire || exit $?
  "$@"
  exit $?
fi
