#!/usr/bin/env bash
# Claude Code PreToolUse (Bash): engellt kapsamsız pkill/killall (SYS-16).
# Neden: `pkill -f "scripts/features/precheck.sh"` bütün worktree'lerdeki koşuları öldürür; kilidi tutan
# e2e koşusu ve kuyruktaki koşular birkaç saniyede gitti (teşhis 2026-11-15, journal).
# Engellenir (exit 2, stderr Claude'a döner), run_in_background olsa da:
#   - `pkill` / `killall` komutu
#   - `pgrep …` + `kill` (`pgrep … | xargs kill`, `kill $(pgrep …)`)
#   ve komutun kalıbı bu checkout'un yolunu içermiyorsa.
# İzinli: kalıp bu checkout'un yolunu ($CLAUDE_PROJECT_DIR ya da gerçek yol) içerir; `kill <pid>`;
# `kill $(lsof -ti tcp:<port>)`; pkill sözcüğünü komut olarak kullanmayan komutlar (echo, grep).
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

# Komutu alt komutlara böl: ; && || | satır sonu ( ve ` ayırıcıdır.
segments="$(printf '%s' "$cmd" | tr '\t' ' ' | sed -E 's/&&|\|\||[;&|(`]/\
/g')"

has_kill=0
printf '%s' "$cmd" | tr '\n\t' '  ' | grep -Eq '(^|[^[:alnum:]_.-])kill([[:space:]]|$)' && has_kill=1

bad=""
while IFS= read -r seg; do
  # baştaki boşluk, tırnak, $ ve sarmalayıcı komutlar
  s="$seg"
  while :; do
    n="$(printf '%s' "$s" | sed -E "s/^[[:space:]\"'\$]+//; s/^((ba|z)?sh[[:space:]]+-c|sudo|xargs|exec|time|nohup|then|do|else|command)[[:space:]]+//")"
    [ "$n" = "$s" ] && break
    s="$n"
  done
  case "$s" in
    pkill|pkill\ *|killall|killall\ *) ;;
    pgrep\ *) [ "$has_kill" = 1 ] || continue ;;
    *) continue ;;
  esac
  case "$s" in
    *"$ROOT"*|*"$ROOT_LOGICAL"*|*'$CLAUDE_PROJECT_DIR'*|*'${CLAUDE_PROJECT_DIR}'*) continue ;;
  esac
  bad="$s"
  break
done <<< "$segments"

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
