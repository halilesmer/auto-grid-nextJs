#!/usr/bin/env bash
# Ortak kontroller — git hook'ları (pre-commit, pre-push) ve Claude Code hook'ları
# (claude/post-edit.sh, claude/stop-check.sh) bu dosyayı `source` eder.
# NOT: sayaçlar (ERRORS/WARNINGS) için bu fonksiyonlar boru (|) ile DEĞİL, `< <(...)` /
# `<<<` ile çağrılmalı; boru alt-kabukta çalışır ve sayaç kaybolur.
# Tüm çıktı stderr'e gider (Claude hook'larında exit 2 ile Claude'a geri beslenir).
# Kural → fonksiyon eşlemesi için bkz. hooks/RULES.md.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$ROOT/frontend_nextjs"

ERRORS=0
WARNINGS=0

err()  { echo "  ✗ $*" >&2; ERRORS=$((ERRORS + 1)); }
warn() { echo "  ! $*" >&2; WARNINGS=$((WARNINGS + 1)); }
ok()   { echo "  ✓ $*" >&2; }

# Python yorumlayıcısı: python3 → python (Windows Store stub'ı çalışmazsa atlanır)
find_python() {
  local p
  for p in python3 python; do
    if command -v "$p" >/dev/null 2>&1 && "$p" -c "import sys" >/dev/null 2>&1; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

# stdin'deki JSON'dan nokta-yollu alan okur (jq gerekmez): json_get tool_input.file_path
json_get() {
  command -v node >/dev/null 2>&1 || return 0
  node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try {
        let v = JSON.parse(s);
        for (const k of process.argv[1].split(".")) v = v == null ? v : v[k];
        if (v !== undefined && v !== null) process.stdout.write(String(v));
      } catch {}
    });' "$1"
}

# ---------------------------------------------------------------------------
# Yasaklı dosyalar (gitignore'a rağmen `git add -f` ile eklenmiş olabilir)
# ---------------------------------------------------------------------------
is_forbidden_path() {
  case "$1" in
    .env.example|*/.env.example) return 1 ;;
    .env|.env.*|*/.env|*/.env.*) return 0 ;;
    worker_python/configs/*.json|worker_python/configs/*/*.json) return 0 ;;
    worker_python/data/*|worker_python/logs/*) return 0 ;;
    hooks/test-account.local.md) return 0 ;;
    broker_symbols.json|*/broker_symbols.json) return 0 ;;
  esac
  return 1
}

# stdin: satır başına bir dosya yolu (repo köküne göre)
check_forbidden_files() {
  local f bad=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if is_forbidden_path "$f"; then
      err "Yasaklı dosya: $f (hesap/credential/çalışma verisi GitHub'a gitmez — bkz. hooks/RULES.md)"
      bad=1
    fi
  done
  [ "$bad" -eq 0 ] && ok "Yasaklı dosya yok"
  return 0
}

# ---------------------------------------------------------------------------
# Gizli veri taraması
# ---------------------------------------------------------------------------
# stdin: "yol<TAB>satır" biçiminde eklenen satırlar
scan_secret_lines() {
  local hits
  hits="$(grep -Ei \
    -e 'BEGIN [A-Z ]*PRIVATE KEY' \
    -e 'NGROK_AUTHTOKEN[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9_-]{8,}' \
    -e 'authtoken[[:space:]]*:[[:space:]]*["'"'"']?[A-Za-z0-9_-]{16,}' \
    -e '(^|[^A-Za-z0-9])(password|passwd|pwd)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'[:space:]]{4,}["'"'"']' \
    -e '(^|[^A-Za-z0-9])(api[_-]?key|secret|access[_-]?token|auth[_-]?token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_./+-]{16,}["'"'"']' \
    || true)"
  if [ -n "$hits" ]; then
    local line
    while IFS= read -r line; do
      err "Olası gizli veri: ${line%%$'\t'*} → $(echo "${line#*$'\t'}" | cut -c1-80)"
    done <<< "$hits"
    return 1
  fi
  return 0
}

# stdin: unified diff; hooks/ altındaki dosyalar (desen içerirler) taranmaz
check_secrets_diff() {
  local before=$ERRORS
  scan_secret_lines < <(awk '
    /^\+\+\+ / { file = substr($0, 7); if ($0 == "+++ /dev/null") file = ""; next }
    /^\+/ && file != "" && file !~ /^hooks\// { print file "\t" substr($0, 2) }
  ')
  [ "$ERRORS" -eq "$before" ] && ok "Gizli veri bulunmadı"
  return 0
}

# ---------------------------------------------------------------------------
# Kod kontrolleri
# ---------------------------------------------------------------------------
check_frontend() {
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    warn "frontend_nextjs/node_modules yok — tsc/eslint atlandı (npm install çalıştırın)"
    return 0
  fi
  local before=$ERRORS
  ( cd "$FRONTEND_DIR" && npx --no-install tsc --noEmit ) >&2 || err "TypeScript hataları (tsc --noEmit)"
  ( cd "$FRONTEND_DIR" && npx --no-install eslint . ) >&2 || err "ESLint hataları"
  [ "$ERRORS" -eq "$before" ] && ok "Frontend: tsc + eslint temiz"
  return 0
}

# stdin: satır başına bir .py yolu (repo köküne göre). Dosya yazmaz (py_compile yerine ast).
check_worker() {
  local files=() f
  while IFS= read -r f; do
    [ -f "$ROOT/$f" ] && files+=("$ROOT/$f")
  done
  [ "${#files[@]}" -eq 0 ] && return 0
  local py
  if ! py="$(find_python)"; then
    warn "Python bulunamadı — worker sözdizimi kontrolü atlandı"
    return 0
  fi
  if "$py" - "${files[@]}" >&2 <<'PY'
import ast, sys
bad = 0
for path in sys.argv[1:]:
    try:
        with open(path, encoding="utf-8") as fh:
            ast.parse(fh.read(), path)
    except SyntaxError as e:
        print(f"  {path}:{e.lineno}: {e.msg}", file=sys.stderr)
        bad = 1
sys.exit(bad)
PY
  then
    ok "Worker: ${#files[@]} Python dosyasında sözdizimi hatası yok"
  else
    err "Worker Python sözdizimi hatası (yukarıya bakın)"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Sürüm dosyaları (CLAUDE.md: elle değiştirilmez, GitHub Action bump eder)
# ---------------------------------------------------------------------------
# $1: git rev-list aralığı (örn. "abc..def")
check_version_files() {
  local range="$1" bad
  bad="$(git -C "$ROOT" log --no-merges --format='%h %s' "$range" -- VERSION frontend_nextjs/src/app/version.ts 2>/dev/null \
    | grep -v ' chore: auto bump version' || true)"
  if [ -n "$bad" ]; then
    err "VERSION / version.ts elle değiştirilmiş (Action otomatik bump eder):"
    echo "$bad" | sed 's/^/      /' >&2
  else
    ok "Sürüm dosyalarına elle dokunulmamış"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Uyarılar (engellemez)
# ---------------------------------------------------------------------------
# stdin: değişen dosya yolları
check_compat_warnings() {
  local files backend_changed frontend_changed
  files="$(cat)"
  backend_changed="$(echo "$files" | grep -E '^worker_python/src/(api/(models|settings)\.py|core/.*\.py)$' || true)"
  frontend_changed="$(echo "$files" | grep -E '^frontend_nextjs/src/(types|store|components|services|hooks|lib)/' || true)"

  if [ -n "$backend_changed" ] && [ -z "$frontend_changed" ]; then
    warn "UI↔backend: worker'da model/ayar/çekirdek değişti ama frontend (types/store/components/services/hooks) değişmedi."
    warn "  Yeni/değişen ayar arayüze yansıtılmadan tamam sayılmaz (.agents/rules/token-saver.md)."
  fi
  if echo "$files" | grep -q '^worker_python/src/core/auto_grid_engine\.py$'; then
    warn "auto_grid_engine.py legacy: yeni mantığı modüler dosyalara (grid_*.py) ekleyin."
  fi
  if echo "$files" | grep -q '^worker_python/'; then
    warn "Worker değişti: Mac'te sadece statik kontrol edilebildi; VPS'te pull + worker restart ile test edin."
  fi
  return 0
}

# Sonuç özeti; hata varsa 1 döner
finish_checks() {
  if [ "$ERRORS" -gt 0 ]; then
    echo "" >&2
    echo "✗ $ERRORS hata, $WARNINGS uyarı — düzeltilmeden ilerlenmez (kurallar: hooks/RULES.md)" >&2
    return 1
  fi
  [ "$WARNINGS" -gt 0 ] && echo "✓ Hata yok ($WARNINGS uyarı)" >&2
  return 0
}
