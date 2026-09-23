# Windows Schnellstart-Anleitung (Auto Grid Bot)

Dieses System benötigt **2 aktive Konsolenfenster** sowie MetaTrader 5 im Hintergrund.

Auf dem VPS läuft nur der Worker. Das Frontend läuft lokal auf dem MacBook (`npm run dev:frontend` in `frontend_nextjs/`) und verbindet sich über die ngrok-URL (`NEXT_PUBLIC_API_URL` in `frontend_nextjs/.env.local`) mit dem Worker.

> **Schnellstart:** `worker_python\start.bat` öffnet beide Fenster automatisch (Worker mit Absturz-Watchdog, ohne `--reload`, plus ngrok). Die Schritte 1 und 2 unten sind der manuelle Weg.
>
> `start.bat` darf beliebig oft gestartet werden: Vorher beendet `cleanup_old_instances.ps1` alte Watchdog-, Worker- (Port 8000) und ngrok-Instanzen. Bot-Prozesse und das MT5-Terminal bleiben dabei unberührt. Beim Start ersetzt der Worker außerdem Bots, die noch mit einer älteren Code-Version laufen (z. B. nach `git pull`).
>
> **Wichtig:** `start.bat` und das MT5-Terminal mit denselben Rechten starten, am besten beide **ohne** „Als Administrator ausführen“. Prozesse und Dateien eines Admin-Prozesses kann der normale Worker weder beenden noch beschreiben.

---

### Vorbereitung (Einmalig)
- **MetaTrader 5:** Muss geöffnet und eingeloggt sein.  
  `Extras` ➔ `Optionen` ➔ `Experten` ➔ **☑ Algorithmic Trading erlauben** aktivieren.

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
