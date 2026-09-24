# VPS-Fernsteuerung: wird vom Mac per SSH aufgerufen (Frontend-Seite /vps -> Next.js-Route
# /api/vps/[action] -> ssh -> dieses Skript). Gibt immer genau ein JSON-Objekt aus.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File vps.ps1 <aktion> [argument]
#
#   status               Worker/ngrok/Bots/Version/Autostart als JSON
#   check-update         Update-Pruefung ueber den Worker (GET /api/system/update/check)
#   logs <worker|ngrok|update> [zeilen]
#   restart              Worker + ngrok neu starten (geplante Aufgabe AutoGrid-Start -> start.bat);
#                        Neustart-Schleifen/Worker/ngrok mit Adminrechten werden vorher beendet
#   fix-elevated         alle AutoGrid-Prozesse mit Adminrechten beenden (auch Bots und MT5),
#                        dann wie restart; der Worker setzt die Bots ohne Adminrechte fort
#   restart-ngrok        nur ngrok beenden; run_ngrok_watchdog.bat startet ihn nach 3 s neu
#   update               Update ueber den laufenden Worker (POST /api/system/update); ist er
#                        nicht erreichbar, ueber die geplante Aufgabe AutoGrid-Update
#   update-local         NUR fuer die Aufgabe AutoGrid-Update (git pull + pip + start.bat)
#   reboot               Windows neu starten
#
# WICHTIG - Rechte: Per SSH angemeldete Administratoren laufen ohne UAC-Filter (voll erhoeht).
# Deshalb fuehrt dieses Skript im SSH-Kontext NIE git aus und startet den Worker NIE direkt:
# Dateien im Repo gehoerten sonst dem Administrator und der normale Worker koennte sie nicht mehr
# ueberschreiben (das alte "git pull als Administrator"-Problem). Schreibende Schritte laufen im
# Worker selbst oder in geplanten Aufgaben mit RunLevel Limited in der angemeldeten Sitzung.
# Datei bewusst nur ASCII: Windows PowerShell 5.1 liest Skripte ohne BOM als ANSI.
param(
    [Parameter(Position = 0)] [string]$Action = 'status',
    [Parameter(Position = 1)] [string]$Arg = '',
    [Parameter(Position = 2)] [int]$Lines = 300
)

$ErrorActionPreference = 'Stop'
# Keine Fortschrittsanzeigen (landen per SSH sonst als CLIXML in der Ausgabe)
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$WorkerDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$RepoRoot = (Resolve-Path (Join-Path $WorkerDir '..')).Path
$LogsDir = Join-Path $WorkerDir 'logs'
$StartTask = 'AutoGrid-Start'
$UpdateTask = 'AutoGrid-Update'
$WorkerUrl = 'http://127.0.0.1:8000'

function Out-Json($obj) {
    $obj | ConvertTo-Json -Depth 6 -Compress
}

function Get-ApiKey {
    # setx WORKER_API_KEY setzt die Benutzer-Variable; die SSH-Sitzung sieht sie evtl. nicht in $env
    $key = [Environment]::GetEnvironmentVariable('WORKER_API_KEY', 'User')
    if (-not $key) { $key = $env:WORKER_API_KEY }
    return $key
}

function Invoke-Worker($method, $path, $timeoutSec = 15) {
    $headers = @{}
    $key = Get-ApiKey
    if ($key) { $headers['X-API-Key'] = $key }
    return Invoke-RestMethod -Method $method -Uri "$WorkerUrl$path" -Headers $headers -TimeoutSec $timeoutSec -UseBasicParsing
}

function Test-Elevated {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-BuiltinAdmin {
    # Das eingebaute Konto "Administrator" (RID 500) laeuft immer erhoeht - dort ist alles gleich berechtigt
    return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -like '*-500'
}

function Get-GitInfo {
    # .git direkt lesen statt git aufzurufen (git als Administrator = Rechteproblem, s. o.)
    $gitDir = Join-Path $RepoRoot '.git'
    $info = @{ branch = ''; commit = '' }
    try {
        $head = (Get-Content (Join-Path $gitDir 'HEAD') -Raw).Trim()
        if ($head -like 'ref: *') {
            $ref = $head.Substring(5)
            $info.branch = $ref -replace '^refs/heads/', ''
            $refFile = Join-Path $gitDir ($ref -replace '/', '\')
            if (Test-Path $refFile) {
                $info.commit = (Get-Content $refFile -Raw).Trim()
            } else {
                $packed = Get-Content (Join-Path $gitDir 'packed-refs') -ErrorAction SilentlyContinue |
                    Where-Object { $_ -like "* $ref" } | Select-Object -First 1
                if ($packed) { $info.commit = $packed.Split(' ')[0] }
            }
        } else {
            $info.commit = $head
        }
    } catch {}
    if ($info.commit.Length -gt 8) { $info.commit = $info.commit.Substring(0, 8) }
    return $info
}

# Hinweis: Funktionsergebnisse immer mit @(...) umschliessen, bevor .Count benutzt wird.
# PowerShell 5.1 packt ein einzelnes Ergebnis aus, und ein einzelnes CimInstance hat kein
# .Count (-> $null, "0 Prozesse", obwohl einer laeuft).
function Get-CmdWindows($pattern) {
    @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like "*$pattern*" })
}

function Get-NgrokProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" | Where-Object { $_.CommandLine -like '*http 8000*' })
}

# --- Prozesse mit Administratorrechten ("Admin-Reste") ---------------------------------------
# Laufen Neustart-Schleife, Worker, Bots, ngrok oder MT5 erhoeht (alte Aufgabe mit "hoechsten
# Rechten", start.bat per "Als Administrator ausfuehren"), kann der normale Worker sie weder sehen
# noch beenden: cleanup_old_instances.ps1 findet sie nicht, alte Schleifen starten Worker und Bots
# neben den neuen wieder mit Adminrechten, und ein Update als Admin machte die Repo-Dateien zu
# Admin-Dateien. Dieses Skript laeuft per SSH erhoeht und sieht alles. Admin-Rest = hoehere
# Integritaetsstufe als die Desktop-Sitzung (explorer.exe). Eingebautes Konto "Administrator" oder
# UAC aus: explorer laeuft selbst erhoeht -> es wird nichts gemeldet (dort gibt es kein Rechte-Gefaelle).
$IntegritySource = @'
using System;
using System.Runtime.InteropServices;
public static class AutoGridIntegrity {
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr info, int len, out int ret);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    // RID der Integritaetsstufe (0x2000 Medium, 0x3000 High, 0x4000 System); -1 = nicht lesbar
    public static int Get(int pid) {
        IntPtr process = OpenProcess(0x1000, false, pid);  // PROCESS_QUERY_LIMITED_INFORMATION
        if (process == IntPtr.Zero) return -1;
        IntPtr token;
        if (!OpenProcessToken(process, 0x8, out token)) { CloseHandle(process); return -1; }  // TOKEN_QUERY
        int len;
        GetTokenInformation(token, 25, IntPtr.Zero, 0, out len);  // TokenIntegrityLevel
        IntPtr buf = Marshal.AllocHGlobal(len);
        try {
            if (!GetTokenInformation(token, 25, buf, len, out len)) return -1;
            IntPtr sid = Marshal.ReadIntPtr(buf);
            int count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
            return Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1)));
        } finally {
            Marshal.FreeHGlobal(buf);
            CloseHandle(token);
            CloseHandle(process);
        }
    }
}
'@

function Get-Integrity([int]$procId) {
    if (-not ('AutoGridIntegrity' -as [type])) { Add-Type -TypeDefinition $IntegritySource }
    return [AutoGridIntegrity]::Get($procId)
}

function Get-ProcessRole($p) {
    $cmd = "$($p.CommandLine)"
    if ($p.Name -eq 'cmd.exe') {
        if ($cmd -like '*run_uvicorn_watchdog.bat*') { return 'worker-loop' }
        if ($cmd -like '*run_ngrok_watchdog.bat*' -or $cmd -like '*/k*ngrok http 8000*') { return 'ngrok-loop' }
        return $null
    }
    if ($p.Name -eq 'ngrok.exe') { if ($cmd -like '*http 8000*') { return 'ngrok' } else { return $null } }
    if ($p.Name -eq 'terminal64.exe') { return 'mt5' }
    if ($cmd -like '*bot_runner.py*') { return 'bot' }
    if ($cmd -like '*main.py*') { return 'worker' }
    return $null
}

# Alle AutoGrid-Prozesse mit hoeherer Integritaetsstufe als die Desktop-Sitzung (inkl. der
# Kindprozesse hinter .venv\Scripts\python.exe)
function Get-ElevatedProcesses {
    $baseline = 0x2000
    $explorer = @(Get-Process explorer -ErrorAction SilentlyContinue)
    if ($explorer.Count -gt 0) {
        $il = Get-Integrity $explorer[0].Id
        if ($il -gt 0) { $baseline = $il }
    }
    $found = @()
    $candidates = @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name like 'python%' OR Name='ngrok.exe' OR Name='terminal64.exe'")
    foreach ($p in $candidates) {
        $role = Get-ProcessRole $p
        if (-not $role) { continue }
        if ((Get-Integrity ([int]$p.ProcessId)) -le $baseline) { continue }
        $account = ''
        if ($role -eq 'bot' -and "$($p.CommandLine)" -match 'bot_runner\.py"?\s+"?(\d+)') { $account = $Matches[1] }
        $found += [pscustomobject]@{ pid = [int]$p.ProcessId; parent = [int]$p.ParentProcessId; role = $role; account = $account }
    }
    return $found
}

# Fuer die Anzeige: .venv-Starter + echter Python-Prozess = ein Eintrag (wie bei den Bots)
function Get-ElevatedSummary {
    $all = @(Get-ElevatedProcesses)
    $ids = @($all | ForEach-Object { $_.pid })
    return @($all | Where-Object { $ids -notcontains $_.parent } | ForEach-Object {
        @{ pid = $_.pid; role = $_.role; account = $_.account }
    })
}

function Stop-ElevatedProcesses([string[]]$Roles) {
    # Erst die Neustart-Schleifen, sonst starten sie Worker/ngrok nach 3 s wieder
    $order = @{ 'worker-loop' = 0; 'ngrok-loop' = 0; 'worker' = 1; 'ngrok' = 1; 'bot' = 2; 'mt5' = 3 }
    $targets = @(Get-ElevatedProcesses | Where-Object { $Roles -contains $_.role } | Sort-Object { $order[$_.role] })
    foreach ($t in $targets) { Stop-Process -Id $t.pid -Force -ErrorAction SilentlyContinue }
    if ($targets.Count -gt 0) { Start-Sleep -Seconds 1 }
    return $targets
}

function Invoke-Restart {
    # start.bat laeuft ohne Adminrechte und kaeme an erhoehte Reste nicht heran (siehe oben)
    $stopped = @(Stop-ElevatedProcesses @('worker-loop', 'ngrok-loop', 'worker', 'ngrok'))
    Start-Task $StartTask
    $message = 'Worker und ngrok werden neu gestartet (start.bat). Bereit nach ~10-20 s.'
    if ($stopped.Count -gt 0) { $message += " Vorher $($stopped.Count) Prozess(e) mit Adminrechten beendet." }
    return @{ ok = $true; message = $message }
}

function Invoke-FixElevated {
    $stopped = @(Stop-ElevatedProcesses @('worker-loop', 'ngrok-loop', 'worker', 'ngrok', 'bot', 'mt5'))
    if ($stopped.Count -eq 0) {
        return @{ ok = $true; message = 'Keine Prozesse mit Adminrechten gefunden.' }
    }
    Start-Task $StartTask
    $roles = ($stopped | ForEach-Object { $_.role } | Sort-Object -Unique) -join ', '
    return @{
        ok = $true
        message = "$($stopped.Count) Prozess(e) mit Adminrechten beendet ($roles). Worker und ngrok starten ohne Adminrechte neu, der Worker setzt die Bots danach fort."
    }
}

function Get-TaskInfo($name) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) { return @{ exists = $false } }
    $ti = Get-ScheduledTaskInfo -TaskName $name
    return @{
        exists = $true
        state = "$($task.State)"
        last_run = if ($ti.LastRunTime -and $ti.LastRunTime.Year -gt 2000) { $ti.LastRunTime.ToString('s') } else { $null }
        last_result = $ti.LastTaskResult
    }
}

function Get-Status {
    $worker = @{ listening = (Test-WorkerListening); reachable = $false; error = $null }
    if ($worker.listening) {
        try {
            Invoke-Worker 'GET' '/api/system/platform' 10 | Out-Null
            $worker.reachable = $true
        } catch {
            $worker.error = $_.Exception.Message
        }
    }

    $ngrokProcs = @(Get-NgrokProcesses)
    $ngrok = @{ running = ($ngrokProcs.Count -gt 0); public_url = $null }
    try {
        $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3 -UseBasicParsing
        $ngrok.public_url = ($tunnels.tunnels | Select-Object -First 1).public_url
    } catch {}

    # .venv\Scripts\python.exe ist unter Windows nur ein Starter: er startet den echten Python
    # mit derselben Befehlszeile als Kindprozess. Pro Bot nur den aeussersten Prozess zaehlen.
    $botProcs = @(Get-CimInstance Win32_Process -Filter "Name like 'python%'" |
        Where-Object { $_.CommandLine -like '*bot_runner.py*' })
    $botPids = @($botProcs | ForEach-Object { $_.ProcessId })
    $bots = @($botProcs |
        Where-Object { $botPids -notcontains $_.ParentProcessId } |
        ForEach-Object {
            $account = ''
            if ($_.CommandLine -match 'bot_runner\.py"?\s+"?(\d+)') { $account = $Matches[1] }
            @{ pid = $_.ProcessId; account = $account }
        })

    $versionFile = Join-Path $RepoRoot 'VERSION'
    $winlogon = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -ErrorAction SilentlyContinue
    $os = Get-CimInstance Win32_OperatingSystem

    return @{
        ok = $true
        hostname = $env:COMPUTERNAME
        version = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { '' }
        git = Get-GitInfo
        worker = $worker
        worker_watchdog = (@(Get-CmdWindows 'run_uvicorn_watchdog.bat').Count -gt 0)
        ngrok = $ngrok
        ngrok_watchdog = (@(Get-CmdWindows 'run_ngrok_watchdog.bat').Count -gt 0)
        bots = $bots
        # Erkennung darf den Status nie kippen (z. B. Add-Type gesperrt)
        elevated = @(try { Get-ElevatedSummary } catch { })
        mt5_terminals = @(Get-Process terminal64 -ErrorAction SilentlyContinue).Count
        session_active = (@(Get-Process explorer -ErrorAction SilentlyContinue).Count -gt 0)
        autologon = ($winlogon -and "$($winlogon.AutoAdminLogon)" -eq '1')
        auto_update_minutes = [Environment]::GetEnvironmentVariable('AUTO_UPDATE_MINUTES', 'User')
        tasks = @{ start = Get-TaskInfo $StartTask; update = Get-TaskInfo $UpdateTask }
        boot_time = $os.LastBootUpTime.ToString('s')
        uptime_minutes = [int]((Get-Date) - $os.LastBootUpTime).TotalMinutes
    }
}

function Get-Logs($which, $count) {
    $files = @{
        worker = 'worker_console.log'
        ngrok = 'ngrok.log'
        update = 'vps_update.log'
    }
    if (-not $files.ContainsKey($which)) { throw "Unbekanntes Log: $which (worker|ngrok|update)" }
    $count = [Math]::Max(10, [Math]::Min($count, 2000))
    $path = Join-Path $LogsDir $files[$which]
    if (-not (Test-Path $path)) {
        return @{ ok = $true; log = $which; lines = @(); note = "Noch keine Datei $($files[$which])" }
    }
    # "$_": Get-Content haengt jeder Zeile PSPath/PSProvider/... an; ConvertTo-Json (PS 5.1)
    # serialisiert die mit (3 Zeilen -> ~6,7 MB JSON). Als reine Strings bleiben es Bytes.
    $content = @(Get-Content $path -Tail $count -Encoding UTF8 | ForEach-Object { "$_" })
    return @{ ok = $true; log = $which; lines = $content }
}

function Start-Task($name) {
    if (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) {
        throw "Geplante Aufgabe '$name' fehlt. Einmalig ops\windows\setup_vps.ps1 ausfuehren."
    }
    if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) {
        throw 'Kein Benutzer angemeldet (Auto-Login aus?). Die Aufgabe laeuft nur in einer angemeldeten Sitzung.'
    }
    Start-ScheduledTask -TaskName $name
}

function Test-WorkerListening {
    return (@(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue).Count -gt 0)
}

function Get-ErrorText($err) {
    $body = $null
    try { $body = $err.ErrorDetails.Message } catch {}
    if ($body) {
        try { return "$(($body | ConvertFrom-Json).detail)" } catch { return $body }
    }
    return $err.Exception.Message
}

function Invoke-CheckUpdate {
    # Der Worker holt origin/main selbst (git fetch mit seinen normalen Rechten, nicht per SSH)
    if (-not (Test-WorkerListening)) { throw 'Worker laeuft nicht (Port 8000) - Update-Pruefung nicht moeglich.' }
    try {
        $check = Invoke-Worker 'GET' '/api/system/update/check?branch=main' 60
    } catch {
        throw "Update-Pruefung fehlgeschlagen: $(Get-ErrorText $_)"
    }
    return @{
        ok = (-not $check.error)
        has_update = [bool]$check.has_update
        local_ver = $check.local_ver
        remote_ver = $check.remote_ver
        error = $check.error
    }
}

function Invoke-Update {
    if (Test-WorkerListening) {
        # Der laufende Worker macht pull + pip + Neustart selbst (mit seinen normalen Rechten).
        # Laeuft er, aber das Update scheitert: NICHT zusaetzlich die Aufgabe starten (zwei git pull gleichzeitig).
        try {
            $res = Invoke-Worker 'POST' '/api/system/update?branch=main' 300
            return @{ ok = $true; via = 'worker'; message = "$($res.message)"; restarting = [bool]$res.restarting }
        } catch {
            return @{ ok = $false; via = 'worker'; message = (Get-ErrorText $_) }
        }
    }
    # Worker laeuft nicht -> geplante Aufgabe (RunLevel Limited, angemeldete Sitzung)
    Start-Task $UpdateTask
    return @{
        ok = $true
        via = 'task'
        message = "Worker laeuft nicht - Update laeuft ueber die Aufgabe $UpdateTask und startet ihn danach. Ergebnis im Log 'update'."
        restarting = $true
    }
}

function Invoke-UpdateLocal {
    # Laeuft in der geplanten Aufgabe AutoGrid-Update (normaler Benutzer, angemeldete Sitzung)
    if ((Test-Elevated) -and -not (Test-BuiltinAdmin)) {
        throw 'update-local laeuft mit Administratorrechten - abgebrochen. git darf auf dem VPS nie als Administrator laufen.'
    }
    New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
    $log = Join-Path $LogsDir 'vps_update.log'
    "=== $(Get-Date -Format s) Update (Aufgabe $UpdateTask) ===" | Out-File $log -Append -Encoding utf8
    Push-Location $WorkerDir
    try {
        $python = Join-Path $WorkerDir '.venv\Scripts\python.exe'
        $output = & $python -m src.utils.self_updater update 2>&1 | Out-String
        $code = $LASTEXITCODE
        $output.Trim() | Out-File $log -Append -Encoding utf8
        if ($code -ne 0) {
            "Update fehlgeschlagen (Exit $code) - Worker wird trotzdem neu gestartet (alter Stand)." | Out-File $log -Append -Encoding utf8
        }
        & cmd.exe /c "`"$WorkerDir\start.bat`"" | Out-File $log -Append -Encoding utf8
        "Worker neu gestartet." | Out-File $log -Append -Encoding utf8
    } finally {
        Pop-Location
    }
    return @{ ok = ($code -eq 0); message = "Siehe $log" }
}

function Invoke-RestartNgrok {
    if (@(Get-CmdWindows 'run_ngrok_watchdog.bat').Count -eq 0) {
        # Keine Neustart-Schleife fuer ngrok -> alles sauber ueber start.bat neu starten
        Start-Task $StartTask
        return @{ ok = $true; message = 'Kein ngrok-Watchdog aktiv - Worker und ngrok werden ueber start.bat neu gestartet.' }
    }
    $procs = @(Get-NgrokProcesses)
    foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force }
    return @{ ok = $true; message = "ngrok beendet ($($procs.Count) Prozess(e)); der Watchdog startet ihn in ~3 s neu." }
}

try {
    switch ($Action) {
        'status' { Out-Json (Get-Status) }
        'logs' { Out-Json (Get-Logs ($(if ($Arg) { $Arg } else { 'worker' })) $Lines) }
        'restart' { Out-Json (Invoke-Restart) }
        'fix-elevated' { Out-Json (Invoke-FixElevated) }
        'restart-ngrok' { Out-Json (Invoke-RestartNgrok) }
        'check-update' { Out-Json (Invoke-CheckUpdate) }
        'update' { Out-Json (Invoke-Update) }
        'update-local' { Out-Json (Invoke-UpdateLocal) }
        'reboot' {
            & shutdown.exe /r /t 5 /c 'AutoGrid: Neustart vom Mac (VPS-Seite)'
            if ($LASTEXITCODE -ne 0) { throw "shutdown.exe fehlgeschlagen (Exit $LASTEXITCODE) - fehlen die Rechte?" }
            Out-Json @{ ok = $true; message = 'VPS startet in 5 s neu. Auto-Login, Worker, ngrok und Bots kommen danach von selbst hoch.' }
        }
        default { throw "Unbekannte Aktion: $Action" }
    }
} catch {
    Out-Json @{ ok = $false; error = $_.Exception.Message }
    exit 1
}
