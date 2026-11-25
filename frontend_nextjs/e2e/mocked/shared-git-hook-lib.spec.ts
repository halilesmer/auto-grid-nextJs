/**
 * Claude-Hook für gemeinsamen Git-Zustand, ohne Browser (hooks/claude/pre-bash-shared-git.sh).
 * SYS-17: `git stash` überall und Branch-Wechsel, `add -A`, `reset --hard` u. a. im Haupt-Checkout → Exit 2.
 * Gebaut wird ein echtes Wegwerf-Repository mit Haupt-Checkout und Worktree (Pfad mit Leerzeichen, wie im Projekt).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CHECKOUT_ROOT } from '../fixtures/env';

const HOOK = path.join(CHECKOUT_ROOT, 'hooks/claude/pre-bash-shared-git.sh');

let base: string;
let main: string;
let wt: string;

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' });
}

test.beforeAll(() => {
  base = mkdtempSync(path.join(tmpdir(), 'shared git guard '));
  main = path.join(base, 'main checkout');
  wt = path.join(base, 'work tree');
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(main, 'a.txt'), 'a\n');
  git(main, 'add', 'a.txt');
  git(main, 'commit', '-q', '-m', 'init');
  git(main, 'worktree', 'add', '-q', '-b', 'feature', wt);
});

test.afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

function run(command: string, cwd: string, runInBackground?: boolean) {
  const input = JSON.stringify({
    tool_name: 'Bash',
    cwd,
    tool_input: { command, ...(runInBackground === undefined ? {} : { run_in_background: runInBackground }) },
  });
  const r = spawnSync('bash', [HOOK], { input, encoding: 'utf8', env: { ...process.env, GUARD_REPO_DIR: main } });
  return { code: r.status, stderr: r.stderr };
}

test.describe('pre-bash-shared-git: gemeinsamer Git-Zustand', { tag: '@SYS-17' }, () => {
  // refs/stash gehört allen Worktrees: überall gesperrt
  const stashBlocked = ['git stash', 'git stash push -u -m x', 'git stash pop', 'git stash apply', 'git stash drop', 'git stash clear', 'git stash -u', 'git stash save wip'];
  for (const cmd of stashBlocked) {
    test(`stash gesperrt im Worktree: ${cmd}`, () => {
      const r = run(cmd, wt);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('pre-bash-shared-git (SYS-17)');
      expect(r.stderr).toContain('WIP');
    });
  }
  test('stash gesperrt auch im Haupt-Checkout und im Hintergrund', () => {
    expect(run('git stash', main).code).toBe(2);
    expect(run('git stash', wt, true).code).toBe(2);
  });
  test('stash list und stash show bleiben erlaubt', () => {
    expect(run('git stash list', wt).code).toBe(0);
    expect(run('git stash show stash@{0}', main).code).toBe(0);
  });

  // Haupt-Checkout: Befehle, die den Zustand anderer Sitzungen ändern
  const mainBlocked = [
    'git checkout -b neu',
    'git checkout feature',
    'git checkout origin/main',
    'git checkout --detach',
    'git switch feature',
    'git switch -c neu',
    'git checkout -- a.txt',
    'git checkout HEAD -- a.txt',
    'git checkout a.txt',
    'git reset --hard',
    'git reset --hard origin/main',
    'git clean -fd',
    'git restore a.txt',
    'git add -A',
    'git add --all',
    'git add .',
    'git add -u',
    'git add *',
    'git commit -a -m x',
    'git commit -am x',
    'git commit -qam "x y"',
    'git commit --all -m x',
    'git rebase origin/main',
    'git cherry-pick abc123',
    'git merge feature',
    'git pull',
    'git pull --rebase',
    // Umgehungen: -C, cd, Kette, bash -c, env (-C/cd werden unten aus dem Worktree geprüft)
    'echo hi; git reset --hard',
    "bash -c 'git add -A'",
    'env GIT_PAGER=cat git checkout -b neu',
    'sudo git clean -fdx',
  ];
  for (const cmd of mainBlocked) {
    test(`Haupt-Checkout gesperrt: ${cmd}`, () => {
      const r = run(cmd, main);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('pre-bash-shared-git (SYS-17)');
      expect(r.stderr).toContain('EnterWorktree');
    });
  }

  test('Haupt-Checkout gesperrt, wenn aus einem Worktree per -C oder cd angesprochen', () => {
    for (const cmd of [`git -C "${main}" add -A`, `cd "${main}" && git add -A`, `cd "${main}"; git reset --hard`, `bash -c 'cd "${main}" && git add -A'`]) {
      const r = run(cmd, wt);
      expect(r.code, cmd).toBe(2);
      expect(r.stderr).toContain('EnterWorktree');
    }
  });

  const mainAllowed = [
    'git status',
    'git log --oneline -3',
    'git diff',
    'git fetch origin',
    'git pull --ff-only',
    'git pull -q --ff-only origin main',
    'git checkout main',
    'git switch main',
    'git add a.txt',
    'git add -- a.txt docs/x.md',
    'git commit -m "msg"',
    'git commit -q --amend -m "msg"',
    'git clean -n',
    'git reset',
    'git reset a.txt',
    'git restore --staged a.txt',
    'git rebase --abort',
    'git merge --abort',
    'git merge --ff-only origin/main',
    'git worktree add ../x -b y',
    'git branch -D old',
    'git push origin main',
    'echo "git add -A"',
    "echo 'git reset --hard'",
    'grep -n "git stash" notes.md',
    'ls -la && git status --short',
  ];
  for (const cmd of mainAllowed) {
    test(`Haupt-Checkout erlaubt: ${cmd}`, () => {
      expect(run(cmd, main).code).toBe(0);
    });
  }

  // Worktrees: derselbe Befehl läuft (außer stash)
  const worktreeAllowed = ['git add -A', 'git commit -am x', 'git checkout -b neu', 'git reset --hard', 'git checkout -- a.txt', 'git rebase origin/main', 'git pull', 'git clean -fd'];
  for (const cmd of worktreeAllowed) {
    test(`Worktree erlaubt: ${cmd}`, () => {
      expect(run(cmd, wt).code).toBe(0);
    });
  }

  test('Koordinator im Haupt-Checkout: cd in einen Worktree macht add -A erlaubt', () => {
    expect(run(`cd "${wt}" && git checkout docs/x.json 2>/dev/null; git add -A && git commit -q -m x`, main).code).toBe(0);
    expect(run(`git -C "${wt}" add -A`, main).code).toBe(0);
  });

  test('cd zurück in den Haupt-Checkout hebt den Schutz wieder auf', () => {
    expect(run(`cd "${wt}" && git add -A && cd "${main}" && git add -A`, main).code).toBe(2);
  });

  test('unbekanntes Ziel (cd $VAR) sperrt nur stash, nichts anderes', () => {
    expect(run('cd "$X" && git add -A', main).code).toBe(0);
    expect(run('cd "$X" && git stash', main).code).toBe(2);
  });

  test('anderes Repository wird nicht angefasst', () => {
    const other = mkdtempSync(path.join(tmpdir(), 'other repo '));
    try {
      git(other, 'init', '-q', '-b', 'main');
      expect(run('git add -A', other).code).toBe(0);
      expect(run(`git -C "${other}" reset --hard`, main).code).toBe(0);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  test('leere oder fremde Eingabe blockiert nichts', () => {
    const env = { ...process.env, GUARD_REPO_DIR: main };
    expect(spawnSync('bash', [HOOK], { input: '', encoding: 'utf8', env }).status).toBe(0);
    expect(spawnSync('bash', [HOOK], { input: '{"tool_input":{}}', encoding: 'utf8', env }).status).toBe(0);
  });
});
