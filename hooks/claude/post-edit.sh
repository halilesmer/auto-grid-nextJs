#!/usr/bin/env bash
# Claude Code PostToolUse (Edit|Write): düzenlenen TEK dosyayı hızlıca kontrol eder.
# Hata → stderr + exit 2 (Claude'a geri beslenir, hemen düzeltir). Tam kontrol Stop hook'unda.
# Girdi: stdin'de hook JSON'u (tool_input.file_path).

# shellcheck source=../lib/checks.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/checks.sh"

file="$(json_get tool_input.file_path)"
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

rel="${file#"$ROOT"/}"
case "$file" in "$ROOT"/*) ;; *) exit 0 ;; esac # repo dışı dosyalara dokunma

echo "▶ post-edit: $rel" >&2

case "$rel" in
  frontend_nextjs/*.ts|frontend_nextjs/*.tsx|frontend_nextjs/*.mjs)
    if [ -d "$FRONTEND_DIR/node_modules" ]; then
      ( cd "$FRONTEND_DIR" && npx --no-install eslint "${file}" ) >&2 || err "ESLint hataları: $rel"
    fi
    ;;
  worker_python/*.py)
    check_worker <<< "$rel"
    ;;
esac

# Gizli veri: gitignore'lu dosyalar (ör. hooks/test-account.local.md) ve hooks/ atlanır
if ! git -C "$ROOT" check-ignore -q "$rel" 2>/dev/null; then
  scan_secret_lines < <(awk -v p="$rel" 'p !~ /^hooks\// { print p "\t" $0 }' "$file")
fi

[ "$ERRORS" -gt 0 ] && exit 2
exit 0
