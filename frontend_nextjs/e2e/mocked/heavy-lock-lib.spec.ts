/**
 * Maschinenweite Sperre für schwere Testläufe ohne Browser (scripts/features/heavy_lock.sh).
 * SYS-11 Zwei schwere Läufe laufen nacheinander; eine veraltete Sperre wird gelöscht;
 * HEAVY_LOCK=0 und CI überspringen; die Sperre wird auch bei Fehler freigegeben, der Exit-Code bleibt;
 * ein Halter ohne Fortschritt wird gemeldet (nach Ruhezustand nicht); Speicherdruck stoppt den Lauf.
 *
 * Jeder Test nimmt ein eigenes Sperrverzeichnis (HEAVY_LOCK_DIR), nie /tmp/gridrobot-heavy.lock.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CHECKOUT_ROOT } from '../fixtures/env';

const SCRIPT = path.join(CHECKOUT_ROOT, 'scripts/features/heavy_lock.sh');

let work: string;
let lockDir: string;

/** Umgebung ohne CI/HEAVY_LOCK des Testlaufs (CI setzt CI=true, das würde die Sperre abschalten). */
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // Speicherprüfung aus: die Maschine des Testlaufs darf unter Druck stehen (eigener Test unten)
  const e: NodeJS.ProcessEnv = {
    ...process.env,
    HEAVY_LOCK_DIR: lockDir,
    HEAVY_LOCK_POLL: '0.1',
    HEAVY_LOCK_SKIP_MEM_CHECK: '1',
  };
  delete e.CI;
  delete e.HEAVY_LOCK;
  delete e.HEAVY_LOCK_TIMEOUT;
  return { ...e, ...extra };
}

function run(args: string[], extra: Record<string, string> = {}) {
  return spawnSync('bash', [SCRIPT, ...args], { env: env(extra), encoding: 'utf8', timeout: 20_000 });
}

/** Läuft im Hintergrund; das Promise liefert Exit-Code und stderr. */
function runAsync(args: string[], extra: Record<string, string> = {}) {
  const child = spawn('bash', [SCRIPT, ...args], { env: env(extra) });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const done = new Promise<{ code: number | null; stderr: string }>((resolve) =>
    child.on('exit', (code) => resolve({ code, stderr })),
  );
  return { child, done };
}

async function waitFor(cond: () => boolean, ms = 10_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zeitlimit beim Warten');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Sperre so anlegen, wie ein laufender anderer Prozess sie hält (Format von heavy-run.sh). */
function holdLock(pid: number) {
  mkdirSync(lockDir);
  writeFileSync(path.join(lockDir, 'owner'), `${pid} other-worktree 12:00:00\n`);
}

test.describe('Sperre für schwere Läufe', { tag: '@SYS-11' }, () => {
  test.beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), 'heavy-lock-'));
    lockDir = path.join(work, 'lock');
  });
  test.afterEach(() => rmSync(work, { recursive: true, force: true }));

  test('zwei gleichzeitige Läufe laufen nacheinander, nicht überlappend', async () => {
    const log = path.join(work, 'log');
    const job = (name: string) => [
      'bash',
      '-c',
      `echo "${name} start $(date +%s.%N 2>/dev/null || date +%s)" >> "${log}"; sleep 1; echo "${name} end" >> "${log}"`,
    ];
    const a = runAsync(job('A'));
    await waitFor(() => existsSync(path.join(lockDir, 'owner')));
    const b = runAsync(job('B'));
    const [ra, rb] = await Promise.all([a.done, b.done]);
    expect(ra.code).toBe(0);
    expect(rb.code).toBe(0);
    const lines = readFileSync(log, 'utf8').trim().split('\n').map((l) => l.split(' ').slice(0, 2).join(' '));
    expect(lines).toEqual(['A start', 'A end', 'B start', 'B end']);
    expect(rb.stderr).toContain('Sperre hält');
    expect(existsSync(lockDir)).toBe(false);
  });

  test('nach kill -9 wird die veraltete Sperre gelöscht', async () => {
    const a = runAsync(['sleep', '30']);
    await waitFor(() => existsSync(path.join(lockDir, 'owner')));
    const ownerPid = Number(readFileSync(path.join(lockDir, 'owner'), 'utf8').split(' ')[0]);
    expect(ownerPid).toBe(a.child.pid);
    a.child.kill('SIGKILL');
    await a.done;
    spawnSync('pkill', ['-P', String(ownerPid)]); // verwaistes sleep aufräumen
    expect(existsSync(lockDir)).toBe(true); // kill -9 lässt die Sperre liegen
    const r = run(['echo', 'B lief']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('veraltete Sperre gelöscht');
    expect(r.stdout).toContain('B lief');
    expect(existsSync(lockDir)).toBe(false);
  });

  test('HEAVY_LOCK=0 und CI laufen sofort, trotz gehaltener Sperre', () => {
    holdLock(process.pid); // lebender fremder Halter
    for (const extra of [{ HEAVY_LOCK: '0' }, { CI: 'true' }] as Record<string, string>[]) {
      const r = run(['echo', 'ohne Sperre'], { ...extra, HEAVY_LOCK_TIMEOUT: '1' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('ohne Sperre');
    }
    // fremde Sperre unangetastet
    expect(readFileSync(path.join(lockDir, 'owner'), 'utf8')).toContain(String(process.pid));
  });

  test('Fehler im Befehl: Sperre frei, Exit-Code bleibt', () => {
    const r = run(['bash', '-c', 'exit 7']);
    expect(r.status).toBe(7);
    expect(existsSync(lockDir)).toBe(false);
  });

  test('SIGTERM gibt die Sperre frei', async () => {
    const a = runAsync(['sleep', '30']);
    await waitFor(() => existsSync(path.join(lockDir, 'owner')));
    spawnSync('pkill', ['-TERM', '-P', String(a.child.pid)]); // Befehl endet, Hülle läuft weiter
    a.child.kill('SIGTERM');
    const ra = await a.done;
    expect(ra.code).not.toBe(0);
    expect(existsSync(lockDir)).toBe(false);
  });

  test('HEAVY_LOCK_TIMEOUT: Exit 75 mit Halter in der Meldung', () => {
    holdLock(process.pid);
    const r = run(['echo', 'nie'], { HEAVY_LOCK_TIMEOUT: '1' });
    expect(r.status).toBe(75);
    expect(r.stdout).not.toContain('nie');
    expect(r.stderr).toContain('other-worktree');
  });

  test('MAX_IDLE warnt bei Halter ohne Fortschritt; HEAVY_LOCK_BREAK beendet ihn', async () => {
    // Halter wie precheck.sh: Bibliothek per source, Sperre nehmen, Schritt melden, dann still (sleep)
    const a = spawn('bash', ['-c', `source "${SCRIPT}"; heavy_lock_acquire; heavy_lock_step e2e; sleep 30`], {
      env: env(),
    });
    const aDone = new Promise<number | null>((resolve) => a.on('exit', (code) => resolve(code)));
    await waitFor(() => existsSync(path.join(lockDir, 'step')));
    const warn = run(['echo', 'nie'], { HEAVY_LOCK_MAX_IDLE: '2', HEAVY_LOCK_TIMEOUT: '5' });
    expect(warn.status).toBe(75);
    expect(warn.stderr).toContain('ohne Fortschritt');
    expect(warn.stderr).toContain('letzter Schritt: e2e');
    const brk = run(['echo', 'B lief'], { HEAVY_LOCK_MAX_IDLE: '2', HEAVY_LOCK_BREAK: '1' });
    expect(brk.status).toBe(0);
    expect(brk.stdout).toContain('B lief');
    expect(await aDone).not.toBe(0); // Halter wurde beendet
    expect(existsSync(lockDir)).toBe(false);
  });

  test('ein arbeitender Halter (CPU steigt) gilt nicht als hängend', async () => {
    const a = runAsync(['bash', '-c', 'while :; do :; done']);
    await waitFor(() => existsSync(path.join(lockDir, 'owner')));
    const r = run(['echo', 'nie'], { HEAVY_LOCK_MAX_IDLE: '2', HEAVY_LOCK_TIMEOUT: '5' });
    expect(r.status).toBe(75);
    expect(r.stderr).not.toContain('ohne Fortschritt');
    spawnSync('pkill', ['-P', String(a.child.pid)]);
    await a.done;
  });

  test('Uhrsprung (Ruhezustand) setzt den Leerlaufzähler zurück', async () => {
    const a = runAsync(['sleep', '30']);
    await waitFor(() => existsSync(path.join(lockDir, 'owner')));
    const w = runAsync(['echo', 'nie'], { HEAVY_LOCK_SLEEP_GAP: '1', HEAVY_LOCK_TIMEOUT: '6' });
    await new Promise((r) => setTimeout(r, 1000));
    w.child.kill('SIGSTOP'); // Wartender „schläft“ wie ein zugeklappter Mac
    await new Promise((r) => setTimeout(r, 3000));
    w.child.kill('SIGCONT');
    const rw = await w.done;
    expect(rw.code).toBe(75);
    expect(rw.stderr).toContain('Uhrsprung');
    spawnSync('pkill', ['-P', String(a.child.pid)]);
    await a.done;
  });

  test('Speicherprüfung: bei Druck Exit 76 und Sperre frei; SKIP_MEM_CHECK läuft', () => {
    test.skip(process.platform !== 'darwin', 'kern.memorystatus_level gibt es nur auf macOS');
    const force = {
      HEAVY_LOCK_SWAP_MAX: '0',
      HEAVY_LOCK_MEM_MIN: '101',
      HEAVY_LOCK_MEM_WINDOW: '0',
      HEAVY_LOCK_SKIP_MEM_CHECK: '0',
    };
    const r = run(['echo', 'nie'], force);
    expect(r.status).toBe(76);
    expect(r.stdout).not.toContain('nie');
    expect(r.stderr).toContain('zu wenig Speicher');
    expect(existsSync(lockDir)).toBe(false);
    const skip = run(['echo', 'trotzdem'], { ...force, HEAVY_LOCK_SKIP_MEM_CHECK: '1' });
    expect(skip.status).toBe(0);
    expect(skip.stdout).toContain('trotzdem');
  });

  test('hält ein Vorfahr die Sperre, läuft der Befehl ohne Warten (Wiedereintritt)', () => {
    const r = run(['bash', SCRIPT, 'echo', 'innen'], { HEAVY_LOCK_TIMEOUT: '2' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('innen');
    expect(r.stderr).toContain('Vorfahr');
    expect(existsSync(lockDir)).toBe(false);
  });
});
