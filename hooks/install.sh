#!/usr/bin/env bash
# Git hook'larını etkinleştirir: core.hooksPath = hooks (klonlanan her makinede bir kez çalıştırın).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

chmod +x hooks/pre-commit hooks/pre-push hooks/install.sh hooks/claude/*.sh
git config core.hooksPath hooks

echo "✓ core.hooksPath = $(git config core.hooksPath)"
echo "  pre-commit, pre-push aktif. Claude hook'ları .claude/settings.json'dan gelir."

if [ ! -f hooks/test-account.local.md ]; then
  echo "! hooks/test-account.local.md yok — test hesabı için hooks/test-account.example.md'yi kopyalayıp doldurun."
fi
