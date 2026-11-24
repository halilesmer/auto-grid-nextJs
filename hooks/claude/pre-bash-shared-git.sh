#!/usr/bin/env bash
# Claude Code PreToolUse (Bash): ortak git durumunu korur (SYS-17).
# Neden: bütün oturumlar tek depoyu paylaşır. İki şey oturumlar arasında sızar:
#   1. `refs/stash` bütün worktree'lerde ortaktır: bir oturumun `git stash`'i başka oturumun `git stash pop`'una düşer.
#   2. Ana checkout (localhost:3000'i, Halil'in yarım işini ve çok oturumu taşır): dal değiştirmek, `git add -A`,
#      `reset --hard` gibi komutlar başkasının dosyalarını alır, siler ya da başka dala commit'ler.
# Engellenir (exit 2, stderr Claude'a döner, run_in_background olsa da):
#   - her yerde: `git stash` (list ve show hariç)
#   - yalnız ana checkout'ta: dal değiştiren checkout/switch, reset --hard/--merge/--keep, clean, restore (dosya),
#     add -A / --all / . / -u, commit -a, rebase, cherry-pick, revert, merge ve pull (--ff-only olmadan)
# İzinli: `git checkout main`, `pull --ff-only`, `add <açık dosya>`, `commit -m`, fetch, status, worktree add, push;
# worktree'lerde (stash hariç) hepsi.
# Hedef dizin: `git -C <yol>`, yoksa komuttaki son `cd <yol>`, yoksa hook JSON'undaki cwd.
# Dizin çözülemezse (cd $DEĞİŞKEN) yalnız stash kuralı çalışır.
# Girdi: stdin'de hook JSON'u (tool_input.command, cwd).

input="$(cat)"
[ -z "$input" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/checks.sh
source "$HOOK_DIR/lib/checks.sh"
# shellcheck source=../lib/cmdsplit.sh
source "$HOOK_DIR/lib/cmdsplit.sh"

cmd="$(json_get tool_input.command <<< "$input")"
[ -z "$cmd" ] && exit 0
printf '%s' "$cmd" | grep -q 'git' || exit 0

cur="$(json_get cwd <<< "$input")"
[ -z "$cur" ] && cur="${CLAUDE_PROJECT_DIR:-$PWD}"

# Bu deponun ortak git dizini (testlerde GUARD_REPO_DIR ile değişir)
REPO_DIR="${GUARD_REPO_DIR:-$HOOK_DIR/..}"
OWN_COMMON="$(git -C "$REPO_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"

# Tırnak farkındalıklı kelime ayırıcı: TOK dizisini doldurur (komut yerine koyma yok; eval yok).
tokenize() {
  TOK=()
  local str="$1" i ch q="" w="" has=0 len=${#1}
  for ((i = 0; i < len; i++)); do
    ch="${str:i:1}"
    if [ "$q" = "'" ]; then
      if [ "$ch" = "'" ]; then q=""; else w+="$ch"; fi
      continue
    fi
    if [ "$q" = '"' ]; then
      if [ "$ch" = '"' ]; then q=""
      elif [ "$ch" = "\\" ] && [ $((i + 1)) -lt "$len" ]; then i=$((i + 1)); w+="${str:i:1}"
      else w+="$ch"; fi
      continue
    fi
    case "$ch" in
      "'") q="'"; has=1 ;;
      '"') q='"'; has=1 ;;
      "\\") i=$((i + 1)); w+="${str:i:1}"; has=1 ;;
      ' ' | $'\t')
        if [ -n "$w" ] || [ "$has" = 1 ]; then TOK+=("$w"); w=""; has=0; fi
        ;;
      *) w+="$ch" ;;
    esac
  done
  if [ -n "$w" ] || [ "$has" = 1 ]; then TOK+=("$w"); fi
}

# Dizin yolunu cur'a göre çözer; $, ` ya da ~ içeriyorsa boş döner (bilinmiyor).
resolve_dir() {
  local base="$1" p="$2"
  case "$p" in
    '' | '~' | '~/'* | *'$'* | *'`'*) printf ''; return ;;
    /*) printf '%s' "$p" ;;
    *) [ -n "$base" ] && printf '%s/%s' "$base" "$p" || printf '' ;;
  esac
}

# Ana checkout mu? (bu deponun ortak git dizinine bağlı ve git-dir == common-dir)
is_main_checkout() {
  local d="$1" gd cd_
  [ -z "$d" ] && return 1
  [ -d "$d" ] || return 1
  gd="$(git -C "$d" rev-parse --path-format=absolute --git-dir 2>/dev/null)" || return 1
  cd_="$(git -C "$d" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ -n "$OWN_COMMON" ] && [ "$cd_" = "$OWN_COMMON" ] && [ "$gd" = "$cd_" ]
}

has_tok() { # has_tok <jeton> <jeton…>: verilen jetonlardan biri tam olarak eşit mi
  local want="$1" t
  shift
  for t in "$@"; do
    [ "$t" = "$want" ] && return 0
  done
  return 1
}

reason=""
check_git() { # TOK = git komutunun jetonları (git dahil), cur = çalışma dizini
  local i=1 dir="$cur" sub="" t
  local -a args=()
  while [ "$i" -lt "${#TOK[@]}" ]; do
    t="${TOK[$i]}"
    case "$t" in
      -C) i=$((i + 1)); dir="$(resolve_dir "$dir" "${TOK[$i]:-}")" ;;
      -c | --git-dir | --work-tree | --namespace) i=$((i + 1)) ;;
      -*) ;;
      *) sub="$t"; i=$((i + 1)); break ;;
    esac
    i=$((i + 1))
  done
  while [ "$i" -lt "${#TOK[@]}" ]; do args+=("${TOK[$i]}"); i=$((i + 1)); done
  [ -z "$sub" ] && return

  if [ "$sub" = stash ]; then
    case "${args[0]:-}" in
      list | show) ;;
      *) reason="git stash: refs/stash bütün worktree'lerde ortaktır; başka oturumun stash'ine düşersin ya da onunkini alırsın."; return ;;
    esac
    return
  fi

  is_main_checkout "$dir" || return

  case "$sub" in
    checkout | switch)
      local pos="" dd=0
      for t in "${args[@]}"; do
        if [ "$t" = "--" ]; then dd=1; continue; fi
        case "$t" in
          -b | -B | -c | -C | --orphan | --detach | -d | --force | -f | --discard-changes)
            reason="git $sub $t: ana checkout'ta dal değiştirir ya da dosya ezer."; return ;;
          -*) ;;
          *) [ -z "$pos" ] && pos="$t" ;;
        esac
      done
      if [ "$dd" = 1 ] || { [ "$sub" = checkout ] && [ -n "$pos" ] && [ "$pos" != main ] && [ -e "$dir/$pos" ]; }; then
        reason="git checkout ... -- <dosya>: ana checkout'ta başkasının yarım işini geri alır."
        return
      fi
      if [ -n "$pos" ] && [ "$pos" != main ]; then
        reason="git $sub $pos: ana checkout'ta dal değiştirir (localhost:3000 ve diğer oturumlar başka kodu görür)."
      fi
      ;;
    reset)
      has_tok '--hard' "${args[@]}" || has_tok '--merge' "${args[@]}" || has_tok '--keep' "${args[@]}" \
        && reason="git reset ${args[*]}: ana checkout'ta çalışma ağacını siler."
      ;;
    clean)
      has_tok '-n' "${args[@]}" || has_tok '--dry-run' "${args[@]}" || reason="git clean: ana checkout'ta izlenmeyen dosyaları siler."
      ;;
    restore)
      if has_tok '--staged' "${args[@]}" && ! has_tok '--worktree' "${args[@]}" && ! has_tok '-W' "${args[@]}"; then :; else
        reason="git restore: ana checkout'ta çalışma ağacı dosyalarını geri alır."
      fi
      ;;
    add)
      has_tok '-A' "${args[@]}" || has_tok '--all' "${args[@]}" || has_tok '-u' "${args[@]}" || has_tok '--update' "${args[@]}" \
        || has_tok '.' "${args[@]}" || has_tok '*' "${args[@]}" || has_tok ':/' "${args[@]}" \
        && reason="git add ${args[*]}: ana checkout'ta başkasının dosyalarını da ekler; açık dosya adı ver."
      ;;
    commit)
      local skip=0
      for t in "${args[@]}"; do
        if [ "$skip" = 1 ]; then skip=0; continue; fi
        case "$t" in
          -m | -F | -C | -c | --message | --file | --author | --date) skip=1 ;;
          --all) reason="git commit --all: ana checkout'ta başkasının değişikliklerini de commit'ler."; return ;;
          --*) ;;
          -*a*) reason="git commit $t: ana checkout'ta başkasının değişikliklerini de commit'ler."; return ;;
        esac
      done
      ;;
    rebase | cherry-pick | revert)
      has_tok '--abort' "${args[@]}" || has_tok '--quit' "${args[@]}" || reason="git $sub: ana checkout'ta dalı ve çalışma ağacını değiştirir."
      ;;
    merge | pull)
      has_tok '--abort' "${args[@]}" || has_tok '--ff-only' "${args[@]}" || reason="git $sub --ff-only olmadan: ana checkout'ta birleşme commit'i ya da çakışma üretir."
      ;;
  esac
}

# Parça parça: cd ile dizini izle, git parçalarını denetle; sh -c '…' içeriği yeniden işlenir
process_cmd() {
  local str="$1" seg saved
  local -a tok
  while IFS= read -r seg; do
    tokenize "$seg"
    [ "${#TOK[@]}" -eq 0 ] && continue
    # baştaki sarmalayıcılar: VAR=değer, env, sudo, command, then/do/else/time
    while [ "${#TOK[@]}" -gt 0 ]; do
      case "${TOK[0]}" in
        [A-Za-z_]*=* | env | sudo | command | then | do | else | time | exec | nohup) TOK=("${TOK[@]:1}") ;;
        *) break ;;
      esac
    done
    [ "${#TOK[@]}" -eq 0 ] && continue
    case "${TOK[0]}" in
      cd) cur="$(resolve_dir "$cur" "${TOK[1]:-}")" ;;
      git) check_git ;;
      bash | sh | zsh)
        if [ "${TOK[1]:-}" = "-c" ] && [ -n "${TOK[2]:-}" ]; then
          saved="$cur"
          tok=("${TOK[@]}")
          process_cmd "${tok[2]}"
          cur="$saved"
        fi
        ;;
    esac
    [ -n "$reason" ] && return
  done < <(split_cmd "$(printf '%s' "$str" | tr '\t' ' ')")
}

process_cmd "$cmd"

[ -z "$reason" ] && exit 0

cat >&2 <<EOF
✗ pre-bash-shared-git (SYS-17): ${reason}
  Oturumlar tek depoyu paylaşır; bu komut başka oturumun işini etkiler. Bunun yerine:
  - Ayrı iş için worktree aç (EnterWorktree ya da start_session use_worktree) ve orada çalış.
  - Işi kenara koymak için stash yerine geçici WIP commit kullan.
  - Ana checkout'ta yalnız: git pull --ff-only, git checkout main, açık dosya adıyla add/commit.
  Kural: hooks/RULES.md §4.18.
EOF
exit 2
