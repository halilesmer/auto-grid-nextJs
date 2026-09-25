/**
 * VPS-Fernsteuerung: gemeinsame Aktionen und Typen für die Seite /vps (Client) und die
 * Route /api/vps/[action] (Server, führt worker_python/ops/windows/vps.ps1 per SSH aus).
 * Kein Worker-Aufruf: läuft nur über den lokalen Next.js-Server auf dem Mac.
 */

export const VPS_ACTIONS = {
  status: { method: 'GET', timeoutMs: 30_000 },
  'check-update': { method: 'GET', timeoutMs: 90_000 },
  logs: { method: 'GET', timeoutMs: 30_000 },
  restart: { method: 'POST', timeoutMs: 30_000 },
  // Admin-Reste beenden (auch Bots/MT5), dann wie restart
  'fix-elevated': { method: 'POST', timeoutMs: 60_000 },
  'restart-ngrok': { method: 'POST', timeoutMs: 30_000 },
  // Worker macht git pull + ggf. pip install: kann dauern
  update: { method: 'POST', timeoutMs: 330_000 },
  reboot: { method: 'POST', timeoutMs: 30_000 },
} as const;

export type VpsAction = keyof typeof VPS_ACTIONS;

export const VPS_LOGS = ['worker', 'ngrok', 'update'] as const;
export type VpsLog = (typeof VPS_LOGS)[number];

export function isVpsAction(value: string): value is VpsAction {
  return Object.prototype.hasOwnProperty.call(VPS_ACTIONS, value);
}

export function isVpsLog(value: string): value is VpsLog {
  return (VPS_LOGS as readonly string[]).includes(value);
}

// uvicorn färbt seine Konsole (ESC[32mINFO ESC[0m), die landen 1:1 in worker_console.log
const ANSI_ESCAPE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(line: string): string {
  return line.replace(ANSI_ESCAPE, '');
}

/**
 * AutoGrid-Prozess, der mit Administratorrechten läuft (höhere Integritätsstufe als die
 * Desktop-Sitzung). Der normale Worker kann ihn weder sehen noch beenden.
 */
export interface VpsElevatedProcess {
  pid: number;
  role: string;
  account: string;
}

export const ELEVATED_ROLE_LABELS: Record<string, string> = {
  'worker-loop': 'Worker-Neustart-Schleife',
  'ngrok-loop': 'ngrok-Neustart-Schleife',
  worker: 'Worker',
  ngrok: 'ngrok',
  bot: 'Bot',
  mt5: 'MT5-Terminal',
};

interface VpsTaskInfo {
  exists: boolean;
  state?: string;
  last_run?: string | null;
  last_result?: number;
}

export interface VpsStatus {
  ok: true;
  hostname: string;
  version: string;
  git: { branch: string; commit: string };
  worker: { listening: boolean; reachable: boolean; error: string | null };
  worker_watchdog: boolean;
  ngrok: { running: boolean; public_url: string | null };
  ngrok_watchdog: boolean;
  bots: { pid: number; account: string }[];
  /** fehlt bei älteren vps.ps1-Ständen */
  elevated?: VpsElevatedProcess[];
  mt5_terminals: number;
  session_active: boolean;
  autologon: boolean;
  auto_update_minutes: string | null;
  tasks: { start: VpsTaskInfo; update: VpsTaskInfo };
  boot_time: string;
  uptime_minutes: number;
}

export interface VpsUpdateCheck {
  ok: boolean;
  has_update: boolean;
  local_ver: string;
  remote_ver: string;
  error?: string | null;
}

export interface VpsLogResult {
  ok: true;
  log: VpsLog;
  lines: string[];
  note?: string;
}

export interface VpsActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  via?: 'worker' | 'task';
  restarting?: boolean;
}
