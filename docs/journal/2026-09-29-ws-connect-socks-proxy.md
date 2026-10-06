---
date: 2026-09-29
type: diagnosis
status: done
pr: [64, 66, 67]
features: [ACC-10, SYM-04]
areas: [ops, worker, frontend]
---

# Second account offline: proxy tunnel was down

## Request

The second account showed "running" by mistake. It got no symbols and no stream metrics.

## Cause

| Step | Finding |
|---|---|
| Symptom | The connect of the second account failed. It looked like a bug in `initialize()`. |
| Root cause | The terminal of this account reached the broker only through the SOCKS5 proxy `127.0.0.1:1080`. This proxy is an SSH reverse tunnel from the Mac (`ssh -N -R 1080`). The terminal got this proxy during its installation, because the VPS cannot reach the MetaQuotes download servers. When the tunnel stops, the terminal has no connection. |

## Solution

| PR | Change |
|---|---|
| — | No code fix for the connect was necessary. The planned "login in `initialize()`" fix was cancelled. |
| #64 | The runtime state resets when the account changes. Symbol errors show in the frontend (ACC-10, SYM-04). |
| #66 | `/ws/stream` accepts `?account_id=`. Each browser gets the metrics of its selected account. |
| #67 | `docs/windows_start_guide.md` shows the proxy setup. It tells you to switch off the proxy in the terminal after the account setup. |

## Verification

Live test on 2026-09-29 (v0.7.114) with the second account: the symbol list loaded (812 symbols), and the account switch showed the correct values.

## Lessons

- If one terminal cannot connect and the other terminals can, check the proxy of this terminal first: `Tools → Options → Server → Proxy`.
- Do not keep a terminal on the Mac tunnel after the setup. Else the bot depends on the Mac: sleep mode or a Wi-Fi change stops MT5 at `0 / 0 Kb`.
