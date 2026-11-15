#!/usr/bin/env bash
# Claude Code PreToolUse (Bash): engellt kapsamsız pkill/killall (SYS-16).
# Neden: `pkill -f "scripts/features/precheck.sh"` bütün worktree'lerdeki koşuları öldürür; kilidi tutan
# e2e koşusu ve kuyruktaki koşular birkaç saniyede gitti (teşhis 2026-11-15, journal).
# Engellenir (exit 2, stderr Claude'a döner), run_in_background olsa da:
#   - `pkill` / `killall` komutu (çıplak, tam yolla, `env [VAR=..]` ya da `\` ile yazılsa da)
#   - `pgrep …` + `kill` (`pgrep … | xargs kill`, `kill $(pgrep …)`)
#   ve komutun kalıbı bu checkout'un yolunu içermiyorsa.
# İzinli: kalıp bu checkout'un yolunu ($CLAUDE_PROJECT_DIR ya da gerçek yol) içerir; `kill <pid>`;
# `kill $(lsof -ti tcp:<port>)`; pkill sözcüğünü komut olarak kullanmayan komutlar (echo, grep):
# tırnak içindeki ; & | ( ayırıcı sayılmaz.
# Girdi: stdin'de hook JSON'u (tool_input.command).

input="$(cat)"
[ -z "$input" ] && exit 0

# shellcheck source=../lib/checks.sh
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$HOOK_DIR/lib/checks.sh"

cmd="$(json_get tool_input.command <<< "$input")"
[ -z "$cmd" ] && exit 0

ROOT="$(cd "$HOOK_DIR/.." && pwd -P)"
ROOT_LOGICAL="$(cd "$HOOK_DIR/.." && pwd)"

# Tırnak farkındalıklı bölücü: ; & | ( ` ve satır sonu yalnız tırnak DIŞINDA ayırıcıdır.
# Çift tırnak içinde yalnız `$(` ve ` ayırıcı sayılır (komut yerine koyma çalışır); tek tırnak içinde hiçbiri.
split_cmd() {
  local str="$1" i ch nx q="" out="" len=${#1}
  for ((i = 0; i < len; i++)); do
    ch="${str:i:1}"
    nx="${str:i+1:1}"
    if [ "$q" = "'" ]; then
      [ "$ch" = "'" ] && q=""
      out+="$ch"
      continue
    fi
    if [ "$ch" = "\\" ]; then
      out+="$ch$nx"
      i=$((i + 1))
      continue
    fi
    if [ "$q" = '"' ]; then
      if [ "$ch" = '"' ]; then
        q=""
        out+="$ch"
      elif [ "$ch" = '`' ] || { [ "$ch" = '$' ] && [ "$nx" = '(' ]; }; then
        out+=$'\n'
        [ "$ch" = '$' ] && i=$((i + 1)) # `(` ayrıca eklenmesin
      else
        out+="$ch"
      fi
      continue
    fi
    case "$ch" in
      "'") q="'"; out+="$ch" ;;
      '"') q='"'; out+="$ch" ;;
      ';' | '&' | '|' | '(' | '`' | $'\n') out+=$'\n' ;;
      *) out+="$ch" ;;
    esac
  done
  printf '%s\n' "$out"
}

has_kill=0
printf '%s' "$cmd" | tr '\n\t' '  ' | grep -Eq '(^|[^[:alnum:]_.-])kill([[:space:]]|$)' && has_kill=1

# Parçayı normalleştirir: baştaki boşluk/tırnak/$, sarmalayıcılar (sudo, env, VAR=.., xargs, bayraklar …),
# komut adında tam yol ve ters eğik çizgi.
normalize() {
  local s="$1" n
  while :; do
    n="$(printf '%s' "$s" | sed -E "s/^[[:space:]\"'\$]+//; s/^((ba|z)?sh[[:space:]]+-c|sudo|xargs|exec|time|nohup|then|do|else|command|env)[[:space:]]+//; s/^-[-[:alnum:]]*[[:space:]]+//; s/^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+//; s#^\\\\?([^[:space:]]*/)?(pkill|killall|pgrep)([[:space:]]|\$)#\2\3#")"
    [ "$n" = "$s" ] && break
    s="$n"
  done
  printf '%s' "$s"
}

bad=""
check_segments() {
  local seg s inner
  while IFS= read -r seg; do
    # sh -c '…' / bash -c "…": içeriği tırnaksız yeniden böl ve ayrıca denetle
    if printf '%s' "$seg" | grep -Eq "^[[:space:]]*((ba|z)?sh)[[:space:]]+-c[[:space:]]+"; then
      inner="$(printf '%s' "$seg" | sed -E "s/^[[:space:]]*(ba|z)?sh[[:space:]]+-c[[:space:]]+//; s/^[\"']//; s/[\"']\$//")"
      check_segments < <(split_cmd "$inner")
      [ -n "$bad" ] && return
    fi
    s="$(normalize "$seg")"
    case "$s" in
      pkill | pkill\ * | killall | killall\ *) ;;
      pgrep\ *) [ "$has_kill" = 1 ] || continue ;;
      *) continue ;;
    esac
    case "$s" in
      *"$ROOT"* | *"$ROOT_LOGICAL"* | *'$CLAUDE_PROJECT_DIR'* | *'${CLAUDE_PROJECT_DIR}'*) continue ;;
    esac
    bad="$s"
    return
  done
}

check_segments < <(split_cmd "$(printf '%s' "$cmd" | tr '\t' ' ')")

[ -z "$bad" ] && exit 0

cat >&2 <<EOF
✗ pre-bash-kill (SYS-16): kapsamsız öldürme komutu: ${bad:0:120}
  Bu kalıp başka worktree'lerin koşularını da öldürür (precheck, playwright, next). Bunun yerine:
  - Kendi arka plan işini görev kimliğiyle durdur (TaskStop).
  - Kendi precheck koşunu durdur: scripts/features/precheck.sh --stop (yalnız bu checkout'un koşusu).
  - Süreci kendi yolunla süz: pkill -f "\$CLAUDE_PROJECT_DIR/<yol>" ya da kill <pid>.
  Kural: hooks/RULES.md §4.16.
EOF
exit 2
