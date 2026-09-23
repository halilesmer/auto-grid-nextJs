@echo off
REM Startet den Worker (mit Absturz-Watchdog, ohne --reload) und ngrok zusammen
REM in zwei eigenen Fenstern. Liegt bewusst in worker_python/, damit main.py
REM und .venv relativ dazu gefunden werden.
cd /d "%~dp0"

REM Alte Worker-/Watchdog-/ngrok-Instanzen beenden (wurde start.bat zweimal gestartet,
REM blieb Port 8000 belegt). Bot-Prozesse und MT5-Terminal werden nicht angefasst.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup_old_instances.ps1"

start "Uvicorn API" cmd /k "run_uvicorn_watchdog.bat"

REM ngrok-Domain ggf. anpassen, falls sich die Free-Domain aendert
start "ngrok" cmd /k "ngrok http 8000 --domain=tweet-overlying-monotone.ngrok-free.dev"
