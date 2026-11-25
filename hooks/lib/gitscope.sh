#!/usr/bin/env bash
# Ortak: bir dizinin bu deponun ANA checkout'u olup olmadığını söyler
# (pre-bash-shared-git.sh, pre-edit-main.sh; SYS-17, SYS-18).
# Kullanım: source hooks/lib/gitscope.sh; is_main_checkout <dizin>
# Ana checkout: git-dir == common-dir (worktree'de git-dir ayrı bir alt dizindir) ve bu depoya bağlı.
# Testlerde GUARD_REPO_DIR bu depoyu belirler (varsayılan: hook dosyasının deposu).

# shellcheck disable=SC2034
GUARD_HOOK_DIR="${GUARD_HOOK_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
OWN_COMMON="$(git -C "${GUARD_REPO_DIR:-$GUARD_HOOK_DIR/..}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"

is_main_checkout() {
  local d="$1" gd cd_
  [ -z "$d" ] && return 1
  [ -d "$d" ] || return 1
  gd="$(git -C "$d" rev-parse --path-format=absolute --git-dir 2>/dev/null)" || return 1
  cd_="$(git -C "$d" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ -n "$OWN_COMMON" ] && [ "$cd_" = "$OWN_COMMON" ] && [ "$gd" = "$cd_" ]
}
