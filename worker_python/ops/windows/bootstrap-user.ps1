# Nicht-erhoehter Teil von bootstrap.ps1: klont das Repo (nur wenn es fehlt, kein "git pull" -
# Rechte-Regel), legt die Python-venv an, installiert requirements.txt, erzeugt (falls noetig)
# WORKER_API_KEY und richtet ngrok ein (Authtoken + feste Domain). Laeuft NIE direkt, sondern
# als geplante Aufgabe mit RunLevel Limited (bootstrap.ps1 registriert/startet/entfernt sie
# wieder), damit git/pip garantiert ohne Adminrechte laufen - sonst gehoeren die Repo-Dateien
# hinterher dem Administrator und der normale Worker kann sie nicht mehr ueberschreiben.
#
# Schreibt am Ende IMMER genau ein JSON-Objekt {ok, message, ...} nach -ResultFile; bootstrap.ps1
# wartet darauf. -ArgsFile (falls angegeben) enthaelt {authtoken, domain} und wird nach dem
# Lesen sofort geloescht (ngrok-Authtoken nicht laenger als noetig auf der Platte).
#
# Datei bewusst nur ASCII: Windows PowerShell 5.1 liest Skripte ohne BOM als ANSI.
param(
    [Parameter(Mandatory = $true)] [string]$RepoPath,
    [Parameter(Mandatory = $true)] [string]$RepoUrl,
    [Parameter(Mandatory = $true)] [string]$ResultFile,
    [string]$ArgsFile = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Test-Elevated {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Result([bool]$ok, [string]$message, [hashtable]$extra) {
    $obj = [ordered]@{ ok = $ok; message = $message }
    if ($extra) { foreach ($key in $extra.Keys) { $obj[$key] = $extra[$key] } }
    ($obj | ConvertTo-Json -Compress -Depth 5) | Set-Content -Path $ResultFile -Encoding utf8
}

try {
    # Zweite Absicherung neben "RunLevel Limited": bricht ab, falls diese Datei je direkt
    # (erhoeht) aufgerufen wird, statt ueber die geplante Aufgabe.
    if (Test-Elevated) {
        throw 'bootstrap-user.ps1 laeuft mit Adminrechten - abgebrochen. git/pip duerfen auf dem VPS nie als Administrator laufen.'
    }

    $authtoken = $null
    $domain = $null
    if ($ArgsFile -and (Test-Path $ArgsFile)) {
        $data = Get-Content $ArgsFile -Raw | ConvertFrom-Json
        $authtoken = "$($data.authtoken)"
        $domain = "$($data.domain)"
        Remove-Item $ArgsFile -Force -ErrorAction SilentlyContinue
    }

    # 1) Repo: klonen nur wenn es noch nicht existiert. NIE "git pull" hier (Rechte-Regel;
    #    Updates laufen ueber den Worker selbst bzw. die Aufgabe AutoGrid-Update).
    if (-not (Test-Path (Join-Path $RepoPath '.git'))) {
        $parent = Split-Path $RepoPath -Parent
        if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        & git clone $RepoUrl $RepoPath
        if ($LASTEXITCODE -ne 0) { throw "git clone fehlgeschlagen (Exit $LASTEXITCODE)." }
    }
    $workerDir = Join-Path $RepoPath 'worker_python'
    if (-not (Test-Path $workerDir)) { throw "worker_python fehlt unter $RepoPath - falscher RepoUrl/RepoPath?" }

    # 2) Python-venv + requirements
    $venvPython = Join-Path $workerDir '.venv\Scripts\python.exe'
    if (-not (Test-Path $venvPython)) {
        & python -m venv (Join-Path $workerDir '.venv')
        if ($LASTEXITCODE -ne 0) { throw "python -m venv fehlgeschlagen (Exit $LASTEXITCODE)." }
    }
    & $venvPython -m pip install --upgrade pip --quiet --disable-pip-version-check
    & $venvPython -m pip install -r (Join-Path $workerDir 'requirements.txt') --quiet --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw "pip install fehlgeschlagen (Exit $LASTEXITCODE)." }

    # 3) API-Schluessel: nur erzeugen, wenn noch keiner gesetzt ist (setx = Benutzer-Variable)
    $key = [Environment]::GetEnvironmentVariable('WORKER_API_KEY', 'User')
    if (-not $key) {
        $bytes = New-Object byte[] 32
        (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
        $key = -join ($bytes | ForEach-Object { $_.ToString('x2') })
        & setx.exe WORKER_API_KEY $key | Out-Null
    }

    # 4) ngrok: in einen Ordner ohne Adminrechte installieren (LOCALAPPDATA), Ordner per
    #    [Environment]::SetEnvironmentVariable (nicht setx.exe - das kappt lange PATH-Werte bei
    #    1024 Zeichen) dauerhaft in den Benutzer-PATH aufnehmen, damit "ngrok" im Watchdog
    #    (run_ngrok_watchdog.bat) unveraendert per Namen gefunden wird.
    $ngrokDir = Join-Path $env:LOCALAPPDATA 'AutoGrid\ngrok'
    $ngrokExe = Join-Path $ngrokDir 'ngrok.exe'
    if (-not (Test-Path $ngrokExe)) {
        New-Item -ItemType Directory -Force -Path $ngrokDir | Out-Null
        $zip = Join-Path $env:TEMP 'autogrid-ngrok.zip'
        Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $ngrokDir -Force
        Remove-Item $zip -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $ngrokExe)) { throw 'ngrok.exe nach dem Download nicht gefunden.' }
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $pathParts = @()
    if ($userPath) { $pathParts = $userPath.Split(';') }
    if ($pathParts -notcontains $ngrokDir) {
        [Environment]::SetEnvironmentVariable('Path', (@($userPath, $ngrokDir) -join ';').Trim(';'), 'User')
    }
    if ($authtoken) { & $ngrokExe config add-authtoken $authtoken | Out-Null }
    if ($domain) { & setx.exe NGROK_DOMAIN $domain | Out-Null }

    Write-Result $true 'Repo, Python-Umgebung, API-Schluessel und ngrok eingerichtet.' @{ ngrok_dir = $ngrokDir }
} catch {
    Write-Result $false $_.Exception.Message $null
    exit 1
}
