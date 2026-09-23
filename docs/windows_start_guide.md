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
