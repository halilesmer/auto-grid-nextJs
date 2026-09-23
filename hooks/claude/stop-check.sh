#!/usr/bin/env bash
# Claude Code Stop: Claude her tur bittiğinde projeyi tam kontrol eder.
# Hata → stderr + exit 2 (Claude durmaz, hatayı düzeltir). Sadece uyarı → engellemez.
# Girdi: stdin'de hook JSON'u (stop_hook_active döngü koruması için).

# shellcheck source=../lib/checks.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/checks.sh"

cd "$ROOT" || exit 0

active="$(json_get stop_hook_active)"

status="$(git status --porcelain -uall 2>/dev/null)"
[ -z "$status" ] && exit 0 # değişiklik yok

# Aynı değişiklik seti daha önce temiz geçtiyse tekrar çalıştırma
sig="$( { echo "$status"; git diff HEAD 2>/dev/null; } | cksum | cut -d' ' -f1 )"
cache="${TMPDIR:-/tmp}/grid-robot-stopcheck-$(echo "$ROOT" | cksum | cut -d' ' -f1)"
[ -f "$cache" ] && [ "$(cat "$cache")" = "$sig" ] && exit 0

# "XY dosya" ve "eski -> yeni" biçimlerinden yolları çıkar
files="$(echo "$status" | sed -e 's/^...//' -e 's/^.* -> //' -e 's/^"//' -e 's/"$//')"

echo "▶ stop-check: proje kontrolü" >&2

if echo "$files" | grep -q '^frontend_nextjs/'; then
  check_frontend
fi
check_worker < <(echo "$files" | grep -E '^worker_python/.*\.py$')
check_secrets_diff < <(git diff HEAD 2>/dev/null)
check_compat_warnings <<< "$files"

if [ "$ERRORS" -gt 0 ]; then
  echo "" >&2
  echo "✗ $ERRORS hata — lütfen düzeltin (kurallar: hooks/RULES.md)" >&2
  # Döngü koruması: bir kez zaten geri çevrildiyse tekrar engelleme
  [ "$active" = "true" ] && exit 0
  exit 2
fi

echo "$sig" > "$cache" 2>/dev/null
exit 0
