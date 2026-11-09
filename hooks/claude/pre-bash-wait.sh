#!/usr/bin/env bash
# Claude Code PreToolUse (Bash): ön planda uzun bekleme döngüsünü engeller (SYS-14).
# Neden: `until grep -q FINISHED …; do sleep 10; done` oturumu 590 s'lik zaman aşımına kadar
# kilitliyor; kullanıcının mesajı o sürede sırada bekliyor (teşhis 2026-11-09, journal).
# Engellenir (exit 2, stderr Claude'a döner), run_in_background değilse:
#   - `until`/`while` döngüsü + içinde `sleep <sayı>`
#   - tek başına `sleep N`, N >= 60
# İzinli: run_in_background=true, ya da komut `timeout N` (N <= 120 s) ile sınırlanmışsa.
# Girdi: stdin'de hook JSON'u (tool_input.command, tool_input.run_in_background).

input="$(cat)"
[ -z "$input" ] && exit 0

# shellcheck source=../lib/checks.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/checks.sh"

[ "$(json_get tool_input.run_in_background <<< "$input")" = "true" ] && exit 0
cmd="$(json_get tool_input.command <<< "$input")"
[ -z "$cmd" ] && exit 0

flat=" $(printf '%s' "$cmd" | tr '\n\t' '  ') "
# Sözcük sınırı: boşluk, ; & | ( ve tırnak (bash -c "while …")
B="[[:space:];&|(\"']"

# `timeout N` ile sınırlı (N <= 120 s) bekleme serbest: kısa sunucu açılışı vb.
if [[ "$flat" =~ ${B}timeout[[:space:]]+([0-9]+)s?[[:space:]] ]]; then
  [ "${BASH_REMATCH[1]}" -le 120 ] && exit 0
fi

reason=""
if [[ "$flat" =~ ${B}(until|while)[[:space:]] ]] && [[ "$flat" =~ ${B}sleep[[:space:]]+[0-9] ]]; then
  reason="ön planda bekleme döngüsü (until/while + sleep)"
else
  rest="$flat"
  while [[ "$rest" =~ ${B}sleep[[:space:]]+([0-9]+) ]]; do
    if [ "${BASH_REMATCH[1]}" -ge 60 ]; then
      reason="ön planda uzun sleep (${BASH_REMATCH[1]} s)"
      break
    fi
    rest="${rest#*"${BASH_REMATCH[0]}"}"
  done
fi

[ -z "$reason" ] && exit 0

cat >&2 <<EOF
✗ pre-bash-wait (SYS-14): $reason. Oturum bu sürede kilitlenir, kullanıcının mesajı bekler.
  Bunun yerine: uzun komutu run_in_background: true ile başlat (bitince bildirim gelir),
  ya da bir koşulu beklemek için Monitor aracını kullan. Kısa bekleme: komutu \`timeout 120\` ile sınırla.
  Kural: hooks/RULES.md §4.15.
EOF
exit 2
