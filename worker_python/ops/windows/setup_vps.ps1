#Requires -RunAsAdministrator
# Einmalige Einrichtung des VPS fuer die Fernsteuerung vom Mac (Frontend-Seite /vps).
# In einer Administrator-PowerShell ausfuehren; darf beliebig oft wiederholt werden.
#
#   cd C:\dev\auto-grid-nextJs\worker_python\ops\windows
#   powershell -ExecutionPolicy Bypass -File .\setup_vps.ps1 -PublicKey "ssh-ed25519 AAAA... mac"
#
# Was passiert:
#   1. OpenSSH-Server installieren, automatisch starten, Port 22 freigeben, NUR Key-Login
#   2. Den Mac-Schluessel (-PublicKey) eintragen
#   3. Besitzer des Repo-Ordners auf den normalen Benutzer setzen (repariert Dateien, die
#      frueher per "git pull als Administrator" dem Administrator gehoerten)
#   4. Auto-Login nach Neustart (Passwort als LSA-Secret, nicht im Klartext in der Registry)
#   5. Bei MT5-Terminals den Haken "Programm als Administrator ausfuehren" entfernen (sonst kann
#      der Worker ohne Adminrechte MT5 nicht starten: -10003 "Process create failed")
#   6. Geplante Aufgaben (normaler Benutzer, OHNE hoechste Rechte):
#        AutoGrid-Start   bei Anmeldung -> start.bat (Worker + ngrok); auch "Worker neu starten"
#        AutoGrid-Update  nur auf Abruf -> vps.ps1 update-local (git pull + pip + start.bat)
#
# Danach: git auf dem VPS NIE als Administrator ausfuehren. Updates nur ueber das Dashboard
# bzw. die VPS-Seite im Mac-Frontend (oder automatisch, AUTO_UPDATE_MINUTES).
# Datei bewusst nur ASCII: Windows PowerShell 5.1 liest Skripte ohne BOM als ANSI.
param(
    [Parameter(Mandatory = $true)] [string]$PublicKey,
    # Windows-Benutzer, unter dem MT5 und der Worker laufen (Standard: der aktuelle)
    [string]$User = $env:USERNAME,
    [switch]$SkipAutoLogon,
    [switch]$SkipRepoOwnership
)

$ErrorActionPreference = 'Stop'
$WorkerDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$RepoRoot = (Resolve-Path (Join-Path $WorkerDir '..')).Path
$Account = "$env:USERDOMAIN\$User"
$AdminsSid = 'S-1-5-32-544'
$SystemSid = 'S-1-5-18'

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    $text" -ForegroundColor Yellow }

if (-not $PublicKey.Trim().StartsWith('ssh-')) {
    throw 'PublicKey sieht nicht wie ein SSH-Schluessel aus (erwartet "ssh-ed25519 AAAA...").'
}

# --------------------------------------------------------------------------- 1. OpenSSH
Step 'OpenSSH-Server'
$cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'OpenSSH.Server*' } | Select-Object -First 1
if (-not $cap) { throw 'OpenSSH.Server ist auf diesem Windows nicht verfuegbar.' }
if ($cap.State -ne 'Installed') {
    Add-WindowsCapability -Online -Name $cap.Name | Out-Null
    Ok 'installiert'
} else {
    Ok 'bereits installiert'
}
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
        -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
}
Ok 'Dienst laeuft und startet automatisch, Port 22 offen'

# --------------------------------------------------------------------------- 2. Schluessel
Step "Mac-Schluessel fuer $Account"
# sshd liest fuer Administratoren NUR administrators_authorized_keys (Match Group administrators),
# fuer normale Benutzer ~\.ssh\authorized_keys. Die Gruppenpruefung (Get-LocalGroupMember) ist
# unter Windows unzuverlaessig - deshalb in beide Dateien eintragen.
$keyFiles = @(
    @{ path = (Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'); grant = @("*${AdminsSid}:F", "*${SystemSid}:F") },
    @{ path = (Join-Path "C:\Users\$User" '.ssh\authorized_keys'); grant = @("${Account}:F", "*${SystemSid}:F") }
)
foreach ($kf in $keyFiles) {
    New-Item -ItemType Directory -Force -Path (Split-Path $kf.path) | Out-Null
    $existing = if (Test-Path $kf.path) { @(Get-Content $kf.path) } else { @() }
    if ($existing -notcontains $PublicKey.Trim()) {
        Add-Content -Path $kf.path -Value $PublicKey.Trim() -Encoding ascii
        Ok "eingetragen in $($kf.path)"
    } else {
        Ok "bereits vorhanden in $($kf.path)"
    }
    $icaclsArgs = @($kf.path, '/inheritance:r')
    foreach ($g in $kf.grant) { $icaclsArgs += @('/grant', $g) }
    & icacls.exe @icaclsArgs | Out-Null
}

# Nur noch Key-Login (RDP bleibt davon unberuehrt). Direktiven VOR dem ersten "Match"-Block einfuegen.
$config = Join-Path $env:ProgramData 'ssh\sshd_config'
$lines = @(Get-Content $config | Where-Object { $_ -notmatch '^\s*#?\s*(PasswordAuthentication|PubkeyAuthentication)\s' })
$lines = @('PubkeyAuthentication yes', 'PasswordAuthentication no') + $lines
Set-Content -Path $config -Value $lines -Encoding ascii
Restart-Service sshd
Ok 'Passwort-Login per SSH deaktiviert, nur Schluessel'

# --------------------------------------------------------------------------- 3. Repo-Besitzer
if (-not $SkipRepoOwnership) {
    Step "Besitzer von $RepoRoot -> $Account"
    & icacls.exe $RepoRoot /setowner $Account /T /C /Q | Out-Null
    & icacls.exe $RepoRoot /grant "${Account}:(OI)(CI)F" /T /C /Q | Out-Null
    Ok 'Dateien gehoeren wieder dem normalen Benutzer (git/Worker koennen sie ueberschreiben)'
}

# --------------------------------------------------------------------------- 4. Auto-Login
if (-not $SkipAutoLogon) {
    Step "Auto-Login fuer $Account"
    $secure = Read-Host "Windows-Passwort von $Account (fuer Auto-Login nach Neustart)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        Add-Type -AssemblyName System.DirectoryServices.AccountManagement
        $ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext('Machine')
        if (-not $ctx.ValidateCredentials($User, $plain)) {
            throw 'Passwort falsch - Auto-Login nicht eingerichtet. Skript erneut ausfuehren.'
        }

        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class AutoGridLsa {
    [StructLayout(LayoutKind.Sequential)]
    struct LSA_UNICODE_STRING { public UInt16 Length; public UInt16 MaximumLength; public IntPtr Buffer; }

    [StructLayout(LayoutKind.Sequential)]
    struct LSA_OBJECT_ATTRIBUTES {
        public int Length; public IntPtr RootDirectory; public IntPtr ObjectName;
        public uint Attributes; public IntPtr SecurityDescriptor; public IntPtr SecurityQualityOfService;
    }

    [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr systemName, ref LSA_OBJECT_ATTRIBUTES attrs, uint access, out IntPtr policy);
    [DllImport("advapi32.dll")] static extern uint LsaStorePrivateData(IntPtr policy, ref LSA_UNICODE_STRING key, ref LSA_UNICODE_STRING data);
    [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr handle);
    [DllImport("advapi32.dll")] static extern int LsaNtStatusToWinError(uint status);

    static LSA_UNICODE_STRING Str(string s) {
        var u = new LSA_UNICODE_STRING();
        u.Buffer = Marshal.StringToHGlobalUni(s);
        u.Length = (UInt16)(s.Length * 2);
        u.MaximumLength = (UInt16)((s.Length + 1) * 2);
        return u;
    }

    public static void Store(string key, string value) {
        var attrs = new LSA_OBJECT_ATTRIBUTES();
        attrs.Length = Marshal.SizeOf(attrs);
        IntPtr policy;
        uint status = LsaOpenPolicy(IntPtr.Zero, ref attrs, 0x000F0FFF, out policy);
        if (status != 0) throw new Win32Exception(LsaNtStatusToWinError(status));
        var k = Str(key);
        var v = Str(value);
        try {
            status = LsaStorePrivateData(policy, ref k, ref v);
            if (status != 0) throw new Win32Exception(LsaNtStatusToWinError(status));
        } finally {
            Marshal.FreeHGlobal(k.Buffer);
            Marshal.FreeHGlobal(v.Buffer);
            LsaClose(policy);
        }
    }
}
'@
        [AutoGridLsa]::Store('DefaultPassword', $plain)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        $plain = $null
    }
    $winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
    Set-ItemProperty $winlogon -Name AutoAdminLogon -Value '1'
    Set-ItemProperty $winlogon -Name DefaultUserName -Value $User
    Set-ItemProperty $winlogon -Name DefaultDomainName -Value $env:USERDOMAIN
    # Klartext-Passwort und Anmelde-Zaehler (beendet Auto-Login nach n Starts) entfernen
    Remove-ItemProperty $winlogon -Name DefaultPassword -ErrorAction SilentlyContinue
    Remove-ItemProperty $winlogon -Name AutoLogonCount -ErrorAction SilentlyContinue
    Ok 'Auto-Login aktiv. RDP-Fenster kuenftig nur schliessen, NICHT abmelden (sonst stoppen MT5/Worker).'
}

# --------------------------------------------------------------------------- 5. MT5 ohne Admin-Zwang
Step 'MT5-Terminals ohne "Als Administrator ausfuehren"'
# Der Worker laeuft ohne Adminrechte (Aufgabe unten) und startet terminal64.exe selbst. Steht dort
# der Kompatibilitaets-Haken RUNASADMIN, scheitert der Start mit Windows-Fehler 740 und MT5 meldet
# -10003 "IPC initialize failed, Process create failed". Andere Kompatibilitaets-Flags bleiben.
$layerKeys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
)
try {
    $sid = (New-Object Security.Principal.NTAccount($Account)).Translate([Security.Principal.SecurityIdentifier]).Value
    if (Test-Path "Registry::HKEY_USERS\$sid") {
        $layerKeys += "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"
    } else {
        Warn "$Account ist nicht angemeldet - nur die Einstellung fuer alle Benutzer wird geprueft."
    }
} catch {
    Warn "SID von $Account nicht gefunden - nur die Einstellung fuer alle Benutzer wird geprueft."
}
$fixed = 0
foreach ($key in $layerKeys) {
    if (-not (Test-Path $key)) { continue }
    $item = Get-Item $key
    foreach ($name in @($item.Property | Where-Object { $_ -like '*\terminal64.exe' })) {
        $flags = @("$($item.GetValue($name))" -split '\s+' | Where-Object { $_ })
        if ($flags -notcontains 'RUNASADMIN') { continue }
        $rest = @($flags | Where-Object { $_ -ne 'RUNASADMIN' })
        if (@($rest | Where-Object { $_ -ne '~' }).Count -eq 0) {
            Remove-ItemProperty -Path $key -Name $name
        } else {
            Set-ItemProperty -Path $key -Name $name -Value ($rest -join ' ')
        }
        Ok "entfernt: $name"
        $fixed++
    }
}
if ($fixed -gt 0) {
    # Windows merkt sich die alte Entscheidung im Kompatibilitaets-Cache. Der Eigenschaften-Dialog
    # leert ihn selbst, eine Registry-Aenderung nicht: ohne Flush bleibt Fehler 740 bis zum Reboot.
    & rundll32.exe 'apphelp.dll,ShimFlushCache'
    Ok 'Kompatibilitaets-Cache geleert; der Worker kann MT5 jetzt ohne Adminrechte starten'
} else {
    Ok 'kein MT5-Terminal mit "Als Administrator ausfuehren" gefunden'
}

# --------------------------------------------------------------------------- 6. Aufgaben
Step 'Geplante Aufgaben (normaler Benutzer, ohne hoechste Rechte)'
$principal = New-ScheduledTaskPrincipal -UserId $Account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

$startAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$WorkerDir\start.bat`"" -WorkingDirectory $WorkerDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $Account
$trigger.Delay = 'PT30S'  # Netzwerk/Desktop erst fertig laden
Register-ScheduledTask -TaskName 'AutoGrid-Start' -Action $startAction -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
Ok 'AutoGrid-Start: bei Anmeldung -> start.bat'

$vps = Join-Path $PSScriptRoot 'vps.ps1'
$updateAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$vps`" update-local" -WorkingDirectory $WorkerDir
Register-ScheduledTask -TaskName 'AutoGrid-Update' -Action $updateAction `
    -Principal $principal -Settings $settings -Force | Out-Null
Ok 'AutoGrid-Update: auf Abruf (Update, wenn der Worker nicht laeuft)'

$startup = [Environment]::GetFolderPath('Startup')
$old = @(Get-ChildItem $startup -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*start*' })
if ($old.Count -gt 0) {
    Warn "Im Autostart-Ordner liegt noch: $($old.Name -join ', ') - bitte entfernen (AutoGrid-Start ersetzt es)."
}

Step 'Fertig'
Write-Host @"
    Auf dem Mac in frontend_nextjs/.env.local eintragen:
      VPS_SSH_HOST=$User@<VPS-IP>
      VPS_SSH_KEY=~/.ssh/autogrid_vps
      VPS_REPO_PATH=$RepoRoot
    Test vom Mac:  ssh -i ~/.ssh/autogrid_vps $User@<VPS-IP> hostname

    Regel: git auf dem VPS nie als Administrator ausfuehren. Updates nur ueber das Dashboard
    bzw. die VPS-Seite im Mac-Frontend.
"@
