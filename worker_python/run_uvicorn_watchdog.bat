@echo off
REM Startet main.py und startet automatisch neu, falls der Prozess abstuerzt oder beendet wird.
REM main.py aktiviert --reload nur, wenn ENV=development gesetzt ist (siehe main.py) -
REM im Produktivbetrieb bewusst OHNE Reload, damit ein laufender Request/MT5-Vorgang
REM nicht durch einen Datei-Watcher unterbrochen wird.
cd /d "%~dp0"

REM Signalisiert dem Worker, dass er nach einem Update (POST /api/system/update) sich selbst
REM beenden darf: diese Schleife startet ihn dann mit dem neuen Code neu.
set WORKER_SUPERVISED=1

:loop
.venv\Scripts\python.exe main.py
echo.
echo [Watchdog] Server beendet oder abgestuerzt - Neustart in 3 Sekunden... (CTRL+C zum Beenden)
timeout /t 3 /nobreak >nul
goto loop
