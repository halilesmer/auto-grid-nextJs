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
#   HEAVY_LOCK_MAX_IDLE=<s>  zeigt der Prozessbaum des Halters so lange keinen Fortschritt (Standard
#                            600 = 10 min), warnt der Wartende mit Halter, Prozess, letztem Schritt und
#                            CPU-Zeit. Fortschritt = CPU-Zeit des Baums oder seine Prozessliste ändert sich.
#                            Gezählt wird nur Wartezeit zwischen zwei Prüfungen; ein Uhrsprung (Mac schlief,
#                            Abstand > Prüfintervall + HEAVY_LOCK_SLEEP_GAP, Standard 60 s) setzt den Zähler zurück. Kein Wanduhr-Limit:
#                            nach dem Ruhezustand sähe sonst jeder Halter hängend aus.
#   HEAVY_LOCK_BREAK=1       nach MAX_IDLE den Prozessbaum des Halters beenden und die Sperre nehmen
#   HEAVY_LOCK_FOREIGN_MAX=<s>  fremder Halter (erstes owner-Feld keine Zahl, z. B. Skript eines anderen
#                            Gesprächs): nie als tot werten; Verzeichnis erst nach so viel wacher Wartezeit
#                            löschen (Standard 10800 = 3 h), mit HEAVY_LOCK_BREAK=1 schon nach MAX_IDLE.
#                            Kein Prozess wird beendet.
#   HEAVY_LOCK_SKIP_MEM_CHECK=1  Speicherprüfung vor dem Lauf auslassen
#   HEAVY_LOCK_SWAP_MAX=<%>  (90), HEAVY_LOCK_MEM_MIN=<%> (20), HEAVY_LOCK_MEM_WINDOW=<s> (120):
#                            nach dem Nehmen der Sperre startet der Lauf nicht (Exit 76), wenn
#                            Swap ≥ SWAP_MAX UND freier Speicher (kern.memorystatus_level) < MEM_MIN
#                            über das ganze Fenster anhält (Prüfung alle 10 s); nur macOS. Swap allein
#                            reicht nicht: macOS gibt Swap erst frei, wenn die Seiten gebraucht werden,
#                            und direkt nach dem Aufwachen ist der Druck nur kurz hoch.
#
# Fortschritt: precheck.sh schreibt mit heavy_lock_step <name> den laufenden Schritt nach <sperre>/step.
#
# Veraltete Sperre: ist das erste owner-Feld eine pid und lebt der Prozess nicht mehr (kill -0),
# wird sie gelöscht. Andere Skripte und Gespräche nutzen dasselbe Verzeichnis: Format einhalten.
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

_hl_cpu_cs() {  # CPU-Zeit des ganzen Prozessbaums von $1 in Hundertstelsekunden
  local pids
  pids=$(_hl_tree "$1" | paste -sd, -)
  # ps time: [[dd-]hh:]mm:ss[.cc]
  ps -o time= -p "$pids" 2>/dev/null | awk '{
      n = split($1, a, /[-:]/); s = 0
      if (n == 4) s = a[1]*86400 + a[2]*3600 + a[3]*60 + a[4]
      else for (i = 1; i <= n; i++) s = s*60 + a[i]
      t += s
    } END { printf "%d\n", t*100 }'
}

_hl_signature() {  # Fortschrittsmerkmal des Halters: CPU-Zeit + Prozessliste
  echo "$(_hl_cpu_cs "$1") $(_hl_tree "$1" | sort -n | paste -sd, -)"
}

# Laufenden Schritt für Wartende sichtbar machen (ändert owner nicht)
heavy_lock_step() {
  [ "$_HL_HELD" = 1 ] || return 0
  echo "$1 $(date -u +%H:%M:%S)" > "$HEAVY_LOCK_DIR/step" 2>/dev/null || true
}

_hl_idle_report() {  # $1 owner, $2 Leerlauf (s)
  local pid=${1%% *} step
  step=$(cat "$HEAVY_LOCK_DIR/step" 2>/dev/null)
  _hl_log "WARNUNG: Halter ohne Fortschritt seit ${2}s (Grenze ${HEAVY_LOCK_MAX_IDLE:-600}s): $1"
  _hl_log "  Prozess: $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-100)"
  _hl_log "  letzter Schritt: ${step:-unbekannt} · CPU des Prozessbaums: $(( $(_hl_cpu_cs "$pid") / 100 ))s, unverändert"
  _hl_log "  beenden: im Besitzer-Worktree den Lauf stoppen, oder hier HEAVY_LOCK_BREAK=1 (beendet pid $pid samt Nachfahren)"
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

_HL_MEM=""  # letzte Messung: "<used>M/<total>M (<pct>%), frei <level>%"
_hl_mem_bad() {  # wahr bei Speicherdruck jetzt; ohne macOS-Werte nie
  local level swap used total pct
  level=$(sysctl -n kern.memorystatus_level 2>/dev/null) || return 1
  swap=$(sysctl -n vm.swapusage 2>/dev/null) || return 1
  total=$(echo "$swap" | awk '{gsub("M","",$3); print int($3)}')
  used=$(echo "$swap" | awk '{gsub("M","",$6); print int($6)}')
  [ -n "$level" ] && [ "${total:-0}" -gt 0 ] || return 1
  pct=$(( used * 100 / total ))
  _HL_MEM="Swap ${used}M/${total}M (${pct}%), freier Speicher ${level}%"
  [ "$pct" -ge "${HEAVY_LOCK_SWAP_MAX:-90}" ] && [ "$level" -lt "${HEAVY_LOCK_MEM_MIN:-20}" ]
}

# Speicherdruck vor dem Lauf (nur macOS). 0 = ok, 1 = Druck hält über das ganze Fenster an
heavy_mem_check() {
  [ "${HEAVY_LOCK_SKIP_MEM_CHECK:-0}" = 1 ] && return 0
  _hl_mem_bad || return 0
  local window="${HEAVY_LOCK_MEM_WINDOW:-120}" t0
  t0=$(date +%s)
  _hl_log "Speicherdruck: $_HL_MEM; prüfe ${window}s lang, ob er nachlässt"
  while [ $(( $(date +%s) - t0 )) -lt "$window" ]; do
    sleep 10
    _hl_mem_bad || { _hl_log "Speicherdruck vorbei: $_HL_MEM"; return 0; }
  done
  _hl_log "ABBRUCH: zu wenig Speicher seit ${window}s: $_HL_MEM."
  _hl_log "  Andere Läufe/Apps beenden und neu starten, oder HEAVY_LOCK_SKIP_MEM_CHECK=1."
  return 1
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
  local last_t sig last_sig="" last_owner="" idle=0 gap jump foreign fheld=0
  start=$(date +%s)
  last_t=$start
  local name
  name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
  while ! mkdir "$HEAVY_LOCK_DIR" 2>/dev/null; do
    owner=$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)
    owner_pid=${owner%% *}
    # Nur eine reine Zahl ist eine pid. Ein anderes Format (andere Skripte, andere Gespräche) gilt
    # als fremder Halter: nie per kill -0 als tot werten, sondern warten.
    foreign=0
    if [ -n "$owner" ] && ! [[ "$owner_pid" =~ ^[0-9]+$ ]]; then
      foreign=1
      owner_pid=""
    fi
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
    if [ -z "$owner" ] && [ -d "$HEAVY_LOCK_DIR" ] && [ "$age" -gt 60 ]; then
      _hl_log "verwaiste Sperre ohne owner (${age}s) gelöscht"
      rm -rf "$HEAVY_LOCK_DIR"
      continue
    fi
    waited=$(( now - start ))
    if [ "$timeout" -gt 0 ] && [ "$waited" -ge "$timeout" ]; then
      _hl_log "Zeitlimit ${timeout}s erreicht, Sperre hält: ${owner:-?} (seit $((age / 60)) min)"
      return 75
    fi
    # Leerlauf des Halters: nur Wartezeit ohne Fortschritt zählt, ein Uhrsprung (Ruhezustand) setzt zurück
    gap=$(( now - last_t ))
    last_t=$now
    jump=0
    if [ "$gap" -gt $(( ${poll%.*} + ${HEAVY_LOCK_SLEEP_GAP:-60} )) ]; then
      jump=1
      _hl_log "Uhrsprung ${gap}s zwischen zwei Prüfungen (Ruhezustand?): Leerlaufzähler zurückgesetzt"
    fi
    if [ -n "$owner_pid" ]; then
      sig=$(_hl_signature "$owner_pid")
      if [ "$owner" != "$last_owner" ] || [ "$jump" = 1 ]; then
        idle=0
      elif [ "$sig" = "$last_sig" ]; then
        idle=$(( idle + gap ))
      else
        idle=0
      fi
      last_sig=$sig
    fi
    local max_idle="${HEAVY_LOCK_MAX_IDLE:-600}"
    # Fremder Halter: kein Fortschritt messbar. Gezählt wird nur die wache Wartezeit dieses Prozesses
    # (Uhrsprung zählt nicht), damit ein Ruhezustand die Sperre nicht „alt“ macht.
    if [ "$foreign" = 1 ]; then
      if [ "$owner" != "$last_owner" ]; then
        fheld=0
      elif [ "$jump" = 0 ]; then
        fheld=$(( fheld + gap ))
      fi
      local fmax="${HEAVY_LOCK_FOREIGN_MAX:-10800}"
      if [ "$fheld" -ge "$fmax" ] || { [ "${HEAVY_LOCK_BREAK:-0}" = 1 ] && [ "$fheld" -ge "$max_idle" ]; }; then
        if [ "$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)" = "$owner" ]; then
          _hl_log "WARNUNG: fremde Sperre (owner ohne pid: \"$owner\") nach ${fheld}s wacher Wartezeit gelöscht."
          _hl_log "  Nur das Verzeichnis wurde gelöscht, kein Prozess beendet. Läuft der Halter noch, laufen jetzt zwei schwere Läufe."
          rm -rf "$HEAVY_LOCK_DIR"
        fi
        last_owner=""
        continue
      fi
    fi
    last_owner=$owner
    if [ -n "$owner_pid" ] && [ "$idle" -ge "$max_idle" ] && [ "${HEAVY_LOCK_BREAK:-0}" = 1 ]; then
      _hl_idle_report "$owner" "$idle"
      _hl_break "$owner"
      continue
    fi
    if [ $(( waited / 120 )) -ne "$last_msg" ] || { [ "$idle" -ge "$max_idle" ] && [ "${_HL_WARNED:-}" != "$owner" ]; }; then
      last_msg=$(( waited / 120 ))
      _hl_log "warte seit $((waited / 60)) min; Sperre hält: ${owner:-?} (seit $((age / 60)) min)"
      if [ "$foreign" = 1 ]; then
        _hl_log "  fremder Halter (owner ohne pid, anderes Skript?): wird nicht als tot gewertet; gelöscht erst nach $(( ${HEAVY_LOCK_FOREIGN_MAX:-10800} / 60 )) min wacher Wartezeit oder mit HEAVY_LOCK_BREAK=1 nach $(( max_idle / 60 )) min"
      fi
      if [ -n "$owner_pid" ] && [ "$idle" -ge "$max_idle" ]; then
        _hl_idle_report "$owner" "$idle"
        _HL_WARNED=$owner
      fi
    fi
    sleep "$poll"
  done
  # traps vor owner: ein Signal direkt nach mkdir gibt die Sperre sonst nie frei
  _HL_HELD=1
  trap '_hl_on_exit' EXIT
  trap '_hl_on_signal 129' HUP
  trap '_hl_on_signal 130' INT
  trap '_hl_on_signal 143' TERM
  echo "$$ $name $(date -u +%H:%M:%S)" > "$HEAVY_LOCK_DIR/owner"
  local waited_total=$(( $(date +%s) - start ))
  _hl_log "Sperre genommen nach ${waited_total}s Warten (pid $$, $name)"
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
  # leer = mkdir war unser, owner noch nicht geschrieben
  if [ -z "$owner_pid" ] || [ "$owner_pid" = "$$" ]; then rm -rf "$HEAVY_LOCK_DIR"; fi
  _HL_HELD=0
}

# Weitere Aufräumfunktion für Exit/Signal registrieren (läuft vor der Freigabe der Sperre).
heavy_on_exit() { _HL_EXIT_HOOKS+=("$1"); trap '_hl_on_exit' EXIT; }

_hl_cleanup() {  # Hooks + Freigabe; mehrfach aufrufbar
  local h
  for h in "${_HL_EXIT_HOOKS[@]+"${_HL_EXIT_HOOKS[@]}"}"; do "$h" || true; done
  _HL_EXIT_HOOKS=()
  heavy_lock_release
}

_hl_on_exit() {
  local status=$?
  # Ein zweites Signal während des Aufräumens würde bash beenden, bevor die Sperre frei ist
  trap '' HUP INT TERM
  _hl_cleanup
  return "$status"
}

# Signal: selbst aufräumen, dann beenden. Kommt das Signal, während der EXIT-trap schon läuft
# (vor dessen `trap ''`), beendet exit hier bash ohne Rest des EXIT-traps: deshalb nicht darauf bauen.
_hl_on_signal() {
  trap '' HUP INT TERM
  _hl_cleanup
  exit "$1"
}

# Als Hülle aufgerufen (nicht per source)
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ $# -ge 1 ] || { sed -n '2,8p' "$0"; exit 2; }
  heavy_lock_acquire || exit $?
  "$@"
  exit $?
fi
