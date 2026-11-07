---
date: 2026-11-07
author: Claude
type: fix
status: open
pr: []
features: [VPS-04]
areas: [frontend, tests]
---

# VPS route checks the real peer address

## Request
The route `/api/vps/[action]` must not trust headers that the client controls. The dev server on the Mac now listens on all interfaces, and the route starts SSH commands on the VPS.

## Cause
- The guard checked `Host` and, for POST, `Origin`. The client sets both. A device on the same network could send headers that look local.
- `x-forwarded-for` is not safe either. Next 16 writes it only when the client did not send it (`??=` in `next/dist/server/base-server.js`). A measurement on a local server showed that a client value stays unchanged.
- Next 16 does not give the route handler the connection: `NextRequest.ip` is removed (Next 15). A measurement showed only two internal symbols on the request.

## Solution
The server writes the real TCP peer address into every request before Next handles it. The guard uses this address first. The other checks stay as additional checks.

| File | Change |
|---|---|
| `frontend_nextjs/src/instrumentation.ts` | New. Calls `installPeerHeader()` when the Node server starts |
| `frontend_nextjs/src/lib/server/peerAddress.ts` | New. Wraps `emit('request')` of `http.Server` and `https.Server`. Sets `x-grid-peer: <token>\|<remoteAddress>` and overwrites a client value. `verifiedPeer()` returns the address only when the token matches. `isLoopbackAddress()` accepts `127.0.0.0/8`, `::1` and `::ffff:127.x` |
| `frontend_nextjs/src/lib/server/vpsGuard.ts` | New. `checkVpsRequest()`: (1) verified peer is loopback, (2) `x-forwarded-for` and `forwarded` show no non-loopback client, (3) `Host` and `x-forwarded-host` are local, (4) a POST needs the same `Origin` |
| `frontend_nextjs/src/app/api/vps/[action]/route.ts` | `guard()` calls `checkVpsRequest()`. The response codes `localOnly` and `badOrigin` do not change |
| `frontend_nextjs/e2e/mocked/vps-guard.spec.ts` | New tests `@VPS-04` |
| `docs/features/features.yaml` | VPS-04 text and code list |

## Why
| Option | Decision |
|---|---|
| Read `x-forwarded-for` | Rejected. The client can set it (measured). |
| Read the peer from the request object | Not possible in Next 16 (measured). |
| Shared secret in a header or cookie | Rejected. The page that sends it is open to the same clients. |
| Bind the dev server to `127.0.0.1` | Good second layer. It is an option of the launch agent, not of this change. See "Open points". |
| Hook `http.Server` from `instrumentation.ts` | Chosen. Next documents `register()` as "must complete before the server is ready to handle requests". |

- The token makes the check fail closed. A process without the hook has no token. A forged `x-grid-peer` header then does not pass. A measurement with an old hook version confirmed this: every request got 403.
- A request with a non-loopback `x-forwarded-for` or a `forwarded` header gets 403, also from loopback. A local reverse proxy then cannot pass outside traffic as local.
- The Vercel build runs the same code. Without the hook the route answers 403 `localOnly`, as before, and the page shows its notice.

## Verification
- Before the fix, the old guard let a request with forged headers from another address pass. The check ran on a test server with its own port. No SSH command ran.
- After the fix, same test server: 6 of 6 forged requests from the non-loopback address got 403 `localOnly`. Requests from `localhost`, `127.0.0.1` and `::1` reached the route.
- `npx playwright test e2e/mocked/vps-guard.spec.ts e2e/mocked/vps.spec.ts`: 33 passed. The LAN tests ran. They skip only when the machine has no non-loopback IPv4 address.
- The new tests fail with the old `route.ts`: a forged POST from the non-loopback address got 404 `disabled` instead of 403.
- `/vps` in the browser on `localhost` shows the same page as before.
- `/security-review` of the diff: no finding with high confidence. See the lesson on port forwards.
- `scripts/features/precheck.sh`: see the pull request.

## Open points
- [ ] Restart the long-running dev server (launch agent) after it pulls this change. The hook loads at server start. Until then every request to `/api/vps/*` gets 403 `localOnly`. This is the safe direction.
- [ ] Decide whether the dev server binds to `127.0.0.1` only. That would close the network exposure for all pages, not only for this route.
- [ ] `hooks/RULES.md` §9.2 lists the files that need `/security-review`. The owner decides whether to add `vpsGuard.ts`, `peerAddress.ts` and `instrumentation.ts`.

## Lessons
- A header is never the address of the client. Take the address from the socket.
- A TCP forward on the Mac (for example `ssh -L` or a port forward of an editor) makes outside traffic look like loopback. No check on the peer address can stop this. Do not forward port 3000 to other people.
- Run a check against a server that you started yourself before you trust a result from the documentation. Here the documented `x-forwarded-for` behavior was not safe.
