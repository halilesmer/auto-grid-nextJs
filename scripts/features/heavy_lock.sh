#!/usr/bin/env bash
# Maschinenweite Sperre für schwere Testläufe (SYS-11): auf diesem Mac läuft immer nur EIN
# voller e2e-Lauf / next build / precheck, egal aus welchem Worktree.
#
#   scripts/features/heavy_lock.sh <befehl …>     als Hülle: wartet, nimmt die Sperre, führt den Befehl aus
#   source scripts/features/heavy_lock.sh         als Bibliothek: heavy_lock_acquire / heavy_lock_release
#
# Sperre: Verzeichnis /tmp/gridrobot-heavy.lock (mkdir ist atomar), darin `owner`:
#   "<pid> <worktree-name> <HH:MM:SS UTC> ls=<Startzeit des Prozesses>"
# Die ersten drei Felder sind unverändert (ältere Skripte lesen nur sie); `ls=` ist ein optionales
# viertes Feld (`ps -o lstart` mit _ statt Leerzeichen). Es hält fest, WELCHER Prozess die Sperre
# nahm: Hat die pid inzwischen ein anderer Prozess (pid-Wiederverwendung), gilt die Sperre als
# veraltet, und HEAVY_LOCK_BREAK beendet nie diesen fremden Prozess. Ein owner ohne `ls=` (älteres
# Skript) bleibt gültig und wird nur nach der pid beurteilt.
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
# Veraltete Sperre: ist das erste owner-Feld eine pid und lebt der Prozess nicht mehr (kill -0;
# „Operation not permitted“ zählt als lebendig, ebenso ein Treffer von ps -p) oder ist die pid
# einem anderen Prozess zugewiesen (ls= passt nicht), wird sie gelöscht. Jedes Löschen läuft durch
# einen zweiten Mutex (Verzeichnis <sperre>.break) und liest owner dort noch einmal: sonst löschte ein
# Wartender mit veraltetem Wissen die frische Sperre eines anderen (R3-03). Andere Skripte und Gespräche nutzen dasselbe Verzeichnis: Format einhalten.
# Ein Sperrverzeichnis ohne `owner` gilt nach 60 s als verwaist.
# Wiedereintritt: hält ein Vorfahr dieses Prozesses die Sperre (z. B. heavy_lock.sh precheck.sh),
# läuft der Befehl ohne erneutes Warten.
# Reihenfolge (FIFO): jeder Wartende legt beim Eintreffen eine Fahrkarte <sperre>.queue/<µs-Ankunftszeit>-<pid>
# an (Inhalt: gleiches Format wie owner, mit ls=). Ein Wartender versucht das mkdir nur, wenn seine
# Fahrkarte die älteste LEBENDE ist; so bekommt nicht der zuerst Pollende die Sperre, sondern der
# am längsten Wartende. Tote Fahrkarten (pid lebt nicht oder ls= passt nicht) löscht jeder Wartende beim
# Prüfen (rm -f einer Datei, die nie wieder lebendig wird, braucht keinen Mutex); eine tote Fahrkarte vorn
# hält also niemanden auf. Die Fahrkarte verschwindet beim Nehmen der Sperre, bei Zeitlimit, Wiedereintritt,
# Exit, Fehler und INT/TERM/HUP. owner und Sperrverzeichnis sind unverändert: ein älteres Skript kennt
# keine Fahrkarten und pollt weiter selbst; es kann die Reihenfolge überspringen, verklemmt aber nichts
# (wer frei sieht, nimmt; ein Wartender mit Fahrkarte versucht es bei jeder Prüfung wieder).
# Freigabe per trap bei Exit, Fehler und INT/TERM/HUP; der Exit-Code des Befehls bleibt erhalten.
# kill -9 lässt sich nicht abfangen: dann räumt der nächste Wartende die Sperre (pid + ls=).

HEAVY_LOCK_DIR="${HEAVY_LOCK_DIR:-/tmp/gridrobot-heavy.lock}"
_HL_HELD=0          # 1 = dieser Prozess hat die Sperre angelegt und gibt sie frei
_HL_OWNER_SET=0     # 1 = owner wurde geschrieben (leerer owner heißt dann: Verzeichnis ist nicht mehr unser)
_HL_EXIT_HOOKS=()   # weitere Aufräumfunktionen (heavy_on_exit)

_hl_log() { echo "[heavy-lock] $*" >&2; }

_hl_mtime() {  # mtime in s; 0 wenn die Datei fehlt. GNU (CI) zuerst, BSD (macOS) nur, wenn stat -c fehlt.
  local m
  if m=$(stat -c %Y "$1" 2>/dev/null); then echo "$m"; return; fi
  # Fehlt die Datei, darf es kein Rückfall auf `stat -f` geben: unter GNU liefert -f Dateisystem-Angaben
  # statt einer Zahl (und ein Wert in $(( )) bricht die Funktion ab).
  if ! stat -c %Y / >/dev/null 2>&1 && m=$(stat -f %m "$1" 2>/dev/null); then echo "$m"; return; fi
  echo 0
}

# --- Prozess-Identität (R3-04, R3-10) -----------------------------------------------------------

_hl_pid_alive() {  # $1 = pid. Lebt der Prozess? EPERM („Operation not permitted“) heißt: er lebt.
  local err
  err=$(LC_ALL=C kill -0 "$1" 2>&1) && return 0
  case "$err" in *[Pp]ermitted*) return 0 ;; esac
  ps -p "$1" >/dev/null 2>&1  # zweite Meinung, falls kill -0 nicht zuverlässig antwortet
}

_hl_lstart() {  # $1 = pid; Startzeit als ein Wort (Leerzeichen → _), leer wenn nicht lesbar
  LC_ALL=C ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' '_' | sed 's/^_//; s/_$//'
}

_hl_owner_start() {  # $1 = owner-Zeile; Wert des ls=-Feldes oder leer (älteres Format)
  printf '%s\n' "$1" | tr ' ' '\n' | sed -n 's/^ls=//p' | head -n 1
}

_hl_owner_alive() {  # $1 = owner-Zeile: wahr, wenn derselbe Prozess noch lebt
  local pid=${1%% *} rec act
  _hl_pid_alive "$pid" || return 1
  rec=$(_hl_owner_start "$1")
  [ -n "$rec" ] || return 0   # älteres Format: nur die pid zählt
  act=$(_hl_lstart "$pid")
  [ -n "$act" ] || return 0   # Startzeit nicht lesbar: im Zweifel lebendig
  [ "$act" = "$rec" ]
}

# Sperre löschen, aber nur wenn owner IN DIESER Sekunde noch dem erwarteten Wert entspricht.
# Alle Löschvorgänge laufen durch den Mutex <sperre>.break, damit zwischen Prüfung und rm niemand
# die Sperre löscht und neu nimmt (R3-03). $1 = erwarteter owner ("" = ohne owner),
# $2 = Mindestalter in s, nur bei leerem owner (frisches Verzeichnis eines Anderen bleibt).
# Rückgabe 0 = gelöscht, 1 = nicht gelöscht.
_hl_remove() {
  local expected=$1 minage=${2:--1} brk="$HEAVY_LOCK_DIR.break" tries=0 cur age mt rc=1
  while ! mkdir "$brk" 2>/dev/null; do
    # Mutex hängt (Prozess zwischen mkdir und rmdir getötet): nach 30 s übernehmen
    mt=$(_hl_mtime "$brk")
    [ "$mt" = 0 ] && continue   # Mutex ist gerade verschwunden: neu versuchen, nie „veraltet“ löschen
    if [ $(( $(date +%s) - mt )) -gt 30 ]; then rmdir "$brk" 2>/dev/null; continue; fi
    tries=$((tries + 1))
    [ "$tries" -gt 200 ] && return 1
    sleep 0.05
  done
  cur=$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)
  if [ -d "$HEAVY_LOCK_DIR" ] && [ "$cur" = "$expected" ]; then
    if [ -f "$HEAVY_LOCK_DIR/owner" ]; then age=$(( $(date +%s) - $(_hl_mtime "$HEAVY_LOCK_DIR/owner") ))
    else age=$(( $(date +%s) - $(_hl_mtime "$HEAVY_LOCK_DIR") )); fi
    if [ -n "$expected" ] || [ "$age" -gt "$minage" ]; then
      rm -rf "$HEAVY_LOCK_DIR" && rc=0
    fi
  fi
  rmdir "$brk" 2>/dev/null
  return $rc
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
  # Identität unmittelbar vor dem Beenden prüfen: gehört die pid inzwischen einem anderen Prozess,
  # wird nur die Sperre gelöscht, nie dieser Prozess beendet (R3-04).
  if ! _hl_owner_alive "$1"; then
    _hl_log "HEAVY_LOCK_BREAK=1: pid $pid gehört nicht mehr dem Halter ($1): kein Prozess beendet, nur die Sperre gelöscht"
    _hl_remove "$1"
    return 0
  fi
  tree=$(_hl_tree "$pid" | tr '\n' ' ')
  _hl_log "HEAVY_LOCK_BREAK=1: beende Prozessbaum des Halters ($1): $tree"
  kill $tree 2>/dev/null
  local i=0
  while _hl_pid_alive "$pid" && [ "$i" -lt 40 ]; do sleep 0.25; i=$((i + 1)); done
  kill -9 $tree 2>/dev/null
  _hl_remove "$1"
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

# --- Warteschlange (FIFO) -------------------------------------------------------------------------

_HL_TICKET=""   # Pfad der eigenen Fahrkarte, solange wir warten
_HL_POS=1       # Platz in der Schlange (1 = vorn), gesetzt von _hl_my_turn

_hl_usec() {  # Ankunftszeit in µs, 16 Stellen (sortierbar); ohne perl auf Sekunden genau
  perl -MTime::HiRes=time -e 'printf "%016d\n", time*1e6' 2>/dev/null \
    || printf '%016d\n' $(( $(date +%s) * 1000000 ))
}

_hl_ticket_take() {  # $1 = Name des Worktrees; legt die Fahrkarte atomar an (tmp + mv)
  local q="$HEAVY_LOCK_DIR.queue" mystart tmp
  mkdir -p "$q" 2>/dev/null || return 0
  mystart=$(_hl_lstart "$$")
  tmp="$q/.tmp-$$"
  echo "$$ $1 $(date -u +%H:%M:%S)${mystart:+ ls=$mystart}" > "$tmp" 2>/dev/null || return 0
  _HL_TICKET="$q/$(_hl_usec)-$$"
  mv -f "$tmp" "$_HL_TICKET" 2>/dev/null || { _HL_TICKET=""; rm -f "$tmp"; }
}

_hl_ticket_drop() {
  [ -n "$_HL_TICKET" ] && rm -f "$_HL_TICKET" 2>/dev/null
  _HL_TICKET=""   # das leere Verzeichnis <sperre>.queue bleibt: ein rmdir liefe gegen ein gleichzeitiges Anlegen
}

# Wahr, wenn die eigene Fahrkarte die älteste lebende ist (oder keine Fahrkarte da ist: dann FIFO aus).
# Löscht tote Fahrkarten; setzt _HL_POS.
_hl_my_turn() {
  [ -n "$_HL_TICKET" ] || return 0
  local q="$HEAVY_LOCK_DIR.queue" f line pid pos=0 mine
  mine=$(basename "$_HL_TICKET")
  [ -e "$_HL_TICKET" ] || { _hl_log "Fahrkarte verschwunden, lege neu an"; _hl_ticket_take "${_HL_NAME:-?}"; return 1; }
  for f in $(ls "$q" 2>/dev/null | sort); do
    line=$(cat "$q/$f" 2>/dev/null)
    pid=${line%% *}
    if [ -z "$line" ] || ! [[ "$pid" =~ ^[0-9]+$ ]] || ! _hl_owner_alive "$line"; then
      [ "$f" = "$mine" ] || { rm -f "$q/$f"; _hl_log "tote Fahrkarte entfernt ($f)"; }
      continue
    fi
    pos=$((pos + 1))
    if [ "$f" = "$mine" ]; then _HL_POS=$pos; [ "$pos" = 1 ]; return; fi
  done
  _HL_POS=1
  return 0
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
  _HL_NAME=$name
  local last_pos=0
  _hl_ticket_take "$name"
  # traps vor dem Warten: auch ein abgebrochener Wartender gibt seine Fahrkarte frei
  trap '_hl_on_exit' EXIT
  trap '_hl_on_signal 129' HUP
  trap '_hl_on_signal 130' INT
  trap '_hl_on_signal 143' TERM
  while ! { _hl_my_turn && mkdir "$HEAVY_LOCK_DIR" 2>/dev/null; }; do
    owner=$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)
    owner_pid=${owner%% *}
    # Nur eine reine Zahl ist eine pid. Ein anderes Format (andere Skripte, andere Gespräche) gilt
    # als fremder Halter: nie per kill -0 als tot werten, sondern warten.
    foreign=0
    # pid 0 und 1 sind nie ein Halter (ein Baum ab pid 1 wäre die ganze Maschine): auch fremd.
    if [ -n "$owner" ] && { ! [[ "$owner_pid" =~ ^[0-9]+$ ]] || [ "$owner_pid" -le 1 ]; }; then
      foreign=1
      owner_pid=""
    fi
    if [ -n "$owner_pid" ] && ! _hl_owner_alive "$owner"; then
      # Zwei Wartende können dieselbe tote Sperre sehen: _hl_remove prüft owner im Mutex noch einmal.
      if _hl_remove "$owner"; then
        _hl_log "veraltete Sperre gelöscht (pid $owner_pid lebt nicht mehr oder gehört einem anderen Prozess: $owner)"
      fi
      continue
    fi
    if [ -n "$owner_pid" ] && _hl_is_ancestor "$owner_pid"; then
      _hl_log "Sperre hält schon ein Vorfahr (pid $owner_pid), weiter ohne Warten"
      _hl_ticket_drop
      return 0
    fi
    now=$(date +%s)
    if [ -f "$HEAVY_LOCK_DIR/owner" ]; then
      age=$(( now - $(_hl_mtime "$HEAVY_LOCK_DIR/owner") ))
    else
      age=$(( now - $(_hl_mtime "$HEAVY_LOCK_DIR") ))
    fi
    [ -d "$HEAVY_LOCK_DIR" ] || age=0   # Sperre gerade frei (der vorderste Wartende ist dran): kein Alter
    if [ -z "$owner" ] && [ -d "$HEAVY_LOCK_DIR" ] && [ "$age" -gt 60 ]; then
      _hl_remove "" 60 && _hl_log "verwaiste Sperre ohne owner (${age}s) gelöscht"
      continue
    fi
    waited=$(( now - start ))
    if [ "$timeout" -gt 0 ] && [ "$waited" -ge "$timeout" ]; then
      _hl_log "Zeitlimit ${timeout}s erreicht, Sperre hält: ${owner:-?} (seit $((age / 60)) min)"
      _hl_ticket_drop
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
        if _hl_remove "$owner"; then
          _hl_log "WARNUNG: fremde Sperre (owner ohne pid: \"$owner\") nach ${fheld}s wacher Wartezeit gelöscht."
          _hl_log "  Nur das Verzeichnis wurde gelöscht, kein Prozess beendet. Läuft der Halter noch, laufen jetzt zwei schwere Läufe."
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
    if [ $(( waited / 120 )) -ne "$last_msg" ] || [ "$_HL_POS" != "$last_pos" ] || { [ "$idle" -ge "$max_idle" ] && [ "${_HL_WARNED:-}" != "$owner" ]; }; then
      last_msg=$(( waited / 120 ))
      last_pos=$_HL_POS
      _hl_log "warte seit $((waited / 60)) min, sitze an ${_HL_POS}. Stelle der Schlange; Sperre hält: ${owner:-frei, vorderster Wartender ist dran} (seit $((age / 60)) min)"
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
  # traps stehen schon (vor dem Warten): ein Signal direkt nach mkdir gibt die Sperre frei
  _HL_HELD=1
  _hl_ticket_drop
  local mystart
  mystart=$(_hl_lstart "$$")
  echo "$$ $name $(date -u +%H:%M:%S)${mystart:+ ls=$mystart}" > "$HEAVY_LOCK_DIR/owner"
  _HL_OWNER_SET=1
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
  local cur
  cur=$(cat "$HEAVY_LOCK_DIR/owner" 2>/dev/null)
  if [ "${cur%% *}" = "$$" ] && [ -n "$cur" ]; then
    _hl_remove "$cur"
  elif [ -z "$cur" ] && [ "$_HL_OWNER_SET" = 0 ]; then
    _hl_remove ""   # mkdir war unser, owner noch nicht geschrieben (ein Signal dazwischen)
  fi
  # leerer owner nach dem Schreiben: das Verzeichnis gehört nicht mehr uns (gelöscht, ggf. neu genommen)
  _HL_HELD=0
  _HL_OWNER_SET=0
}

# Weitere Aufräumfunktion für Exit/Signal registrieren (läuft vor der Freigabe der Sperre).
heavy_on_exit() { _HL_EXIT_HOOKS+=("$1"); trap '_hl_on_exit' EXIT; }

_hl_cleanup() {  # Hooks + Freigabe; mehrfach aufrufbar
  local h
  for h in "${_HL_EXIT_HOOKS[@]+"${_HL_EXIT_HOOKS[@]}"}"; do "$h" || true; done
  _HL_EXIT_HOOKS=()
  _hl_ticket_drop
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
