# Claude Code setup on a new machine

## Code intelligence (LSP)

The Claude Code plugins `typescript-lsp` and `pyright-lsp` (official marketplace) show diagnostics after each edit and give go-to-definition and find-references. Setup on a new machine: `npm i -g typescript-language-server typescript@5 pyright@1.1.414`, then in the desktop app **+ → Plugins → Add plugin** (user scope). Pyright needs `worker_python/.venv` with `requirements-dev.txt` (in a worktree: a symlink to the main checkout's venv). Python uses the root `pyrightconfig.json`: worker only, platform Windows, a `MetaTrader5` stub in `worker_python/typings/`, the noisy `Optional`/argument rules off. The baseline (pyright 1.1.414) has 35 known errors (dynamic legacy module in `bot_runner.py`, the `log` callable signature, test fakes). Fix new diagnostics in the lines you changed; do not fix old ones in an unrelated change.
