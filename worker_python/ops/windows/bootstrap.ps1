#Requires -RunAsAdministrator
# Einmalige Bootstrap-Einrichtung eines frischen Windows-VPS. Installiert Git/Python 3.11/das
# VC++-Redistributable (falls sie fehlen), klont das Repo, legt die Python-venv an, erzeugt einen
# API-Schluessel, richtet ngrok ein, ruft danach setup_vps.ps1 auf (Auto-Login, geplante Aufgaben,
# MT5-Rechte-Fix), startet den Worker und gibt zum Schluss einen Verbindungs-Link fuer die
# Web-Oberflaeche aus (auch in der Zwischenablage).
#
# In einer Administrator-PowerShell ausfuehren, entweder direkt aus dem Netz:
#
#   irm https://raw.githubusercontent.com/halilesmer/auto-grid-nextJs/main/worker_python/ops/windows/bootstrap.ps1 | iex
#
# oder heruntergeladen mit Parametern:
#
#   powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1 [-RepoPath C:\dev\auto-grid-nextJs] [-User <Name>] [-SkipAutoLogon]
#
# Darf beliebig oft laufen (idempotent): vorhandene Installationen/der Ordner/die venv werden
# uebersprungen. Fragt einmal nach dem ngrok-Authtoken und einer festen Domain (kostenloser
# Account auf dashboard.ngrok.com reicht) und, ausser bei -SkipAutoLogon, einmal nach dem
# Windows-Passwort (siehe setup_vps.ps1, Auto-Login nach einem Neustart).
#
# Rechte-Regel: git/pip laufen auf dem VPS nie mit Adminrechten (sonst gehoeren die Repo-Dateien
# hinterher dem Administrator, und der normale Worker/git pull scheitert daran). Dieses Skript
# selbst braucht Adminrechte (Systeminstallationen, Registry, geplante Aufgaben); den Repo-Klon,
# die venv und ngrok richtet deshalb eine eigene geplante Aufgabe mit RunLevel Limited ein
# (bootstrap-user.ps1), die dieses Skript registriert, startet, abwartet und wieder entfernt.
#
# Datei bewusst nur ASCII: Windows PowerShell 5.1 liest Skripte ohne BOM als ANSI.
param(
    [string]$RepoPath = 'C:\dev\auto-grid-nextJs',
    [string]$RepoUrl = 'https://github.com/halilesmer/auto-grid-nextJs.git',
    [string]$User = $env:USERNAME,
    [string]$FrontendUrl = 'https://auto-grid-next-js.vercel.app',
    [switch]$SkipAutoLogon
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    $text" -ForegroundColor Yellow }

function Update-PathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) -join ';').Trim(';')
}

function Test-RealCommand($name) {
    # Auf manchen Windows-10/11-Installationen ist "python" nur der Store-Alias-Stub, der den
    # Microsoft Store oeffnet, statt eine echte Installation zu sein.
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $cmd) { return $false }
    if ("$($cmd.Source)" -like '*WindowsApps*') { return $false }
    return $true
}

# --------------------------------------------------------------------------- Skript-Ordner
# Per "irm ... | iex" gestartet ist $PSScriptRoot leer: die begleitenden Skripte
# (bootstrap-user.ps1, setup_vps.ps1, connect-link.ps1) liegen dann nicht daneben und werden
# zuerst heruntergeladen.
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) {
    Step 'Begleitskripte herunterladen (per "irm | iex" gestartet)'
    $ScriptDir = Join-Path $env:TEMP 'autogrid-bootstrap-scripts'
    New-Item -ItemType Directory -Force -Path $ScriptDir | Out-Null
    $rawBase = 'https://raw.githubusercontent.com/halilesmer/auto-grid-nextJs/main/worker_python/ops/windows'
    foreach ($file in @('bootstrap-user.ps1', 'setup_vps.ps1', 'connect-link.ps1')) {
        Invoke-WebRequest -Uri "$rawBase/$file" -OutFile (Join-Path $ScriptDir $file) -UseBasicParsing
    }
    Ok "heruntergeladen nach $ScriptDir"
}

# --------------------------------------------------------------------------- 1. Git
Step 'Git'
if (Test-RealCommand 'git') {
    Ok 'bereits installiert'
} else {
    if (Test-RealCommand 'winget') {
        & winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    } else {
        Warn 'winget nicht gefunden - lade Git direkt von github.com herunter'
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -UseBasicParsing
        $asset = $release.assets | Where-Object { $_.name -like '*64-bit.exe' } | Select-Object -First 1
        if (-not $asset) { throw 'Git-Installer nicht gefunden (github.com/git-for-windows/git/releases).' }
        $installer = Join-Path $env:TEMP $asset.name
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer -UseBasicParsing
        Start-Process -FilePath $installer -ArgumentList '/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES', '/SP-' -Wait
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
    }
    Update-PathFromRegistry
    if (-not (Test-RealCommand 'git')) { throw 'Git-Installation fehlgeschlagen (git.exe danach nicht gefunden).' }
    Ok 'installiert'
}

# --------------------------------------------------------------------------- 2. Python 3.11
Step 'Python 3.11'
$pythonOk = $false
if (Test-RealCommand 'python') {
    $ver = "$(& python --version 2>&1)"
    if ($ver -match '3\.11\.') { $pythonOk = $true }
}
if ($pythonOk) {
    Ok 'bereits installiert (3.11.x)'
} else {
    $pyVersion = '3.11.9'
    if (Test-RealCommand 'winget') {
        & winget install --id Python.Python.3.11 -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    } else {
        Warn 'winget nicht gefunden - lade Python direkt von python.org herunter'
        $installer = Join-Path $env:TEMP "python-$pyVersion-amd64.exe"
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/$pyVersion/python-$pyVersion-amd64.exe" -OutFile $installer -UseBasicParsing
        Start-Process -FilePath $installer -ArgumentList '/quiet', 'InstallAllUsers=1', 'PrependPath=1', 'Include_test=0' -Wait
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
    }
    Update-PathFromRegistry
    if (-not (Test-RealCommand 'python')) { throw 'Python-Installation fehlgeschlagen (python.exe danach nicht gefunden).' }
    Ok 'installiert'
}

# --------------------------------------------------------------------------- 3. VC++ Redistributable
Step 'Visual C++ 2015-2022 Redistributable (x64)'
$vcKey = 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64'
$vcInstalled = (Test-Path $vcKey) -and ((Get-ItemProperty $vcKey -ErrorAction SilentlyContinue).Installed -eq 1)
if ($vcInstalled) {
    Ok 'bereits installiert'
} else {
    $installer = Join-Path $env:TEMP 'vc_redist.x64.exe'
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $installer -UseBasicParsing
    Start-Process -FilePath $installer -ArgumentList '/install', '/quiet', '/norestart' -Wait
    Remove-Item $installer -Force -ErrorAction SilentlyContinue
    Ok 'installiert (pandas-ta/numba brauchen sie, siehe windows_start_guide.md)'
}

# --------------------------------------------------------------------------- 4. Repo/venv/API-Key/ngrok
# Laeuft absichtlich NICHT hier (erhoeht), sondern in einer geplanten Aufgabe mit RunLevel
# Limited (bootstrap-user.ps1) - siehe Rechte-Regel oben.
Step 'Repo, Python-Umgebung, API-Schluessel, ngrok (als normaler Benutzer, das dauert etwas)'
# Bei einem zweiten Lauf (idempotent) leer lassen koennen, um Vorhandenes zu behalten
$existingDomain = [Environment]::GetEnvironmentVariable('NGROK_DOMAIN', 'User')
$authtokenPrompt = 'ngrok-Authtoken (dashboard.ngrok.com -> Your Authtoken; kostenloser Account reicht)'
$domainPrompt = 'Feste ngrok-Domain (dashboard.ngrok.com -> Domains -> Create Domain; kostenlos)'
if ($existingDomain) {
    $authtokenPrompt += ' [leer lassen = vorhandenes Authtoken behalten]'
    $domainPrompt += " [leer lassen = $existingDomain behalten]"
}
$ngrokAuthtoken = (Read-Host $authtokenPrompt).Trim()
$ngrokDomain = (Read-Host $domainPrompt).Trim()
if (-not $ngrokDomain) { $ngrokDomain = $existingDomain }
if (-not $ngrokDomain) { throw 'Ohne feste Domain aendert sich die Adresse bei jedem Neustart - abgebrochen.' }
if (-not $ngrokAuthtoken -and -not $existingDomain) {
    Warn 'Kein Authtoken angegeben - ngrok kann ohne eigenes Konto keinen Tunnel aufbauen (Schritt 6 wartet trotzdem kurz).'
}

$argsFile = Join-Path $env:TEMP "autogrid-bootstrap-args-$([guid]::NewGuid().ToString('N')).json"
(@{ authtoken = $ngrokAuthtoken.Trim(); domain = $ngrokDomain } | ConvertTo-Json -Compress) |
    Set-Content -Path $argsFile -Encoding utf8
$account = "$env:USERDOMAIN\$User"
& icacls.exe $argsFile /inheritance:r /grant "${account}:F" | Out-Null

$resultFile = Join-Path $env:TEMP "autogrid-bootstrap-result-$([guid]::NewGuid().ToString('N')).json"
Remove-Item $resultFile -Force -ErrorAction SilentlyContinue

if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) {
    throw "Keine angemeldete Desktop-Sitzung fuer $account gefunden - per RDP anmelden und erneut ausfuehren."
}

$taskName = 'AutoGrid-Bootstrap'
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$userScript = Join-Path $ScriptDir 'bootstrap-user.ps1'
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$userScript`" -RepoPath `"$RepoPath`" -RepoUrl `"$RepoUrl`" -ResultFile `"$resultFile`" -ArgsFile `"$argsFile`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host -NoNewline '    Warte auf Repo/venv/ngrok'
$deadline = (Get-Date).AddMinutes(30)
while (-not (Test-Path $resultFile) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    Write-Host -NoNewline '.'
}
Write-Host ''
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item $argsFile -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $resultFile)) {
    throw "Zeitueberschreitung: bootstrap-user.ps1 hat sich nach 30 Minuten nicht gemeldet. Log/Status: Get-ScheduledTaskInfo -TaskName $taskName (falls noch da) oder erneut ausfuehren."
}
$result = Get-Content $resultFile -Raw | ConvertFrom-Json
Remove-Item $resultFile -Force -ErrorAction SilentlyContinue
if (-not $result.ok) { throw "Einrichtung fehlgeschlagen: $($result.message)" }
Ok $result.message

# --------------------------------------------------------------------------- 5. setup_vps.ps1
Step 'Auto-Login, MT5-Rechte-Fix, geplante Aufgaben (setup_vps.ps1)'
$setupArgs = @('-User', $User)
if ($SkipAutoLogon) { $setupArgs += '-SkipAutoLogon' }
& (Join-Path $ScriptDir 'setup_vps.ps1') @setupArgs

# --------------------------------------------------------------------------- 6. Worker starten
Step 'Worker + ngrok starten (Aufgabe AutoGrid-Start)'
Start-ScheduledTask -TaskName 'AutoGrid-Start'

$workerKey = [Environment]::GetEnvironmentVariable('WORKER_API_KEY', 'User')
$workerUp = $false
$publicUrl = $null
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline -and (-not $workerUp -or -not $publicUrl)) {
    Start-Sleep -Seconds 3
    if (-not $workerUp) {
        try {
            Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/system/platform' -Headers @{ 'X-API-Key' = $workerKey } -TimeoutSec 5 -UseBasicParsing | Out-Null
            $workerUp = $true
        } catch {}
    }
    if (-not $publicUrl) {
        try {
            $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3 -UseBasicParsing
            $publicUrl = ($tunnels.tunnels | Select-Object -First 1).public_url
        } catch {}
    }
}
if ($workerUp -and $publicUrl) {
    Ok "Worker erreichbar, Tunnel: $publicUrl"
} else {
    if (-not $workerUp) { Warn 'Worker antwortet noch nicht auf Port 8000 - Log: worker_python\logs\worker_console.log' }
    if (-not $publicUrl) { Warn 'ngrok-Tunnel noch nicht sichtbar - Log: worker_python\logs\ngrok.log' }
    Warn 'Verbindungs-Link unten testet trotzdem - bei Fehlschlag in ein paar Minuten "VPS verbinden" -> Testen erneut versuchen.'
}

# --------------------------------------------------------------------------- 7. Verbindungs-Link
Step 'Verbindungs-Link fuer die Web-Oberflaeche'
& (Join-Path $ScriptDir 'connect-link.ps1') -FrontendUrl $FrontendUrl -Domain $ngrokDomain

Step 'Fertig'
Write-Host @"
    MT5 nicht vergessen (einmalig, per RDP):
      1. MetaTrader 5 des Brokers installieren und einloggen
      2. Extras -> Optionen -> Experten -> "Algorithmic Trading erlauben" anhaken
      3. Extras -> Optionen -> Community -> "Python integration" anhaken
      4. MT5 einmal neu starten (die Haken wirken erst danach)
    Danach das MT5-Konto in der Web-Oberflaeche anlegen (Konto hinzufuegen), sobald oben verbunden.

    Das RDP-Fenster kuenftig nur schliessen, nicht abmelden (sonst stoppen MT5/Worker/ngrok).
    Ein weiteres Geraet verbinden oder der Schluessel hat sich geaendert: connect-link.ps1 erneut
    ausfuehren (liegt unter $ScriptDir).
"@
