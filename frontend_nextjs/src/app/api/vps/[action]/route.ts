/**
 * /api/vps/[action] – VPS-Fernsteuerung für die Seite /vps (nur lokal auf dem Mac).
 *
 * GET  status | check-update | logs?log=worker|ngrok|update|tunnel&lines=300
 * POST update | restart | restart-ngrok | reboot | fix-elevated[?stopBots=1]
 *   (fix-elevated beendet Bots/MT5 nur mit stopBots=1; sonst 409 botsElevated, wenn welche laufen)
 *
 * Schutz (diese Route startet SSH-Befehle auf dem VPS), Details in src/lib/server/vpsGuard.ts:
 *   - nur Anfragen, deren TCP-Gegenstelle Loopback ist (vom Server gesetzt, nicht vom Client; VPS-04)
 *   - zusätzlich Host/x-forwarded-* = localhost, und kein Proxy davor
 *   - POST nur von derselben Origin (keine fremde Webseite kann über den Browser auslösen)
 *   - ohne VPS_SSH_HOST (z. B. Vercel) → 404
 */
import type { NextRequest } from 'next/server';
import { getVpsConfig, runVps, VpsSshError } from '@/lib/server/vpsSsh';
import { checkVpsRequest } from '@/lib/server/vpsGuard';
import { VPS_ACTIONS, isVpsAction, isVpsLog } from '@/lib/vps';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function guard(request: NextRequest): Response | null {
  const denial = checkVpsRequest(request.method, request.headers);
  return denial ? json(denial.body, denial.status) : null;
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
  if (action === 'fix-elevated') {
    const stopBots = request.nextUrl.searchParams.get('stopBots');
    if (stopBots === '1') args.push('stop-bots');
    else if (stopBots !== null) {
      return json({ ok: false, error: 'Ungültiges Argument', code: 'badArg' }, 400);
    }
  }

  try {
    const result = await runVps(config, action, args);
    // Bots/MT5 laufen mit Adminrechten, stopBots fehlt: nichts beendet, die Seite lädt die Liste neu
    if (result.ok === false && result.code === 'botsElevated') return json(result, 409);
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
