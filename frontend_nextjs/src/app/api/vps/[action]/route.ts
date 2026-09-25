/**
 * /api/vps/[action] – VPS-Fernsteuerung für die Seite /vps (nur lokal auf dem Mac).
 *
 * GET  status | check-update | logs?log=worker|ngrok|update&lines=300
 * POST update | restart | restart-ngrok | reboot
 *
 * Schutz (diese Route startet SSH-Befehle auf dem VPS):
 *   - nur über localhost/127.0.0.1 erreichbar (Host-Header)
 *   - POST nur von derselben Origin (keine fremde Webseite kann über den Browser auslösen)
 *   - ohne VPS_SSH_HOST (z. B. Vercel) → 404
 */
import type { NextRequest } from 'next/server';
import { getVpsConfig, runVps, VpsSshError } from '@/lib/server/vpsSsh';
import { VPS_ACTIONS, isVpsAction, isVpsLog } from '@/lib/vps';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostname(hostHeader: string | null): string {
  if (!hostHeader) return '';
  // [::1]:3000 → [::1], localhost:3000 → localhost
  return hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function guard(request: NextRequest): Response | null {
  const host = request.headers.get('host');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (!LOCAL_HOSTS.has(hostname(host)) || (forwardedHost && !LOCAL_HOSTS.has(hostname(forwardedHost)))) {
    return json({ ok: false, error: 'VPS-Steuerung nur lokal (localhost) erlaubt', code: 'localOnly' }, 403);
  }
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    let originHost = '';
    try {
      originHost = origin ? new URL(origin).host : '';
    } catch {
      originHost = '';
    }
    if (!originHost || originHost !== host) {
      return json({ ok: false, error: 'Ungültige Origin', code: 'badOrigin' }, 403);
    }
  }
  return null;
}

async function handle(request: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const denied = guard(request);
  if (denied) return denied;

  const config = getVpsConfig();
  if (!config) {
    return json(
      { ok: false, error: 'VPS-Steuerung deaktiviert: VPS_SSH_HOST fehlt in .env.local', code: 'disabled' },
      404,
    );
  }

  const { action } = await ctx.params;
  if (!isVpsAction(action)) {
    return json({ ok: false, error: `Unbekannte Aktion: ${action}`, code: 'unknownAction', params: { action } }, 404);
  }
  if (VPS_ACTIONS[action].method !== request.method) {
    return json(
      {
        ok: false,
        error: `${action} erwartet ${VPS_ACTIONS[action].method}`,
        code: 'wrongMethod',
        params: { action, method: VPS_ACTIONS[action].method },
      },
      405,
    );
  }

  const args: string[] = [];
  if (action === 'logs') {
    const log = request.nextUrl.searchParams.get('log') ?? 'worker';
    if (!isVpsLog(log)) {
      return json({ ok: false, error: `Unbekanntes Log: ${log}`, code: 'unknownLog', params: { log } }, 400);
    }
    const lines = Math.min(2000, Math.max(10, Number(request.nextUrl.searchParams.get('lines')) || 300));
    args.push(log, String(lines));
  }

  try {
    const result = await runVps(config, action, args);
    return json(result, result.ok === false ? 502 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof VpsSshError && err.kind === 'config' ? 500 : 502;
    return json(
      {
        ok: false,
        error: message,
        ssh_failed: err instanceof VpsSshError && err.kind === 'ssh',
        ...(err instanceof VpsSshError && err.code ? { code: err.code, params: err.params } : {}),
      },
      status,
    );
  }
}

export const GET = handle;
export const POST = handle;
