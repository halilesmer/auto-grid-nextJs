#!/usr/bin/env bash
# Ortak: Bash komutunu tırnak farkındalıklı parçalara böler (pre-bash-kill.sh, pre-bash-shared-git.sh).
# Kullanım: source hooks/lib/cmdsplit.sh; split_cmd "$cmd" → her satır bir alt komut.

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
