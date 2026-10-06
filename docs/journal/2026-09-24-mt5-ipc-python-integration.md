---
date: 2026-09-24
type: diagnosis
status: done
pr: []
features: [SYS-06]
areas: [ops, worker]
---

# MT5 IPC error: Python integration was off

## Cause

| Step | Finding |
|---|---|
| Symptom | After a VPS reboot, each MT5 connect from Python failed with `-10003` or `-10004`: "IPC initialize failed, Pipe server didn't answer in 60 sec". |
| Wrong paths | First, admin rights, the Task Scheduler and the network were checked. None of them was the cause. This took hours. |
| Root cause | In MT5, `Tools → Options → Community`, the service "Python integration" was off. Then the terminal does not create its named pipe `\\.\pipe\MT5.Terminal.<hash>`, and Python cannot connect. |
| Why the error came late | The option changes only after a terminal restart. A terminal that ran before the change continued to work until the next reboot. |

| Setting | Value |
|---|---|
| File | `config\common.ini` of the terminal |
| Section and key | `[Common]`, `Services=` (a bit mask) |
| Python integration | Bit `0x40`: `4294967172` = off, `4294967236` = on |

## Solution

- Enable "Python integration" in each terminal. Then restart MT5.
- `docs/windows_start_guide.md` (preparation) shows the option.
- The worker checks the pipe and gives a clear message: `python_pipe_state()` in `worker_python/src/utils/mt5_errors.py` (SYS-06).

## Lessons

- For an MT5 IPC error on the VPS, check the pipe first. Use PowerShell over SSH:
  ```powershell
  [IO.Directory]::GetFiles('\\.\pipe\') | Select-String 'MT5.Terminal'
  ```
- If the pipe is missing, enable Python integration and restart MT5. Do not change the code.
- Then check the `Services=` value in `common.ini`.
