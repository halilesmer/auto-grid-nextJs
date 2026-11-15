/**
 * Claude-Hook gegen kapsamloses pkill/killall, ohne Browser (hooks/claude/pre-bash-kill.sh).
 * SYS-16: pkill/killall/pgrep|kill ohne den Pfad des eigenen Checkouts im Muster → Exit 2.
 * Die ersten beiden Befehle sind die echten Befehle aus der Diagnose vom 2026-11-15.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CHECKOUT_ROOT } from '../fixtures/env';

const HOOK = path.join(CHECKOUT_ROOT, 'hooks/claude/pre-bash-kill.sh');
const STOP = path.join(CHECKOUT_ROOT, 'scripts/features/precheck.sh');

function run(command: string, runInBackground?: boolean) {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command, ...(runInBackground === undefined ? {} : { run_in_background: runInBackground }) },
  });
  const r = spawnSync('bash', [HOOK], { input, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}

test.describe('pre-bash-kill: kein kapsamloses pkill', { tag: '@SYS-16' }, () => {
  const blocked = [
    // echte Befehle aus der Diagnose (2026-11-14 23:49 und 2026-11-15 00:38 UTC)
    'pkill -f "scripts/features/precheck.sh"',
    'pkill -f "scripts/features/precheck.sh"; pkill -f "playwright"; pkill -f "next start"; pkill -f "next build"',
    // weitere gemeinsame Namen und Formen
    'pkill -f heavy_lock.sh',
    'killall node',
    'pkill -9 -f "next dev"',
    "bash -c 'pkill -f playwright'",
    'sudo pkill -f run.sh && echo done',
    'pgrep -f "next start" | xargs kill',
    'kill $(pgrep -f playwright)',
    'pkill -f "$PATTERN"',
    // Umgehung über Pfad, env, Zuweisung, Backslash (SYS-16, 2026-11-15)
    '/usr/bin/pkill -f playwright',
    '/usr/bin/killall node',
    'env pkill -f playwright',
    'env VAR=1 pkill -f playwright',
    'FOO=1 pkill -f playwright',
    '\\pkill -f playwright',
    'echo hi && /usr/bin/pkill -f playwright',
    "bash -c 'echo a; pkill -f playwright'",
    'echo "$(pkill -f playwright)"',
    // Pfad eines fremden Checkouts zählt nicht
    'pkill -f "/Users/x/other-worktree/scripts/features/precheck.sh"',
  ];
  for (const cmd of blocked) {
    test(`blockiert: ${cmd}`, () => {
      const r = run(cmd);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('pre-bash-kill (SYS-16)');
      expect(r.stderr).toContain('precheck.sh --stop');
    });
  }

  test('Hintergrund hebt die Sperre nicht auf', () => {
    expect(run('pkill -f playwright', true).code).toBe(2);
  });

  test('jedes Teilkommando der Kette wird einzeln geprüft', () => {
    const own = `pkill -f "${CHECKOUT_ROOT}/scripts/features/precheck.sh"`;
    expect(run(`${own}; pkill -f playwright`).code).toBe(2);
  });

  const allowed = [
    `pkill -f "${CHECKOUT_ROOT}/scripts/features/precheck.sh"`,
    `pkill -f '${CHECKOUT_ROOT}/frontend_nextjs/node_modules/.bin/next'`,
    'pkill -f "$CLAUDE_PROJECT_DIR/scripts/features/precheck.sh"',
    'pkill -f "${CLAUDE_PROJECT_DIR}/frontend_nextjs"',
    'kill 12345',
    'kill $(lsof -ti tcp:3300)',
    'git status',
    'echo pkill is dangerous',
    'grep -n pkill notes.md',
    'scripts/features/precheck.sh --stop',
    // Trenner in Anführungszeichen trennen nichts (SYS-16, 2026-11-15)
    'git branch | grep -E "advisor|pkill|nws"',
    "echo 'a; pkill -f x'",
    'echo "a && pkill -f x"',
    `env FOO=1 pkill -f "${CHECKOUT_ROOT}/scripts/features/precheck.sh"`,
  ];
  for (const cmd of allowed) {
    test(`erlaubt: ${cmd}`, () => {
      expect(run(cmd).code).toBe(0);
    });
  }

  test('leere oder fremde Eingabe blockiert nichts', () => {
    expect(spawnSync('bash', [HOOK], { input: '', encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync('bash', [HOOK], { input: '{"tool_input":{}}', encoding: 'utf8' }).status).toBe(0);
  });
});

test.describe('precheck.sh --stop', { tag: '@SYS-16' }, () => {
  test('beendet nichts, wenn keine PID-Datei existiert', () => {
    const r = spawnSync('bash', [STOP, '--stop'], { encoding: 'utf8', env: { ...process.env, PRECHECK_PID_FILE: '/nonexistent/precheck.pid' } });
    expect(r.status).toBe(0);
    expect(r.stderr + r.stdout).toContain('kein Lauf');
  });

  test('beendet den eigenen Lauf samt Kindprozess', async () => {
    // Stellvertreter: Befehlszeile enthält precheck.sh, Kind ist ein sleep
    const run = spawn('bash', ['-c', 'sleep 30; :', 'precheck.sh'], { stdio: 'ignore' });
    const dir = mkdtempSync(path.join(tmpdir(), 'precheck-stop-'));
    const file = path.join(dir, 'precheck.pid');
    try {
      await new Promise((r) => setTimeout(r, 300)); // Kind starten lassen
      writeFileSync(file, `${run.pid} ${CHECKOUT_ROOT}\n`);
      const r = spawnSync('bash', [STOP, '--stop'], { encoding: 'utf8', env: { ...process.env, PRECHECK_PID_FILE: file } });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('beendet');
      // Zombie gilt als beendet (Node holt den Kindprozess erst nach spawnSync ab)
      const stat = spawnSync('ps', ['-o', 'stat=', '-p', String(run.pid)], { encoding: 'utf8' }).stdout.trim();
      expect(stat === '' || stat.startsWith('Z')).toBe(true);
    } finally {
      run.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('beendet keinen fremden Prozess (PID-Datei zeigt auf Befehl ohne eigenen Pfad)', () => {
    const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
    const dir = mkdtempSync(path.join(tmpdir(), 'precheck-stop-'));
    const file = path.join(dir, 'precheck.pid');
    try {
      // PID-Datei nennt diesen Checkout, aber der Befehl ist nicht precheck.sh → nichts beenden
      writeFileSync(file, `${sleeper.pid} ${CHECKOUT_ROOT}\n`);
      const r = spawnSync('bash', [STOP, '--stop'], { encoding: 'utf8', env: { ...process.env, PRECHECK_PID_FILE: file } });
      expect(r.status).toBe(0);
      expect(() => process.kill(sleeper.pid!, 0)).not.toThrow(); // lebt noch
    } finally {
      sleeper.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
