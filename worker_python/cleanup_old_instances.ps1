# Beendet alte Worker-/Watchdog-/ngrok-Instanzen, damit start.bat beliebig oft laufen kann
# (sonst Fehler 10048: Port 8000 belegt). Wird von start.bat aufgerufen.
# Bot-Prozesse (bot_runner.py) und das MT5-Terminal werden NIE beendet.
$ErrorActionPreference = 'SilentlyContinue'

function Stop-Pid($procId, $what) {
    Stop-Process -Id $procId -Force
    Start-Sleep -Milliseconds 300
    if (Get-Process -Id $procId) {
        Write-Host "[Cleanup] WARNUNG: $what (PID $procId) konnte nicht beendet werden - laeuft vermutlich mit Administratorrechten." -ForegroundColor Yellow
        Write-Host "          In einer Administrator-PowerShell: Stop-Process -Id $procId -Force" -ForegroundColor Yellow
    } else {
        Write-Host "[Cleanup] $what beendet (PID $procId)."
    }
}

# 1) Alte Watchdog-Fenster (sonst starten sie Server bzw. ngrok nach 3 s wieder)
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { $_.CommandLine -like '*run_uvicorn_watchdog.bat*' -or $_.CommandLine -like '*run_ngrok_watchdog.bat*' } |
    ForEach-Object { Stop-Pid $_.ProcessId 'Alter Watchdog' }

# 1b) ngrok-Fenster der alten start.bat (cmd /k "ngrok http 8000 ..."): ohne das bliebe nach
#     Schritt 3 ein leerer Prompt offen, neben dem neuen run_ngrok_watchdog.bat-Fenster
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { $_.CommandLine -like '*/k*ngrok http 8000*' } |
    ForEach-Object { Stop-Pid $_.ProcessId 'Altes ngrok-Fenster' }

# 2) Alter Worker auf Port 8000 (+ .venv-Starter)
foreach ($conn in Get-NetTCPConnection -LocalPort 8000 -State Listen) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)"
    if (-not $p) { continue }
    if ($p.Name -like 'python*' -and $p.CommandLine -notlike '*bot_runner.py*') {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)"
        Stop-Pid $p.ProcessId 'Alter Worker auf Port 8000'
        if ($parent -and $parent.Name -like 'python*' -and $parent.CommandLine -like '*main.py*') {
            Stop-Pid $parent.ProcessId 'Alter Worker-Starter'
        }
    } else {
        Write-Host "[Cleanup] WARNUNG: Port 8000 wird von einem anderen Programm belegt: $($p.Name) (PID $($p.ProcessId))" -ForegroundColor Yellow
    }
}

# 3) Alter ngrok-Tunnel fuer diesen Worker (andere ngrok-Tunnel bleiben)
Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" |
    Where-Object { $_.CommandLine -like '*http 8000*' } |
    ForEach-Object { Stop-Pid $_.ProcessId 'Alter ngrok' }

# 4) Reste mit Administratorrechten laut melden. Laeuft dieses Skript normal (ohne Adminrechte,
#    z. B. ueber die Aufgabe AutoGrid-Start), sieht es von erhoehten Prozessen nur Name und PID:
#    Die Befehlszeile bleibt leer, Beenden scheitert. Die Schritte 1-3 finden sie deshalb gar
#    nicht, und alte Neustart-Schleifen laufen neben den neuen weiter (starten Worker und Bots
#    wieder mit Adminrechten). Diese Konsole sieht niemand -> zusaetzlich ins Worker-Log, das die
#    Seite "VPS" auf dem Mac anzeigt. Beenden kann sie nur ein erhoehter Prozess (vps.ps1 per SSH).
$session = (Get-Process -Id $PID).SessionId
$procs = @(Get-CimInstance Win32_Process -Filter "SessionId=$session")
$hidden = @($procs | Where-Object { -not $_.CommandLine -and $_.Name -match '^(python[\d.]*|pythonw|ngrok|terminal64|timeout)\.exe$' })
$hiddenParents = @($hidden | ForEach-Object { $_.ParentProcessId })
# Neustart-Schleife = verstecktes cmd.exe mit verstecktem python/ngrok/timeout als Kind
$loops = @($procs | Where-Object { $_.Name -eq 'cmd.exe' -and -not $_.CommandLine -and $hiddenParents -contains $_.ProcessId })
$report = @($loops) + @($hidden | Where-Object { $_.Name -ne 'timeout.exe' })
if ($report.Count -gt 0) {
    $list = ($report | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ', '
    $lines = @(
        "[Cleanup] !! $($report.Count) Prozess(e) laufen mit Administratorrechten und lassen sich ohne Adminrechte weder pruefen noch beenden: $list",
        "[Cleanup] !! Folge: alte Neustart-Schleifen, Worker oder Bots laufen neben den neuen weiter und starten sie wieder mit Adminrechten.",
        "[Cleanup] !! Abhilfe: auf dem Mac Seite 'VPS' -> 'Admin-Prozesse beenden' (oder in einer Administrator-PowerShell: Stop-Process -Id <PID> -Force)."
    )
    foreach ($line in $lines) { Write-Host $line -ForegroundColor Red }
    try {
        $logDir = Join-Path $PSScriptRoot 'logs'
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        # FileShare ReadWrite: der laufende Worker haelt die Datei offen (console_tee)
        $stream = [IO.File]::Open((Join-Path $logDir 'worker_console.log'), 'Append', 'Write', 'ReadWrite')
        $writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
        foreach ($line in $lines) { $writer.WriteLine("$(Get-Date -Format s) $line") }
        $writer.Close()
    } catch {}
}

Start-Sleep -Seconds 1
