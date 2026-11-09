/**
 * Maschinenweite Sperre für schwere Testläufe ohne Browser (scripts/features/heavy_lock.sh).
 * SYS-11 Zwei schwere Läufe laufen nacheinander; eine veraltete Sperre wird gelöscht;
 * HEAVY_LOCK=0 und CI überspringen; die Sperre wird auch bei Fehler freigegeben, der Exit-Code bleibt;
 * ein Halter ohne Fortschritt wird gemeldet (nach Ruhezustand nicht); Speicherdruck stoppt den Lauf;
 * ein fremder owner ohne pid wird nie als tot gewertet;
 * R3-03 viele Wartende vor einer toten Sperre betreten den kritischen Bereich nie gemeinsam;
 * R3-04 owner trägt die Startzeit des Halters (4. Feld), eine wiederverwendete pid gilt als veraltet
 * und wird nie beendet, ein owner ohne 4. Feld (älteres Skript) bleibt gültig;
 * R3-10 „Operation not permitted“ bei kill -0 heißt: der Halter lebt;
 * FIFO Wartende bekommen die Sperre in Ankunftsreihenfolge; die Fahrkarte eines getöteten Wartenden hält die
 * Schlange nicht auf; ein älteres Skript ohne Fahrkarte verklemmt nichts.
 *
 * Jeder Test nimmt ein eigenes Sperrverzeichnis (HEAVY_LOCK_DIR), nie /tmp/gridrobot-heavy.lock.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CHECKOUT_ROOT } from '../fixtures/env';

const SCRIPT = path.join(CHECKOUT_ROOT, 'scripts/features/heavy_lock.sh');

let work: string;
let lockDir: string;
let holders: ChildProcess[] = [];

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
  return { child, done, err: () => stderr };
}

async function waitFor(cond: () => boolean, ms = 10_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zeitlimit beim Warten');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Wartet, bis die Hülle ihren Befehl gestartet hat. `owner` wird VOR dem Befehl geschrieben: ein
 * `pkill -P` direkt nach `owner` kann ins Leere gehen (unter Last, R3-Nachlauf), und dann hält
 * bash das TERM-Signal zurück, bis das 30 s lange `sleep` endet.
 */
async function waitForCommand(wrapperPid: number | undefined) {
  await waitFor(() => spawnSync('pgrep', ['-P', String(wrapperPid)]).stdout.length > 0);
}

/**
 * Sperre so anlegen, wie ein laufender anderer Prozess sie hält (Format von heavy-run.sh).
 * Halter ist ein eigenes `sleep`, kein Vorfahr der Hülle: process.pid wäre ein Vorfahr, und dann
 * liefe die Hülle per Wiedereintritt ohne Warten.
 */
function holdLock(): ChildProcess {
  const holder = spawn('sleep', ['60']);
  mkdirSync(lockDir);
  writeFileSync(path.join(lockDir, 'owner'), `${holder.pid} other-worktree 12:00:00\n`);
  holders.push(holder);
  return holder;
}

test.describe('Sperre für schwere Läufe', { tag: '@SYS-11' }, () => {
  test.beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), 'heavy-lock-'));
    lockDir = path.join(work, 'lock');
  });
  test.afterEach(() => {
    for (const h of holders) h.kill('SIGKILL');
    holders = [];
    rmSync(work, { recursive: true, force: true });
  });

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
    const holder = holdLock(); // lebender fremder Halter
    for (const extra of [{ HEAVY_LOCK: '0' }, { CI: 'true' }] as Record<string, string>[]) {
      const r = run(['echo', 'ohne Sperre'], { ...extra, HEAVY_LOCK_TIMEOUT: '1' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('ohne Sperre');
    }
    // fremde Sperre unangetastet
    expect(readFileSync(path.join(lockDir, 'owner'), 'utf8')).toContain(String(holder.pid));
  });

  test('Fehler im Befehl: Sperre frei, Exit-Code bleibt', () => {
    const r = run(['bash', '-c', 'exit 7']);
    expect(r.status).toBe(7);
    expect(existsSync(lockDir)).toBe(false);
  });

  test('SIGTERM gibt die Sperre frei', async () => {
    const a = runAsync(['sleep', '30']);
    await waitFor(() => existsSync(path.join(lockDir, 'owner')));
    await waitForCommand(a.child.pid);
    spawnSync('pkill', ['-TERM', '-P', String(a.child.pid)]); // Befehl endet, Hülle läuft weiter
    a.child.kill('SIGTERM');
    const ra = await a.done;
    expect(ra.code).not.toBe(0);
    expect(existsSync(lockDir)).toBe(false);
  });

  test('HEAVY_LOCK_TIMEOUT: Exit 75 mit Halter in der Meldung', () => {
    holdLock();
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

  // Gemessene Werte kommen aus der Umgebung (HEAVY_LOCK_TEST_*), nie vom echten sysctl der Maschine.
  const memForce = { HEAVY_LOCK_MEM_WINDOW: '0', HEAVY_LOCK_SKIP_MEM_CHECK: '0' };
  const swapUsage = (total: string, used: string) => `total = ${total}M  used = ${used}M  free = 0.00M  (encrypted)`;

  test('Speicherprüfung: bei Druck Exit 76 und Sperre frei; SKIP_MEM_CHECK läuft', () => {
    const force = {
      ...memForce,
      HEAVY_LOCK_TEST_MEMLEVEL: '5',
      HEAVY_LOCK_TEST_SWAPUSAGE: swapUsage('1024.00', '1000.00'),
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

  test('Speicherprüfung: ohne Swap (total 0) oder bei freiem Speicher kein Druck, Lauf startet', () => {
    // kein Swap: kein Druck, auch bei sehr wenig freiem Speicher
    const noSwap = run(['echo', 'ohne-swap'], {
      ...memForce,
      HEAVY_LOCK_TEST_MEMLEVEL: '5',
      HEAVY_LOCK_TEST_SWAPUSAGE: swapUsage('0.00', '0.00'),
    });
    expect(noSwap.status).toBe(0);
    expect(noSwap.stdout).toContain('ohne-swap');
    // Swap voll, aber genug freier Speicher: kein Druck
    const freeMem = run(['echo', 'viel-frei'], {
      ...memForce,
      HEAVY_LOCK_TEST_MEMLEVEL: '60',
      HEAVY_LOCK_TEST_SWAPUSAGE: swapUsage('1024.00', '1000.00'),
    });
    expect(freeMem.status).toBe(0);
    expect(freeMem.stdout).toContain('viel-frei');
    expect(freeMem.stderr).not.toContain('Speicherdruck');
  });

  test('fremder owner ohne pid: Wartender löscht nicht, läuft erst nach Freigabe', async () => {
    mkdirSync(lockDir);
    writeFileSync(path.join(lockDir, 'owner'), 'pane-model-pr2 osc-panes-tv 18:00\n');
    const t = run(['echo', 'nie'], { HEAVY_LOCK_TIMEOUT: '2' });
    expect(t.status).toBe(75);
    expect(t.stderr).toContain('fremder Halter');
    expect(t.stderr).not.toContain('veraltete Sperre');
    expect(readFileSync(path.join(lockDir, 'owner'), 'utf8')).toContain('pane-model-pr2');
    const w = runAsync(['echo', 'nach Freigabe']);
    let out = '';
    w.child.stdout?.on('data', (d) => (out += d));
    await new Promise((r) => setTimeout(r, 800));
    expect(existsSync(lockDir)).toBe(true); // wartet noch
    rmSync(lockDir, { recursive: true, force: true }); // fremder Halter gibt frei
    expect((await w.done).code).toBe(0);
    expect(out).toContain('nach Freigabe');
  });

  test('fremder owner: nach HEAVY_LOCK_FOREIGN_MAX wacher Wartezeit nur das Verzeichnis gelöscht', () => {
    mkdirSync(lockDir);
    writeFileSync(path.join(lockDir, 'owner'), 'pane-model-pr2 osc-panes-tv 18:00\n');
    const r = run(['echo', 'danach'], { HEAVY_LOCK_FOREIGN_MAX: '1' });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('fremde Sperre');
    expect(r.stdout).toContain('danach');
  });

  test('hält ein Vorfahr die Sperre, läuft der Befehl ohne Warten (Wiedereintritt)', () => {
    const r = run(['bash', SCRIPT, 'echo', 'innen'], { HEAVY_LOCK_TIMEOUT: '2' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('innen');
    expect(r.stderr).toContain('Vorfahr');
    expect(existsSync(lockDir)).toBe(false);
  });
  /** Startzeit wie heavy_lock.sh sie schreibt: ps lstart, Leerzeichen zu _ */
  function lstartOf(pid: number): string {
    const out = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    return out.stdout.trim().replace(/\s+/g, '_');
  }

  test('owner hat die Startzeit als 4. Feld, die ersten drei Felder bleiben (R3-04)', async () => {
    const a = runAsync(['sleep', '30']);
    await waitFor(() => existsSync(path.join(lockDir, 'owner')));
    const owner = readFileSync(path.join(lockDir, 'owner'), 'utf8').trim();
    expect(owner).toMatch(/^\d+ \S+ \d\d:\d\d:\d\d ls=\S+$/);
    expect(owner.split(' ')[0]).toBe(String(a.child.pid));
    expect(owner.split(' ')[3]).toBe(`ls=${lstartOf(a.child.pid as number)}`);
    await waitForCommand(a.child.pid);
    spawnSync('pkill', ['-P', String(a.child.pid)]);
    await a.done;
  });

  test('wiederverwendete pid (Startzeit passt nicht) gilt als veraltet, der Prozess bleibt (R3-04)', () => {
    const holder = spawn('sleep', ['60']);
    holders.push(holder);
    mkdirSync(lockDir);
    writeFileSync(path.join(lockDir, 'owner'), `${holder.pid} other-worktree 12:00:00 ls=Mon_Jan_1_00:00:00_2001\n`);
    // MAX_IDLE + BREAK: der alte Stand hätte den fremden Prozess nach 2 s beendet
    const r = run(['echo', 'B lief'], { HEAVY_LOCK_MAX_IDLE: '2', HEAVY_LOCK_BREAK: '1', HEAVY_LOCK_TIMEOUT: '10' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('B lief');
    expect(r.stderr).toContain('veraltete Sperre gelöscht');
    expect(r.stderr).not.toContain('beende Prozessbaum');
    expect(spawnSync('kill', ['-0', String(holder.pid)]).status).toBe(0); // lebt noch
  });

  test('owner mit passender Startzeit gilt als lebender Halter (R3-04)', () => {
    const holder = spawn('sleep', ['60']);
    holders.push(holder);
    mkdirSync(lockDir);
    const ls = lstartOf(holder.pid as number);
    writeFileSync(path.join(lockDir, 'owner'), `${holder.pid} other-worktree 12:00:00 ls=${ls}\n`);
    const r = run(['echo', 'nie'], { HEAVY_LOCK_TIMEOUT: '1' });
    expect(r.status).toBe(75);
    expect(r.stderr).not.toContain('veraltete Sperre');
  });

  test('owner ohne 4. Feld (älteres Skript) bleibt gültig, solange die pid lebt (R3-04)', () => {
    holdLock(); // schreibt „<pid> other-worktree 12:00:00“
    const r = run(['echo', 'nie'], { HEAVY_LOCK_TIMEOUT: '1' });
    expect(r.status).toBe(75);
    expect(r.stderr).not.toContain('veraltete Sperre');
  });

  test('kill -0 mit „Operation not permitted“ zählt als lebender Halter (R3-10)', () => {
    test.skip(process.getuid?.() === 0, 'als root gibt es kein EPERM');
    // Ein Prozess ohne Kinder, der root gehört: kill -0 antwortet dem normalen Benutzer mit EPERM
    const ps = spawnSync('ps', ['-axo', 'pid=,user='], { encoding: 'utf8' }).stdout.trim().split('\n');
    const rootPid = ps
      .map((l) => l.trim().split(/\s+/))
      .filter(([pid, user]) => user === 'root' && Number(pid) > 1)
      .map(([pid]) => pid)
      .find((pid) => spawnSync('pgrep', ['-P', pid]).stdout.length === 0);
    test.skip(!rootPid, 'kein root-Prozess ohne Kinder gefunden');
    expect(spawnSync('kill', ['-0', rootPid as string]).status).not.toBe(0); // EPERM wie erwartet
    mkdirSync(lockDir);
    writeFileSync(path.join(lockDir, 'owner'), `${rootPid} other-worktree 12:00:00\n`);
    const r = run(['echo', 'nie'], { HEAVY_LOCK_TIMEOUT: '1' });
    expect(r.status).toBe(75);
    expect(r.stderr).not.toContain('veraltete Sperre');
    expect(readFileSync(path.join(lockDir, 'owner'), 'utf8')).toContain(`${rootPid} other-worktree`);
  });

  test('owner mit pid 1 gilt als fremder Halter: nie ein Baum ab pid 1 beendet (R3-10)', () => {
    mkdirSync(lockDir);
    writeFileSync(path.join(lockDir, 'owner'), '1 other-worktree 12:00:00\n');
    const wait = run(['echo', 'nie'], { HEAVY_LOCK_TIMEOUT: '1' });
    expect(wait.status).toBe(75);
    expect(wait.stderr).toContain('fremder Halter');
    // BREAK: bei einem fremden Halter nur das Verzeichnis löschen, nie einen Prozess beenden
    const brk = run(['echo', 'B lief'], { HEAVY_LOCK_MAX_IDLE: '0', HEAVY_LOCK_BREAK: '1', HEAVY_LOCK_TIMEOUT: '10' });
    expect(brk.status).toBe(0);
    expect(brk.stderr).toContain('fremde Sperre');
    expect(brk.stderr).not.toContain('beende Prozessbaum');
  });

  test('_hl_mtime: fehlende Datei gibt genau „0“, vorhandene eine Zahl (GNU und BSD stat)', () => {
    // Unter GNU stat lieferte der Rückfall `stat -f` Dateisystem-Angaben statt 0 und brach die
    // Arithmetik ab (CI-Fehler im Stresstest R3-03).
    writeFileSync(path.join(work, 'da'), 'x');
    const r = spawnSync(
      'bash',
      ['-c', `source "${SCRIPT}"; echo "fehlt=[$(_hl_mtime "${work}/nicht-da")]"; echo "da=[$(_hl_mtime "${work}/da")]"`],
      { env: env(), encoding: 'utf8' },
    );
    expect(r.stdout).toContain('fehlt=[0]');
    const da = /da=\[(\d+)\]/.exec(r.stdout);
    expect(da, r.stdout).not.toBeNull();
    expect(Math.abs(Number(da?.[1]) - Date.now() / 1000)).toBeLessThan(30);
  });

  test('viele Wartende vor einer toten Sperre: nie zwei im kritischen Bereich (R3-03)', () => {
    test.setTimeout(150_000); // vier Runden mit je 15 Hüllen; auf einer ausgelasteten Maschine über 30 s
    // Je Runde: tote Sperre, 15 gleichzeitige Hüllen. Der kritische Bereich ist ein mkdir ohne Wartezeit:
    // schlägt es fehl, hielten zwei gleichzeitig die Sperre. Der alte Stand verletzte das in etwa
    // jeder zweiten Runde (eine Hülle löschte die frische Sperre einer anderen).
    const harness = `
      set -u
      N=15
      for round in 1 2 3 4; do
        d=$(mktemp -d "${work}/r.XXXXXX")
        export HEAVY_LOCK_DIR="$d/lock" HEAVY_LOCK_POLL=0.05 HEAVY_LOCK_SKIP_MEM_CHECK=1
        sleep 0.1 & dead=$!; wait $dead
        mkdir "$HEAVY_LOCK_DIR"; echo "$dead other 12:00:00" > "$HEAVY_LOCK_DIR/owner"
        pids=()
        for i in $(seq 1 $N); do
          bash "${SCRIPT}" bash -c "if mkdir '$d/cs' 2>/dev/null; then sleep 0.05; rmdir '$d/cs'; else echo VIOLATION; fi; echo OK" 2>>"$d/err" >>"$d/out" &
          pids+=($!)
        done
        for p in "\${pids[@]}"; do wait $p || echo "rc=$?" >> "$d/rcs"; done
        echo "round $round violations=$(grep -c VIOLATION "$d/out" 2>/dev/null || true) done=$(grep -c OK "$d/out" 2>/dev/null || true) stale=$(grep -c 'veraltete Sperre gelöscht' "$d/err" 2>/dev/null || true)"
        echo "dbg rcs=[$(cat "$d/rcs" 2>/dev/null | sort | uniq -c | tr '\n' ' ')] err=[$(sort "$d/err" 2>/dev/null | uniq -c | sort -rn | head -6 | cut -c1-150 | tr '\n' '|')]"
      done`;
    const r = spawnSync('bash', ['-c', harness], { env: env(), encoding: 'utf8', timeout: 120_000 });
    const rounds = r.stdout.trim().split('\n').filter((l) => l.startsWith('round'));
    const dbg = r.stdout + r.stderr; // bei einem Fehler in der Meldung: Austrittscodes und stderr der Hüllen
    expect(rounds, dbg).toHaveLength(4);
    for (const line of rounds) {
      expect(line, dbg).toMatch(/violations=0 /); // kein gemeinsamer Eintritt
      expect(line, dbg).toMatch(/done=15 /); // alle 15 liefen
      expect(line, dbg).toMatch(/stale=1$/); // die tote Sperre wurde genau einmal gelöscht
    }
  });

  /** Anzahl lebender Fahrkarten in <sperre>.queue */
  const tickets = () => {
    const q = `${lockDir}.queue`;
    return existsSync(q) ? readdirSync(q).filter((f) => !f.startsWith('.')).length : 0;
  };

  test('FIFO: A, B, C warten in dieser Reihenfolge und laufen in dieser Reihenfolge', async () => {
    const log = path.join(work, 'order');
    const job = (n: string) => ['bash', '-c', `echo ${n} >> "${log}"; sleep 0.2`];
    const holder = holdLock();
    // Sequenziell aufbauen: der Nächste startet erst, wenn der Vorherige seinen Platz gemeldet hat
    const a = runAsync(job('A'));
    await waitFor(() => tickets() === 1 && /1\. Stelle der Schlange/.test(a.err()));
    const b = runAsync(job('B'));
    await waitFor(() => tickets() === 2 && /2\. Stelle der Schlange/.test(b.err()));
    const c = runAsync(job('C'));
    await waitFor(() => tickets() === 3 && /3\. Stelle der Schlange/.test(c.err()));
    holder.kill('SIGKILL'); // Halter stirbt: veraltete Sperre
    const res = await Promise.all([a.done, b.done, c.done]);
    expect(res.map((r) => r.code)).toEqual([0, 0, 0]);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['A', 'B', 'C']);
    expect(tickets()).toBe(0);
    expect(existsSync(lockDir)).toBe(false);
  });

  test('FIFO: die Fahrkarte eines mit kill -9 getöteten Wartenden hält die Schlange nicht auf', async () => {
    const log = path.join(work, 'order');
    const job = (n: string) => ['bash', '-c', `echo ${n} >> "${log}"; sleep 0.2`];
    const holder = holdLock();
    const a = runAsync(job('A'));
    await waitFor(() => tickets() === 1);
    const b = runAsync(job('B'));
    await waitFor(() => tickets() === 2);
    const c = runAsync(job('C'));
    await waitFor(() => tickets() === 3);
    a.child.kill('SIGKILL'); // vorderster Wartender stirbt, seine Fahrkarte bleibt liegen
    await a.done;
    expect(tickets()).toBe(3);
    holder.kill('SIGKILL');
    const [rb, rc] = await Promise.all([b.done, c.done]);
    expect([rb.code, rc.code]).toEqual([0, 0]);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['B', 'C']);
    expect(rb.stderr + rc.stderr).toContain('tote Fahrkarte entfernt'); // B oder C räumt sie
    expect(tickets()).toBe(0);
  });

  test('FIFO: ein älterer Wartender ohne Fahrkarte (altes Skript) verklemmt nichts', async () => {
    const log = path.join(work, 'order');
    const holder = holdLock();
    const a = runAsync(['bash', '-c', `echo A >> "${log}"; sleep 0.2`]);
    await waitFor(() => tickets() === 1);
    // so wartet das alte Skript: pollt mkdir, schreibt owner im alten Format (3 Felder), gibt frei
    const legacy = spawn('bash', ['-c', `until mkdir "${lockDir}" 2>/dev/null; do sleep 0.05; done
      echo "$$ legacy 12:00:00" > "${lockDir}/owner"; echo L >> "${log}"; sleep 0.2; rm -rf "${lockDir}"`]);
    const legacyDone = new Promise<number | null>((r) => legacy.on('exit', (c) => r(c)));
    holder.kill('SIGKILL');
    // Die ersten Wartenden räumen die tote Sperre; wer sie sieht, nimmt sie. Beide müssen fertig werden.
    // Der alte Wartende räumt selbst nicht (kennt die pid-Prüfung nicht), A tut es für ihn.
    const [ra, lc] = await Promise.all([a.done, legacyDone]);
    expect(ra.code).toBe(0);
    expect(lc).toBe(0);
    expect(readFileSync(log, 'utf8').trim().split('\n').sort()).toEqual(['A', 'L']);
    expect(existsSync(lockDir)).toBe(false);
  });
});
