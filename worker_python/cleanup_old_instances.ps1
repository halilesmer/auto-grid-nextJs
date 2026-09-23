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

# 1) Alte Watchdog-Fenster (sonst starten sie den Server nach 3 s wieder)
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { $_.CommandLine -like '*run_uvicorn_watchdog.bat*' } |
    ForEach-Object { Stop-Pid $_.ProcessId 'Alter Watchdog' }

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

Start-Sleep -Seconds 1
