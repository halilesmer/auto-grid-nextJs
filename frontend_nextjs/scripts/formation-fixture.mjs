#!/usr/bin/env node
/**
 * Holt Kerzen vom Worker (GET /api/market/{id}/rates) und schreibt sie als Fixture für die Formationstests:
 * e2e/fixtures/formation/<name>.json mit symbol, timeframe und bars (Zeit + OHLC, keine Herkunftsangabe).
 *
 *   node scripts/formation-fixture.mjs --account <id> --symbol EURUSD --tf H4 \
 *        --from 2025-09-01 --to 2025-10-10 --name frz-example-h4-01
 *
 * Adresse und Schlüssel kommen aus NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WORKER_API_KEY in .env.local
 * (oder der Umgebung); der Schlüssel wird nie ausgegeben. --from/--to sind Daten (YYYY-MM-DD) in
 * MT5-Zeit (Brokeruhr) wie im Worker, --to ist ausgeschlossen. Die Zeiten der Kerzen bleiben MT5-Sekunden.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--') || argv[i + 1] === undefined) throw new Error(`Argument ungültig: ${key}`);
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}

function toSec(date, label) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`--${label} muss YYYY-MM-DD sein`);
  return Math.floor(ms / 1000);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const k of ['account', 'symbol', 'tf', 'from', 'to', 'name']) {
    if (!args[k]) throw new Error(`--${k} fehlt`);
  }
  if (!TIMEFRAMES.includes(args.tf)) throw new Error(`--tf muss eins von ${TIMEFRAMES.join(', ')} sein`);
  if (!/^[a-z0-9-]+$/.test(args.name)) throw new Error('--name: nur a-z, 0-9 und Bindestrich');

  const env = { ...readEnvFile(path.join(ROOT, '.env.local')), ...process.env };
  const base = env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  const key = env.NEXT_PUBLIC_WORKER_API_KEY;
  if (!base) throw new Error('NEXT_PUBLIC_API_URL fehlt (.env.local)');

  const to = toSec(args.to, 'to');
  let from = toSec(args.from, 'from');
  const bars = [];
  while (from !== null) {
    const url = new URL(`${base}/api/market/${encodeURIComponent(args.account)}/rates`);
    url.search = new URLSearchParams({ symbol: args.symbol, timeframe: args.tf, from: String(from), to: String(to) });
    const res = await fetch(url, {
      redirect: 'error', // der Schlüssel geht nie an einen anderen Ursprung
      signal: AbortSignal.timeout(60_000),
      headers: { 'ngrok-skip-browser-warning': '1', ...(key ? { 'X-API-Key': key } : {}) },
    });
    if (!res.ok) throw new Error(`Worker antwortet ${res.status}`);
    const data = await res.json();
    // die laufende, unfertige Kerze gehört nicht in eine Fixture
    const n = data.live_from == null ? data.t.length : data.t.indexOf(data.live_from);
    for (let i = 0; i < n; i++) {
      bars.push({ time: data.t[i], open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i] });
    }
    // fehlende Kerzen wegen Fehler oder Auslastung würden eine falsche Fixture ergeben
    const bad = (data.missing ?? []).filter((m) => m.reason === 'busy' || m.reason === 'error');
    if (bad.length) throw new Error(`${bad.length} Bereiche nicht geladen (${bad[0].reason}); später erneut versuchen`);
    if (data.missing?.length) console.warn(`Warnung: ${data.missing.length} Bereiche ohne Kerzen (z. B. Marktpause)`);
    const next = data.next_from ?? null;
    if (next !== null && next <= from) throw new Error('Worker meldet next_from ohne Fortschritt');
    from = next;
  }
  if (bars.length === 0) throw new Error('Keine Kerzen im Fenster');

  const dir = path.join(ROOT, 'e2e', 'fixtures', 'formation');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${args.name}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ symbol: args.symbol, timeframe: args.tf, bars })}\n`);
  console.log(`${bars.length} Kerzen → ${path.relative(ROOT, file)}`);
}

main().catch((e) => {
  console.error(`formation-fixture: ${e.message}`);
  process.exit(1);
});
