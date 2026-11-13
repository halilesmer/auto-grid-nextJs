/**
 * Prüfskripte ohne Browser (scripts/features/e2e_server.sh, precheck.sh, run.sh).
 * SYS-10 R3-06 ein verwaister Testserver wird auch in einem Checkout-Pfad mit „playwright“ beendet,
 * ein Server unter einem echten Playwright-Lauf nie; R3-11 ein leerer Port ist ein Fehler, keine stille
 * Auslassung; R3-07 ein Teillauf von precheck.sh heißt nie „PRECHECK OK“; R3-08 run.sh liest nie den
 * Bericht eines älteren Laufs und wertet einen Filter ohne ausgeführten Test als Fehler;
 * R3-09 ein ungültiges E2E_PORT bricht e2e_port ab (Regeln selbst: e2e-port-lib.spec.ts).
 *
 * Die Läufe von precheck.sh/run.sh gehen gegen einen Nachbau mit falschem `npx`: kein Build, kein
 * Server, kein Browser, keine Sperre (HEAVY_LOCK=0).
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CHECKOUT_ROOT } from '../fixtures/env';

const SCRIPTS = path.join(CHECKOUT_ROOT, 'scripts/features');
const E2E_SERVER = path.join(SCRIPTS, 'e2e_server.sh');

let work: string;
let orphans: number[] = [];

test.beforeEach(() => {
  work = realpathSync(mkdtempSync(path.join(tmpdir(), 'scripts-lib-')));
});
test.afterEach(() => {
  for (const p of orphans) if (p > 1) spawnSync('kill', ['-9', String(p)]);
  orphans = [];
  rmSync(work, { recursive: true, force: true });
});

function bash(script: string, extra: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CI;
  delete env.E2E_REUSE;
  delete env.E2E_PORT;
  return spawnSync('bash', ['-c', script], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function waitFor(cond: () => boolean, ms = 8_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zeitlimit beim Warten');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const alive = (pid: number) => spawnSync('kill', ['-0', String(pid)]).status === 0;
const listenerPid = (port: number) =>
  Number(spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).stdout.split('\n')[0]) || 0;

/**
 * Verwaister Testserver mit cwd = dir: Ein Zwischen-`sh` startet `bash` im Hintergrund und endet, bash
 * hängt danach an pid 1 (wie ein Server nach einem harten Abbruch des Laufs). Sonst wäre der Testlauf
 * selbst, ein echter Playwright-Prozess, sein Vorfahre. Die Kommandozeile von bash trägt `marker`; der
 * Server (node) ist sein Kind.
 */
async function startServer(dir: string, marker: string[]) {
  const port = await freePort();
  const script = `node -e "require('http').createServer().listen(${port}, '127.0.0.1')"; :`;
  spawnSync('sh', ['-c', '"$@" &', 'sh', 'bash', '-c', script, 'srv', ...marker], { cwd: dir, stdio: 'ignore' });
  await waitFor(() => listenerPid(port) > 0);
  const pid = listenerPid(port);
  const ppid = Number(spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim());
  orphans.push(pid, ppid);
  return { port, pid };
}

test.describe('e2e_server.sh', { tag: ['@SYS-10', '@SYS-11'] }, () => {
  test.skip(spawnSync('which', ['lsof']).status !== 0, 'lsof fehlt');

  test('verwaister Server in einem Checkout-Pfad mit „playwright“ wird beendet (R3-06)', async () => {
    const dir = path.join(work, 'worktrees', 'playwright-port-fix', 'frontend_nextjs');
    mkdirSync(dir, { recursive: true });
    // Der Pfad steht in der Kommandozeile des Elternprozesses, wie bei `node …/node_modules/.bin/next start`
    const { port, pid } = await startServer(dir, [path.join(dir, 'node_modules/.bin/next')]);
    const r = bash(`source "${E2E_SERVER}"; e2e_server_cleanup ${port} "${dir}" start`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('verwaister Testserver');
    await waitFor(() => !alive(pid));
  });

  test('Server unter einem echten Playwright-Lauf bleibt, start meldet Fehler (R3-06)', async () => {
    const dir = path.join(work, 'frontend_nextjs');
    mkdirSync(dir, { recursive: true });
    const { port, pid } = await startServer(dir, ['playwright', 'test', '--project=mocked']);
    const r = bash(`source "${E2E_SERVER}"; e2e_server_cleanup ${port} "${dir}" start`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('laufenden Playwright-Lauf');
    expect(alive(pid)).toBe(true);
    const exit = bash(`source "${E2E_SERVER}"; e2e_server_cleanup ${port} "${dir}" exit`);
    expect(exit.status).toBe(0);
    expect(alive(pid)).toBe(true); // beim Beenden eines anderen Laufs in Ruhe lassen
  });

  test('fremder Prozess auf dem Port wird nie beendet (start: Fehler)', async () => {
    const own = path.join(work, 'frontend_nextjs');
    const other = path.join(work, 'other');
    mkdirSync(own, { recursive: true });
    mkdirSync(other, { recursive: true });
    const { port, pid } = await startServer(other, ['x']);
    const r = bash(`source "${E2E_SERVER}"; e2e_server_cleanup ${port} "${own}" start`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Fremder Prozess');
    expect(alive(pid)).toBe(true);
  });

  test('leerer Port: start ist ein Fehler, exit tut nichts, E2E_REUSE=1 lässt es zu (R3-11)', () => {
    const dir = path.join(work, 'frontend_nextjs');
    mkdirSync(dir, { recursive: true });
    const start = bash(`source "${E2E_SERVER}"; e2e_server_cleanup "" "${dir}" start`);
    expect(start.status).toBe(1);
    expect(start.stderr).toContain('Port dieses Checkouts unbekannt');
    expect(bash(`source "${E2E_SERVER}"; e2e_server_cleanup "" "${dir}" exit`).status).toBe(0);
    expect(bash(`source "${E2E_SERVER}"; e2e_server_cleanup "" "${dir}" start`, { E2E_REUSE: '1' }).status).toBe(0);
  });

  test('e2e_port: unlesbare env.ts gibt keinen Port und eine sichtbare Fehlermeldung (R3-11)', () => {
    const dir = path.join(work, 'frontend_nextjs');
    mkdirSync(path.join(dir, 'e2e/fixtures'), { recursive: true });
    writeFileSync(path.join(dir, 'e2e/fixtures/env.ts'), 'export const E2E_PORT = (\n');
    const r = bash(`source "${E2E_SERVER}"; p=$(e2e_port "${dir}"); echo "port=[$p]"`);
    expect(r.stdout).toContain('port=[]');
    expect(r.stderr.trim().length).toBeGreaterThan(0);
  });

  test('e2e_port: ungültiges E2E_PORT gibt keinen Port und meldet den Wert (R3-09)', () => {
    const frontend = path.join(CHECKOUT_ROOT, 'frontend_nextjs');
    const bad = bash(`source "${E2E_SERVER}"; p=$(e2e_port "${frontend}"); echo "port=[$p]"`, { E2E_PORT: '99999' });
    expect(bad.stdout).toContain('port=[]');
    expect(bad.stderr).toContain('E2E_PORT="99999" ist ungültig');
    const good = bash(`source "${E2E_SERVER}"; e2e_port "${frontend}"`, { E2E_PORT: '4321' });
    expect(good.stdout.trim()).toBe('4321');
  });
});

/** Nachbau des Repos: die echten Skripte, ein falsches `npx`. */
function fakeRepo() {
  const root = path.join(work, 'repo');
  mkdirSync(path.join(root, 'scripts/features'), { recursive: true });
  for (const f of ['precheck.sh', 'run.sh', 'heavy_lock.sh', 'e2e_server.sh', 'pw_stats.py', 'update_checklist.py']) {
    cpSync(path.join(SCRIPTS, f), path.join(root, 'scripts/features', f));
  }
  // Mini-Katalog statt des echten: der echte nennt Dateien, die der Nachbau nicht hat
  mkdirSync(path.join(root, 'docs/features'), { recursive: true });
  writeFileSync(
    path.join(root, 'docs/features/features.yaml'),
    `version: 1
kategorien:
  - id: ZZZ
    titel: Nachbau
    features:
      - id: ZZZ-01
        titel: Nachbau-Feature
        beschreibung: nur für den Test der Skripte
        code: [scripts/features/run.sh]
        tiers: [e2e]
        pruefung: [nichts]
        erwartet: nichts
`,
  );
  mkdirSync(path.join(root, 'frontend_nextjs'), { recursive: true });
  writeFileSync(path.join(root, 'frontend_nextjs/playwright.config.ts'), '');
  // Python mit pyyaml: das Venv des Checkouts, sonst python3 (CI installiert requirements-dev)
  const venvPy = path.join(CHECKOUT_ROOT, 'worker_python/.venv/bin/python');
  const py = existsSync(venvPy) ? venvPy : spawnSync('which', ['python3'], { encoding: 'utf8' }).stdout.trim();
  mkdirSync(path.join(root, 'worker_python/.venv/bin'), { recursive: true });
  // Hülle statt Symlink (ein Symlink findet pyvenv.cfg und damit pyyaml nicht). `-m pytest` meldet
  // Erfolg: der Nachbau hat keine Worker-Tests.
  const pyWrap = path.join(root, 'worker_python/.venv/bin/python');
  writeFileSync(pyWrap, `#!/bin/sh\n[ "$1" = "-m" ] && [ "$2" = "pytest" ] && exit 0\nexec "${py}" "$@"\n`);
  chmodSync(pyWrap, 0o755);
  // falsche Befehle: npx schreibt auf Wunsch einen Bericht, npm tut nichts
  const bin = path.join(work, 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'npx'),
    '#!/bin/sh\nif [ -n "$STUB_JSON" ] && [ -n "$PLAYWRIGHT_JSON_OUTPUT_NAME" ]; then echo "$STUB_JSON" > "$PLAYWRIGHT_JSON_OUTPUT_NAME"; fi\nexit "${STUB_RC:-0}"\n',
  );
  writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(bin, 'npx'), 0o755);
  chmodSync(path.join(bin, 'npm'), 0o755);
  return { root, bin };
}

const STATS_RAN = '{"stats":{"expected":3,"unexpected":0,"flaky":0,"skipped":0}}';
const STATS_ZERO = '{"stats":{"expected":0,"unexpected":0,"flaky":0,"skipped":0}}';

function runIn(root: string, bin: string, script: string, args: string[], extra: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HEAVY_LOCK: '0',
    E2E_REUSE: '1',
    ...extra,
  };
  delete env.CI;
  return spawnSync('bash', [path.join(root, 'scripts/features', script), ...args], { env, encoding: 'utf8', timeout: 90_000 });
}

test.describe('precheck.sh', { tag: '@SYS-10' }, () => {
  test('Teillauf mit Playwright-Argumenten heißt TEILLAUF, nie „PRECHECK OK“ (R3-07)', () => {
    const { root, bin } = fakeRepo();
    const stub = { STUB_JSON: STATS_RAN };
    const full = runIn(root, bin, 'precheck.sh', [], stub);
    expect(full.stdout, full.stderr).toContain('PRECHECK OK');
    expect(full.status).toBe(0);
    const part = runIn(root, bin, 'precheck.sh', ['--grep', '@ZON-05'], stub);
    expect(part.status, part.stdout + part.stderr).toBe(0);
    expect(part.stdout).toContain('PRECHECK TEILLAUF');
    expect(part.stdout).toContain('kein vollständiger Check');
    expect(part.stdout).not.toContain('PRECHECK OK');
  });

  test('Teillauf mit Fehler heißt TEILLAUF … FEHLER (R3-07)', () => {
    const { root, bin } = fakeRepo();
    const part = runIn(root, bin, 'precheck.sh', ['--grep', '@ZON-05'], { STUB_JSON: STATS_ZERO });
    expect(part.status).not.toBe(0);
    expect(part.stdout).toContain('PRECHECK TEILLAUF');
    expect(part.stdout).toContain('FEHLER');
  });
});

test.describe('precheck.sh: Python-Pakete vor der Sperre', { tag: '@SYS-10' }, () => {
  test('fehlt ein Paket, endet der Lauf sofort mit Meldung und nimmt die Sperre nicht (SYS-10)', () => {
    const { root, bin } = fakeRepo();
    // Python ohne pytest/yaml: `-c 'import …'` schlägt fehl wie in einem Worktree ohne Venv
    const pyWrap = path.join(root, 'worker_python/.venv/bin/python');
    writeFileSync(pyWrap, `#!/bin/sh\n[ "$1" = "-c" ] && { echo "ModuleNotFoundError: No module named 'pytest'" >&2; exit 1; }\nexit 0\n`);
    chmodSync(pyWrap, 0o755);
    // Fremder Halter hält die Sperre: nähme das Skript sie, würde es warten (Zeitlimit 60 s, Exit 75)
    const lock = path.join(work, 'held.lock');
    mkdirSync(lock);
    writeFileSync(path.join(lock, 'owner'), 'fremd anderes-skript 00:00:00\n');
    const t0 = Date.now();
    const r = runIn(root, bin, 'precheck.sh', [], {
      HEAVY_LOCK: '1',
      HEAVY_LOCK_DIR: lock,
      HEAVY_LOCK_TIMEOUT: '60',
      STUB_JSON: STATS_RAN,
    });
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain('Python-Pakete fehlen');
    expect(r.stderr).toContain(pyWrap);
    expect(r.stderr).toContain('ln -s');
    expect(r.stderr).toContain('requirements-dev.txt');
    expect(r.stdout).not.toContain('━━');
  });
});

test.describe('run.sh', { tag: '@SYS-10' }, () => {
  test('alter Bericht wird nicht gelesen: ohne neuen Bericht schlägt der Lauf fehl (R3-08)', () => {
    const { root, bin } = fakeRepo();
    mkdirSync(path.join(root, '.feature-results'), { recursive: true });
    writeFileSync(path.join(root, '.feature-results/e2e.json'), STATS_RAN); // Bericht eines früheren Laufs
    const r = runIn(root, bin, 'run.sh', ['e2e', 'ZZZ']); // npx schreibt nichts (abgebrochener Lauf)
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(r.stderr).toContain('kein Playwright-Bericht');
  });

  test('Filter ohne einen ausgeführten Test ist ein Fehler (R3-08)', () => {
    const { root, bin } = fakeRepo();
    const r = runIn(root, bin, 'run.sh', ['e2e', 'ZZZ'], { STUB_JSON: STATS_ZERO });
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(r.stderr).toContain('kein Test für den Filter "ZZZ"');
  });

  test('Filter mit ausgeführten Tests ist grün (R3-08)', () => {
    const { root, bin } = fakeRepo();
    const r = runIn(root, bin, 'run.sh', ['e2e', 'ZZZ'], { STUB_JSON: STATS_RAN });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  test('ohne Filter: null Tests bleiben ein Fehler (RULES §4.9)', () => {
    const { root, bin } = fakeRepo();
    const r = runIn(root, bin, 'run.sh', ['e2e'], { STUB_JSON: STATS_ZERO });
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(r.stderr).toContain('KEIN Test ausgeführt');
  });
});
