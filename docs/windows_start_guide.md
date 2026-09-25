# Windows Schnellstart-Anleitung (Auto Grid Bot)

Dieses System benötigt **2 aktive Konsolenfenster** sowie MetaTrader 5 im Hintergrund.

Auf dem VPS läuft nur der Worker. Das Frontend läuft lokal auf dem MacBook (`npm run dev:frontend` in `frontend_nextjs/`) und verbindet sich über die ngrok-URL (`NEXT_PUBLIC_API_URL` in `frontend_nextjs/.env.local`) mit dem Worker.

> **Schnellstart:** `worker_python\start.bat` öffnet beide Fenster automatisch (Worker mit Absturz-Watchdog, ohne `--reload`, plus ngrok). Die Schritte 1 und 2 unten sind der manuelle Weg.
>
> `start.bat` darf beliebig oft gestartet werden: Vorher beendet `cleanup_old_instances.ps1` alte Watchdog-, Worker- (Port 8000) und ngrok-Instanzen. Bot-Prozesse und das MT5-Terminal bleiben dabei unberührt. Beim Start ersetzt der Worker außerdem Bots, die noch mit einer älteren Code-Version laufen (z. B. nach `git pull`).
>
> **Wichtig:** `start.bat` und das MT5-Terminal mit denselben Rechten starten, am besten beide **ohne** „Als Administrator ausführen“. Prozesse und Dateien eines Admin-Prozesses kann der normale Worker weder beenden noch beschreiben.
>
> Laufen trotzdem Neustart-Schleifen, Worker, Bots, ngrok oder MT5 mit Adminrechten (z. B. von einer älteren Aufgabe mit „höchsten Rechten“), zeigt die Seite „VPS“ eine rote Warnung mit PID und dem Knopf **„Admin-Prozesse beenden“**: Er beendet sie per SSH und startet Worker und ngrok ohne Adminrechte neu; der Worker setzt die Bots danach fort. `cleanup_old_instances.ps1` selbst kann solche Reste nicht beenden (es sieht nicht einmal ihre Befehlszeile), schreibt sie aber ins Worker-Log (`[Cleanup] !! …`). Ein Worker mit Adminrechten warnt beim Start und macht kein `git pull`.

---

## Fernsteuerung vom Mac (empfohlen)

Nach einer **einmaligen** Einrichtung wird der VPS komplett vom Mac aus gesteuert: Seite **„VPS“** im lokalen Frontend (http://localhost:3000/vps). Dort gibt es Status (Worker, ngrok, Bots, Version, Autostart), „Nach Updates suchen“, „Update & Neustart“, „Worker neu starten“, „ngrok neu starten“, „VPS neu starten“ und die Logs. Kein RDP, kein Administrator-Fenster.

Was danach automatisch läuft:
- **Nach einem Reboot:** Windows meldet sich selbst an (Auto-Login), die Aufgabe `AutoGrid-Start` startet `start.bat` (Worker + ngrok). Bots, die vorher liefen und nicht gestoppt wurden, startet der Worker wieder (auch LIVE). MT5 startet jeder Bot selbst.
- **Updates:** Der Worker prüft alle 5 Minuten `origin/main` und aktualisiert sich selbst (git pull, bei geändertem `requirements.txt` auch `pip install`), danach Neustart. Abschalten: `setx AUTO_UPDATE_MINUTES 0`, Intervall ändern: `setx AUTO_UPDATE_MINUTES 15` (danach Worker neu starten).
- **Abstürze:** Worker und ngrok haben je eine Neustart-Schleife (`run_uvicorn_watchdog.bat`, `run_ngrok_watchdog.bat`).

> **Regel – Rechte:** `git` auf dem VPS **nie als Administrator** ausführen (auch nicht in einer Admin-PowerShell), Updates nur über das Dashboard bzw. die Seite „VPS“ (oder automatisch). Sonst gehören Dateien im Repo dem Administrator, der normale Worker kann sie nicht mehr überschreiben, und `git pull` bricht ab. Die Fernsteuerung hält sich selbst daran: Per SSH läuft nie `git`. Updates macht der Worker selbst oder die Aufgabe `AutoGrid-Update`, beide mit normalen Rechten.

### Einmalige Einrichtung

1. **Mac – Schlüssel erzeugen** (ohne Passphrase, damit die Seite ohne Nachfrage verbinden kann):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/autogrid_vps -N "" -C "autogrid-mac"
   cat ~/.ssh/autogrid_vps.pub
   ```
2. **VPS – einmal per RDP:** Das Repo mit dem normalen Benutzer auf den aktuellen Stand bringen (Dashboard → „Check for Updates“ → „Apply Update“). Scheitert das wegen Rechten („Permission denied“, „unable to unlink“), vorher in einer Administrator-PowerShell nur den Besitzer reparieren: `icacls C:\dev\auto-grid-nextJs /setowner <Benutzer> /T /C /Q`, dann das Update erneut über das Dashboard. Danach **PowerShell als Administrator** öffnen:
   ```powershell
   cd C:\dev\auto-grid-nextJs\worker_python\ops\windows
   powershell -ExecutionPolicy Bypass -File .\setup_vps.ps1 -PublicKey "ssh-ed25519 AAAA... autogrid-mac"
   ```
   Das Skript fragt einmal nach dem Windows-Passwort (für Auto-Login; es wird geprüft und als LSA-Secret gespeichert, nicht im Klartext). Es
   - installiert den OpenSSH-Server (nur Schlüssel-Login, Port 22),
   - trägt den Mac-Schlüssel ein,
   - gibt den Repo-Ordner wieder dem normalen Benutzer (repariert alte Admin-Dateien),
   - richtet Auto-Login ein,
   - legt die Aufgaben `AutoGrid-Start` (bei Anmeldung) und `AutoGrid-Update` an, beide **ohne** höchste Rechte.

   Optionen: `-User <Name>` (Standard: aktueller Benutzer), `-SkipAutoLogon`, `-SkipRepoOwnership`. Das Skript darf beliebig oft laufen. Liegt `start.bat` noch im Autostart-Ordner, dort entfernen.
3. **Firewall des VPS-Anbieters:** Port 22 (TCP) freigeben, falls der Anbieter eine eigene Firewall vor dem VPS hat. Am besten nur für die eigene IP.
4. **Mac – `frontend_nextjs/.env.local`** ergänzen (bewusst **ohne** `NEXT_PUBLIC_`, landet nie im Browser/Vercel):
   ```
   VPS_SSH_HOST=<Benutzer>@<VPS-IP>
   VPS_SSH_KEY=~/.ssh/autogrid_vps
   VPS_REPO_PATH=C:\dev\auto-grid-nextJs
   ```
   Test: `ssh -i ~/.ssh/autogrid_vps <Benutzer>@<VPS-IP> hostname`, danach `npm run dev:frontend` neu starten und die Seite „VPS“ öffnen.

Hinweise:
- Das RDP-Fenster künftig nur **schließen**, nicht abmelden. Bei einer Abmeldung enden MT5, Worker und ngrok (sie brauchen eine angemeldete Sitzung).
- Die Seite „VPS“ funktioniert nur im lokalen Frontend: Die Route `/api/vps/*` antwortet nur auf `localhost` und nur, wenn `VPS_SSH_HOST` gesetzt ist. Auf Vercel ist sie aus.
- Logs auf dem VPS: `worker_python\logs\worker_console.log` (Konsole des Workers), `logs\ngrok.log`, `logs\vps_update.log` (Updates über die Aufgabe).

---

### Vorbereitung (Einmalig)
- **MetaTrader 5:** Muss geöffnet und eingeloggt sein.  
  `Extras` ➔ `Optionen` ➔ `Experten` ➔ **☑ Algorithmic Trading erlauben** aktivieren.  
  `Extras` ➔ `Optionen` ➔ `Community` ➔ **☑ Python-Integration** muss angehakt sein. Ohne diesen Dienst legt das Terminal keinen Kanal für Python an; der Worker meldet dann „… 'Python integration' kutusunu işaretleyin …“. Die Einstellung wirkt erst nach einem Neustart von MT5. Ein Terminal, das schon lief, arbeitet deshalb bis zum nächsten VPS-Neustart weiter; der Fehler fällt erst danach auf (so am 24.09.2026).

- **Microsoft Visual C++ Redistributable 2015–2022 (x64):** Muss auf dem VPS installiert sein. Fehlt sie (kein `vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll` in `C:\Windows\System32`), kann `llvmlite` (über `numba`) seine DLL nicht laden und `import pandas_ta` scheitert mit `OSError: Could not find/load shared object file`. Der WS-Stream rechnet RSI/MACD dann mit reinem pandas (Hinweis `[Indicators] pandas-ta kullanılamıyor …` im Worker-Log). Installation einmal per RDP: `vc_redist.x64.exe` von Microsoft (https://aka.ms/vs/17/release/vc_redist.x64.exe) per Doppelklick in der GUI als Administrator installieren, danach den Worker neu starten. **Nicht** per SSH installieren und dabei kein `git` oder `pip` als Administrator ausführen (siehe „Regel – Rechte“).

- **API-Schlüssel (`WORKER_API_KEY`):** Der Worker ist über ngrok öffentlich erreichbar. Ohne Schlüssel kann jeder, der die URL kennt, Bots starten/stoppen, Einstellungen ändern oder `/api/system/update` auslösen. Beim Start ohne Schlüssel schreibt der Worker deshalb `⚠️ WARNING: WORKER_API_KEY ayarlı değil …` in die Konsole.
  1. Schlüssel erzeugen (z. B. auf dem Mac): `openssl rand -hex 32`
  2. Auf dem VPS dauerhaft als Benutzer-Umgebungsvariable setzen (danach `start.bat` **neu** per Doppelklick starten; bereits offene Konsolen sehen die Variable nicht):
     ```cmd
     setx WORKER_API_KEY "<schluessel>"
     ```
  3. Auf dem Mac denselben Wert in `frontend_nextjs/.env.local` eintragen und `npm run dev:frontend` neu starten (`NEXT_PUBLIC_*`-Variablen werden nur beim Start eingelesen):
     ```
     NEXT_PUBLIC_WORKER_API_KEY=<schluessel>
     ```
  
  Ist `WORKER_API_KEY` gesetzt, verlangt der Worker den Schlüssel bei jedem `/api/*`-Request im Header `X-API-Key` (sonst `401`) und beim WebSocket `/ws/stream` als Query-Parameter `?api_key=…` (Browser können bei WebSockets keine Header setzen; sonst wird die Verbindung abgelehnt). Ist die Variable nicht gesetzt, läuft alles wie bisher ohne Schlüssel.
  
  Reihenfolge beim Umstellen: erst den Schlüssel im Frontend eintragen (ein Worker ohne Schlüssel ignoriert den Header), dann den Worker mit gesetztem `WORKER_API_KEY` neu starten. Der Schlüssel landet im Browser-Bundle – das Frontend deshalb nur lokal betreiben und nicht öffentlich deployen. Schlüssel wechseln = beide Werte ändern und beide Seiten neu starten.
- **MT5-Passwörter:** Die API gibt gespeicherte Passwörter nicht mehr zurück (`GET /api/accounts` liefert nur `has_password`). Beim Bearbeiten eines Kontos bleibt das Passwortfeld leer; leer lassen = gespeichertes Passwort bleibt erhalten.

---

### 1. Terminal: FastAPI Backend (Worker)
Startet die Schnittstelle für MT5, Berechnungen und WebSockets.

```cmd
cd C:\dev\auto-grid-nextJs\worker_python
.venv\Scripts\activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
oder
.venv\Scripts\activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
> **Erfolgskontrolle:** Zeigt am Ende `Application startup complete.` und `Uvicorn running on http://0.0.0.0:8000`.

---

### 2. Terminal: Ngrok Tunnel
Macht den Worker auf dem VPS über das Internet erreichbar, damit das lokale Frontend auf dem MacBook ihn ansprechen kann.

```cmd
ngrok http 8000 --domain=tweet-overlying-monotone.ngrok-free.dev
```
> **Erfolgskontrolle:** Zeigt `Session Status: online` und verweist auf Port `8000`.
