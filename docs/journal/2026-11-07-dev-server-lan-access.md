---
date: 2026-11-07
author: Claude
type: feature
status: open
pr: [438]
features: [SYS-12]
areas: [frontend, tests, ops]
---

# Open the dev server from a phone

## Request
The project owner wants the dev server on port 3000 to stay open on the Mac. The owner also wants to open the frontend from a phone: in the same Wi-Fi network, and from the public Vercel site.

## Cause
A phone in the same network got the page, but the page did not work. The table shows the measurements on the Mac.

| Request | Result |
|---|---|
| Page from the network address of the Mac | `200` |
| Dev file under `/_next/static/chunks/`, with the network address as `Origin` and `Referer` | `403` |
| The same dev file with `Origin: http://localhost:3000` | `200` |
| Dev server log | `add it to "allowedDevOrigins" in next.config.js and restart the dev server` |

Next.js 16 blocks the dev files for each origin except `localhost` and the host that `next dev` started with, unless `allowedDevOrigins` lists the host. `next.config.ts` did not set the option. Thus a phone gets the HTML, but not the scripts.

The macOS firewall already allowed incoming connections for `node`. It was not the cause.

## Solution
`ALLOWED_DEV_ORIGINS` in the environment of the dev server lists the extra hosts. `next.config.ts` passes them to `allowedDevOrigins`.

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/devOrigins.ts` | New `parseDevOrigins()`: split at comma or white space, remove scheme, user name, port and path, lower case, put an IPv6 address in brackets, remove duplicates |
| `frontend_nextjs/next.config.ts` | `allowedDevOrigins: parseDevOrigins(process.env.ALLOWED_DEV_ORIGINS)` |
| `frontend_nextjs/e2e/mocked/dev-origins-lib.spec.ts` | New tests `@SYS-12` (7 tests) |
| `docs/features/features.yaml` | New feature `SYS-12` |

Use: set `ALLOWED_DEV_ORIGINS="<Mac name>.local"` where you start `next dev`. Open `http://<Mac name>.local:3000` on the phone. The `.local` name stays the same when the router gives the Mac a new address.

On the owner's Mac, a LaunchAgent starts `npm run dev:frontend` and starts it again after a crash or a restart. The plist of the LaunchAgent can set `ALLOWED_DEV_ORIGINS`. The plist is not in the repository. To load a changed plist, run `launchctl bootout` and then `launchctl bootstrap`. `launchctl kickstart -k` does not read the plist again.

## Why
- The value comes from the environment. A host name in `next.config.ts` would be public in this repository, and it would change with the network.
- An empty value gives an empty list. The behavior stays as before.
- The option works only for `next dev`. The production build and Vercel ignore it.
- The phone has two ways in. The Vercel site works everywhere and uses HTTPS. The dev server shows changes that are not committed. The owner selected both.
- Security: the `NEXT_PUBLIC_*` values of `.env.local` are in the JavaScript that the dev server sends. A device in the same network can read them, with the address and the key of the worker. The owner accepted this for the home network. Do not use this setup in a public network.
- Rejected: one wildcard for all private addresses. A wildcard opens each host of its pattern. Use exact names. An explicit list is simpler and safer.

## Verification
- `parseDevOrigins` and the config test: 7 of 7 passed. Command: `npx playwright test` with a local config without `webServer`.
- `tsc --noEmit` and `eslint` on the changed files: no output.
- Local dev server on a spare port, same requests as in Cause: without the variable `403`, and with the variable set to the network address of the Mac `200`.
- Not verified: a real phone. See "Open points".

## Open points
- [ ] Open the dev server from a real phone in the same Wi-Fi network (manual check of `SYS-12`).
- [x] After the merge: pull `main` in the main checkout. Done. A dev panel can now update the checkout (see `2026-11-12-dev-panel.md`).
- [x] The LaunchAgent no longer binds to `127.0.0.1` only. It sets `ALLOWED_DEV_ORIGINS`, so a phone in the same network can reach the dev server. Only the check on a real phone is open (first item).

## Lessons
- A `next dev` run with a spare `NEXT_DIST_DIR` adds that folder to `include` in `frontend_nextjs/tsconfig.json`. Discard that change before the commit.
- A shell can have an old Node first in `PATH`. Playwright needs Node 20 or newer. Put `/opt/homebrew/bin` first.
