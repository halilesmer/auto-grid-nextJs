@echo off
REM Startet den ngrok-Tunnel und startet ihn automatisch neu, falls er abstuerzt oder beendet wird
REM (auch "ngrok neu starten" auf der VPS-Seite im Mac-Frontend beendet nur ngrok.exe; diese
REM Schleife startet ihn dann neu). Log: logs\ngrok.log (liest die VPS-Seite per SSH).
cd /d "%~dp0"
if not exist logs mkdir logs

REM ngrok-Domain ggf. anpassen, falls sich die Free-Domain aendert
set NGROK_DOMAIN=tweet-overlying-monotone.ngrok-free.dev

:loop
REM Log vor jedem Start auf max. ~5 MB begrenzen (waehrend ngrok laeuft, ist die Datei gesperrt)
if exist logs\ngrok.log for %%F in (logs\ngrok.log) do if %%~zF GTR 5242880 move /y logs\ngrok.log logs\ngrok.log.1 >nul
ngrok http 8000 --domain=%NGROK_DOMAIN% --log=logs\ngrok.log --log-format=logfmt
echo.
echo [Watchdog] ngrok beendet oder abgestuerzt - Neustart in 3 Sekunden... (CTRL+C zum Beenden)
timeout /t 3 /nobreak >nul
goto loop
