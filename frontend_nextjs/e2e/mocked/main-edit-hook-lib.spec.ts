/**
 * Claude-Hook gegen Dateiänderungen im Haupt-Checkout, ohne Browser (hooks/claude/pre-edit-main.sh).
 * SYS-18: Edit/Write/NotebookEdit auf eine Datei im Haupt-Checkout, die Git nicht ignoriert → Exit 2.
 * Gebaut wird ein echtes Wegwerf-Repository mit Haupt-Checkout und Worktree (Pfad mit Leerzeichen, wie im Projekt).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CHECKOUT_ROOT } from '../fixtures/env';

const HOOK = path.join(CHECKOUT_ROOT, 'hooks/claude/pre-edit-main.sh');

let base: string;
let main: string;
let wt: string;

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' });
}

test.beforeAll(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), 'main edit guard ')));
  main = path.join(base, 'main checkout');
  wt = path.join(base, 'work tree');
  mkdirSync(path.join(main, 'src'), { recursive: true });
  writeFileSync(path.join(main, 'src/a.ts'), 'a\n');
  writeFileSync(path.join(main, '.gitignore'), 'secret.local\nlocal-notes/\n');
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'add', 'src/a.ts', '.gitignore');
  git(main, 'commit', '-q', '-m', 'init');
  mkdirSync(path.join(main, '.git/info'), { recursive: true });
  writeFileSync(path.join(main, '.git/info/exclude'), 'research/\n');
  git(main, 'worktree', 'add', '-q', '-b', 'feature', wt);
});

test.afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

function run(toolInput: Record<string, string>, cwd: string, env: Record<string, string> = {}) {
  const input = JSON.stringify({ tool_name: 'Edit', cwd, tool_input: toolInput });
  const r = spawnSync('bash', [HOOK], { input, encoding: 'utf8', env: { ...process.env, GUARD_REPO_DIR: main, ...env } });
  return { code: r.status, stderr: r.stderr };
}

test.describe('pre-edit-main: keine Änderung im Haupt-Checkout', { tag: '@SYS-18' }, () => {
  const blocked: Array<[string, Record<string, string>]> = [
    ['verfolgte Datei, absoluter Pfad', { file_path: 'ABS:src/a.ts' }],
    ['neue Datei im Quellordner', { file_path: 'ABS:src/neu.ts' }],
    ['neue Datei in neuem Unterordner', { file_path: 'ABS:src/tief/noch/tiefer/x.ts' }],
    ['Datei in der Wurzel', { file_path: 'ABS:README.md' }],
    ['Notebook', { notebook_path: 'ABS:src/n.ipynb' }],
    ['relativer Pfad (cwd = Haupt-Checkout)', { file_path: 'src/a.ts' }],
    ['.gitignore selbst', { file_path: 'ABS:.gitignore' }],
    ['Ordner .claude außer artifacts', { file_path: 'ABS:.claude/settings.json' }],
  ];
  for (const [name, input] of blocked) {
    test(`gesperrt: ${name}`, () => {
      const fixed = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v.startsWith('ABS:') ? path.join(main, v.slice(4)) : v]));
      const r = run(fixed, main);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('pre-edit-main (SYS-18)');
      expect(r.stderr).toContain('EnterWorktree');
    });
  }

  const allowedInMain: Array<[string, Record<string, string>]> = [
    ['Artifact-Entwurf', { file_path: 'ABS:.claude/artifacts/entwurf.html' }],
    ['Artifact in neuem Unterordner', { file_path: 'ABS:.claude/artifacts/neu/x.html' }],
    ['von .gitignore ignorierte Datei', { file_path: 'ABS:secret.local' }],
    ['von .gitignore ignorierter Ordner', { file_path: 'ABS:local-notes/a/b.md' }],
    ['über .git/info/exclude ausgeschlossen', { file_path: 'ABS:research/plan.md' }],
  ];
  for (const [name, input] of allowedInMain) {
    test(`erlaubt im Haupt-Checkout: ${name}`, () => {
      const fixed = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v.startsWith('ABS:') ? path.join(main, v.slice(4)) : v]));
      expect(run(fixed, main).code).toBe(0);
    });
  }

  test('Worktree: alles erlaubt, auch relative Pfade', () => {
    expect(run({ file_path: path.join(wt, 'src/a.ts') }, wt).code).toBe(0);
    expect(run({ file_path: 'src/a.ts' }, wt).code).toBe(0);
    expect(run({ file_path: path.join(wt, 'src/neu/x.ts') }, wt).code).toBe(0);
  });

  test('Koordinator im Haupt-Checkout schreibt per absolutem Pfad in einen Worktree: erlaubt', () => {
    expect(run({ file_path: path.join(wt, 'docs/journal/x.md') }, main).code).toBe(0);
  });

  test('Pfade außerhalb des Repositorys: erlaubt', () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'outside '));
    try {
      expect(run({ file_path: path.join(outside, 'a.md') }, main).code).toBe(0);
      expect(run({ file_path: '/private/tmp/scratch/x.md' }, main).code).toBe(0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('anderes Repository: erlaubt', () => {
    const other = realpathSync(mkdtempSync(path.join(tmpdir(), 'other repo ')));
    try {
      git(other, 'init', '-q', '-b', 'main');
      expect(run({ file_path: path.join(other, 'x.ts') }, other).code).toBe(0);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  test('Kaçis GUARD_ALLOW_MAIN_EDIT=1 (nur Halil, Start-Umgebung) hebt die Sperre auf', () => {
    expect(run({ file_path: path.join(main, 'src/a.ts') }, main, { GUARD_ALLOW_MAIN_EDIT: '1' }).code).toBe(0);
  });

  test('leere oder fremde Eingabe blockiert nichts', () => {
    const env = { ...process.env, GUARD_REPO_DIR: main };
    expect(spawnSync('bash', [HOOK], { input: '', encoding: 'utf8', env }).status).toBe(0);
    expect(spawnSync('bash', [HOOK], { input: '{"tool_input":{}}', encoding: 'utf8', env }).status).toBe(0);
  });
});
