# Auto Grid – Funktions-Checkliste

> Automatisch erzeugt aus [`features.yaml`](features.yaml) – **nicht von Hand bearbeiten**.
> Aktualisieren: `scripts/features/run.sh` (oder in Claude Code `/feature-test`).
> Manuelles Ergebnis eintragen: `scripts/features/run.sh sign ENG-13 bestanden`.

**Stand:** 2026-10-02 · **125/140** abgehakt · ❌ 0 mit Fehlern · 🐞 0 bekannte Fehler

Legende: 🧪 unit · 🔌 api · 🖥️ e2e (gemockt) · 🌐 live (DEMO-Konto) · 👤 manuell — ✅ bestanden · ❌ fehlgeschlagen · 🐞 bekannter Fehler (xfail) · ⏭️ übersprungen · ⏳ noch kein Ergebnis

Häkchen = kein Fehler, mindestens ein bestandener Test bzw. manuelle Freigabe, und bei 👤 eine Freigabe. *(teilweise)* = es fehlen noch Ergebnisse auf anderen Ebenen.

## Testreihenfolge

| # | Kategorie | Stand |
|---|---|---|
| 1 | **SYS** – Verbindung & Infrastruktur | 8/9 |
| 2 | **ACC** – Konten | 10/11 |
| 3 | **USR** – Benutzer & Zugriff | 8/8 |
| 4 | **SET** – Allgemeine Einstellungen | 6/6 |
| 5 | **SYM** – Symbole | 4/4 |
| 6 | **ZON** – Zonen-Konfiguration (UI ↔ Backend) | 15/18 |
| 7 | **BOT** – Bot-Steuerung | 6/7 |
| 8 | **ENG** – Grid-Engine (Handelslogik) | 28/28 |
| 9 | **MET** – Live-Daten & Diagramm | 4/4 |
| 10 | **LOG** – Logs | 6/7 |
| 11 | **UPD** – System & Updates | 5/6 |
| 12 | **VPS** – VPS-Fernsteuerung vom Mac | 4/10 |
| 13 | **UI** – Oberfläche | 9/9 |
| 14 | **ANA** – Analyse (Chart, Statistik, Backtest) | 10/11 |
| 15 | **BKT** – Backtest (Musterlösungen, Nachbau, Rechner) | 2/2 |

## 1. SYS – Verbindung & Infrastruktur

- [x] **SYS-01** Worker erreichbar (REST über ngrok) — 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Das Frontend erreicht den Worker über die im Browser gespeicherte Verbindung (Adresse + /api); axios sendet den ngrok-skip-browser-warning-Header. NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WORKER_API_KEY sind nur noch der Startwert für die lokale Entwicklung (siehe SYS-07).
  - **Prüfung:** Worker auf dem VPS starten (start.bat), Frontend lokal starten (npm run dev:frontend). → http://localhost:3000 öffnen.
  - **Erwartet:** Kontoliste lädt, im Log-Bereich steht der Worker als online.
  - 📝 Claude im App-Browser: /api/accounts 200 über ngrok, DEMO-Konto 7942034 im Dropdown, 'Worker online'
- [x] **SYS-02** WebSocket-Stream + Reconnect — 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Verbindung zu /ws/stream; Nachrichten METRICS, LIVE_DATA, LOG werden in die Stores geleitet; bei Abbruch automatischer Reconnect.
  - **Prüfung:** Dashboard öffnen, DevTools → Network → WS prüfen. → Worker kurz neu starten.
  - **Erwartet:** WS verbindet sich, nach dem Neustart verbindet er sich von selbst wieder.
  - 📝 Claude im App-Browser: WS offen nach ~0,1 s, 1 Nachricht/s; nach Worker-Neustart 4 Fehlversuche mit Backoff 2/4/8/16 s, dann verbunden (~60 s). Inhalt fehlerhaft → siehe MET-03
- [x] **SYS-03** Plattform-Erkennung — 🔌 api ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /system/platform meldet, ob der Worker unter Windows läuft (auch als einfacher Health-Check, siehe docs/NGrok).
  - **Prüfung:** GET /api/system/platform (mit X-API-Key) über ngrok aufrufen.
  - **Erwartet:** Antwort {"platform": "win32", "is_windows": true}.
  - 📝 Claude: /system/platform → 200 {is_windows: true, platform: win32}; 'Mac Test Mode'-Leiste nicht sichtbar
- [x] **SYS-04** MT5-Terminal-Scanner — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /system/scan-mt5 sucht terminal64.exe auf dem VPS; der Konto-Dialog bietet die Pfade zur Auswahl an (Rescan, eigener Pfad).
  - **Prüfung:** „Neues Konto“ öffnen, Feld MT5-Pfad ansehen, „Rescan“ klicken. → Checkbox „eigener Pfad“ aktivieren.
  - **Erwartet:** Installierte Terminals erscheinen in der Liste; mit „eigener Pfad“ erscheint ein Textfeld.
  - 📝 Claude: /system/scan-mt5 → 200 in 83 ms, 1 Terminal (Pfad = Testkonto); Dialog lädt Pfad beim Öffnen, Rescan fragt erneut ab, 'Manuel Gir' ersetzt Auswahl durch Textfeld; Dialog ohne Speichern geschlossen
- [x] **SYS-05** API-Schlüssel (WORKER_API_KEY) — 🔌 api ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24
  - Ist WORKER_API_KEY auf dem VPS gesetzt, braucht jede /api/*-Anfrage den Header X-API-Key und /ws/stream den Query-Parameter api_key; das Frontend sendet den im Browser gespeicherten Schlüssel mit (SYS-07). Ohne Variable bleibt der Worker offen (mit Warnung beim Start). WORKER_API_KEY ist der Admin-Schlüssel; Benutzer bekommen eigene Schlüssel (USR-01).
  - **Prüfung:** WORKER_API_KEY auf dem VPS setzen, Worker neu starten. → Dashboard mit passendem Schlüssel verbinden (SYS-07); danach die ngrok-URL /api/accounts direkt im Browser aufrufen.
  - **Erwartet:** Dashboard funktioniert normal; der direkte Aufruf ohne Schlüssel liefert 401.
- [x] **SYS-07** Verbindung im Browser einrichten — 🖥️ e2e ✅ 2026-10-02
  - Worker-Adresse und API-Key werden im Verbindungsdialog eingegeben oder per Link übernommen, mit GET /api/system/platform getestet (ok/falscher Key/unsicher/nicht erreichbar/kein Worker) und erst nach erfolgreichem Test im Browser (localStorage) gespeichert; „Verbinden“ und „Trennen“ laden die Seite neu. Ohne Verbindung zeigt die Seite eine Anleitung statt des Dashboards; NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WORKER_API_KEY dienen nur als Startwert, wenn noch nichts gespeichert ist.
  - **Prüfung:** Im Browser localStorage den Eintrag grid-robot-connection löschen und neu laden. → Über den Knopf „VPS verbinden“ Adresse und Schlüssel eingeben, testen, verbinden; danach trennen.
  - **Erwartet:** Ohne Verbindung erscheint die Anleitung statt des Dashboards; „Verbinden“ ist erst nach erfolgreichem Test klickbar und lädt danach das Dashboard; „Trennen“ führt zur Anleitung zurück.
- [x] **SYS-08** Verbindungs-Link — 🖥️ e2e ✅ 2026-10-02
  - Ein Link/Code (#connect=…, base64url-JSON {v,u,k}) füllt Adresse und Schlüssel im Dialog und testet sofort; nichts wird ohne Bestätigung gespeichert, das Fragment verschwindet sofort aus der Adresszeile. worker_python/ops/windows/connect-link.ps1 erzeugt denselben Code.
  - **Prüfung:** Einen Verbindungs-Link mit gültigem Code öffnen (z. B. → Einen unvollständigen/kaputten Code öffnen.
  - **Erwartet:** Gültiger Link zeigt das Ziel im Dialog und ein erfolgreiches Testergebnis, ohne die Verbindung schon zu speichern; ungültiger Code zeigt eine Fehlermeldung.
- [x] **SYS-09** Verbindungsstatus im Header — 🖥️ e2e ✅ 2026-10-02
  - Ein Chip in der Kopfzeile (ab sm) bzw. eine Zeile darunter (Handy) zeigt Host und Status (verbunden/kein Key/nicht erreichbar/unsicher/nicht verbunden) und prüft alle 30 s sowie bei Fenster-Fokus erneut über SYS-07.
  - **Prüfung:** Bei laufendem Worker das Dashboard öffnen, dann den API-Key auf dem VPS ändern. → Zurück ins Browserfenster wechseln (Fokus).
  - **Erwartet:** Der Chip zeigt zunächst „Verbunden“, nach dem Fokuswechsel „API-Key abgelehnt“.
- [ ] **SYS-06** MT5-Verbindung (Kaltstart, Zeitbudget, Python-Integration) — 🧪 unit ✅ 2026-10-02 · 👤 manuell ⏳
  - Worker (/start, Symbolabfrage) und bot_runner verbinden sich über connect_to_mt5_with_timeout. Das Timeout ist ein Gesamtbudget (Warten auf die MT5-Sperre, initialize-Versuche, Neustart eines hängenden Terminals); danach wird nicht weiter versucht, /start antwortet also nach rund 120 s (+ Login). Bei IPC-Fehlern wird nur ein terminal64.exe desselben Pfads beendet, das älter als 180 s ist; ein startendes Terminal wird abgewartet. Die kurze Symbolabfrage (15 s) beendet nie ein Terminal. -10004 bei initialize heißt „keine IPC-Verbindung“, nicht „falsches Passwort“. Vor initialize wird der Python-Kanal des Terminals geprüft (named pipe MT5.Terminal.<SHA-256 des Pfads>). Ist das Terminal älter als 30 s und hat keinen Kanal, ist in MT5 unter Optionen → Community „Python integration“ abgewählt; dann kommt sofort eine klare Meldung statt 60 s Warten pro Versuch, und kein Terminal wird beendet. Ist der Kanal eines anderen Terminals offen, wird wie bisher verbunden.
  - **Prüfung:** Auf der Seite „VPS“ den VPS neu starten, MT5 nicht von Hand öffnen. → Sobald der Worker erreichbar ist, Konto wählen, eine Zone öffnen (Symbolliste) und sofort „Start Bot“ klicken. → Nur DEMO, Bot vorher stoppen: Per RDP in MT5 Extras → Optionen → Community „Python-Integration“ abwählen, MT5 beenden und neu starten, „Start Bot“ klicken. Danach den Haken wieder setzen und MT5 neu starten.
  - **Erwartet:** /start antwortet nach spätestens ~2–3 min (Erfolg oder klare Fehlermeldung). Das Worker-Log zeigt „henüz açılıyor, öldürülmüyor“ statt „Öldürülüyor“ für ein Terminal, das jünger als 180 s ist. Scheitert der erste Start am langsamen Kaltstart, verbindet ein zweiter Start mit demselben Terminal. Ohne Python-Integration scheitert „Start Bot“ nach wenigen Sekunden mit der Meldung „… 'Python integration' kutusunu işaretleyin …“; mit Haken verbindet er in Sekunden.

## 2. ACC – Konten

- [x] **ACC-01** Kontoliste laden — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /accounts liefert alle Konten aus configs/accounts.json; das Dropdown zeigt sie an und schreibt sie in useAccountStore.
  - **Prüfung:** Dashboard öffnen, Dropdown „Select Account“ aufklappen.
  - **Erwartet:** Alle registrierten Konten erscheinen (inkl. DEMO-Testkonto).
  - 📝 Claude: /accounts → 1 Konto (7942034, DEMO, Eightcap-Demo), Dropdown zeigt genau dieses
- [x] **ACC-02** Konto anlegen + Validierung — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - Dialog „New MT5 Account“; Pflichtfelder Name, Login, Passwort, Server, MT5-Pfad; Notizen max. 1000 Zeichen; POST /accounts.
  - **Prüfung:** „Add new account“ klicken, leer absenden. → (Nur mit einem Wegwerf-Konto!) Alle Felder ausfüllen und speichern.
  - **Erwartet:** Leeres Formular zeigt Pflichtfeld-Fehler; gültiges Konto erscheint danach im Dropdown.
- [x] **ACC-03** Doppelter Login — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - Gleicher Login wie ein bestehendes Konto → Rückfrage „bestehendes Konto bearbeiten?“; der Worker antwortet mit 409 (RFC-7807-Problem).
  - **Prüfung:** Neues Konto mit dem Login eines vorhandenen Kontos anlegen.
  - **Erwartet:** Browser-Rückfrage erscheint; es entsteht kein zweites Konto.
- [x] **ACC-04** Konto bearbeiten — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - PUT /accounts/{id}; gesperrt, solange der Bot läuft.
  - **Prüfung:** Konto wählen, „Edit account“, Notiz ändern, speichern.
  - **Erwartet:** Änderung bleibt nach Neuladen erhalten; bei laufendem Bot ist der Button deaktiviert.
- [x] **ACC-05** Konto löschen — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - DELETE /accounts/{id} nach Bestätigung („Delete Account“); gesperrt, solange der Bot läuft.
  - **Prüfung:** (Nur Wegwerf-Konto!) „Delete account“ → bestätigen.
  - **Erwartet:** Konto verschwindet aus dem Dropdown; bei laufendem Bot ist der Button deaktiviert.
- [x] **ACC-06** Kontoauswahl lädt Einstellungen — 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Auswahl im Dropdown lädt GET /settings/{id} in useSettingsStore; ohne Konto erscheint der Leerzustand „No account selected“.
  - **Prüfung:** Seite ohne Auswahl öffnen, dann das DEMO-Konto wählen.
  - **Erwartet:** Zuerst Leerzustand, danach erscheinen Zonen und allgemeine Einstellungen des Kontos.
  - 📝 Claude: ohne Auswahl Leerzustand; nach Auswahl /settings/7942034 geladen, UI = API (1 Zone USOUSD BOTH 20–200, Step 0.1, Lot 0.01, TP 0.1, SL 0; Intervall 1 s)
- [x] **ACC-07** LIVE/TEST-Kennzeichnung — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Badge (TEST/LIVE) am Anfang der Steuerleiste und Kennzeichnung DEMO/LIVE je Eintrag der Kontoliste, beides aus env_type des Kontos.
  - **Prüfung:** DEMO-Konto wählen.
  - **Erwartet:** Badge zeigt TEST/DEMO, nicht LIVE.
  - 📝 Claude: Header-Badge TEST, Badge neben Dropdown DEMO (env_type DEMO). Hinweis: ohne Kontoauswahl zeigt der Header ebenfalls TEST
- [x] **ACC-08** LIVE/DEMO-Sicherheitsprüfung — 🧪 unit ✅ 2026-10-02
  - Ein als LIVE markiertes Konto darf nur mit einem echten, ein DEMO-Konto nur mit einem Demo-Server verbinden – sonst wird die Verbindung verweigert.
  - **Prüfung:** Nicht manuell testen (würde ein falsch markiertes Konto erfordern).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ACC-09** Passwort nie in API-Antworten — 🔌 api ✅ 2026-10-02
  - Der Worker gibt MT5-Passwörter in keiner Antwort zurück (Liste, Anlegen, Bearbeiten, 409-Problem), sondern nur has_password. Leeres Passwort beim Bearbeiten = unverändert.
  - **Prüfung:** DevTools → Network → Antwort von /api/accounts ansehen. → Konto bearbeiten, Passwortfeld leer lassen, speichern.
  - **Erwartet:** Kein Feld „password“ in der Antwort; das Konto verbindet sich danach weiterhin (Passwort unverändert).
- [x] **ACC-10** Kontowechsel zeigt nur Daten des gewählten Kontos *(teilweise)* — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 🌐 live ⏳
  - Beim Wechsel des Kontos werden Laufzeitdaten (Bot-Status, Preis, G/V, Positionen) zurückgesetzt, statt die Werte des vorherigen Kontos stehen zu lassen. Der WS-Stream folgt dem gewählten Konto (/ws/stream?account_id=, neu verbunden beim Wechsel); der Worker sendet jeder Verbindung nur ihr Konto – aus der MT5-Abfrage des API-Prozesses nur, wenn dessen Terminal an diesem Konto angemeldet ist, sonst aus der Metrikdatei des Bot-Prozesses. WS-Metriken tragen account_id; Metriken eines anderen Kontos (älterer Worker) ignoriert das Frontend.
  - **Prüfung:** Konto mit laufendem Bot wählen, dann auf ein Konto wechseln, dessen Bot nicht läuft. → Zweites Konto mit laufendem Bot wählen, /chart bzw. /formasyon öffnen; DevTools → WS-URL und Nachrichten ansehen.
  - **Erwartet:** Das zweite Konto zeigt „Gestoppt“ und keine Preise/Positionen des ersten Kontos; zurück auf das erste Konto zeigt wieder dessen Status. Mit laufendem Bot bekommt das zweite Konto eigene Stream-Metriken (Live-Preis im Chart; die WS-URL enthält account_id=<Konto>, jede METRICS-Nachricht dessen account_id).
- [ ] **ACC-11** Kein Login im MT5-Terminal eines anderen Kontos — 🧪 unit ✅ 2026-10-02 · 👤 manuell ⏳
  - mt5.login() stellt das verbundene Terminal auf ein anderes Konto um. Ist mt5_path eingetragen, aber nicht vorhanden, verbinden Worker (/start, Symbolabfrage) und Bot-Reconnect nicht mehr ohne Pfad mit irgendeinem laufenden Terminal, sondern melden „[CONFIG] MT5 terminal yolu bulunamadı“. Vor jedem Login wird terminal_info().path mit den mt5_path-Einträgen in accounts.json verglichen; gehört das Terminal einem anderen Konto (und nicht auch diesem), wird nicht eingeloggt („[TERMINAL] … hesabına ait“). Ein Konto ohne mt5_path kann sich daher nicht im Terminal eines Kontos mit eingetragenem Pfad anmelden. Der Bot prüft in jeder Runde vor Fernbefehlen und Handel account_info().login; ist sein Terminal auf ein fremdes Konto umgestellt, handelt er nicht („MT5 terminali başka bir hesaba … geçmiş“) und meldet sich wieder am eigenen Konto an; wird der Login abgelehnt, trennt er sich vom Terminal. Anlass 29.09.2026, 20:41 – T34 (Konto 7942034) wurde kurz auf 7947315 angemeldet.
  - **Prüfung:** Nur DEMO. Zwei Konten mit je eigenem Terminal, Bot von Konto 1 läuft. → Bei Konto 2 im Bearbeiten-Dialog einen nicht existierenden MT5-Pfad eintragen, speichern und für Konto 2 eine Zone öffnen (Symbolliste) bzw. „Bot starten“ klicken. → Danach den richtigen Pfad wieder eintragen.
  - **Erwartet:** Konto 2 zeigt „[CONFIG] MT5 terminal yolu bulunamadı …“; das Journal von Terminal 1 enthält keine Anmeldung von Konto 2, der Bot von Konto 1 läuft ohne „BAĞLANTISI KOPTU“ weiter.

## 3. USR – Benutzer & Zugriff

- [x] **USR-01** Persönliche Schlüssel und Rollen — 🔌 api ✅ 2026-10-02
  - Der Worker ordnet jeden X-API-Key (bzw. ?api_key= am WebSocket) einer Rolle zu. WORKER_API_KEY = Admin (sieht alles); der persönliche Schlüssel eines Benutzers (configs/users.json, nur als sha256-Hash) = Benutzer (nur eigene Konten). Unbekannt oder fehlend → 401. Ohne WORKER_API_KEY und ohne Benutzer bleibt der Worker offen (wie bisher, alle Admin); gibt es Benutzer (oder eine unlesbare users.json), aber keinen WORKER_API_KEY, wird ein Zugriff ohne Schlüssel abgelehnt. GET /api/auth/me liefert Name und Rolle.
  - **Prüfung:** Mit dem Admin-Schlüssel und mit dem Schlüssel eines Benutzers GET /api/auth/me aufrufen. → Mit einem falschen Schlüssel dasselbe versuchen.
  - **Erwartet:** Admin- und Benutzerschlüssel liefern die jeweilige Rolle, ein falscher Schlüssel 401.
- [x] **USR-02** Benutzerverwaltung (Admin) — 🔌 api ✅ 2026-10-02
  - GET/POST /api/users, POST /api/users/{id}/key (Schlüssel erneuern), DELETE /api/users/{id} – nur mit Admin-Schlüssel (sonst 403). Der Schlüssel wird nur in der Antwort auf Anlegen/Erneuern angezeigt. Namen sind eindeutig (ohne Groß-/Kleinschreibung), 1–40 Zeichen. Ohne gesetzten WORKER_API_KEY verweigert der Worker das Anlegen (409), denn im offenen Modus ist jeder Admin und der erste Benutzer würde alle aussperren. Beim Löschen bleiben die Konten und ihre Bots erhalten und werden „ohne Besitzer“ (gehören dem Admin).
  - **Prüfung:** Als Admin einen Benutzer anlegen, den Schlüssel notieren, damit verbinden. → Schlüssel erneuern und mit dem alten Schlüssel verbinden.
  - **Erwartet:** Der neue Schlüssel funktioniert sofort, der alte wird nach dem Erneuern mit 401 abgelehnt; Benutzer sehen die Verwaltung nicht.
- [x] **USR-03** Konto-Besitzer — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - Konten tragen ein Feld owner (Benutzer-ID). Benutzer sehen und legen nur eigene Konten an (Besitzer wird vom Worker gesetzt, der Body wird ignoriert); der Admin sieht alle Konten und kann den Besitzer beim Anlegen/Bearbeiten setzen (Altbestand ohne Besitzer gehört dem Admin). Bearbeiten erhält den Besitzer. Die Konto-ID darf nur aus Ziffern bestehen (Dateinamen); id und login dürfen nicht mit einem anderen Konto kollidieren; ein Duplikat verrät keine Daten fremder Konten (409 ohne existing_account). Benutzer müssen einen mt5_path angeben, der ein von scan-mt5 gefundenes Terminal ist und nicht zu einem Konto eines anderen Besitzers gehört. Bearbeiten und Löschen eines Kontos lehnt der Worker bei laufendem Bot mit 409 ab.
  - **Prüfung:** Als Benutzer ein Konto anlegen und als Admin die Kontoliste öffnen. → Als Benutzer ein Konto mit der Login-Nummer eines fremden Kontos anlegen.
  - **Erwartet:** Das Konto erscheint beim Benutzer und beim Admin (mit Besitzer), aber nicht bei anderen Benutzern; das Duplikat wird ohne Details zum fremden Konto abgelehnt.
- [x] **USR-04** Isolation aller kontobezogenen Endpunkte — 🔌 api ✅ 2026-10-02
  - Einstellungen, UI-Zustand, Symbole, Logs (lesen, löschen, herunterladen), Start/Stop, Aktionen sowie Konto bearbeiten/löschen prüfen den Besitzer und antworten für fremde oder unbekannte Konten mit 404. Das schließt auch Glob- und Pfad-Tricks (/settings/*, /logs/download/..) aus. Der Admin behält Zugriff auf alle Konten.
  - **Prüfung:** Mit dem Schlüssel eines Benutzers per curl ein Konto eines anderen Benutzers abrufen (Einstellungen, Logs, Start).
  - **Erwartet:** Immer 404; das eigene Konto und der Admin kommen durch.
- [x] **USR-05** WebSocket-Isolation — 🔌 api ✅ 2026-10-02
  - /ws/stream?api_key=…&account_id=… – Benutzer verbinden nur mit eigenen Konten (sonst Schließen mit 1008); ohne account_id kein „erstes Konto“-Fallback. Der Admin verbindet wie bisher. Bei offener Verbindung prüft der Worker die Berechtigung alle 5 s neu und schließt sie (1008), wenn Schlüssel erneuert/Benutzer gelöscht wurde oder das Konto den Besitzer wechselt bzw. gelöscht wird.
  - **Prüfung:** Mit dem Schlüssel eines Benutzers eine WebSocket-Verbindung für ein fremdes Konto öffnen.
  - **Erwartet:** Die Verbindung wird abgelehnt; für das eigene Konto kommen Live-Daten. Erneuert der Admin den Schlüssel, endet die offene Verbindung nach wenigen Sekunden.
- [x] **USR-06** Systemrouten nur für Admin — 🔌 api ✅ 2026-10-02
  - GET /system/update/check und POST /system/update (git pull + Neustart) verlangen den Admin-Schlüssel (403 für Benutzer). Verbindungstest (/system/platform) und MT5-Suche (/system/scan-mt5) bleiben für alle offen.
  - **Prüfung:** Mit dem Schlüssel eines Benutzers POST /api/system/update aufrufen.
  - **Erwartet:** 403; es wird kein git pull und kein Neustart ausgelöst.
- [x] **USR-07** Benutzerseite (Admin) — 🖥️ e2e ✅ 2026-10-02
  - Die Seite /users (Nav-Eintrag „Benutzer“, nur mit Admin-Schlüssel) listet die Benutzer mit Anzahl ihrer Konten. „Benutzer anlegen“ zeigt den persönlichen Schlüssel und einen fertigen Verbindungs-Link (Worker-Adresse + Schlüssel) genau einmal; „Neuer Schlüssel“ und „Löschen“ fragen vorher nach. Konten eines gelöschten Benutzers bleiben und gehören danach dem Administrator. Doppelte Namen meldet der Worker.
  - **Prüfung:** Mit dem Admin-Schlüssel „Benutzer“ öffnen, einen Benutzer anlegen, Schlüssel/Link kopieren, das Fenster schließen. → Schlüssel erneuern und den Benutzer danach löschen.
  - **Erwartet:** Der Schlüssel erscheint nur im Fenster direkt nach dem Anlegen bzw. Erneuern; die Liste zeigt Name, Konten und Erstellzeit; nach dem Löschen ist der Benutzer weg und seine Konten sind noch da.
- [x] **USR-08** Ansicht eines Benutzers — 🖥️ e2e ✅ 2026-10-02
  - Mit einem persönlichen Schlüssel zeigen Kontoliste und Verbindungsdialog nur die eigenen Konten und die Rolle („Verbunden als …“). Die Navigation hat keine Einträge „VPS“ und „Benutzer“, die Seiten selbst zeigen „Nur für Administratoren“, das Dashboard-Menü hat keine Update-Prüfung und es wird keine Update-Anfrage gestellt. Ein neues Konto bekommt der Benutzer als Besitzer vom Worker (das Formular hat keine Besitzer-Auswahl). Chart-Seiten öffnen ohne gewähltes Konto keinen Stream.
  - **Prüfung:** Im Browser (privates Fenster) mit dem Verbindungs-Link eines Benutzers verbinden. → Kontoliste, Navigation, Einstellungsmenü im Dashboard und die Seiten /users und /vps ansehen.
  - **Erwartet:** Nur die eigenen Konten erscheinen; „VPS“ und „Benutzer“ fehlen in der Navigation, ihre Seiten zeigen den Administrator-Hinweis; die Update-Prüfung fehlt im Menü.

## 4. SET – Allgemeine Einstellungen

- [x] **SET-01** Einstellungen laden — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /settings/{id} liest configs/settings_{id}*.json (verschachteltes „settings“ wird ausgepackt).
  - **Prüfung:** Konto wählen.
  - **Erwartet:** Zonen und Kontroll-Intervall entsprechen der Datei auf dem VPS.
  - 📝 Claude: GET /settings/7942034 → flache Datei settings_7942034.json (LOOP_INTERVAL_SECONDS, ZONES); UI zeigt alle Werte korrekt (siehe ACC-06)
- [x] **SET-02** Kontroll-Intervall (LOOP_INTERVAL_SECONDS) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Stepper „Kontrol Sıklığı“ 1–60 s in 0,1er-Schritten; „Kaydet“ ist nur bei Änderung aktiv.
  - **Prüfung:** Mit −/+ den Wert ändern, 0 und 61 eintippen, speichern, neu laden.
  - **Erwartet:** Werte außerhalb 1–60 werden begrenzt; gespeicherter Wert bleibt nach Neuladen.
  - 📝 Claude: + → 1,1 und Kaydet aktiv; 61 → 60, 0 → 1 begrenzt; gespeichert → API 1,1, bleibt nach Neuladen; per − zurück auf 1 gespeichert
- [x] **SET-03** „Alle speichern“ + Dirty-Tracking — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Bei ungespeicherten Änderungen erscheint die schwebende Leiste „Kaydedilmemiş değişiklikler var“; „Tüm Ayarları Kaydet“ speichert alles (is_active wird beim Vergleich ignoriert). Auch per Cmd+Enter (Mac) / Strg+Enter (Windows); das Kürzel steht als Badge neben „Kaydet“.
  - **Prüfung:** Ein Zonenfeld ändern → Leiste prüfen → „Kaydet“ oder Cmd/Strg+Enter.
  - **Erwartet:** Leiste erscheint, Button zeigt „Kaydediliyor…“ → „Kaydedildi“, Leiste verschwindet.
  - 📝 Claude: Max Fiyat 200 → 201 → schwebende Leiste + Badge 'Kaydedilmedi'; 'Kaydet' in der Leiste → API 201, Leiste weg; zurück auf 200 über 'Tüm Ayarları Kaydet' → API 200, 'Kaydedildi'
- [x] **SET-04** Werte bereinigen (Sanitizing) — 🧪 unit ✅ 2026-10-02 · 🔌 api ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Der Worker rundet Gleitkommazahlen beim Speichern (sanitize_settings).
  - **Prüfung:** Lot 0.0100000001 eingeben und speichern.
  - **Erwartet:** Gespeichert wird 0.01.
  - 📝 Claude: POST LOOP_INTERVAL_SECONDS 1.00000001 → gespeichert als 1.0
- [x] **SET-05** Einstellungen zusammenführen (Merge) — 🔌 api ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - POST /settings/{id} führt die neuen Werte mit der bestehenden Datei zusammen, statt sie zu überschreiben.
  - **Prüfung:** Nur das Intervall speichern.
  - **Erwartet:** Zonen bleiben unverändert.
  - 📝 Claude: POST nur mit LOOP_INTERVAL_SECONDS → ZONES unverändert; Gesamteinstellungen danach identisch mit Sicherung
- [x] **SET-06** Standardwerte (neue Datei, fehlende Zonenfelder) — 🧪 unit ✅ 2026-10-02
  - Eine neue Einstellungsdatei enthält nur LOOP_INTERVAL_SECONDS und ZONES. Fehlt einer Zone ein Feld, nimmt die Engine dieselben Standardwerte wie eine neue Zone im UI (defaultZone). Die früheren GLOBAL_*-Schlüssel wurden nie gelesen und sind entfernt.
  - **Prüfung:** Nicht manuell testbar.
  - **Erwartet:** Engine- und UI-Standardwerte stimmen überein; keine ungenutzten Schlüssel in neuen Dateien.

## 5. SYM – Symbole

- [x] **SYM-01** Symbolliste + Cache *(teilweise)* — 🧪 unit ✅ 2026-10-02 · 🔌 api ⏳ · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /symbols/{id} liefert Broker-Symbole aus broker_symbols.json; 1-h-Cache, bei Ablauf wird die alte Liste geliefert und im Hintergrund aktualisiert (doppelte Anfragen werden zusammengelegt). Solange /start oder /stop für das Konto läuft, verbindet sich die Abfrage nicht selbst mit MT5 (alte Liste bzw. leer); /start füllt den Cache.
  - **Prüfung:** Zone öffnen, ins Symbolfeld klicken.
  - **Erwartet:** Symbolliste des Brokers erscheint schnell (auch bei wiederholtem Öffnen).
  - 📝 Claude: /symbols/7942034 → 200, 812 Symbole mit Details (USOUSD: digits 3, point 0.001, Volumen 0.01–50); 2. Abruf 72 ms statt 168 ms (Cache). 1-h-Ablauf/Hintergrund-Refresh nicht live prüfbar → Unit-Test
- [x] **SYM-02** Symbol-Autocomplete — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Feld „Sembol Ara…“ filtert die Symbolliste beim Tippen.
  - **Prüfung:** „XAU“ tippen und einen Vorschlag wählen.
  - **Erwartet:** Nur passende Symbole erscheinen; Auswahl übernimmt das Symbol.
  - 📝 Claude: 'XAU' → 5 Vorschläge mit Beschreibung; 'gold' findet auch über Beschreibung; 'ZZQQ' → 'Sembol bulunamadı'; nichts ausgewählt, per Neuladen verworfen
- [x] **SYM-03** Symboldetails — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Zu einem Symbol werden Details (Digits, Point, Volumen-Grenzen) geladen; daraus leiten die Zonenfelder Schrittweite, Minimum und Rundung ab, und unbekannte Symbole werden als „Geçersiz Sembol!“ markiert.
  - **Prüfung:** Symbol wählen, Schrittweite der Preis- und Lotfelder prüfen (Pfeiltasten / DevTools). → Ein unbekanntes Symbol eintippen (nicht speichern).
  - **Erwartet:** Preisfelder in Schritten von point (z. B. 0,001 bei 3 Digits), Lot mit volume_min/volume_step; liegt der Lot unter dem Minimum des Symbols, wird er darauf angehoben (nie 0); unbekanntes Symbol zeigt „Geçersiz Sembol!“.
  - 📝 Claude: USOUSD → Preisfelder step/min 0.001, Lot min/step 0.01; unbekanntes Symbol → 'Geçersiz Sembol!'; nach Neuladen wieder USOUSD, API unverändert
- [x] **SYM-04** Symbolfehler sichtbar — 🧪 unit ✅ 2026-10-02 · 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - Kann der Worker die Symbole nicht aus MT5 holen (z. B. Terminal nicht eingeloggt), liefert GET /symbols/{id} neben der leeren Liste ein Feld error mit der MT5-Meldung und schreibt sie ins Robot-Log des Kontos; das Symbolfeld zeigt darunter einen Hinweis statt still leer zu bleiben.
  - **Prüfung:** Konto wählen, dessen MT5-Terminal nicht erreichbar oder nicht eingeloggt ist, und eine Zone öffnen.
  - **Erwartet:** Unter dem Symbolfeld steht „Symbole konnten nicht aus MT5 geladen werden“ mit der MT5-Meldung; dieselbe Meldung steht im Robot-Log.

## 6. ZON – Zonen-Konfiguration (UI ↔ Backend)

- [x] **ZON-01** Zone hinzufügen — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - „Bölge Ekle“ fügt eine neue Zone mit Standardwerten hinzu; die Anzahl im Badge steigt.
  - **Prüfung:** „Bölge Ekle“ klicken, speichern, neu laden.
  - **Erwartet:** Neue Zone bleibt nach dem Neuladen erhalten.
  - 📝 Claude: 'Bölge Ekle' → Zähler 2, neue Zone inaktiv (is_active false, Symbol der letzten Zone); gespeichert → API 2 Zonen, bleibt nach Neuladen
- [x] **ZON-02** Zone löschen — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Menü „…“ → „Bölgeyi Sil“ → Bestätigung „Bölge Sil“.
  - **Prüfung:** Test-Zone löschen und bestätigen, speichern.
  - **Erwartet:** Zone ist weg, auch nach Neuladen.
  - 📝 Claude: Menü '…' → 'Bölgeyi Sil' → Dialog 'Bölge Sil' → Delete → Zähler 1, Leiste 'ungespeichert'; nach 'Tüm Ayarları Kaydet' API = Sicherung
- [x] **ZON-03** Basisfelder (Symbol, Emir Tipi, Min/Max Fiyat) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Symbol, Ordertyp BUY/SELL/BOTH und Preisbereich der Zone.
  - **Prüfung:** Jedes Feld ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten; Ordertyp-Badge im Kopf passt.
  - 📝 Claude (Test-Zone): Symbol per Autocomplete XAUUSD, Emir Tipi BOTH, Min/Max 500/600 → nach Neuladen in API und UI
- [x] **ZON-04** Grid-Felder (Grid Adımı, Lot, Kar Al, Zarar Durdur) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Gridabstand, Lotgröße, Take Profit, Stop Loss der Zone. Der Lot ist nie 0 und nie kleiner als der kleinste Lot des Symbols beim Broker (volume_min) - Symbolwechsel, Laden, neue Zone und Speichern heben ihn auf mindestens dieses Minimum an; ein leeres Feld oder 0 beim Tippen fällt auf den letzten gültigen Lot zurück.
  - **Prüfung:** Jedes Feld ändern, speichern, neu laden. → Lot leeren oder 0 eintragen und das Feld verlassen; danach ein Symbol mit größerem Mindestlot wählen (z. B. 0,1).
  - **Erwartet:** Alle Werte bleiben erhalten; der Lot bleibt nie bei 0, sondern zeigt mindestens das Minimum des Symbols.
  - 📝 Claude (Test-Zone): Grid 0.2, Lot 0.02, KA 0.3, ZD 1 → nach Neuladen in API und UI
- [x] **ZON-05** SELL-Felder + BUY/SELL-Sync — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Bei Ordertyp BOTH eigene SELL-Werte (SELL Grid/Lot/KA/ZD) oder Schalter „BUY ve SELL için aynı ayarları uygula“.
  - **Prüfung:** Ordertyp BOTH wählen, Sync aus → SELL-Felder ändern; Sync an.
  - **Erwartet:** SELL-Felder erscheinen nur bei BOTH und Sync aus; Werte bleiben nach Speichern erhalten.
  - 📝 Claude (Test-Zone): BOTH + Sync aus → SELL-Felder (und SELL-Pullback) erscheinen; SELL 0.4/0.03/0.6/2 und sync_buy_sell=false gespeichert
- [x] **ZON-06** Breakout-Felder — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Schalter „Sadece trend yönünde“, Pullback-Abstände, Alt/Üst Seviyeler (levels_below/above), Maks Pozisyon.
  - **Prüfung:** Breakout einschalten, Felder ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten.
  - 📝 Claude (Test-Zone): Breakout an, Pullback 0.7/SELL 0.9, Alt 3, Üst 4, Maks 2 → nach Neuladen in API und UI
- [x] **ZON-07** Exit-Felder (Bereinigen beim Verlassen) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Schalter „Fiyat bölgeden çıkınca temizle“; dann Çıkış Yönü, Hedef Taraf, Temizleme Kapsamı, Çıkış Tetikleyici und bei „Mum Kapanışı“ zusätzlich Zaman Dilimi.
  - **Prüfung:** Schalter an → Auswahlfelder prüfen; Auslöser „Mum Kapanışı“ wählen.
  - **Erwartet:** Die vier Auswahlfelder erscheinen erst mit dem Schalter; Zeitrahmen nur bei Kerzenschluss.
  - 📝 Claude (Test-Zone): Schalter aus → 4 Auswahlfelder weg, an → wieder da; BUY (Yukarı)/Hepsi/Tüm İşlemler; 'Mum Kapanışı' blendet Zaman Dilimi (M1–D1) ein, H1 gespeichert
- [x] **ZON-08** Start/Pause pro Zone — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24
  - Button im Zonenkopf (Başladı / Başla / Hazır / Kapalı) setzt is_active (POST /settings) und START/PAUSE in ui_state (POST /ui-state); Warnung bei ungültigem Symbol oder ungespeicherter Zone.
  - **Prüfung:** Test-Zone starten und wieder pausieren. → Neue, ungespeicherte Zone starten.
  - **Erwartet:** Label wechselt passend; ungespeicherte Zone zeigt eine Warnung.
- [x] **ZON-09** „Kaydedilmedi“-Badge — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Zonen mit ungespeicherten Änderungen tragen den Badge „Kaydedilmedi“.
  - **Prüfung:** Ein Feld ändern, dann speichern.
  - **Erwartet:** Badge erscheint nach der Änderung und verschwindet nach dem Speichern.
  - 📝 Claude: Badge 'Kaydedilmedi' nur an der geänderten Zone, verschwindet nach Speichern (auch bei SET-03 gesehen)
- [x] **ZON-10** Zahlenfelder leerbar — 🖥️ e2e ✅ 2026-10-02
  - Zahlenfelder der Zone (Preis, Grid, Lot, KA/ZD, Pullback, Seviyeler) halten einen lokalen Text-Entwurf; die letzte Ziffer lässt sich löschen, erst beim Verlassen des Feldes erscheint wieder der echte Wert.
  - **Prüfung:** Ein Zahlenfeld mit Rücktaste komplett leeren, dann neu tippen (z. B. 0.05) und das Feld verlassen.
  - **Erwartet:** Feld bleibt beim Löschen leer, Zwischenstände wie „0.“ bleiben erhalten, nach dem Verlassen steht der gespeicherte Wert (leer → 0).
- [x] **ZON-11** Einzelne Zone speichern — 🖥️ e2e ✅ 2026-10-02
  - Jede Zonenkarte hat einen eigenen „Kaydet“-Button, der nur diese Zone im Worker ersetzt (neue Zone wird angehängt). Andere Zonen und Einstellungen mit ungespeicherten Änderungen bleiben ungespeichert; „Tüm Ayarları Kaydet“ (neben „Bölge Ekle“) speichert weiterhin alles.
  - **Prüfung:** Zone 1 ändern, Zone hinzufügen, nur bei der neuen Zone „Kaydet“ klicken. → Danach bei Zone 1 „Kaydet“ klicken.
  - **Erwartet:** Nach dem ersten Klick liegt die neue Zone im Worker, Zone 1 trägt weiter „Kaydedilmedi“ und „Tüm Ayarları Kaydet“ bleibt aktiv; nach dem zweiten Klick sind Badge und Dirty-Zustand weg.
- [x] **ZON-12** Symbol-Richtwerte in den Hinweisen — 🖥️ e2e ✅ 2026-10-02
  - Der (i)-Hinweis von Grid-Abstand und Take Profit (Buy/Sell) nennt für gängige Symbole (Gold, Silber, Forex, BTC/ETH, US-Indizes, Öl) einen Richtwert; bei unbekanntem Symbol bleibt der Text unverändert. Nur Anzeige, keine Validierung.
  - **Prüfung:** Symbol auf XAUUSD stellen, mit der Maus über das (i) von Grid-Abstand und Take Profit fahren. → Symbol auf ein unbekanntes Symbol stellen.
  - **Erwartet:** Bei XAUUSD steht „1–5“ als Richtwert im Hinweis; bei unbekanntem Symbol nur der Standardtext.
- [ ] **ZON-13** Abstand nach Verlust ($) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Schalter „Abstand nach Verlust ($)“ in der Zonenkarte. Wenn an, sind Grid-Abstand (BUY/SELL), Min./BUY-/SELL-Pullback, Take Profit und Stop Loss $-Beträge statt Preisabstände; beim Umschalten werden vorhandene Werte mit Lotgröße und Tick-Wert umgerechnet, unter dem Feld steht der entsprechende Preisabstand. Wird mit der Zone gespeichert (step_by_loss).
  - **Prüfung:** Zone mit EURUSD, 0,10 Lot anlegen, „Abstand nach Verlust ($)“ einschalten, Grid-Abstand 10 und Take Profit 5 eingeben. → Speichern, Bot auf dem DEMO-Konto laufen lassen und die Pending Orders in MT5 ansehen.
  - **Erwartet:** Unter dem Feld steht „≈ 0,001 Preisabstand bei 0,1 Lot“; die Orders liegen 0,00100 auseinander (ab der zuletzt eröffneten Position), jede neue Position öffnet, wenn die vorige 10 $ im Minus ist; der TP liegt 0,00050 vom Einstieg.
- [ ] **ZON-14** Sofort erste Position — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Schalter „Sofort erste Position“ in der Zonenkarte (instant_entry), unabhängig von „Abstand nach Verlust“. Wird mit der Zone gespeichert.
  - **Prüfung:** Zone (BUY und SELL) auf dem DEMO-Konto anlegen, Preis innerhalb des Bereichs, „Sofort erste Position“ einschalten, speichern, Bot starten. → Warten, bis eine Seite per Take Profit schließt.
  - **Erwartet:** Beim Start öffnen sofort 1 BUY und 1 SELL zum Marktpreis; die Pending Orders liegen einen Grid-Abstand davon entfernt; nach dem TP öffnet der Bot auf dieser Seite sofort wieder eine Position.
- [x] **ZON-15** Einstiegsmodus Fraktal — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-29
  - Auswahl „Einstiegsmodus“ (Grid/Fraktal, entry_mode) in der Zonenkarte. Im Fraktal-Modus werden Grid-Felder, „Abstand nach Verlust“, „Sofort erste Position“ und Trend/Pullback ausgeblendet; stattdessen Zeitrahmen (M1–D1, Standard H4), Ordertyp (Ausbruch/Abpraller), Lot, Max. Positionen, SL-Methode (ATR/SAR/Gegenfraktal/Fraktal-Kerze) mit passenden Feldern, SL-Puffer und Chance/Risiko (per Switch „TP als Betrag“ stattdessen TP-Betrag in Kontowährung). Wird mit der Zone gespeichert.
  - **Prüfung:** Zone auf dem DEMO-Konto auf „Fraktal“ stellen, H4, Ausbruch, SL „Automatisch (ATR)“, speichern, Bot starten. → Im MT5-Chart (H4) den Indikator „Fractals“ und ATR(14) einblenden und mit den Pending Orders vergleichen. → Eine Fraktal-Order in MT5 von Hand löschen.
  - **Erwartet:** Mit Anzahl 1 (Standard, siehe ZON-16) je Seite genau eine Pending Order auf Höhe des jüngsten, noch nicht erreichten Fraktals (Buy Stop am oberen, Sell Stop am unteren); SL = Fraktal-Kerze ± 1,5 × ATR, TP = 2 × SL-Abstand. Die von Hand gelöschte Order wird nicht neu gesetzt, erst beim nächsten Fraktal dieser Seite.
  - 📝 VPS DEMO: Fraktal-Zone, Orders passen zu MT5 Fractals/ATR, manuell gelöschte Order nicht neu gesetzt
- [x] **ZON-17** Fraktal – Schalter „Mit SL“ *(teilweise)* — 🖥️ e2e ✅ 2026-10-02 · 🧪 unit ⏳
  - Im Fraktal-Modus blendet der Schalter „Mit SL (Stop Loss)“ (fractal_use_sl, Standard an) die SL-Felder (Methode, ATR, SAR, Puffer) aus; Orders kommen dann ohne SL. Ohne SL ist „TP als Betrag“ fest aktiv (Chance/Risiko braucht einen SL). Wird mit der Zone gespeichert.
  - **Prüfung:** Fraktal-Zone auf dem DEMO-Konto, „Mit SL“ ausschalten, speichern, Bot starten.
  - **Erwartet:** Pending Orders ohne SL in MT5; TP nur als Betrag.
- [ ] **ZON-16** Fraktal – Anzahl Orders je Richtung — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Im Fraktal-Modus legt „Anzahl Orders“ fest, auf wie vielen der jüngsten Fraktale je Richtung eine Pending Order steht (fractal_order_count, 1–20, Standard 1). Nur BUY oder nur SELL → ein Feld „Anzahl BUY-Orders“ bzw. „Anzahl SELL-Orders“; Beide mit „Buy/Sell gleich“ → ein Feld „Anzahl Orders (BUY & SELL)“; Beide ohne „gleich“ → getrennte Felder (sell_fractal_order_count). Die Infokarte im Diagramm zeigt den Wert. Wird mit der Zone gespeichert.
  - **Prüfung:** Fraktal-Zone auf dem DEMO-Konto, Richtung BUY, „Anzahl BUY-Orders“ 3, speichern, Bot starten. → Im MT5-Chart den Indikator „Fractals“ einblenden und die letzten drei oberen Fraktale mit den Buy-Stop-Orders vergleichen. → Eine der Orders in MT5 von Hand löschen.
  - **Erwartet:** Buy Stops nur auf den letzten drei oberen Fraktalen, soweit der Kurs sie noch nicht erreicht hat und sie im Preisbereich liegen (also höchstens drei, oft weniger). Für die gelöschte Order kommt keine neue, auch nicht auf einem älteren Fraktal; die übrigen bleiben stehen.
- [x] **ZON-18** Fraktal – mehrere Setups je Zone (Plus-Button) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-10-02
  - Eine Fraktal-Zone hat zunächst ein Setup (die bisherigen Felder). Der Button „Setup hinzufügen“ (Plus-Icon) legt bei jedem Klick ein weiteres an (höchstens 10 zusätzlich), mit den Werten von Setup 1 als Start. Jedes Setup hat eigenen Zeitrahmen, Lot (Buy/Sell getrennt wie bisher), Anzahl Orders, TP-Wert (Chance/Risiko bzw. Betrag) und Max. Positionen; Ordermodus, SL-Schalter und SL-Methode sowie die TP-Art (Schalter „TP als Betrag“) gelten für die ganze Zone. Ab zwei Setups tragen die Blöcke eine Überschrift „Setup n“ (Nummer vom Worker, neues Setup „Neues Setup“ bis zum Speichern), jedes Zusatz-Setup hat einen Entfernen-Button. Bei einem schon gespeicherten Setup fragt ein Dialog, ob seine Pending Orders gelöscht werden („Orders löschen“) oder in MT5 bleiben („Orders behalten“ → Nummer in fractal_kept_sids); ein noch ungespeichertes Setup verschwindet ohne Rückfrage. Gespeichert in fractal_setups; die Infokarte im Diagramm zeigt die Anzahl Setups.
  - **Prüfung:** Fraktal-Zone auf dem DEMO-Konto, Richtung BUY, Setup 1 = H4 / 0,01 Lot. → Zweimal „Setup hinzufügen“, Setup 2 = M1 / 0,02 Lot / Max. Positionen 1, Setup 3 = M5; speichern, Bot starten. → In MT5 die Kommentare der Pending Orders ansehen (AutoGrid_Z{n}_FU…, …_F2U…, …_F3U…). → Setup 3 entfernen, im Dialog „Orders löschen“ wählen und speichern. → Setup 2 entfernen, im Dialog „Orders behalten“ wählen und speichern.
  - **Erwartet:** Jedes Setup setzt seine Orders auf den Fraktalen seines Zeitrahmens mit eigenem Lot/TP; ist Setup 2 bei 1 Position, setzt nur Setup 2 nichts mehr. Nach „Orders löschen“ verschwinden nur die Pending Orders von Setup 3; nach „Orders behalten“ bleiben die von Setup 2 unverändert in MT5. Positionen bleiben in beiden Fällen.
  - 📝 Live DEMO 7942034, GBPUSD-Testzone, Setups H4/M1(0,02, Max 1→2)/M5→H1: sid 2/3 vom Worker, nach Neuladen erhalten; Kommentar AutoGrid_Z4_F2U…; Max. Positionen je Setup greift (Kurgu 2 1/1, Kurgu 1 weiter); Entfernen+Orders löschen: nur Order von Setup 3 gelöscht; Entfernen+Orders behalten: kept_sids=[2], keine Löschung (Order wurde zeitgleich gefüllt); keine Order-Flut. Nebenbefund: Setup 1 setzte beim Start kurz eine Order auf altem H4-Fraktal und ersetzte sie 2 s später.

## 7. BOT – Bot-Steuerung

- [x] **BOT-01** Bot starten *(teilweise)* — 🌐 live ⏭️ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - POST /start verbindet MT5 (Timeout 120 s), cached die Symbole, startet bot_runner.py als eigenen Prozess und stellt ihn unter Watchdog. UI-Timeout für „Connecting“ 180 s.
  - **Prüfung:** DEMO-Konto wählen, „Start Bot“.
  - **Erwartet:** Status wechselt über „Connecting“ zu „Running“, Markt offen/geschlossen wird angezeigt.
  - 📝 Claude (DEMO 7942034): 'Start Bot' → Connecting → Running nach 5 s; Log: MT5-Login ok, 812 Symbole gecacht, Subprozess gestartet, Zone 0 aus Magic-Numbers als START wiederhergestellt, 'Yeni Bölgeye Girildi: Bölge 1'; keine Alarme, Zone 'Başladı'
- [x] **BOT-02** Bot stoppen *(teilweise)* — 🌐 live ⏭️ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - POST /stop nimmt den Bot aus dem Watchdog und beendet den Prozess; Positionen und Orders bleiben unangetastet. Bestätigung „Disconnect MT5“.
  - **Prüfung:** „Stop Bot“ → bestätigen; in MT5 die offenen Positionen prüfen.
  - **Erwartet:** Status „Stopped“; Positionen sind noch da.
  - 📝 Claude (DEMO 7942034): 'Stop Bot' → Dialog 'Disconnect MT5' → Stopped nach ~5 s, bot_running=false, Zone 'Hazır (Motor Bekleniyor)'; Log: 'Açık pozisyon/emirlere dokunulmuyor'. Nach Neustart MT5-Sync: weiterhin 14 Positionen / 5 Pending Orders (vorher 14/5)
- [x] **BOT-03** Neustart veralteter/hängender Bot — 🧪 unit ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Läuft ein Bot mit alter VERSION oder ohne frische Metriken (> 180 s), startet /start ihn neu; beim Worker-Start übernimmt startup_maintenance laufende Bots.
  - **Prüfung:** Nach einem Update „Restart Bot“ klicken.
  - **Erwartet:** Bot läuft danach mit der neuen Version (PID-Datei enthält neue VERSION).
  - 📝 Live: nach Worker-Neustart meldet der Worker '[AUTO] Bot eski bir kod sürümüyle çalışıyor; yeni sürümle yeniden başlatılıyor' und startet ihn neu (21:24 und 22:48, Positionen unverändert)
- [x] **BOT-04** Statusanzeige + Alarme — 🖥️ e2e ✅ 2026-10-02
  - Anzeige Connecting / Running / „process without MT5“ / Stopped, Marktstatus, Kontoname/Server; Alarme für API-Fehler, MT5-Verbindung, abgelehnte Order, Algo Trading aus.
  - **Prüfung:** In MT5 „Algo Trading“ ausschalten, während der Bot läuft.
  - **Erwartet:** Alarm „Algo Trading off“ erscheint; nach Einschalten verschwindet er.
- [x] **BOT-05** Watchdog-Neustart — 🧪 unit ✅ 2026-10-02
  - Alle 15 s Prüfung; abgestürzter oder hängender Bot (600 s ohne Metriken) wird mit Backoff 15/30/60/120/240 s neu gestartet.
  - **Prüfung:** Auf dem VPS den bot_runner-Prozess im Task-Manager beenden.
  - **Erwartet:** Nach ≤ 30 s läuft der Bot wieder (Robot-Log zeigt Neustart).
- [x] **BOT-06** Watchdog gibt auf — 🧪 unit ✅ 2026-10-02
  - Nach 5 Neustarts in 30 min hört der Watchdog auf; gelöschte Konten werden nicht mehr beobachtet.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **BOT-07** Bots nach Worker-/VPS-Neustart fortsetzen — 🧪 unit ✅ 2026-10-02 · 👤 manuell ⏳
  - Die Watchdog-Liste (Start ohne Stop) steht zusätzlich in data/watched_bots.json. Beim Worker-Start liest main.py sie ein; startup_maintenance startet jeden dort eingetragenen, nicht laufenden Bot neu (auch LIVE) und stellt ihn unter Watchdog, auch wenn der erste Start scheitert. Gestoppte Bots, gelöschte Konten und Bots, bei denen der Watchdog aufgegeben hat, fehlen in der Liste.
  - **Prüfung:** DEMO-Bot starten, dann auf der Seite „VPS“ → „VPS neu starten“.
  - **Erwartet:** Nach dem Reboot läuft der Bot wieder; das Robot-Log zeigt „[AUTO] Bot … devam ettirildi“.

## 8. ENG – Grid-Engine (Handelslogik)

- [x] **ENG-01** Zonenwahl — 🧪 unit ✅ 2026-10-02
  - Pro Symbol ist höchstens eine Zone aktiv – die erste aktive Zone dieses Symbols, deren Mittelkurs (oder Schlusskurs der letzten Kerze bei „Mum Kapanışı“, Zeitrahmen exit_timeframe) in [min_price, max_price] liegt. Zonen mit verschiedenen Symbolen (z. B. USOUSD + XAUUSD) laufen gleichzeitig.
  - **Prüfung:** Zwei Zonen mit verschiedenen Bereichen anlegen, Bot laufen lassen. → Eine zweite Zone mit anderem Symbol anlegen und starten.
  - **Erwartet:** Beim gleichen Symbol entstehen Orders nur in der Zone, in der der Preis liegt; eine Zone mit anderem Symbol bekommt zusätzlich eigene Orders.
- [x] **ENG-02** Sliding-Grid-Level — 🧪 unit ✅ 2026-10-02
  - Level werden an round(mid/step)*step verankert, levels_below/levels_above Stufen, auf die Zone begrenzt; acceptable-Sets mit ±2 Stufen Puffer.
  - **Prüfung:** Bot laufen lassen, Pending Orders in MT5 ansehen.
  - **Erwartet:** Orders liegen im Gridabstand um den Preis, nie außerhalb der Zone.
- [x] **ENG-03** Breakout / Pullback — 🧪 unit ✅ 2026-10-02
  - Im Breakout-Modus nur Orders in Trendrichtung, mit pullback_distance / sell_pullback_distance.
  - **Prüfung:** Breakout-Zone aktivieren, Orders ansehen.
  - **Erwartet:** Orders nur in Trendrichtung und im Pullback-Abstand.
- [x] **ENG-04** Zonen-Config lesen + Lot begrenzen — 🧪 unit ✅ 2026-10-02
  - extract_zone_config liest order_type, grid_step, lot_size und sell_lot_size (nie 0 - mindestens volume_min des Symbols beim Broker und auf dessen Lot-Schritt gerundet, nach oben auf 5,0 begrenzt; ohne Symbolinfos gilt 0,01 als Minimum), TP/SL, Symbol, sync_buy_sell, sell_*-Overrides, max_positions, is_active.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-05** Order-Platzierung LIMIT/STOP + TP/SL *(teilweise)* — 🧪 unit ✅ 2026-10-02 · 🌐 live ⏭️ 2026-09-24
  - Fehlende Level bekommen Pending Orders mit TP/SL; LIMIT oder STOP je nach Seite des Marktes; Toleranz 0,45 × Gridabstand; manuelle Positionen zählen als belegte Level.
  - **Prüfung:** Test-Zone (0,01 Lot) um den aktuellen Preis starten.
  - **Erwartet:** BUY LIMIT unter / BUY STOP über dem Preis (bzw. SELL umgekehrt), jeweils mit TP/SL.
- [x] **ENG-06** Validierung + Bereinigung — 🧪 unit ✅ 2026-10-02
  - Orders außerhalb des Fensters oder mit falschem Lot/TP/SL werden gelöscht (erwartetes Lot berücksichtigt Teilausführungen).
  - **Prüfung:** Bei laufendem Bot TP der Zone ändern und speichern.
  - **Erwartet:** Alte Orders werden gelöscht und mit neuem TP neu gesetzt.
- [x] **ENG-07** Maximale Positionen *(teilweise)* — 🧪 unit ✅ 2026-10-02 · 🌐 live ⏳
  - Ist max_positions erreicht, werden die Pending Orders der Zone gelöscht; die Warnung erscheint einmal (erneut nur, wenn sich die Zahl ändert), nicht bei jedem Tick. Auch der Restlot-Nachschub (ENG-08) setzt dann nichts.
  - **Prüfung:** Maks Pozisyon = 1 setzen und eine Position füllen lassen.
  - **Erwartet:** Danach keine Pending Orders mehr in dieser Zone.
- [x] **ENG-08** Teilausführung + TP/SL-Resync — 🧪 unit ✅ 2026-10-02
  - Geänderte TP/SL-Werte werden auf offene Positionen übertragen; liegt der neue TP/SL schon auf der falschen Seite des Kurses (MT5 würde mit 10016 ablehnen), wartet der Bot mit einer einmaligen Meldung und setzt ihn, sobald der Kurs es zulässt. Bei Teilausführung wird das Restlot neu gesendet, gemessen am Volumen der eröffnenden Order (history_orders_get), nicht am Lot in den Einstellungen; ein später erhöhtes Lot löst also keinen Nachschub aus. Am Positionslimit (ENG-07) kein Nachschub.
  - **Prüfung:** Bei offener Position den TP der Zone ändern und speichern. → Nur DEMO: bei offenen 0,01-Positionen das Lot der Zone auf 0,02 erhöhen und speichern.
  - **Erwartet:** TP der offenen Position wird angepasst (liegt er schon hinter dem Kurs, steht einmal „TP/SL Bekliyor“ im Log). Nach der Lot-Erhöhung keine „Kısmi Dolum“-Meldungen und keine Orders auf den Leveln der offenen Positionen; neue Grid-Orders haben 0,02.
- [x] **ENG-09** Zombie-Orders entfernen — 🧪 unit ✅ 2026-10-02
  - Orders pausierter, bereinigter, inaktiver Zonen oder mit falschem Symbol werden gelöscht.
  - **Prüfung:** Zone mit offenen Orders pausieren.
  - **Erwartet:** Ihre Pending Orders verschwinden.
- [x] **ENG-10** Bereinigung beim Verlassen der Zone *(teilweise)* — 🧪 unit ✅ 2026-10-02 · 🌐 live ⏭️ 2026-09-24
  - Mit clear_on_exit: Richtung (clear_exit_side), Umfang („Sadece Bekleyen Emirler“ oder „Tüm İşlemler“ = auch Positionen schließen) und Zielseite (BUY/SELL/alle). Danach steht die Zone auf AUTO_CLEAR: keine neuen Orders – auch nicht, wenn der Kurs zurückkommt – bis „Yeniden Başlat“ im Dashboard (oder Bot-Neustart).
  - **Prüfung:** Test-Zone knapp um den Preis legen, „temizle“ an, warten bis der Preis sie verlässt. → Warten, bis der Preis zurückkommt; dann „Yeniden Başlat“ in der Zone klicken.
  - **Erwartet:** Orders (bei „Tüm İşlemler“ auch Positionen) werden entfernt; die Zone zeigt „Otomatik temizlendi“ und setzt keine Orders mehr, bis „Yeniden Başlat“ geklickt wird.
- [x] **ENG-11** Auto-Pause nach 3 Ablehnungen — 🧪 unit ✅ 2026-10-02
  - Nach 3 abgelehnten Orders in Folge wird die Zone pausiert (ui_state PAUSE) und order_rejected_alarm gesetzt.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-12** Order-Sicherheit (Stops-Level, order_check, 10027) — 🧪 unit ✅ 2026-10-02
  - safe_send_order normalisiert Volumen (nie unter volume_min - auch 0 wird zum Minimum -, nie über volume_max, Schritt ab volume_min), hält den Broker-Stops-Level ein (vermeidet 10016), prüft vorab mit order_check, erkennt 10027 (Algo Trading aus) und prüft, ob die Order wirklich existiert.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-13** Fernsteuerung per MT5-Handy-App — 🧪 unit ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-24
  - Manuelle BUY LIMIT 0,01 Lot bei 1 $ = STOP, bei 2 $ = START; alternativ Kommentar GRID:STOP / GRID:START. STOP löscht alle Robot-Orders; die Signal-Order wird danach entfernt.
  - **Prüfung:** In der MT5-App eine BUY LIMIT 0,01 bei Preis 1 setzen. → Danach BUY LIMIT 0,01 bei Preis 2 setzen.
  - **Erwartet:** Erst werden alle Robot-Orders gelöscht (remote_paused), dann läuft der Bot weiter; die Signal-Orders verschwinden.
  - 📝 Nutzer per MT5-App: $1 Buy Limit → STOP (Robot-Orders gelöscht, Signal-Order entfernt), $2 Buy Limit → START; Robot-Log 15:14/15:18 bestätigt, danach remote_paused false, Bot läuft
- [x] **ENG-14** Zustand beim Start wiederherstellen — 🧪 unit ✅ 2026-10-02
  - Beim Bot-Start sind alle Zonen PAUSE; active_zones_state wird aus den Magic-Numbers der vorhandenen Orders/Positionen aufgebaut (data/state_<id>.json), alte ui_state-Datei gelöscht.
  - **Prüfung:** Bot mit offenen Orders stoppen und neu starten.
  - **Erwartet:** Vorhandene Orders werden übernommen, nicht doppelt gesetzt.
- [x] **ENG-15** Markt geschlossen + Reconnect — 🧪 unit ✅ 2026-10-02
  - Bei geschlossenem Markt (trade_mode ≠ 4 oder Tick älter als 180 s) wartet die Schleife 60 s; Verbindungsverlust → Reconnect mit exponentiellem Backoff; nur „Algo Trading aus“ → warten statt neu einloggen.
  - **Prüfung:** Am Wochenende Dashboard ansehen.
  - **Erwartet:** Markt wird als geschlossen angezeigt, keine neuen Orders.
- [x] **ENG-16** Aufräumen beim Beenden der Schleife — 🧪 unit ✅ 2026-10-02
  - Beim Verlassen der Hauptschleife werden alle Pending Orders des Robots gelöscht.
  - **Prüfung:** Nicht manuell testen (/stop beendet den Prozess hart).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-17** Grid-Abstand nach Verlust ($) umrechnen — 🧪 unit ✅ 2026-10-02
  - Bei step_by_loss rechnet extract_zone_config grid_step, sell_grid_step, die Pullbacks sowie TP/SL (auch beim Nachziehen offener Positionen) als $-Betrag mit Lotgröße und trade_tick_value/trade_tick_size (Fallback Kontraktgröße) in Preisabstände um, gerundet auf den Point; die neue Position öffnet, wenn die vorige diesen Betrag im Minus ist. Ohne Symbolinfo wird die Zone abgelehnt.
  - **Prüfung:** Nicht manuell testen (siehe ZON-13).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-18** Sofort erste Position (Markt-Order) — 🧪 unit ✅ 2026-10-02
  - Bei instant_entry öffnet die Engine je Seite (BUY/SELL, bei BOTH beide) sofort eine Markt-Position, wenn die Zone dort keine offene Position hat und der Preis im Zonenbereich liegt – beim Start und nach dem Schließen (z. B. TP). Abgelehnte Orders werden erst nach 30 s wiederholt. Bei instant_entry/step_by_loss richtet sich das Raster an der zuletzt eröffneten Position der Seite aus (nicht am festen Preisraster).
  - **Prüfung:** Nicht manuell testen (siehe ZON-14).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-19** Fraktal-Erkennung, ATR und Parabolic SAR — 🧪 unit ✅ 2026-10-02
  - Bill-Williams-Fraktale aus 5 geschlossenen Kerzen wie MT5 Fractals.mq5 (Mitte > beide rechten, >= beide linken Nachbarn; erst gültig, wenn die zwei rechten Kerzen geschlossen sind). ATR als einfacher Durchschnitt der True Range wie MT5 ATR.mq5, Parabolic SAR nach Wilder inkl. Wert der laufenden Kerze.
  - **Prüfung:** Nicht manuell testen (siehe ZON-15).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-20** Fraktal-Orders (Ausbruch / Abpraller) — 🧪 unit ✅ 2026-10-02
  - Bei entry_mode „fractal“ setzt die Engine statt des Grids je Seite eine Pending Order auf das jüngste bestätigte Fraktal des gewählten Zeitrahmens (bzw. auf die letzten N, siehe ENG-26) – Ausbruch oberes → Buy Stop, unteres → Sell Stop; Abpraller oberes → Sell Limit, unteres → Buy Limit. order_type (BUY/SELL/BOTH) und der Preisbereich der Zone filtern; liegt der Kurs näher als stops_level, wird gewartet. Kommentar AutoGrid_Z{n}_F{U|D}{Kerzenzeit} (weitere Setups mit Nummer, siehe ENG-28). Liegt die laufende Kerze mehr als zwei Perioden vor dem letzten Tick (MT5 lädt die Geschichte eines Symbols beim ersten Abruf noch nach), wartet die Engine und setzt keine Order auf ein veraltetes Fraktal.
  - **Prüfung:** Nicht manuell testen (siehe ZON-15).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-21** Fraktal-Order verschieben / löschen — 🧪 unit ✅ 2026-10-02
  - Entsteht ein neueres Fraktal derselben Seite, wird die alte Pending Order gelöscht und auf das neue gesetzt (mit Anzahl 1 immer höchstens eine je Seite, sonst wandert das Fenster der letzten N, siehe ENG-26). Hat eine spätere Kerze oder der aktuelle Kurs das Fraktal-Niveau erreicht, bevor eine Order steht, gilt es als verbraucht – es wird keine Order gesetzt. Eine bereits gesetzte Order bleibt dagegen stehen, ob sie füllt, entscheidet MT5 (Kerzen sind Bid, eine BUY LIMIT füllt erst, wenn der Ask das Niveau erreicht). Beim Umschalten von Grid auf Fraktal verschwinden die Grid-Orders der Zone.
  - **Prüfung:** Nicht manuell testen (siehe ZON-15).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-22** Fraktal-SL-Methoden und TP nach Chance/Risiko — 🧪 unit ✅ 2026-10-02
  - SL je nach fractal_sl_mode – ATR (Fraktal-Kerze ± Faktor × ATR der Fraktal-Kerze), Parabolic SAR (Wert der laufenden Kerze), Gegenfraktal (letztes Fraktal der Gegenseite ± Puffer) oder Fraktal-Kerze ± Puffer. Nicht berechenbar oder auf der falschen Seite → Fraktal-Kerze ± Puffer; ist auch das ungültig, keine Order. TP = Einstieg ± fractal_rr × SL-Abstand, 0 = kein TP; mit fractal_use_sl=false (Schalter „Mit SL“ aus) kommt die Order ohne SL, dann ist nur TP als Betrag möglich (kein Chance/Risiko-TP, kein SAR-Nachziehen); mit fractal_tp_by_money stattdessen TP = Einstieg ± Preisabstand, der fractal_tp_money (Kontowährung) beim Lot der Seite entspricht (0 oder kein Tick-Wert = kein TP).
  - **Prüfung:** Nicht manuell testen (siehe ZON-15).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-23** Fraktal-Positionen – kein TP/SL-Abgleich, SAR nachziehen — 🧪 unit ✅ 2026-10-02
  - Für Positionen einer Fraktal-Zone entfallen der TP/SL-Abgleich mit den Grid-Werten und die Teilfüllungs-Nachorder, auch von Hand geänderte SL/TP bleiben stehen. Im SAR-Modus wird der SL offener Positionen mit jeder Kerze auf den neuen SAR gezogen, nur in Gewinnrichtung und außerhalb von stops_level.
  - **Prüfung:** Nicht manuell testen (siehe ZON-15).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-24** Manuelle Eingriffe in MT5 respektieren — 🧪 unit ✅ 2026-10-02
  - Verschwindet eine Fraktal-Order, ohne dass der Bot sie gelöscht hat (gefüllt, in MT5 von Hand gelöscht, abgelaufen), oder gibt es eine Position dieses Fraktals, gilt das Fraktal als erledigt – auch nach dem Schließen der Position wird dafür keine neue Order gesetzt. Der Merker (Zone + Seite → Kerzenzeiten der erledigten Fraktale) steht in data/fractal_state_<Konto>.json und übersteht Neustarts; ein neueres Fraktal öffnet wieder eine Order. Vom Bot selbst gelöschte Orders (Zone pausiert, Max. Positionen, Verschieben) zählen nicht.
  - **Prüfung:** Nicht manuell testen (siehe ZON-15).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-25** Von außen gelöschte Orders erkennen + Order-Flut-Bremse — 🧪 unit ✅ 2026-10-02
  - Der Bot merkt sich jede Pending Order, die er setzt. Verschwindet sie, ohne dass er sie gelöscht hat und ohne Füllung (keine Position, Historie nicht FILLED), schreibt er eine Warnung mit dem Status aus der MT5-Historie (CANCELED/EXPIRED/REJECTED …), Ticket, Preis und Lebensdauer. Werden in einer Zone 10 Orders innerhalb von 60 s so entfernt, pausiert die Zone (wie ENG-11) mit Alarm, statt die Level endlos neu zu setzen; Positionen bleiben unberührt. Auch wer selbst 10 Orders in 60 s in MT5 löscht, pausiert so die Zone (Neustart über die Oberfläche). Anlass - am 29.09. verschwanden auf Konto 7947315 alle Orders 2–5 s nach dem Setzen, ohne Löschung im Journal des eigenen Terminals, und der Bot setzte rund 200 Orders pro Minute.
  - **Prüfung:** Nicht manuell testen (Order-Löschung von außen lässt sich nur mit einem zweiten Terminal nachstellen). → Im Ernstfall - Robot-Log nach „MT5'te kayboldu“ bzw. „Emir seli durduruldu“ durchsuchen; der Historien-Status zeigt, wer löscht.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-26** Fraktal – mehrere Orders je Richtung — 🧪 unit ✅ 2026-10-02
  - fractal_order_count (BUY) und sell_fractal_order_count (SELL, nur bei BOTH ohne sync_buy_sell, sonst = BUY-Wert) legen fest, auf wie vielen der jüngsten Fraktale je Richtung eine Pending Order steht (1–20, Standard 1). Betrachtet werden nur die letzten N Fraktale der Seite - ist eines erreicht, ausgelöst, von Hand gelöscht oder außerhalb des Preisbereichs, bleibt sein Platz leer, ältere rücken nicht nach. Nur Pending Orders zählen - „Max. Positionen“ wird wie bisher erst in der nächsten Runde geprüft, lösen mehrere Orders zwischen zwei Runden aus, kann es kurz überschritten werden. Ein neues Fraktal schiebt das Fenster weiter, die Order des ältesten wird gelöscht. „Erledigt“ wird je Fraktal gemerkt, damit eine ausgelöste Order die übrigen nicht löscht; alte Zustandsdateien mit nur einer Kerzenzeit je Seite werden weiter gelesen.
  - **Prüfung:** Nicht manuell testen (siehe ZON-16).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-27** Feste Magic-Nummer je Zone (Löschen verschiebt nichts) — 🧪 unit ✅ 2026-10-02 · 🔌 api ✅ 2026-10-02
  - Jede Zone bekommt beim Speichern eine feste Magic-Nummer (200001–200999), die nur der Worker vergibt und nie neu vergibt (ZONE_MAGIC_MAX). Bestehende Zonen behalten ihre bisherige Nummer (200000 + Listenplatz + 1), offene Orders und Positionen bleiben also zugeordnet. Die Engine findet die Zone einer Order/Position über die Magic, nicht mehr über den Listenplatz - wird eine Zone gelöscht, behalten die Zonen dahinter ihre Orders, Positionen, TP/SL und ihren Status; Orders der gelöschten Zone werden als Zombies gelöscht, ihre Positionen bekommen nicht mehr den TP/SL einer anderen Zone. Der laufende Bot erkennt das Löschen beim Neuladen der Einstellungen und trägt seinen nach Listenplatz geführten Zustand (aktive Zone je Symbol, PAUSE/AUTO_CLEAR auch in der ui_state-Datei, Fraktal-Tracking, Ablehnungs- und Verschwunden-Zähler) über die Magic auf den neuen Platz um; war die gelöschte Zone die aktive, gilt nicht plötzlich ihr Nachbar als aktiv (sonst liefe dort der Zonen-Ausstieg). Ist die Einstellungsdatei beim Neuladen kurz unlesbar (wird gerade geschrieben, Windows-Sperre), läuft der Bot mit den zuletzt gelesenen Zonen weiter, statt „keine Zonen“ anzunehmen und alle Robot-Orders als Zombies zu löschen; die API schreibt die Datei atomar. Order-Kommentare (AutoGrid_Z{n}, Fraktal AutoGrid_Z{n}_F…) nehmen n aus der Magic. Anlass - vorher rutschten beim Löschen von Zone 1 alle Magic-Nummern dahinter um eins.
  - **Prüfung:** Demo-Konto mit zwei Zonen auf demselben Symbol, beide mit offenen Orders (und möglichst einer Position). → Zone 1 löschen und speichern. → Zone 2 behält ihre Orders und Positionen (gleiche Tickets, Magic 200002), ihre TP/SL ändern sich nicht; nur die Orders von Zone 1 verschwinden.
  - **Erwartet:** Löschen einer Zone lässt die übrigen Zonen unverändert weiterlaufen.
- [x] **ENG-28** Fraktal-Setups – eigene Orders, Kommentar und Max. Positionen je Setup — 🧪 unit ✅ 2026-10-02 · 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - Die Engine führt jedes Setup einer Fraktal-Zone getrennt (Setup 1 = Zonenfelder, weitere aus fractal_setups) - Kerzen je Zeitrahmen einmal pro Runde, Orders mit eigenem Lot/TP/Anzahl. Kommentar AutoGrid_Z{n}_F{k}{U|D}{Kerzenzeit}, bei Setup 1 ohne k (wie bisher). Eine Order gehört über den Kommentar zu ihrem Setup (ohne lesbaren Kommentar Setup 1), eine Position über ihren Kommentar oder den der Eröffnungsorder (Historie); gleicher Preis in zwei Setups ergibt zwei Orders. Max. Positionen gilt je Setup - ein volles Setup löscht nur seine Pending Orders. Der Erledigt-Merker gilt je Setup (Schlüssel mit :S{k}, Setup 1 unverändert). Pending Orders eines entfernten Setups werden gelöscht, außer seine Nummer steht in fractal_kept_sids („Orders behalten“; der Worker bereinigt die Liste beim Speichern auf vergebene, nicht mehr aktive Nummern). Die Setup-Nummer (2–99) vergibt der Worker beim Speichern wie die Zonen-Magic - eine Nummer vom Client gilt nur, wenn sie das Setup vorher schon hatte; gelöschte Nummern werden nie wieder vergeben (fractal_setup_seq), damit die Statistik je Setup nie zwei Setups mischt. Ungültige Setups (Nummer, Werte) überspringt die Engine mit einer Logzeile.
  - **Prüfung:** Nicht manuell testen (siehe ZON-18).
  - **Erwartet:** Abgedeckt durch Unit-, API- und Musterlösungs-Tests (fractal_two_setups).

## 9. MET – Live-Daten & Diagramm

- [x] **MET-01** Kennzahlenleiste — 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Vier Kacheln Preis, Floating P/L, Offene Positionen, Pending Orders mit animierten Ziffern.
  - **Prüfung:** Bot laufen lassen, Werte mit MT5 vergleichen.
  - **Erwartet:** Werte stimmen mit MT5 überein und aktualisieren sich.
  - 📝 Claude: Kacheln = Bot-Metriken (97,199 → $97.20, P/L −25,68, 14 Positionen, 5 Orders, Market open). Hinweis: Preis mit 2 statt 3 Nachkommastellen
- [x] **MET-02** Chart (10-s-Kerzen + RSI) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - lightweight-charts baut 10-s-Kerzen aus WebSocket-METRICS, RSI auf eigener Skala; Farben folgen dem Theme.
  - **Prüfung:** /formasyon öffnen und 1 Minute warten.
  - **Erwartet:** Kerzen und RSI-Linie entstehen.
  - 📝 v0.7.59 live: /formasyon zeichnet Kerzen, Preis 97,109, P/L −25,16, 14 Positionen; RSI '--' im Fallback-Modus
- [x] **MET-03** WebSocket-Metriken des Workers — 🧪 unit ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - ws_server sendet jeder Verbindung jede Sekunde Preis, RSI, MACD, P/L, Positionen für ihr Konto (?account_id=, ohne Parameter das erste Konto) und dessen Zone 0; jede METRICS-Nachricht trägt account_id (siehe ACC-10). RSI/MACD gibt es nur, wenn das MT5-Terminal des API-Prozesses an diesem Konto angemeldet ist; sonst Preis/P/L aus der Metrikdatei des Bots.
  - **Prüfung:** DevTools → WS-Nachrichten ansehen.
  - **Erwartet:** Jede Sekunde eine METRICS-Nachricht mit Preis und RSI.
  - 📝 v0.7.59 live: WS sendet METRICS 1/s (symbol USOUSD, Preis, 14 Pos., 6 Orders). Ohne MT5-Verbindung im API-Prozess (nach Worker-Neustart) kommt der Fallback aus der Bot-Metrik → RSI fehlt dann
- [x] **MET-04** Bot-Telemetrie — 🧪 unit ✅ 2026-10-02
  - calculate_live_metrics exportiert P/L, Positions-/Orderzahl, Preis, Alarme (algo_trading_error, order_rejected_alarm, last_error, remote_paused, connection_lost), market_open, den Marktstatus je Zone-Symbol (zone_market_open) samt aus M5-Kerzen abgeleiteter Handelszeit (zone_market_hours) und die Zonen-Zustände der Engine (zone_states) nach met_<id>.json.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.

## 10. LOG – Logs

- [x] **LOG-01** Log-Tabs laden — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Tabs Activity, Robot Logs, MT5 Terminal; GET /logs/{id}?log_type=all&lines=200; ohne laufenden Bot wird mt5_connected=false erzwungen.
  - **Prüfung:** Alle drei Tabs öffnen, „Refresh“.
  - **Erwartet:** Jeder Tab zeigt seine Logs.
  - 📝 Claude: Activity, Robot Logs (200 Zeilen), MT5 Terminal laden und wechseln korrekt; Inhalt: siehe LOG-05 (Fragmente) und LOG-06 (MT5-Tab leer)
- [x] **LOG-02** Logs löschen — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - Activity wird nur lokal geleert; Robot/MT5 nach Rückfrage per DELETE /logs/{id}.
  - **Prüfung:** Im Tab Robot Logs „Clear“ → bestätigen.
  - **Erwartet:** Log ist leer, auch nach Refresh.
- [x] **LOG-03** Logs als ZIP herunterladen — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - GET /logs/download/{id} liefert ein ZIP mit Logs, State- und Settings-Datei.
  - **Prüfung:** „Download log file“ klicken, ZIP öffnen.
  - **Erwartet:** ZIP enthält Logs, state_<id>.json und settings-Datei.
  - 📝 Claude: 'Download log file' → gültiges ZIP (54 KB) MT5_Logs_and_Configs_7942034.zip mit err-Log, met/pid/symbols, 3 MT5-Terminal-Logs, state und settings; Download im Browser abgefangen, nichts gespeichert
- [x] **LOG-04** Worker-Status + Polling — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Anzeige Worker online/offline; Abfrage alle 10 s (beim Verbinden alle 2 s).
  - **Prüfung:** Worker auf dem VPS stoppen.
  - **Erwartet:** Status wechselt nach ≤ 10 s auf offline.
  - 📝 Claude: 'Worker online · updated' aktualisiert exakt alle 10 s (22:19:02/12/22/32)
- [x] **LOG-05** Robot-Log schreiben — 🧪 unit ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Der Bot-Prozess schreibt seine Meldungen (log_message) nach logs/<id>/err_<id>.log.
  - **Prüfung:** Tab „Robot Logs“ öffnen und die letzten Zeilen ansehen.
  - **Erwartet:** Jede Meldung genau einmal, keine abgeschnittenen Zeilen.
  - 📝 v0.7.59 live: seit Bot-Neustart 22:48:40 keine Fragmente, keine doppelten Zeilen (vorher 4 Fragmente in 200 Zeilen)
- [x] **LOG-06** MT5-Terminal-Log anzeigen — 🔌 api ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Der Tab „MT5 Terminal“ zeigt das Tages-Log des MT5-Terminals, das beim Verbinden nach logs/<id>/mt5_terminal/ kopiert wird.
  - **Prüfung:** Tab „MT5 Terminal“ öffnen.
  - **Erwartet:** Zeilen aus MT5_Terminal_<Datum>.log erscheinen.
  - 📝 v0.7.59 live: MT5-Tab liefert 400 Zeilen aus mt5_terminal/MT5_Terminal_<Datum>.log, UTF-16 korrekt dekodiert
- [ ] **LOG-07** Zonen-Logs — 🧪 unit ✅ 2026-10-02 · 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Jede Robot-Log-Zeile, die zu einer Zone gehört, trägt das Tag [Z:<zone_id>]; GET /logs/{id}?zone_id=… filtert darauf, und jede Zonenkarte zeigt ihre eigenen Logs aufklappbar an.
  - **Prüfung:** Bot mit zwei Zonen laufen lassen, in einer Zonenkarte „Logs“ aufklappen.
  - **Erwartet:** Nur Zeilen dieser Zone erscheinen (ohne Tag); im Robot-Log-Tab steht das Zonen-Badge vor der Zeile.

## 11. UPD – System & Updates

- [x] **UPD-01** Update-Prüfung — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - „System Info“ → „Check for Updates“; GET /system/update/check vergleicht Git-Hash und VERSION mit origin/main.
  - **Prüfung:** „Check for Updates“ klicken.
  - **Erwartet:** „You are up to date“ oder alte → neue Version.
  - 📝 Claude: 'Check for Updates' → 'You are up to date'; API: local v0.7.58 = remote v0.7.58. Hinweis: System Info zeigt Host/Port des Frontends (localhost:3000), nicht des Workers
- [x] **UPD-02** Update anwenden — 🧪 unit ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-24
  - „Apply Update (git pull)“ → POST /system/update (stash nur bei lokalen Änderungen, pull, stash pop), danach Seiten-Reload. Scheitert der Pull (z. B. Datei gesperrt oder ohne Schreibrecht), wird der Stand davor wiederhergestellt – keine halb aktualisierten Dateien, der Stash wird zurückgespielt.
  - **Prüfung:** Nach einem Merge auf main das Update im Dashboard anwenden (Zahnrad → Check for Updates → Apply Update).
  - **Erwartet:** VERSION auf dem VPS entspricht main; nach einem Fehler zeigt git status keine geänderten Dateien und git stash list keinen neuen Eintrag.
  - 📝 VPS per Dashboard-Update von v0.7.69 auf v0.7.70 (Worker meldet local_ver = remote_ver = v0.7.70). Erster Versuch scheiterte an Datei-Rechten in docs/features; nach takeown/icacls auf das Repo ok.
- [x] **UPD-03** System herunterfahren — 🖥️ e2e ✅ 2026-10-02
  - Power-Button → Bestätigung → /stop, danach window.close().
  - **Prüfung:** Power-Button → bestätigen.
  - **Erwartet:** Bot wird gestoppt, Fenster schließt (falls vom Browser erlaubt).
- [x] **UPD-05** Server-Neustart nach Update — 🧪 unit ✅ 2026-10-02 · 🔌 api ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-24
  - Nach einem erfolgreichen POST /system/update beendet sich der Worker nach 1,5 s (schedule_restart); run_uvicorn_watchdog.bat (setzt WORKER_SUPERVISED=1) startet ihn mit dem neuen Code neu. Ohne Watchdog kein Neustart. Das Dashboard wartet 8 s und lädt dann neu; veraltete Bots startet der neue Worker selbst neu (BOT-03).
  - **Prüfung:** Update im Dashboard anwenden (System Info → Check for Updates → Apply Update). → Im Fenster „Uvicorn API“ auf dem VPS den Neustart beobachten.
  - **Erwartet:** Worker startet nach wenigen Sekunden mit der neuen Version; das Dashboard lädt neu und ist wieder online.
  - 📝 Apply Update v0.7.70→v0.7.71 im Dashboard: Worker beendet sich, Watchdog startet neu, meldet v0.7.71; laufender Bot mit neuem Code neu gestartet
- [x] **UPD-06** Abhängigkeiten nach Update installieren — 🧪 unit ✅ 2026-10-02
  - Ändert ein Pull worker_python/requirements.txt, führt execute_git_pull danach pip install -r mit dem Python des Workers (.venv) aus. Schlägt pip fehl, meldet das Update einen Fehler und der Worker startet nicht neu (neuer Code würde ohne Paket abstürzen).
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **UPD-07** Automatisches Update — 🧪 unit ✅ 2026-10-02 · 👤 manuell ⏳
  - Unter dem Watchdog (WORKER_SUPERVISED=1) prüft der Worker alle AUTO_UPDATE_MINUTES (Standard 5, 0 = aus) origin/main. Liegt der lokale Stand auf Branch main nur zurück, zieht er das Update (inkl. pip) und startet neu. Ein anderer Branch oder lokale Commits werden nicht angefasst. git läuft dabei mit den normalen Rechten des Workers.
  - **Prüfung:** Einen PR nach main mergen und 5–10 Minuten warten.
  - **Erwartet:** Die VPS-Seite zeigt die neue Version, ohne dass etwas geklickt wurde.

## 12. VPS – VPS-Fernsteuerung vom Mac

- [ ] **VPS-01** VPS-Status — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Die Seite /vps zeigt per SSH (Route /api/vps/status → ops/windows/vps.ps1 status) Worker, ngrok samt öffentlicher URL, laufende Bots, Version/Branch samt Zeitpunkt der letzten Aktualisierung (Reflog .git/logs/HEAD), Autostart und Uptime. Ohne VPS_SSH_HOST (z. B. Vercel) erscheint nur ein Hinweis.
  - **Prüfung:** Lokal npm run dev:frontend, Seite „VPS“ öffnen.
  - **Erwartet:** Alle Kacheln grün; ist der Worker gestoppt, steht „Gestoppt“.
- [ ] **VPS-02** Aktionen (Update, Neustart, Reboot) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Update-Prüfung über den Worker; „Update & Neustart“ läuft über den Worker (POST /system/update) oder, wenn er nicht läuft, über die Aufgabe AutoGrid-Update; „Worker neu starten“ über die Aufgabe AutoGrid-Start (start.bat); „ngrok neu starten“ beendet ngrok, run_ngrok_watchdog.bat startet ihn neu; „VPS neu starten“ per shutdown /r. Jede Aktion mit Bestätigung. git läuft nie per SSH als Administrator.
  - **Prüfung:** „Worker neu starten“ → bestätigen. → „Update & Neustart“ nach einem Merge auf main.
  - **Erwartet:** Worker ist nach ~20 s wieder erreichbar bzw. die Version steigt.
- [x] **VPS-03** Logs vom VPS — 🖥️ e2e ✅ 2026-10-02
  - Tabs Worker (logs/worker_console.log), ngrok (logs/ngrok.log) und Update (logs/vps_update.log), jeweils die letzten 300 Zeilen per SSH. Das Log lädt mit dem Status-Poll neu, Farbcodes von uvicorn werden entfernt; fehlt die Neustart-Schleife (dann gibt es kein Log), erklärt ein Hinweis den Klick auf „Worker neu starten“.
  - **Prüfung:** Tabs wechseln. → Seite offen lassen, nachdem der VPS aktualisiert oder neu gestartet wurde.
  - **Erwartet:** Konsolenausgabe des Workers bzw. ngrok erscheint ohne Farbcodes und aktualisiert sich von selbst; ein alter Fehler bleibt nicht stehen.
- [x] **VPS-04** Schutz der VPS-Route — 🖥️ e2e ✅ 2026-10-02
  - /api/vps/* antwortet nur auf localhost; POST nur mit eigener Origin; ohne VPS_SSH_HOST 404. Nur geprüfte Aktionen/Argumente gelangen in den SSH-Befehl, SSH-Daten stehen nur server-seitig in .env.local (kein NEXT_PUBLIC_). Auf der öffentlichen (Vercel-)Version antwortet ein fremder Host mit 403 localOnly; die Seite /vps zeigt dafür einen Hinweis statt eines roten Fehlerpanels und bleibt ohne Worker-Verbindung nutzbar (ConnectionGate lässt /vps offen).
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch e2e-Tests.
- [x] **VPS-05** Konsolen-Log und ngrok-Watchdog — 🧪 unit ✅ 2026-10-02
  - Unter dem Watchdog schreibt der Worker seine Konsolenausgabe zusätzlich nach logs/worker_console.log (rotiert ab 5 MB). run_ngrok_watchdog.bat startet ngrok bei Absturz neu und loggt nach logs/ngrok.log; start.bat und cleanup_old_instances.ps1 kennen ihn. Die PowerShell-Skripte sind reines ASCII (PowerShell 5.1).
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **VPS-06** Einmalige Einrichtung und Autostart — 👤 manuell ⏳
  - ops/windows/setup_vps.ps1 (einmal als Administrator) installiert OpenSSH (nur Schlüssel), trägt den Mac-Schlüssel ein, setzt den Besitzer des Repos auf den normalen Benutzer, richtet Auto-Login ein (Passwort als LSA-Secret), entfernt bei MT5-Terminals den Haken „Als Administrator ausführen“ (RUNASADMIN, samt Leeren des Kompatibilitäts-Caches) und legt die Aufgaben AutoGrid-Start (bei Anmeldung) und AutoGrid-Update an, beide ohne höchste Rechte.
  - **Prüfung:** Einrichtung nach docs/windows_start_guide.md, danach VPS über die Seite „VPS“ neu starten.
  - **Erwartet:** Nach dem Reboot sind Auto-Login, Worker, ngrok und die vorher laufenden Bots von selbst wieder da.
- [ ] **VPS-07** Prozesse mit Adminrechten erkennen und beenden — 🧪 unit ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Laufen Neustart-Schleife, Worker, Bots, ngrok oder MT5 mit Adminrechten (alte Aufgabe mit höchsten Rechten, start.bat „Als Administrator“), kann der normale Worker sie weder sehen noch beenden. vps.ps1 status meldet sie (höhere Integritätsstufe als explorer.exe), die Seite „VPS“ zeigt eine rote Warnung mit „Admin-Prozesse beenden“ (fix-elevated, danach Neustart ohne Adminrechte, der Worker setzt die Bots fort); „Worker neu starten“ beendet Admin-Schleifen/-Worker/-ngrok vorher selbst. cleanup_old_instances.ps1 schreibt nicht beendbare Reste ins Worker-Log. Ein Worker mit Adminrechten warnt beim Start und macht kein git pull.
  - **Prüfung:** Seite „VPS“ öffnen, wenn nichts mit Adminrechten läuft. → Nur mit Absprache: auf dem VPS start.bat per Rechtsklick „Als Administrator ausführen“, danach Seite „VPS“ neu laden und „Admin-Prozesse beenden“.
  - **Erwartet:** Ohne Admin-Prozesse keine Warnung. Mit Admin-Start nennt die Warnung Neustart-Schleifen und Worker mit PID; nach „Admin-Prozesse beenden“ verschwindet sie, Worker und ngrok laufen wieder ohne Adminrechte und das Worker-Log zeigt keine neue Admin-Warnung.
- [ ] **VPS-08** Bootstrap eines frischen VPS — 🧪 unit ✅ 2026-10-02 · 👤 manuell ⏳
  - Ein PowerShell-Einzeiler (irm .../bootstrap.ps1 | iex, Administrator-PowerShell) installiert fehlendes Git/Python 3.11/VC++-Redistributable, klont das Repo (nur wenn es fehlt, kein git pull), legt die venv an, installiert requirements.txt, erzeugt bei Bedarf WORKER_API_KEY und richtet ngrok (Authtoken + feste Domain) ein – Repo-Klon/venv/pip/ngrok laufen dafür in einer eigenen geplanten Aufgabe mit RunLevel Limited (bootstrap-user.ps1), nie erhöht. Danach ruft es setup_vps.ps1 auf (jetzt ohne Pflicht-Parameter -PublicKey; ohne ihn entfallen nur OpenSSH/Mac-Schlüssel), startet den Worker über die Aufgabe AutoGrid-Start und gibt zum Schluss über connect-link.ps1 einen Verbindungs-Link (#connect=…, dasselbe Format wie frontend_nextjs/src/lib/connectionCode.ts) aus, den man im Frontend öffnet oder einfügt (SYS-07/SYS-08).
  - **Prüfung:** Auf einem frischen Windows-VPS (oder einem, auf dem Git/Python/Repo noch fehlen), in einer Administrator-PowerShell den Einzeiler ausführen. → ngrok-Authtoken und eine feste Domain eingeben, danach das Windows-Passwort (Auto-Login) oder -SkipAutoLogon verwenden.
  - **Erwartet:** Git/Python/VC++-Redistributable werden installiert (oder als vorhanden erkannt), das Repo liegt unter C:\dev\auto-grid-nextJs, der Worker antwortet auf Port 8000, ngrok zeigt eine öffentliche URL, und am Ende erscheint ein Verbindungs-Link, der im Frontend („VPS verbinden“) sofort einen erfolgreichen Test ergibt. Ein zweiter Lauf des Einzeilers ändert nichts Bestehendes (idempotent).
- [ ] **VPS-09** Worker online steuern (ohne SSH) — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Wo die SSH-Route zu ist (öffentliche Vercel-Version), zeigt /vps unter dem Hinweis ein Panel „Worker (online)“, das direkt die Worker-API mit dem Admin-Schlüssel nutzt (alles admin-only) – GET /system/worker/status (Version, Laufzeit, unter Neustart-Schleife?, laufende Bots), GET /system/worker/log (letzte Zeilen von logs/worker_console.log, Farbcodes entfernt) und POST /system/restart (Worker beendet sich, run_uvicorn_watchdog.bat startet ihn in ~3 s neu; ohne Watchdog 409 und deaktivierter Knopf). Update-Prüfung/Update bleiben im Systemmenü des Dashboards. ngrok-/VPS-Neustart geht bewusst nur per SSH, denn ist der Tunnel weg, ist auch die API nicht erreichbar.
  - **Prüfung:** Auf der Vercel-Version mit Admin-Schlüssel verbinden, Seite „VPS“ öffnen. → „Worker neu starten“ → bestätigen.
  - **Erwartet:** Version, Laufzeit und Log erscheinen; nach ~20 s ist der Worker wieder erreichbar und die Laufzeit beginnt von vorn.
- [x] **VPS-10** Selbstheilung (Tunnel-Watchdog) — 🧪 unit ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-10-01
  - Die geplante Aufgabe AutoGrid-Tunnel (setup_vps.ps1, alle 5 min) führt ops/windows/tunnel_watchdog.ps1 aus und prüft, ob die öffentliche ngrok-URL (NGROK_DOMAIN) /api/system/platform beantwortet (401/403 zählt als erreichbar). Wenn nicht und der Worker lokal antwortet, beendet sie ngrok (run_ngrok_watchdog.bat startet ihn neu); antwortet auch der Worker nicht, erst abwarten (Neustart-Schleife), dann Worker + ngrok über AutoGrid-Start. Nach 3 Fehlschlägen in Folge Reboot per shutdown /r – höchstens einmal pro Stunde und 3-mal in 24 h, nicht ohne Internet und nicht bei ERR_NGROK_334 (Domain woanders online); nichts in den ersten 10 min nach dem Start und während eines Updates. Der Fehlschlag wird vor der Aktion gespeichert (Zeiten in UTC, Datei atomar ersetzt). Kein Fernzugriff nötig; die Aufgabe hat höchste Rechte nur für den Reboot, ruft nie git auf und startet Worker/ngrok nie selbst. Zustand in data/tunnel_watchdog.json, Log logs/tunnel_watchdog.log; die Seite „VPS“ zeigt „Selbstheilung“ in der ngrok-Kachel (Warnung bei Tunnel-Fehlschlägen, „keine Prüfung seit n min“ wenn die Aufgabe nicht mehr läuft, letzter Auto-Reboot) und den Log-Tab „Tunnel“.
  - **Prüfung:** Auf dem VPS in einer Administrator-PowerShell setup_vps.ps1 -SkipAutoLogon -SkipRepoOwnership erneut ausführen, dann tunnel_watchdog.ps1 -DryRun. → Nur mit Absprache: ngrok.exe im Task-Manager beenden und das ngrok-Fenster schließen (keine Neustart-Schleife mehr), ~5-10 min warten.
  - **Erwartet:** DryRun meldet keinen Fehler bzw. „AKTION: ngrok neu starten.“, wenn der Tunnel weg ist. Nach dem Schließen startet der Watchdog Worker + ngrok über AutoGrid-Start, die URL antwortet wieder, und die Seite „VPS“ zeigt „Selbstheilung: URL erreichbar“ sowie die Einträge im Log-Tab „Tunnel“.
  - 📝 VPS 2026-10-01: setup_vps.ps1 legt AutoGrid-Tunnel an, Aufgabe laeuft alle 5 min (LastTaskResult 0, last_result ok, Zeiten UTC). Ausfall-Test: ngrok-Schleife + ngrok.exe beendet -> 04:18 FEHLER 1/3 (404, Worker lokal OK) + AutoGrid-Start, 04:23 OK antwortet wieder.

## 13. UI – Oberfläche

- [x] **UI-01** Navigation — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Logo, Version, Links Dashboard, Formasyon und VPS mit animierter Markierung. Auf Mobil (375px) kompakter, ohne horizontales Scrollen.
  - **Prüfung:** Zwischen Dashboard und Formasyon wechseln. → Bei 375px Breite öffnen.
  - **Erwartet:** Aktiver Link ist markiert, Version entspricht VERSION. Bei 375px kein horizontales Scrollen, „Grid Robot“ bricht nicht um.
  - 📝 Claude: Dashboard ↔ Formasyon, Markierung wandert mit, Version v0.7.58 = VERSION
- [x] **UI-02** Theme hell / dunkel / System — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Umschalter „Açık / Koyu / Sistem“ (auf Mobil ein einzelner Button, der der Reihe nach durchschaltet), gespeichert in localStorage grid-robot-theme, ohne Aufblitzen beim Laden.
  - **Prüfung:** Alle drei Varianten wählen und die Seite neu laden.
  - **Erwartet:** Theme bleibt erhalten, kein helles Aufblitzen im Dunkelmodus.
  - 📝 Claude: Açık/Koyu/Sistem setzen Klasse 'dark' + localStorage; 'Açık' übersteht Neuladen; Script vor der Hydration vorhanden; zurück auf 'Sistem'
- [x] **UI-03** PWA / Service Worker — 🖥️ e2e ✅ 2026-10-02
  - Manifest und Registrierung von /service-worker.js im Layout.
  - **Prüfung:** DevTools → Application → Service Workers.
  - **Erwartet:** Service Worker ist registriert, keine 404 in der Konsole.
- [x] **UI-04** Zonen-Test-Link (/chart?account=&zone=) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-09-23
  - Link „Test“ im Zonenkopf öffnet die Analyse-Seite /chart?account=<Konto>&zone=<id> mit dieser Zone. Eine Zone, die es im Konto nicht gibt, meldet „Bölge bulunamadı“.
  - **Prüfung:** In einer Zone auf „Test“ klicken.
  - **Erwartet:** Die Analyse-Seite zeigt das Konto und die gewählte Zone mit ihren Einstellungen.
  - 📝 v0.7.59 (Frontend aus main): 'Test'-Link → Karte 'Bölge 1 · USOUSD' mit allen Werten + Live-Chart; kein Symbol-Hinweis (Stream = USOUSD). Min/Max-Linien 20/200 liegen außerhalb des sichtbaren Kursbereichs (~97)
- [x] **UI-05** Sprache Türkisch / Englisch / Deutsch — 🖥️ e2e ✅ 2026-10-02
  - Umschalter TR · EN · DE in der Navigation (auf Mobil ein einzelner Button, der durchschaltet). Die Wahl liegt in localStorage grid-robot-locale, setzt <html lang> schon vor dem ersten Paint und gilt für alle Seiten, Dialoge, Toasts und Fehlermeldungen des Frontends. Texte stehen in frontend_nextjs/src/i18n/messages/*.ts (je Bereich tr, en, de nebeneinander, tsc erzwingt gleiche Schlüssel). Meldungen des Workers (detail-Texte, Logzeilen) bleiben unübersetzt.
  - **Prüfung:** Im Umschalter EN, dann DE, dann TR wählen und dabei Dashboard, /vps und /chart ansehen. → Seite neu laden.
  - **Erwartet:** Alle Texte wechseln sofort, die Sprache bleibt nach dem Reload erhalten, <html lang> stimmt. Keine hartcodierten Reste, keine überlaufenden Buttons (Deutsch ist am längsten).
- [x] **UI-06** Zahlen- und Zeitformat folgt der Sprache — 🖥️ e2e ✅ 2026-10-02
  - Preise und Gewinne ($97,25 in tr/de, $97.25 in en), Uhrzeiten in Logs und VPS-Seite sowie das Dezimalmuster im Symbol-Label („Sembol (0,00)“) richten sich nach der gewählten Sprache.
  - **Prüfung:** Bot mit MT5 verbinden, dann die Sprache zwischen EN und DE wechseln.
  - **Erwartet:** Der Preis in der Kennzahlenleiste wechselt zwischen Punkt und Komma als Dezimaltrenner.
- [x] **UI-07** Hinweise (Tooltips) zu jedem Feld und Button — 🖥️ e2e ✅ 2026-10-02
  - Jede Einstellung, jedes Feld, jeder Schalter, Button, Tab und Menüpunkt erklärt sich. Felder und Schalter tragen ein (i) hinter dem Label (Hover, Tastaturfokus oder Antippen), Buttons und Links zeigen den Tooltip bei Hover/Fokus, deaktivierte Buttons nennen den Grund. Der Tooltip ist ein Popover im Top-Layer (nicht von overflow-hidden abgeschnitten, über den Dialogen), Escape schließt zuerst nur ihn. Texte stehen als i18n-Schlüssel `<label-key>.hint` in src/i18n/messages/hints.ts (tr, en, de). `hint` ist Pflicht-Prop von InputField, Switch, Button, Tabs und ConfirmModal; der Abdeckungstest meldet jedes Bedienelement ohne Hinweis (hooks/RULES.md §5).
  - **Prüfung:** Im Dashboard mit der Maus über das (i) hinter „Alt Seviyeler“, „Maks Pozisyon“ und „Çıkış Tetikleyici“ fahren. → Mit Tab durch die Felder gehen; Escape drücken. → Bei laufendem Bot über „Edit“ fahren; im Konto-Dialog über ein (i) fahren. → Sprache auf EN und DE stellen.
  - **Erwartet:** Zu jedem Element erscheint ein verständlicher Text in der gewählten Sprache. Er wird nicht abgeschnitten, liegt im Dialog über dem Dialog, Escape schließt erst den Tooltip. Ein deaktivierter Button nennt den Grund. Der Abdeckungstest findet kein Bedienelement ohne Hinweis.
- [x] **UI-08** Mobil (375 px) ohne horizontalen Überlauf — 🖥️ e2e ✅ 2026-10-02
  - Bei 375 px Breite läuft keine Seite horizontal über. Im Zonenbereich brechen die Kopfzeile des Panels („Kaydedildi“ und „Bölge Ekle“) und der Zonenkopf (Status, Kaydet, Test und ⋯-Menü) in eine zweite Zeile um, statt die Karte zu sprengen. Das gilt für alle drei Sprachen (Deutsch ist am längsten), auch mit dem Abzeichen „Kaydedilmedi“ und einer vom Motor gestoppten Zone. Die Tab-Leiste des Log-Viewers im Dashboard ist bei 375 px breiter als ihre Karte; sie scrollt deshalb selbst horizontal (ohne sichtbaren Scrollbalken) statt vom overflow-hidden der Karte abgeschnitten zu werden, und ein gewählter Tab wird in Sicht geholt. Auch das gilt für alle drei Sprachen; die Tabs des VPS-Logs auf /vps passen ohne Scrollen. Ab Tablet-Breite bleibt das Layout unverändert.
  - **Prüfung:** Dashboard bei 375 px Breite öffnen (Entwicklertools, Geräteleiste) und ein Konto mit Zone wählen. → Sprache auf DE stellen und in der Zone einen Wert ändern. → /formasyon, /vps und /chart bei 375 px ansehen. → Im Log-Viewer unter dem Zonenbereich die Tab-Leiste nach links wischen und den dritten Tab („MT5 Terminal“) antippen.
  - **Erwartet:** Kein horizontaler Scrollbalken auf keiner Seite. „Bölge Ekle“, „Kaydet“, „Test“ und das ⋯-Menü der Zone sind vollständig sichtbar, notfalls in einer zweiten Zeile. Die Tab-Leiste des Log-Viewers lässt sich wischen, jeder Tab ist erreichbar und nach dem Antippen ganz sichtbar.
- [x] **UI-09** Kompakte Steuerleiste (Konto, Bot, Intervall) — 🖥️ e2e ✅ 2026-10-02
  - Über den Kennzahlen liegt eine einzige Leiste mit LIVE/TEST-Badge, Kontoauswahl, Kontomenü (⋯ mit Bot-Log herunterladen, Bearbeiten, Löschen, Neues Konto), Bot-Status mit Start/Neustart/Stopp, Prüfintervall mit Speichern und Systemmenü (Zahnrad mit Systeminfo, Update-Prüfung, Herunterfahren). Ab etwa 1280 px ist das eine Zeile; schmaler brechen die Gruppen um, bei 375 px ohne horizontalen Überlauf. Alarme der Bot-Steuerung erscheinen in voller Breite unter der Leiste. Zonen und Log nutzen darunter die volle Breite.
  - **Prüfung:** Dashboard auf dem Desktop öffnen und ein Konto wählen. → Auf ⋯ neben der Kontoauswahl klicken, dann Escape drücken. → Fenster auf 375 px Breite verkleinern.
  - **Erwartet:** Konto, Bot-Steuerung und Prüfintervall stehen in einer Zeile. Das ⋯-Menü zeigt Log, Bearbeiten, Löschen und Neues Konto und schließt mit Escape. Bei 375 px stehen die Gruppen untereinander, nichts läuft über.

## 14. ANA – Analyse (Chart, Statistik, Backtest)

- [x] **ANA-01** Analyse-Seite mit Tabs — 🖥️ e2e ✅ 2026-10-02
  - Menüpunkt „Analyse“ (/chart) mit den Tabs Chart, Statistik und Backtest (Statistik und Backtest noch Platzhalter). Konto, Zone, Tab und Zeitraum stehen in der URL (?account=&zone=&tab=&range= bzw. &from=&to=); Neuladen und geteilte Links zeigen dieselbe Ansicht, ohne ?account= wird das im Dashboard gewählte Konto übernommen. Der Chart-Tab zeigt die Einstellungen der Zone und ihren Kursverlauf (ANA-05). Ein Info-Symbol zeigt den Lizenzhinweis von TradingView Lightweight Charts™ mit Link zu tradingview.com. Bei 375 px stehen Konto, Zone und Zeitraum untereinander; Panels bleiben im Bildschirm.
  - **Prüfung:** Im Menü „Analyse“ öffnen, ein Konto wählen. → Tab „Statistik“ wählen und die Seite neu laden. → Auf das Info-Symbol neben dem Zahnrad klicken. → Fenster auf 375 px Breite verkleinern.
  - **Erwartet:** Die erste Zone des Kontos ist gewählt und steht mit dem Konto in der Adresse; nach dem Neuladen ist derselbe Tab offen. Der Lizenzhinweis nennt TradingView und verlinkt tradingview.com. Bei 375 px läuft nichts über.
- [x] **ANA-02** Konto- und Zonenwahl ohne fremde Daten — 🖥️ e2e ✅ 2026-10-02
  - Die Analyse-Seite wählt das Konto für die ganze App (Dashboard und Live-Stream folgen, gemeinsame Funktion selectAccount). Beim Kontowechsel werden Zonen, Status und Preise des alten Kontos sofort geleert; die Zonenwahl zeigt nur Zonen, die für genau dieses Konto geladen wurden (useSettingsStore.loadedAccount). Eine verspätete Antwort für ein vorher gewähltes Konto wird verworfen. Sind die Zonen dieses Kontos schon geladen, lädt die Seite sie nicht neu (ungespeicherte Zonen-Änderungen bleiben erhalten). Wird das Konto direkt beim Laden über die Adresse gewählt, verbindet sich der Live-Stream mit diesem Konto (vorher schloss ein verzögertes Trennen im WebSocket-Manager den gerade geöffneten Stream).
  - **Prüfung:** Auf der Analyse-Seite ein Konto mit Zonen wählen, dann ein Konto ohne Zonen. → Danach zum Dashboard wechseln.
  - **Erwartet:** Nach dem Wechsel ist keine Zone des alten Kontos mehr zu sehen, die Zonenwahl ist leer. Das Dashboard zeigt das zuletzt gewählte Konto.
- [x] **ANA-03** Anzeige-Schalter (Zahnrad) — 🖥️ e2e ✅ 2026-10-02
  - Das Zahnrad schaltet Zonenband, Grid-Stufen, Positionen/Orders, Marktpausen, RSI und die Karte mit den Zonen-Einstellungen ein und aus; die Wahl bleibt in diesem Browser gespeichert (localStorage grid-robot-analysis-prefs). Datenqualitäts-Warnungen, Datenquelle und Modellgrenzen haben bewusst keinen Schalter; das Panel sagt das.
  - **Prüfung:** Zahnrad öffnen, „Karte mit Zonen-Einstellungen“ ausschalten, Seite neu laden.
  - **Erwartet:** Die Karte bleibt nach dem Neuladen ausgeblendet; das Panel nennt die nicht abschaltbaren Hinweise.
- [x] **ANA-04** Kursdatenbank mit Abdeckung — 🔌 api ✅ 2026-10-02 · 👤 manuell ✅ 2026-10-02
  - SQLite auf dem VPS (worker_python/data/market.sqlite, gitignored). GET /market/{id}/rates?symbol&timeframe=M1…D1&from&to (MT5-Zeit, halb offen, nur eigene Konten) holt nur die Teile, die noch nicht in der Datenbank sind, aus MT5 und liefert spaltenweise (t,o,h,l,c,v,s; höchstens 50.000 Kerzen, Rest über next_from). Jeder Bereich hat einen Zustand: vollständig (zwischen erster und letzter gelieferter Kerze), bestätigte Pause (keine Kerzen, aber davor und danach welche, höchstens 4 Tage: Wochenende, Feiertag) oder nicht verfügbar (vor der ersten Kerze, die MT5 hat; nach 24 h neu versucht). Die neueste MT5-Kerze wird nie gespeichert, nur mitgeliefert (live_from). Fehler werden nicht gespeichert; was fehlt, steht mit Grund in missing (unavailable, error, busy). Schutz des Live-Bots: Abruf in Stücken (höchstens 31 Tage M1), immer nur einer gleichzeitig, 0,5 s Pause, ohne Login und ohne Terminal-Neustart; ist das Konto in /start oder /stop, kommt nur der Datenbank-Bestand. GET /market/{id}/coverage zeigt den Bestand und die Größe. Bei jedem Abruf wird ein verlässlicher Broker-Abstand protokolliert. Ab MARKET_DB_MAX_MB (Standard 5000) werden keine Kerzen mehr gespeichert. Täglich und vor jeder Migration ein Backup (data/backups, 7 Stück); eine fehlgeschlagene Migration lässt die alte Version und die Daten-Endpunkte antworten 503, der Handel läuft weiter.
  - **Prüfung:** Worker auf dem VPS mit diesem Stand neu starten. → Im Browser (angemeldet als Admin) /api/market/<Konto>/rates?symbol=<Symbol>&timeframe=M1&from=<Montag 00:00 als Unix-Sekunden>&to=<Montag 01:00> zweimal aufrufen (Header X-API-Key, z. B. mit curl). → Danach /api/market/<Konto>/coverage?symbol=<Symbol> aufrufen. → Im MT5-Journal und im Bot-Log nachsehen, ob während der Abrufe etwas passiert ist.
  - **Erwartet:** Beide Aufrufe liefern dieselben 60 Kerzen, die Zeiten passen zum MT5-Chart (Brokerzeit). Coverage zeigt den Bereich als „complete“. Im Journal keine neue Zeile „authorized on …“, im Bot-Log kein Verbindungsabbruch.
  - 📝 02.10.26 VPS v0.7.140+ (nach #93): /rates liefert offset_sec 10800 und server_now; Kerzen identisch mit MT5-M1 aus time-check; coverage plausibel (complete/gap/unavailable)
- [x] **ANA-05** Chart-Tab mit Kerzen, Zonenband und Stufen — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-10-02
  - Der Chart-Tab zeigt die MT5-Kerzen der gewählten Zone für Zeitraum und Zeitrahmen (M1 … D1, in der Adresse ?tf=, Standard M15) aus GET /market/{id}/rates, höchstens 100.000 Kerzen (sonst nur das Ende, mit Hinweis), Zeiten unverändert als Brokerzeit (MT5). Darüber das Zonenband (min–max als gestrichelte Linien und helle Fläche) und die Grid-Stufen, die der Bot vom aktuellen Preis aus rechnet (src/lib/analysis/levels.ts, gleiche Rechnung wie grid_execution/levels.py inkl. Breakout-Pullback und „Abstand nach Verlust“; Fraktal-Zonen haben keine Stufen, mit Hinweis). RSI(14, Wilder) im Browser aus den gezeigten Kerzen, eigener Bereich. Liegt der Zeitraum bis jetzt, kommt alle 60 s das Endstück neu (der Worker hält es 30 s im Cache); die laufende Kerze wächst mit dem Live-Preis, aber nur bei passendem Konto und Symbol, offenem Markt und sicherer Brokeruhr. Band, Stufen und RSI sind im Zahnrad abschaltbar.
  - **Prüfung:** Analyse öffnen, ein DEMO-Konto mit laufendem Bot und eine Grid-Zone wählen, Zeitraum „Letzte 7 Tage“. → Zeitrahmen M15, dann H1 wählen und die Seite neu laden. → Im MT5-Terminal denselben Chart (Symbol, H1) daneben öffnen.
  - **Erwartet:** Die Kerzen stimmen in Zeit und Preis mit dem MT5-Chart überein (Brokerzeit). Nach dem Neuladen ist H1 noch gewählt. Das Zonenband liegt auf min/max der Zone; die Stufen liegen dort, wo der Bot seine Orders setzt.
  - 📝 02.10.26 DEMO 7942034 live: Kerzen = rohe MT5-Kerzen; M15 7 Tage, D1 alles (3491 ab 2013, Hinweis gekürzt); tf in URL; Stufen USOUSD/EURUSD per levels.ts gegen echte Bot-Orders geprüft (Raster identisch, freie Stufen durch Positionen belegt); Live-Kerze folgt Stream-Preis, neue Kerze zum Minutenwechsel
- [x] **ANA-06** Offene Positionen und Orders im Chart — 🧪 unit ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-10-02
  - Die Bot-Telemetrie (grid_metrics.calculate_live_metrics) liefert zusätzlich positions[] und orders[] der Robot-Magics (Ticket, Magic, Typ, Volumen, Einstiegspreis, SL, TP, Gewinn, MT5-Zeit; höchstens 500). Der Chart-Tab liest sie alle 5 s über GET /logs/{id}?log_type=metrics und zeigt nur die der gewählten Zone (feste Magic-Nummer und Symbol): Positionen als durchgezogene Linie mit Beschriftung (BUY/SELL + Lot), TP/SL gepunktet, Pending-Orders gestrichelt (BUY LIMIT …); ab mehr als 20 Linien ohne Beschriftung an der Preisachse (überdecken sich sonst). Ohne laufenden Bot oder ohne Magic (Zone nie gespeichert) keine Linien, dafür ein Hinweis. Die geschätzte Handelszeit der Zone steht als „geschätzt“ daneben. Abschaltbar im Zahnrad.
  - **Prüfung:** Bot auf dem DEMO-Konto laufen lassen, bis die Zone Orders und mindestens eine Position hat. → Analyse → Chart-Tab mit dieser Zone öffnen und mit der Liste „Handel“ im MT5-Terminal vergleichen. → Bot stoppen und 10 Sekunden warten.
  - **Erwartet:** Jede Position und Order dieser Zone erscheint auf ihrem Preis, Orders anderer Zonen nicht; die Anzahl unter dem Chart stimmt mit MT5 überein. Nach dem Stopp verschwinden die Linien und der Hinweis „Bot läuft nicht“ erscheint.
  - 📝 02.10.26 DEMO 7942034 nach Deploy #94: Telemetrie liefert positions/orders; Chart zeigt USOUSD 64 Pos/3 Orders, EURUSD 3 Pos/20 Orders = Worker-Listen je Magic; Fraktal-Zone 0/0; ab 20 Linien ohne Achsenbeschriftung
- [x] **ANA-07** Deal-Archiv und Zonen-Register — 🔌 api ✅ 2026-10-02
  - GET /history/{id}/deals?from&to (MT5-Zeit, nur eigene Konten) archiviert alle Deals des Kontos in der Datenbank, auch manuelle Trades sowie Ein- und Auszahlungen; gefiltert wird erst bei der Auswertung. Abgeglichene Zeiträume werden einzeln gemerkt (ein Abgleich von „diese Woche“ sagt nichts über „letztes Jahr“); der jüngste Rand (24 h plus Puffer für den Broker-Abstand) wird jedes Mal neu abgeglichen. Liegt der Einstieg einer Position vor dem Zeitraum, wird er nachgeladen und mitgeliefert. Die Antwort enthält Kontowährung, Kontostand, Kontomodell und das Zonen-Register. Das Register (POST /settings) merkt sich je Magic-Nummer Zone, Symbol und Name, auch für gelöschte Zonen (deleted_at), und jede geänderte Fassung der Zonen-Einstellungen mit Zeitstempel. Konto löschen löscht dessen Deal-Archiv.
  - **Prüfung:** /api/history/<Konto>/deals?from=<vor 30 Tagen> aufrufen (X-API-Key).
  - **Erwartet:** Alle Deals der letzten 30 Tage wie in MT5 unter Historie → Deals, auch Ein- und Auszahlungen; „zones“ nennt die Zonen mit ihrer Magic-Nummer.
- [ ] **ANA-08** Trades im Chart und Trade-Archiv (Pfeile, Fraktale) — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ⏳
  - Der Chart-Tab lädt für denselben Zeitraum wie die Kerzen das Deal-Archiv (GET /history/{id}/deals, ANA-07) und führt Ein- und Ausstiege über die Positionsnummer zusammen (src/lib/analysis/tradePairing.ts): jeder Ausstieg ist ein Trade, eine Teilschließung ein eigener Trade mit nach Volumen verteilten Einstiegskosten; eine Umkehr (INOUT, Netting) schließt die Position und eröffnet den Rest in der Gegenrichtung; Close By ist gekennzeichnet; Netto = Gewinn + Kommission + Swap + Gebühr. Zone nur über das Zonen-Register: Magic im Register und Einstieg nach dem Registereintrag (MT5-Zeit minus Broker-Abstand, ohne Messung minus 14 h); sonst „Zone unbekannt“, nie geraten. Magic 200000, Ein-/Auszahlungen, manuelle Trades und andere Zonen erscheinen nicht (gezählt). Im Chart: Pfeil am Einstieg (Kauf grün, Verkauf rot), Punkt am Ausstieg nach Ergebnis, gepunktete Verbindung, „Zone unbekannt“ grau mit „?“; unter dem Fadenkreuz die Trades der Kerze; abschaltbar. Fraktal-Zonen zeigen Bill-Williams-Fraktale aus geschlossenen Kerzen (gleiche Regel wie der Bot, nie über eine Datenlücke), vom Bot gehandelte Fraktale (Order-Kommentar) orange; mit Hinweis und Knopf, wenn der Chart einen anderen Zeitrahmen als die Zone hat. Darunter das Trade-Archiv der Zone (neueste zuerst, höchstens 500 Zeilen): Schließzeit, Richtung, Lot, Ein-/Ausstieg, Netto, Zone, Hinweise (TP/SL, Teilschließung, Umkehr, Close By, vor dem Zeitraum eröffnet, Einstieg fehlt) und Sprung in den Chart. Fehlende Teile des Archivs (Konto beschäftigt, MT5-Fehler) stehen als Pflicht-Hinweis darüber. Reicht der Zeitraum bis jetzt, alle 2 min neu.
  - **Prüfung:** Analyse → Chart-Tab, DEMO-Konto mit Trades seit dem Zonen-Register, Grid-Zone, Zeitraum „Letzte 7 Tage“, Zeitrahmen M15. → Im MT5-Terminal unter Werkzeuge → Historie → Deals denselben Zeitraum ansehen und einige Trades vergleichen. → In der Trade-Liste bei einem Trade auf „Im Chart zeigen“ klicken und mit der Maus über den Pfeil fahren. → Eine Fraktal-Zone wählen und den Zeitrahmen der Zone einstellen.
  - **Erwartet:** Jeder Ausstieg der Zone steht mit Zeit (Brokerzeit), Preis, Lot und Netto wie in MT5 in der Liste; Teilschließungen sind einzeln und markiert; Trades aus der Zeit vor dem Register heißen „Zone unbekannt“. Pfeile und Punkte liegen im Chart auf Kerze und Preis der Ausführung. In der Fraktal-Zone liegen die Dreiecke dort, wo der MT5-Indikator „Fractals“ seine Pfeile zeigt.
- [x] **ANA-10** Kalender in Brokerzeit — 🔌 api ✅ 2026-10-02 · 🖥️ e2e ✅ 2026-10-02
  - Zeitraum in Brokertagen (MT5-Zeit): Vorauswahlen (heute, diese Woche ab Montag, dieser/letzter Monat, letzte 7/30/90 Tage, dieses/letztes Jahr, letzte 12 Monate, alles), Kalender und Eingabe als TT.MM.JJ mit Prüfung. „Heute“ ist der Tag auf der Brokeruhr, nicht im Browser; dazu misst GET /market/{id}/clock (nur lesend, für eigene Konten) den Abstand der Brokeruhr zu UTC und merkt ihn sich 10 min; ist MT5 nicht erreichbar, gilt die letzte sichere Messung. Ohne sichere Messung (Markt zu, alter Tick) liefert er keinen Abstand statt eines falschen; die Seite rechnet dann in UTC, fragt jede Minute erneut und zeigt einen nicht abschaltbaren Hinweis. Zeiträume sind halb offen, ohne 23:59:59 (src/lib/serverTime.ts, docs/analyse-regeln.md §1).
  - **Prüfung:** Auf der Analyse-Seite den Zeitraum öffnen, „Letztes Jahr“ wählen. → Eigenen Zeitraum 01.09.26 bis 15.09.26 eingeben, übernehmen, Seite neu laden. → „31.02.26“ eingeben.
  - **Erwartet:** Neben dem Titel steht „Broker UTC+3“ (je nach Broker). „Letztes Jahr“ zeigt 01.01.–31.12. des Vorjahres; der eigene Zeitraum bleibt nach dem Neuladen; ein ungültiges Datum wird rot gemeldet und „Übernehmen“ ist gesperrt.
- [x] **ANA-11** Fehlende Daten und Marktpausen im Chart — 🖥️ e2e ✅ 2026-10-02 · 👤 manuell ✅ 2026-10-02
  - Keine erfundenen Kerzen: Bereiche, die laut /rates fehlen (unavailable, error, busy), werden Leerstellen ohne Preis (nur Zeitstempel, höchstens 120 je Bereich) und grau schraffiert mit „Keine Daten“ gezeichnet; darüber ein Pflicht-Hinweis ohne Schalter mit Zeitraum, Grund und letzter Prüfung (DataQualityBanner). Bis „jetzt“ abgeschnitten, die Zukunft fehlt nie. Marktpausen (Lücke zwischen zwei echten Kerzen, mindestens zwei Kerzen lang und länger als eine Kerze + 15 min: Wochenende, Feiertag, Tagespause) sind dünne gestrichelte Trennlinien, abschaltbar; eine einzelne fehlende Kerze ohne Ticks ist keine Pause. Der RSI läuft nicht über eine Datenlücke. Gekürzter Zeitraum und volle Datenbank werden ebenfalls gemeldet.
  - **Prüfung:** Analyse → Chart-Tab, Zeitraum über ein Wochenende (z. B. „Letzte 7 Tage“), Zeitrahmen M15. → Einen Zeitraum wählen, der vor dem Beginn der MT5-Historie des Symbols liegt (z. B. „Letztes Jahr“ bei M1).
  - **Erwartet:** Am Wochenende eine dünne gestrichelte Linie statt Kerzen. Vor dem Beginn der Historie eine grau schraffierte Fläche „Keine Daten“ und ein gelber Hinweis mit Zeitraum und Grund „in MT5 nicht vorhanden“; dort steht keine einzige Kerze.
  - 📝 02.10.26 DEMO 7942034: M1 Jan 2026 = 0 Kerzen, Fläche Keine Daten + Hinweis unavailable; M1 22.-23.06. Historie ab 23.06. 06:55 → links schraffiert, rechts echte Kerzen, RSI ohne Brücke; Tagespausen 00:00-01:00 als Linien
- [x] **ANA-13** Zeit-Check und Login-Schonung (Schritt 0) — 🧪 unit ✅ 2026-10-02 · 🔌 api ✅ 2026-10-02 · 🌐 live ✅ 2026-10-01 · 👤 manuell ✅ 2026-10-01
  - GET /market/{id}/time-check (nur Admin, nur lesend) liefert für ein Symbol (Standard: das der ersten Zone) die Tick-Zeit (Brokerzeit) und die echte UTC des VPS, daraus den Broker-Abstand (aus dem Tick des Symbols, bei geschlossenem Markt aus einem frischeren der Marktübersicht; auf halbe Stunden gerundet, „verlässlich“ nur bei frischem Tick), die letzten 3 M1-Kerzen aus copy_rates_range, den letzten Trade-Deal (7 Tage, sonst 90 Tage), Kontomodell (hedging/netting) und Kontowährung sowie Berechnungsart, Gewinnwährung und Dreifach-Swap-Tag des Symbols. Damit wird vor dem Bau der Analyse-Seite geprüft, dass Zeiten in MT5, API und Datenbank zusammenpassen (docs/analyse-regeln.md). Der Check verbindet sich ohne Terminal-Neustart und ohne erneuten Login; ist das Konto gerade in /start oder /stop, kommt 409, ist MT5 nicht erreichbar 503 mit Grund; MT5-Fehler einzelner Abfragen stehen in errors. Datenabrufe (Zeit-Check, Symbolliste) verbinden sich mit data_query: kein mt5.login(), wenn das Terminal schon in diesem Konto und auf diesem Server angemeldet ist (dafür wird bis zu 3 s auf die Kontodaten gewartet; ein Login baut die Sitzung neu auf und könnte den dort laufenden Bot kurz trennen), und kein Kontowechsel auf einem Terminal, auf dem der Bot eines anderen Kontos läuft.
  - **Prüfung:** Worker auf dem VPS mit diesem Stand neu starten; DEMO-Konto, Bot läuft, Markt offen. → Auf dem Mac `scripts/features/run.sh live ANA-13` ausführen und die Zeilen „Zeit-Check“ lesen. → Per RDP in MT5 unter Werkzeuge → Historie den genannten letzten Deal suchen; in der Marktübersicht die Serverzeit ansehen. → Im MT5-Journal und im Bot-Log nachsehen, ob während des Checks etwas passiert ist. → Ergebnisse in docs/analyse-regeln.md (Tabelle „Messergebnisse“) eintragen.
  - **Erwartet:** Ticket und Uhrzeit des letzten Deals stimmen sekundengenau mit MT5 überein, Tick- und Kerzenzeit passen zur Serverzeit in MT5, der Broker-Abstand ist eine glatte Zahl (z. B. UTC+3) und „verlässlich“. Das Kontomodell ist „hedging“. Im MT5-Journal erscheint keine neue Zeile „authorized on …“, der Bot-Log zeigt keinen Verbindungsabbruch.
  - 📝 VPS 01.10.2026: Deal #231139614 16:34:13 = MT5, UTC+3 verlässlich, Hedging, kein Login im Journal

## 15. BKT – Backtest (Musterlösungen, Nachbau, Rechner)

- [x] **BKT-01** Musterlösungen des Python-Bots — 🧪 unit ✅ 2026-10-02
  - 17 Szenarien (worker_python/tests/parity/scenarios, erzeugt von make_scenarios.py: Grid BUY/SELL/BOTH, eigener SELL-Abstand, SL, Höchstzahl Positionen, Ausbruch, step_by_loss, Rauschen, Zonen-Ausstieg mit Löschen/Schließen/Mum Kapanışı, Sofort-Einstieg mit 30-s-Bremse, Fraktal-Ausbruch/-Dönüş mit Puffer-, Gegenfraktal-, ATR- und SAR-SL, zwei Orders je Richtung, TP als Geldbetrag) werden mit dem echten Bot (manage_dynamic_grid) gegen einen FakeMT5 mit simulierter Uhr abgespielt: je Tick erst der Markt (Füllungen, TP/SL), dann ein Bot-Durchlauf. Die Ereignisfolge (place, market, cancel, modify, sltp, close, fill, exit, active; ohne Ticketnummern) ist als Musterlösung gespeichert (tests/parity/golden) und muss gleich bleiben; der Bot-Nachbau im Browser (Schritt 7) wird daran gemessen. Kerzen jedes Zeitrahmens entstehen nur aus Historie und bisherigen Ticks. Die Uhr des Bots (30-s-Bremse, Tick-Frische, Order-Zeitpunkte) läuft über src/core/clock.py, live unverändert die echte Uhr. pyround.json hält Pythons round() für Grenzfälle fest. Bewusste Änderung der Bot-Logik: pytest tests/unit/test_parity_golden.py --update-golden (hooks/RULES.md §4.7).
  - **Prüfung:** In worker_python `.venv/bin/python -m pytest tests/unit/test_parity_golden.py -q` ausführen.
  - **Erwartet:** Alle Szenarien gleichen ihrer Musterlösung; zweimal abgespielt ergibt dieselbe Folge.
- [x] **BKT-09** Zukunftsdaten-Test — 🧪 unit ✅ 2026-10-02
  - Für jedes Szenario werden ab einem Tick k (nach einem und nach zwei Dritteln) alle späteren Kurse verändert. Alle Ereignisse vor k müssen gleich bleiben (docs/analyse-regeln.md §5 „kein Blick in die Zukunft“); danach muss sich etwas ändern, sonst prüft der Test nichts.
  - **Prüfung:** In worker_python `.venv/bin/python -m pytest tests/unit/test_parity_golden.py -q -k spaetere` ausführen.
  - **Erwartet:** Grün für alle Szenarien.
