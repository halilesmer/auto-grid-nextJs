@echo off
REM Startet den ngrok-Tunnel und startet ihn automatisch neu, falls er abstuerzt oder beendet wird
REM (auch "ngrok neu starten" auf der VPS-Seite im Mac-Frontend beendet nur ngrok.exe; diese
REM Schleife startet ihn dann neu). Log: logs\ngrok.log (liest die VPS-Seite per SSH).
cd /d "%~dp0"
if not exist logs mkdir logs

REM Domain kommt nur aus der Benutzer-Umgebungsvariable NGROK_DOMAIN (setx, siehe bootstrap.ps1).
REM Sieht dieser Prozess sie noch nicht (vor dem setx gestartet), direkt aus der Registry lesen.
REM Ohne Domain kein Start: eine zufaellige ngrok-Adresse wuerde Frontend und Tunnel-Watchdog brechen.
:domain
if not defined NGROK_DOMAIN for /f "tokens=2,*" %%A in ('reg query HKCU\Environment /v NGROK_DOMAIN 2^>nul ^| find "NGROK_DOMAIN"') do set "NGROK_DOMAIN=%%B"
if defined NGROK_DOMAIN goto loop
echo [Watchdog] NGROK_DOMAIN fehlt - "setx NGROK_DOMAIN <domain>" ausfuehren. Neuer Versuch in 60 Sekunden...
REM Nur einmal ins Log schreiben (die 5-MB-Rotation unten laeuft in dieser Warteschleife nicht)
if not defined DOMAIN_LOGGED >>logs\ngrok.log echo lvl=eror msg="NGROK_DOMAIN fehlt: setx NGROK_DOMAIN <domain> ausfuehren (siehe bootstrap.ps1)"
set DOMAIN_LOGGED=1
timeout /t 60 /nobreak >nul
goto domain

:loop
REM Log vor jedem Start auf max. ~5 MB begrenzen (waehrend ngrok laeuft, ist die Datei gesperrt)
if exist logs\ngrok.log for %%F in (logs\ngrok.log) do if %%~zF GTR 5242880 move /y logs\ngrok.log logs\ngrok.log.1 >nul
ngrok http 8000 --domain=%NGROK_DOMAIN% --log=logs\ngrok.log --log-format=logfmt
echo.
echo [Watchdog] ngrok beendet oder abgestuerzt - Neustart in 3 Sekunden... (CTRL+C zum Beenden)
timeout /t 3 /nobreak >nul
goto loop
