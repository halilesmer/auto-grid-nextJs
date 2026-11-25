#!/usr/bin/env bash
# Claude Code PreToolUse (Edit|Write|NotebookEdit): ana checkout'ta dosya düzenlemeyi engeller (SYS-18).
# Neden: ana checkout tek çalışma ağacıdır; localhost:3000'i, Halil'in yarım işini ve çok oturumu taşır.
# İki oturumun aynı dosyaya yazması ya da worktree'si silinip ana checkout'a düşen bir oturumun orada
# düzenlemesi başkasının işine karışır. Commit'e giden iş zaten bir daldan gelir; ana checkout'ta dal açılamaz (SYS-17).
# Engellenir (exit 2): ana checkout içindeki, git'in yok saymadığı her dosya (izlenen ya da yeni).
# İzinli: worktree'ler; ana checkout dışı yollar (scratchpad, ~/.claude); gitignore/info-exclude ile yok sayılan
#   yollar (research/, .env.local …); .claude/artifacts/ (Artifact taslakları, izlenmez).
# Kaçış (yalnız Halil, oturumu başlatan ortamda): GUARD_ALLOW_MAIN_EDIT=1.
# Girdi: stdin'de hook JSON'u (tool_input.file_path ya da notebook_path, cwd).

input="$(cat)"
[ -z "$input" ] && exit 0
[ "${GUARD_ALLOW_MAIN_EDIT:-}" = 1 ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/checks.sh
source "$HOOK_DIR/lib/checks.sh"
# shellcheck source=../lib/gitscope.sh
source "$HOOK_DIR/lib/gitscope.sh"

p="$(json_get tool_input.file_path <<< "$input")"
[ -z "$p" ] && p="$(json_get tool_input.notebook_path <<< "$input")"
[ -z "$p" ] && exit 0

cwd="$(json_get cwd <<< "$input")"
case "$p" in
  /*) ;;
  *) p="${cwd:-${CLAUDE_PROJECT_DIR:-$PWD}}/$p" ;;
esac

# En yakın var olan üst dizin (dosya ya da alt dizinler henüz yok olabilir)
d="$(dirname "$p")"
while [ ! -d "$d" ] && [ "$d" != "/" ]; do d="$(dirname "$d")"; done

is_main_checkout "$d" || exit 0

top="$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)"
# Fiziksel yol: var olan üst dizin (symlink çözülmüş) + henüz var olmayan kalan kısım
phys="$(cd "$d" && pwd -P)/${p#"$d"/}"
[ -n "$top" ] || exit 0
case "$phys" in
  "$top"/.claude/artifacts/*) exit 0 ;;
esac
git -C "$d" check-ignore -q -- "$p" 2>/dev/null && exit 0

cat >&2 <<EOF
✗ pre-edit-main (SYS-18): ana checkout'ta dosya düzenleme: ${p:0:140}
  Ana checkout'u bütün oturumlar, localhost:3000 ve Halil'in kendi işi paylaşır; burada yazmak başkasının işine karışır.
  - Ayrı iş için worktree aç (EnterWorktree ya da start_session use_worktree) ve orada düzenle.
  - Artifact taslağı: .claude/artifacts/ altına yaz. Yerel not ve araştırma: gitignore'lu klasörler (research/).
  Kural: hooks/RULES.md §4.19.
EOF
exit 2
