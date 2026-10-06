# Tunnel-Watchdog (Selbstheilung): laeuft alle 5 Minuten als geplante Aufgabe AutoGrid-Tunnel
# (angelegt von setup_vps.ps1) und braucht keinen Fernzugriff.
#
#   1. Prueft, ob die OEFFENTLICHE ngrok-URL https://<NGROK_DOMAIN>/api/system/platform antwortet.
#   2. Wenn nicht: antwortet der Worker lokal (127.0.0.1:8000), liegt es am Tunnel -> ngrok beenden,
#      run_ngrok_watchdog.bat startet ihn neu. Antwortet auch der Worker nicht -> einmal abwarten
#      (Neustart-Schleife/Auto-Update), danach Worker + ngrok ueber die Aufgabe AutoGrid-Start.
#   3. Klappt das FailuresBeforeReboot-mal hintereinander nicht -> VPS neu starten. Bremse gegen
#      Reboot-Schleifen: hoechstens MaxRebootsPerDay Reboots in 24 h und mindestens
#      MinMinutesBetweenReboots Minuten Abstand. Kein Reboot, wenn er nicht helfen kann: kein
#      Internet (Stoerung ausserhalb des VPS) oder ngrok meldet ERR_NGROK_334 (die Domain ist schon
#      woanders online, z. B. auf einem zweiten VPS). Dann nur weiter ngrok neu starten.
#   Nichts unternehmen: in den ersten BootGraceMinutes nach dem Start (Auto-Login, start.bat) und
#   solange ein Update laeuft (Aufgabe AutoGrid-Update oder git des Workers) - kein Reboot mitten
#   im git pull.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tunnel_watchdog.ps1 [-DryRun]
#
# -DryRun prueft nur und schreibt, was passieren wuerde (keine Aktion, kein Zustand).
# Zustand: data\tunnel_watchdog.json (Zeiten in UTC; liest vps.ps1 status), Log: logs\tunnel_watchdog.log.
#
# Rechte: Die Aufgabe laeuft mit hoechsten Rechten, nur damit der Reboot sicher klappt. Deshalb
# ruft dieses Skript NIE git auf und startet Worker/ngrok NIE selbst: ngrok wird nur beendet (die
# Neustart-Schleife ohne Adminrechte startet ihn neu), alles andere laeuft ueber AutoGrid-Start
# (RunLevel Limited). Sonst entstuenden Admin-Prozesse (siehe VPS-07).
# Grenze: Die Aufgabe laeuft nur in einer angemeldeten Sitzung (wie Worker und MT5). Scheitert
# schon das Auto-Login, hilft nur ein Reboot von aussen (Seite "VPS" oder Hoster-Konsole).
# Datei bewusst nur ASCII: Windows PowerShell 5.1 liest Skripte ohne BOM als ANSI.
param(
    [int]$FailuresBeforeReboot = 3,
    [int]$BootGraceMinutes = 10,
    [int]$MinMinutesBetweenReboots = 60,
    [int]$MaxRebootsPerDay = 3,
    [int]$TimeoutSec = 20,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# ngrok verlangt TLS 1.2; PowerShell 5.1 bietet es auf aelteren Windows-Servern nicht von sich aus an
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$WorkerDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogsDir = Join-Path $WorkerDir 'logs'
$DataDir = Join-Path $WorkerDir 'data'
$LogFile = Join-Path $LogsDir 'tunnel_watchdog.log'
$StateFile = Join-Path $DataDir 'tunnel_watchdog.json'
$StartTask = 'AutoGrid-Start'
$UpdateTask = 'AutoGrid-Update'

function Write-Log($text) {
    $line = "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) $text"
    if ($DryRun) { Write-Host "[DryRun] $line"; return }
    New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
    # Log klein halten (~1 MB, eine Vorgaengerdatei)
    if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) {
        Move-Item -Force $LogFile "$LogFile.1"
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function ConvertTo-UtcText([datetime]$time) {
    return $time.ToUniversalTime().ToString('s') + 'Z'
}

function Read-State {
    $state = @{ failures = 0; last_check = $null; last_ok = $null; last_result = ''; last_action = ''; reboots = @() }
    if (Test-Path $StateFile) {
        try {
            $saved = Get-Content $StateFile -Raw | ConvertFrom-Json
            foreach ($name in @($saved.PSObject.Properties.Name)) { $state[$name] = $saved.$name }
        } catch {
            Write-Log "Zustandsdatei unlesbar, beginne neu: $($_.Exception.Message)"
        }
    }
    $state.failures = [int]$state.failures
    # Nur die letzte Woche behalten (die Bremse schaut 24 h zurueck); unlesbare Eintraege verwerfen
    $state.reboots = @($state.reboots | Where-Object { $_ } | ForEach-Object {
            try { if (((Get-Date) - [datetime]$_).TotalDays -lt 7) { "$_" } } catch {}
        })
    return $state
}

function Save-State($state) {
    if ($DryRun) { return }
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    # Erst in eine Nebendatei, dann ersetzen: bricht die Aufgabe ab, bleibt die alte Datei ganz
    # (kaputtes JSON wuerde die Reboot-Bremse zuruecksetzen)
    $tmp = "$StateFile.tmp"
    $state | ConvertTo-Json -Depth 4 | Set-Content -Path $tmp -Encoding UTF8
    Move-Item -Force $tmp $StateFile
}

function Get-UserEnv($name) {
    # setx setzt Benutzer-Variablen; eine laufende Aufgabe sieht sie evtl. noch nicht in $env
    $value = [Environment]::GetEnvironmentVariable($name, 'User')
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($name) }
    return $value
}

function Get-NgrokDomain {
    # Einzige Quelle wie in run_ngrok_watchdog.bat: die Benutzer-Variable NGROK_DOMAIN (setx)
    $domain = Get-UserEnv 'NGROK_DOMAIN'
    if ($domain) { return $domain.Trim() }
    return $null
}

function Test-Platform($baseUrl) {
    # $null = ok, sonst Fehlertext. Nur eine echte Worker-Antwort zaehlt: die Fehlerseite von ngrok
    # (ERR_NGROK_3200 "endpoint offline") kommt als HTML und hat kein is_windows.
    $headers = @{ 'ngrok-skip-browser-warning' = '1' }
    $key = Get-UserEnv 'WORKER_API_KEY'
    if ($key) { $headers['X-API-Key'] = $key }
    try {
        $res = Invoke-RestMethod -Uri "$baseUrl/api/system/platform" -Headers $headers -TimeoutSec $TimeoutSec -UseBasicParsing
        if ($null -ne $res.is_windows) { return $null }
        return 'Antwort ist keine Worker-Antwort'
    } catch {
        # 401/403 vom Worker selbst (Schluessel passt nicht): erreichbar, also kein Grund fuer
        # Neustart oder Reboot. Der Worker antwortet dabei mit JSON {"detail": ...}; ein 403 von
        # ngrok (Traffic-Policy) hat das nicht und zaehlt als Fehlschlag.
        $code = 0
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        $body = "$($_.ErrorDetails.Message)"
        if (($code -eq 401 -or $code -eq 403) -and $body -like '*"detail"*') { return $null }
        return $_.Exception.Message
    }
}

function Test-Internet {
    # Kommt der VPS ueberhaupt ins Internet? Zwei unabhaengige Ziele, nur TCP 443 (kein DNS noetig)
    foreach ($target in @('1.1.1.1', '8.8.8.8')) {
        $client = New-Object Net.Sockets.TcpClient
        try {
            if ($client.ConnectAsync($target, 443).Wait(5000) -and $client.Connected) { return $true }
        } catch {
        } finally {
            $client.Dispose()
        }
    }
    return $false
}

function Test-NgrokDomainTaken {
    # ERR_NGROK_334: dieselbe Domain ist schon woanders online - ein Reboot hier aendert daran nichts
    $log = Join-Path $LogsDir 'ngrok.log'
    if (-not (Test-Path $log)) { return $false }
    return [bool](Get-Content $log -Tail 30 -ErrorAction SilentlyContinue | Select-String -SimpleMatch 'ERR_NGROK_334' -Quiet)
}

function Get-CmdWindows($pattern) {
    @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like "*$pattern*" })
}

function Get-NgrokProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" | Where-Object { $_.CommandLine -like '*http 8000*' })
}

function Test-UpdateRunning {
    # AutoGrid-Update (vps.ps1 update-local) oder das Auto-Update des Workers (self_updater -> git).
    # Nur Laeufe der letzten 15 min: ein haengendes git (z. B. Passwortabfrage) soll die
    # Selbstheilung nicht fuer immer blockieren.
    $task = Get-ScheduledTask -TaskName $UpdateTask -ErrorAction SilentlyContinue
    if ($task -and "$($task.State)" -eq 'Running') {
        $started = (Get-ScheduledTaskInfo -TaskName $UpdateTask).LastRunTime
        if ($started -and ((Get-Date) - $started).TotalMinutes -lt 15) { return $true }
    }
    $recent = @(Get-CimInstance Win32_Process -Filter "Name='git.exe'" |
        Where-Object { $_.CreationDate -and ((Get-Date) - $_.CreationDate).TotalMinutes -lt 15 })
    return ($recent.Count -gt 0)
}

function Start-AutoGrid {
    if (-not (Get-ScheduledTask -TaskName $StartTask -ErrorAction SilentlyContinue)) {
        throw "Geplante Aufgabe '$StartTask' fehlt (setup_vps.ps1 ausfuehren)."
    }
    Start-ScheduledTask -TaskName $StartTask
}

function Restart-Ngrok {
    if (@(Get-CmdWindows 'run_ngrok_watchdog.bat').Count -eq 0) {
        Start-AutoGrid
        return 'keine ngrok-Neustart-Schleife -> Worker + ngrok ueber AutoGrid-Start'
    }
    $procs = @(Get-NgrokProcesses)
    foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    return "ngrok beendet ($($procs.Count) Prozess(e)), run_ngrok_watchdog.bat startet ihn neu"
}

function Get-RebootBlocker($state, $now) {
    # $null = Reboot erlaubt, sonst der Grund dagegen
    $recent = @($state.reboots | ForEach-Object { [datetime]$_ } | Where-Object { ($now - $_).TotalHours -lt 24 })
    if ($recent.Count -ge $MaxRebootsPerDay) {
        return "schon $($recent.Count) Reboot(s) in 24 h (Grenze $MaxRebootsPerDay)"
    }
    $last = $recent | Sort-Object | Select-Object -Last 1
    if ($last -and ($now - $last).TotalMinutes -lt $MinMinutesBetweenReboots) {
        return "letzter Reboot vor $([int]($now - $last).TotalMinutes) min (Mindestabstand $MinMinutesBetweenReboots min)"
    }
    if (-not (Test-Internet)) {
        return 'kein Internet (1.1.1.1/8.8.8.8:443) - Stoerung ausserhalb des VPS'
    }
    if (Test-NgrokDomainTaken) {
        return 'ngrok meldet ERR_NGROK_334: die Domain ist schon woanders online (zweiter VPS/Rechner?)'
    }
    return $null
}

function Invoke-Heal($state, $localError, $now) {
    if ($state.failures -ge $FailuresBeforeReboot) {
        $blocked = Get-RebootBlocker $state $now
        if (-not $blocked) {
            Write-Log "AKTION: VPS-Neustart nach $($state.failures) Fehlschlaegen hintereinander."
            $state.last_action = 'reboot'
            if ($DryRun) { return }
            $state.failures = 0
            $state.reboots = @($state.reboots) + (ConvertTo-UtcText $now)
            Save-State $state
            & shutdown.exe /r /t 30 /c 'AutoGrid Tunnel-Watchdog: ngrok-URL nicht erreichbar, Neustart'
            if ($LASTEXITCODE -ne 0) { throw "shutdown.exe fehlgeschlagen (Exit $LASTEXITCODE)" }
            return
        }
        Write-Log "Kein Reboot: $blocked. Stattdessen Neustart wie bisher."
    }

    if ($localError -and $state.failures -eq 1 -and @(Get-CmdWindows 'run_uvicorn_watchdog.bat').Count -gt 0) {
        # Worker startet evtl. gerade neu (Absturz, Auto-Update): seine Schleife zuerst machen lassen
        $state.last_action = 'wait'
        Write-Log 'AKTION: keine - Worker-Neustart-Schleife laeuft, naechste Pruefung abwarten.'
    } elseif ($localError) {
        $state.last_action = 'restart-all'
        Write-Log 'AKTION: Worker + ngrok ueber AutoGrid-Start neu starten.'
        if (-not $DryRun) { Start-AutoGrid }
    } else {
        $state.last_action = 'restart-ngrok'
        if ($DryRun) {
            Write-Log 'AKTION: ngrok neu starten.'
        } else {
            Write-Log "AKTION: $(Restart-Ngrok)."
        }
    }
}

try {
    $now = Get-Date
    $state = Read-State
    $state.last_check = ConvertTo-UtcText $now

    $uptime = ($now - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalMinutes
    if ($uptime -lt $BootGraceMinutes) {
        $state.last_result = 'grace'
        Save-State $state
        exit 0
    }

    $domain = Get-NgrokDomain
    if (-not $domain) {
        $state.last_result = 'no-domain'
        Write-Log 'Keine ngrok-Domain (NGROK_DOMAIN) - keine Pruefung moeglich.'
        Save-State $state
        exit 0
    }

    $publicError = Test-Platform "https://$domain"
    if (-not $publicError) {
        if ($state.failures -gt 0) {
            Write-Log "OK: https://$domain antwortet wieder (nach $($state.failures) Fehlschlag/Fehlschlaegen)."
        }
        $state.failures = 0
        $state.last_ok = ConvertTo-UtcText $now
        $state.last_result = 'ok'
        $state.last_action = ''
        Save-State $state
        exit 0
    }

    $localError = Test-Platform 'http://127.0.0.1:8000'
    if (Test-UpdateRunning) {
        # Waehrend git pull/pip weder neu starten noch rebooten; der Zaehler bleibt stehen
        $state.last_result = 'update-running'
        $state.last_action = 'wait'
        Write-Log "Update laeuft - keine Aktion (https://$domain -> $publicError)."
        Save-State $state
        exit 0
    }

    # Zaehler sofort sichern: scheitert die Aktion unten, geht der Fehlschlag nicht verloren
    # (sonst erreichte er nie die Reboot-Grenze)
    $state.failures = $state.failures + 1
    $state.last_result = if ($localError) { 'worker-down' } else { 'tunnel-down' }
    Write-Log ("FEHLER $($state.failures)/${FailuresBeforeReboot}: https://$domain -> $publicError" +
        $(if ($localError) { " | lokal 127.0.0.1:8000 -> $localError" } else { ' | Worker lokal OK' }))
    Save-State $state

    try {
        Invoke-Heal $state $localError $now
    } catch {
        $state.last_action = "error: $($_.Exception.Message)"
        Write-Log "Aktion fehlgeschlagen: $($_.Exception.Message)"
    }
    if ($state.last_action -ne 'reboot' -or $DryRun) { Save-State $state }
} catch {
    Write-Log "Watchdog-Fehler: $($_.Exception.Message)"
    exit 1
}
