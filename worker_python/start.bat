@echo off
REM Startet den Worker (uvicorn) und ngrok zusammen in zwei eigenen Fenstern.
REM Liegt bewusst in worker_python/, damit main.py und .venv relativ dazu gefunden werden.
cd /d "%~dp0"

start "Uvicorn API" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

REM ngrok-Domain ggf. anpassen, falls sich die Free-Domain aendert
start "ngrok" cmd /k "ngrok http 8000 --domain=tweet-overlying-monotone.ngrok-free.dev"
