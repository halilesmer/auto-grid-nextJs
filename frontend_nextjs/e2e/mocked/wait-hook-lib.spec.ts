/**
 * Claude-Hook gegen Warten im Vordergrund, ohne Browser (hooks/claude/pre-bash-wait.sh).
 * SYS-14 until/while + sleep und sleep ≥ 60 s ohne run_in_background → Exit 2; Hintergrund und timeout ≤ 120 erlaubt.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CHECKOUT_ROOT } from '../fixtures/env';

const HOOK = path.join(CHECKOUT_ROOT, 'hooks/claude/pre-bash-wait.sh');

function run(command: string, runInBackground?: boolean) {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command, ...(runInBackground === undefined ? {} : { run_in_background: runInBackground }) },
  });
  const r = spawnSync('bash', [HOOK], { input, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}

test.describe('pre-bash-wait: kein Warten im Vordergrund', { tag: '@SYS-14' }, () => {
  const blocked = [
    'until grep -q FINISHED /tmp/run.log; do sleep 10; done; tail /tmp/run.log',
    'while ! test -f done.txt; do sleep 5; done',
    'for i in 1 2; do\n  until test -f a; do\n    sleep 30\n  done\ndone',
    'timeout 600 bash -c "while true; do sleep 5; done"',
    'sleep 90 && gh pr checks 5',
    "bash -c 'sleep 300'",
  ];
  for (const cmd of blocked) {
    test(`blockiert: ${cmd.split('\n')[0]}`, () => {
      const r = run(cmd);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('pre-bash-wait (SYS-14)');
      expect(r.stderr).toContain('run_in_background');
    });
  }

  const allowed = [
    'sleep 2; git status',
    'while read l; do echo "$l"; done < list.txt',
    "timeout 60 bash -c 'until curl -s localhost:3300 >/dev/null; do sleep 1; done'",
    'git log --until=yesterday --oneline; sleep 5',
    'scripts/features/precheck.sh',
  ];
  for (const cmd of allowed) {
    test(`erlaubt: ${cmd}`, () => {
      expect(run(cmd).code).toBe(0);
    });
  }

  test('im Hintergrund ist auch die Warteschleife erlaubt', () => {
    expect(run('until grep -q FINISHED /tmp/run.log; do sleep 10; done', true).code).toBe(0);
  });

  test('leere oder fremde Eingabe blockiert nichts', () => {
    expect(spawnSync('bash', [HOOK], { input: '', encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync('bash', [HOOK], { input: '{"tool_input":{}}', encoding: 'utf8' }).status).toBe(0);
  });
});
