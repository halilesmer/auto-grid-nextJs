/**
 * Führt worker_python/ops/windows/vps.ps1 per SSH auf dem VPS aus (nur Server-seitig, Next.js-Route).
 *
 * Konfiguration in .env.local – bewusst OHNE NEXT_PUBLIC_, landet nie im Browser-Bundle:
 *   VPS_SSH_HOST   z. B. Administrator@203.0.113.10   (fehlt → VPS-Steuerung aus, z. B. auf Vercel)
 *   VPS_SSH_KEY    z. B. ~/.ssh/autogrid_vps          (optional, sonst ssh-Standard/Agent)
 *   VPS_SSH_PORT   optional, Standard 22
 *   VPS_REPO_PATH  z. B. C:\dev\auto-grid-nextJs      (Standard)
 *
 * Sicherheit: execFile ohne Shell auf dem Mac; der entfernte Befehl besteht nur aus der
 * Aktion aus VPS_ACTIONS und geprüften Argumenten, nie aus freiem Benutzertext.
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { VPS_ACTIONS, type VpsAction } from '@/lib/vps';

const DEFAULT_REPO_PATH = 'C:\\dev\\auto-grid-nextJs';
// Laufwerk + Ordner, ohne Anführungszeichen/Steuerzeichen (wird in den entfernten Befehl eingesetzt)
const REPO_PATH_RE = /^[A-Za-z]:\\[\w\\. -]+$/;
const SAFE_ARG_RE = /^[\w-]+$/;

export interface VpsConfig {
  host: string;
  key?: string;
  port: string;
  repoPath: string;
}

export function getVpsConfig(): VpsConfig | null {
  const host = process.env.VPS_SSH_HOST?.trim();
  if (!host) return null;
  const rawKey = process.env.VPS_SSH_KEY?.trim();
  const key = rawKey ? rawKey.replace(/^~(?=$|\/)/, os.homedir()) : undefined;
  return {
    host,
    key: key ? path.resolve(key) : undefined,
    port: process.env.VPS_SSH_PORT?.trim() || '22',
    repoPath: (process.env.VPS_REPO_PATH?.trim() || DEFAULT_REPO_PATH).replace(/\\+$/, ''),
  };
}

export class VpsSshError extends Error {
  constructor(
    message: string,
    public readonly kind: 'config' | 'ssh' | 'remote',
  ) {
    super(message);
  }
}

/** Letzte JSON-Zeile der Ausgabe (PowerShell kann davor Warnungen ausgeben). */
function parseJsonOutput(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith('{')) continue;
    try {
      return JSON.parse(lines[i]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

export function runVps(config: VpsConfig, action: VpsAction, args: string[] = []): Promise<Record<string, unknown>> {
  if (!REPO_PATH_RE.test(config.repoPath)) {
    return Promise.reject(new VpsSshError(`VPS_REPO_PATH ungültig: ${config.repoPath}`, 'config'));
  }
  if (!args.every((a) => SAFE_ARG_RE.test(a))) {
    return Promise.reject(new VpsSshError('Ungültiges Argument', 'config'));
  }
  const script = `${config.repoPath}\\worker_python\\ops\\windows\\vps.ps1`;
  const remote = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${script}"`, action, ...args].join(' ');

  const sshArgs = [
    '-T',
    '-p', config.port,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=15',
    '-o', 'StrictHostKeyChecking=accept-new',
    ...(config.key ? ['-i', config.key, '-o', 'IdentitiesOnly=yes'] : []),
    config.host,
    remote,
  ];

  return new Promise((resolve, reject) => {
    execFile(
      'ssh',
      sshArgs,
      { timeout: VPS_ACTIONS[action].timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const json = parseJsonOutput(stdout);
        if (json) {
          // vps.ps1 meldet eigene Fehler als {ok:false,error} mit Exit 1
          resolve(json);
          return;
        }
        if (error) {
          const code = (error as NodeJS.ErrnoException & { code?: number | string }).code;
          const killed = (error as { killed?: boolean }).killed;
          if (killed) {
            reject(new VpsSshError(`Zeitüberschreitung nach ${VPS_ACTIONS[action].timeoutMs / 1000} s`, 'ssh'));
          } else if (code === 'ENOENT') {
            reject(new VpsSshError('ssh ist auf diesem Rechner nicht installiert', 'config'));
          } else {
            const detail = stderr.trim().split(/\r?\n/).slice(-3).join(' ') || error.message;
            reject(new VpsSshError(`SSH fehlgeschlagen (Exit ${code}): ${detail}`, 'ssh'));
          }
          return;
        }
        reject(new VpsSshError(`Unerwartete Antwort vom VPS: ${stdout.slice(0, 300) || stderr.slice(0, 300)}`, 'remote'));
      },
    );
  });
}
