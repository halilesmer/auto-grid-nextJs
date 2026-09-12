# Windows Schnellstart-Anleitung (Auto Grid Bot)

Dieses System benötigt **2 aktive Konsolenfenster** sowie MetaTrader 5 im Hintergrund.

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
```
> **Erfolgskontrolle:** Zeigt am Ende `Application startup complete.` und `Uvicorn running on http://0.0.0.0:8000`.

---

### 2. Terminal: Ngrok Tunnel
Verbindet das lokale Backend sicher mit dem Vercel-Frontend über das Internet.

```cmd
ngrok http 8000 --domain=tweet-overlying-monotone.ngrok-free.dev
```
> **Erfolgskontrolle:** Zeigt `Session Status: online` und verweist auf Port `8000`.
