# Baut den Verbindungs-Link fuer die Web-Oberflaeche: #connect=<code>, wobei <code> base64url
# (UTF-8-JSON {"v":1,"u":"<https-Adresse>","k":"<API-Schluessel>"}) ist - exakt das Format, das
# frontend_nextjs/src/lib/connectionCode.ts liest (decodeConnectionCode). Kopiert den Link in
# die Zwischenablage (falls verfuegbar) und gibt ihn aus. Auch spaeter einzeln nutzbar, z. B.
# nach einem Schluesselwechsel oder um ein weiteres Geraet zu verbinden.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File connect-link.ps1 [-FrontendUrl <url>] [-Domain <ngrok-domain>]
#
# Ohne -Domain: zuerst NGROK_DOMAIN (Benutzer-Variable), sonst die laufende ngrok-Instanz
# (127.0.0.1:4040). Datei bewusst nur ASCII.
param(
    [string]$FrontendUrl = 'https://auto-grid-next-js.vercel.app',
    [string]$Domain = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Get-ApiKey {
    # setx setzt die Benutzer-Variable; eine schon offene Sitzung sieht sie evtl. nicht in $env
    $key = [Environment]::GetEnvironmentVariable('WORKER_API_KEY', 'User')
    if (-not $key) { $key = $env:WORKER_API_KEY }
    return $key
}

function Get-NgrokDomain {
    if ($Domain) { return $Domain }
    $fromEnv = [Environment]::GetEnvironmentVariable('NGROK_DOMAIN', 'User')
    if ($fromEnv) { return $fromEnv }
    try {
        $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3 -UseBasicParsing
        $url = ($tunnels.tunnels | Select-Object -First 1).public_url
        if ($url) { return ([Uri]$url).Host }
    } catch {}
    return $null
}

function ConvertTo-Base64Url([byte[]]$bytes) {
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

$apiKey = Get-ApiKey
if (-not $apiKey) {
    throw 'WORKER_API_KEY ist nicht gesetzt. setx WORKER_API_KEY "<schluessel>" ausfuehren, Worker neu starten, dann erneut versuchen.'
}

$ngrokHost = Get-NgrokDomain
if (-not $ngrokHost) {
    throw 'ngrok-Domain nicht gefunden. -Domain angeben, NGROK_DOMAIN setzen (setx) oder erst ngrok starten (Port 4040 muss antworten).'
}

$address = "https://$ngrokHost"
$code = [ordered]@{ v = 1; u = $address; k = $apiKey } | ConvertTo-Json -Compress
$code = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($code))
$link = "$FrontendUrl/#connect=$code"

$copied = $false
try {
    Set-Clipboard -Value $link
    $copied = $true
} catch {}

Write-Host ''
Write-Host 'Verbindungs-Link (Adresse + API-Schluessel - wie ein Passwort behandeln, nicht oeffentlich teilen):' -ForegroundColor Cyan
Write-Host $link
if ($copied) {
    Write-Host '(in der Zwischenablage - im Browser einfach einfuegen)' -ForegroundColor DarkGray
} else {
    Write-Host '(Zwischenablage nicht verfuegbar - Link von Hand kopieren)' -ForegroundColor DarkGray
}
