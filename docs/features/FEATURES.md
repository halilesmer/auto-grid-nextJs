# Auto Grid – Funktions-Checkliste

> Automatisch erzeugt aus [`features.yaml`](features.yaml) – **nicht von Hand bearbeiten**.
> Aktualisieren: `scripts/features/run.sh` (oder in Claude Code `/feature-test`).
> Manuelles Ergebnis eintragen: `scripts/features/run.sh sign ENG-13 bestanden`.

**Stand:** 2026-09-25 · **81/88** abgehakt · ❌ 0 mit Fehlern · 🐞 0 bekannte Fehler

Legende: 🧪 unit · 🔌 api · 🖥️ e2e (gemockt) · 🌐 live (DEMO-Konto) · 👤 manuell — ✅ bestanden · ❌ fehlgeschlagen · 🐞 bekannter Fehler (xfail) · ⏭️ übersprungen · ⏳ noch kein Ergebnis

Häkchen = kein Fehler, mindestens ein bestandener Test bzw. manuelle Freigabe, und bei 👤 eine Freigabe. *(teilweise)* = es fehlen noch Ergebnisse auf anderen Ebenen.

## Testreihenfolge

| # | Kategorie | Stand |
|---|---|---|
| 1 | **SYS** – Verbindung & Infrastruktur | 5/6 |
| 2 | **ACC** – Konten | 9/9 |
| 3 | **SET** – Allgemeine Einstellungen | 6/6 |
| 4 | **SYM** – Symbole | 3/3 |
| 5 | **ZON** – Zonen-Konfiguration (UI ↔ Backend) | 11/11 |
| 6 | **BOT** – Bot-Steuerung | 6/7 |
| 7 | **ENG** – Grid-Engine (Handelslogik) | 16/16 |
| 8 | **MET** – Live-Daten & Diagramm | 4/4 |
| 9 | **LOG** – Logs | 6/6 |
| 10 | **UPD** – System & Updates | 5/6 |
| 11 | **VPS** – VPS-Fernsteuerung vom Mac | 3/7 |
| 12 | **UI** – Oberfläche | 7/7 |

## 1. SYS – Verbindung & Infrastruktur

- [x] **SYS-01** Worker erreichbar (REST über ngrok) — 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Das Frontend erreicht den Worker über NEXT_PUBLIC_API_URL + /api; axios sendet den ngrok-skip-browser-warning-Header.
  - **Prüfung:** Worker auf dem VPS starten (start.bat), Frontend lokal starten (npm run dev:frontend). → http://localhost:3000 öffnen.
  - **Erwartet:** Kontoliste lädt, im Log-Bereich steht der Worker als online.
  - 📝 Claude im App-Browser: /api/accounts 200 über ngrok, DEMO-Konto 7942034 im Dropdown, 'Worker online'
- [x] **SYS-02** WebSocket-Stream + Reconnect — 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Verbindung zu /ws/stream; Nachrichten METRICS, LIVE_DATA, LOG werden in die Stores geleitet; bei Abbruch automatischer Reconnect.
  - **Prüfung:** Dashboard öffnen, DevTools → Network → WS prüfen. → Worker kurz neu starten.
  - **Erwartet:** WS verbindet sich, nach dem Neustart verbindet er sich von selbst wieder.
  - 📝 Claude im App-Browser: WS offen nach ~0,1 s, 1 Nachricht/s; nach Worker-Neustart 4 Fehlversuche mit Backoff 2/4/8/16 s, dann verbunden (~60 s). Inhalt fehlerhaft → siehe MET-03
- [x] **SYS-03** Plattform-Erkennung — 🔌 api ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /system/platform meldet, ob der Worker unter Windows läuft (auch als einfacher Health-Check, siehe docs/NGrok).
  - **Prüfung:** GET /api/system/platform (mit X-API-Key) über ngrok aufrufen.
  - **Erwartet:** Antwort {"platform": "win32", "is_windows": true}.
  - 📝 Claude: /system/platform → 200 {is_windows: true, platform: win32}; 'Mac Test Mode'-Leiste nicht sichtbar
- [x] **SYS-04** MT5-Terminal-Scanner — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /system/scan-mt5 sucht terminal64.exe auf dem VPS; der Konto-Dialog bietet die Pfade zur Auswahl an (Rescan, eigener Pfad).
  - **Prüfung:** „Neues Konto“ öffnen, Feld MT5-Pfad ansehen, „Rescan“ klicken. → Checkbox „eigener Pfad“ aktivieren.
  - **Erwartet:** Installierte Terminals erscheinen in der Liste; mit „eigener Pfad“ erscheint ein Textfeld.
  - 📝 Claude: /system/scan-mt5 → 200 in 83 ms, 1 Terminal (Pfad = Testkonto); Dialog lädt Pfad beim Öffnen, Rescan fragt erneut ab, 'Manuel Gir' ersetzt Auswahl durch Textfeld; Dialog ohne Speichern geschlossen
- [x] **SYS-05** API-Schlüssel (WORKER_API_KEY) — 🔌 api ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24
  - Ist WORKER_API_KEY auf dem VPS gesetzt, braucht jede /api/*-Anfrage den Header X-API-Key und /ws/stream den Query-Parameter api_key; das Frontend sendet NEXT_PUBLIC_WORKER_API_KEY mit. Ohne Variable bleibt der Worker offen (mit Warnung beim Start).
  - **Prüfung:** WORKER_API_KEY auf dem VPS setzen, Worker neu starten. → Dashboard mit passendem NEXT_PUBLIC_WORKER_API_KEY öffnen; danach die ngrok-URL /api/accounts direkt im Browser aufrufen.
  - **Erwartet:** Dashboard funktioniert normal; der direkte Aufruf ohne Schlüssel liefert 401.
- [ ] **SYS-06** MT5-Verbindung (Kaltstart, Zeitbudget, Python-Integration) — 🧪 unit ✅ 2026-09-25 · 👤 manuell ⏳
  - Worker (/start, Symbolabfrage) und bot_runner verbinden sich über connect_to_mt5_with_timeout. Das Timeout ist ein Gesamtbudget (Warten auf die MT5-Sperre, initialize-Versuche, Neustart eines hängenden Terminals); danach wird nicht weiter versucht, /start antwortet also nach rund 120 s (+ Login). Bei IPC-Fehlern wird nur ein terminal64.exe desselben Pfads beendet, das älter als 180 s ist; ein startendes Terminal wird abgewartet. Die kurze Symbolabfrage (15 s) beendet nie ein Terminal. -10004 bei initialize heißt „keine IPC-Verbindung“, nicht „falsches Passwort“. Vor initialize wird der Python-Kanal des Terminals geprüft (named pipe MT5.Terminal.<SHA-256 des Pfads>). Ist das Terminal älter als 30 s und hat keinen Kanal, ist in MT5 unter Optionen → Community „Python integration“ abgewählt; dann kommt sofort eine klare Meldung statt 60 s Warten pro Versuch, und kein Terminal wird beendet. Ist der Kanal eines anderen Terminals offen, wird wie bisher verbunden.
  - **Prüfung:** Auf der Seite „VPS“ den VPS neu starten, MT5 nicht von Hand öffnen. → Sobald der Worker erreichbar ist, Konto wählen, eine Zone öffnen (Symbolliste) und sofort „Start Bot“ klicken. → Nur DEMO, Bot vorher stoppen: Per RDP in MT5 Extras → Optionen → Community „Python-Integration“ abwählen, MT5 beenden und neu starten, „Start Bot“ klicken. Danach den Haken wieder setzen und MT5 neu starten.
  - **Erwartet:** /start antwortet nach spätestens ~2–3 min (Erfolg oder klare Fehlermeldung). Das Worker-Log zeigt „henüz açılıyor, öldürülmüyor“ statt „Öldürülüyor“ für ein Terminal, das jünger als 180 s ist. Scheitert der erste Start am langsamen Kaltstart, verbindet ein zweiter Start mit demselben Terminal. Ohne Python-Integration scheitert „Start Bot“ nach wenigen Sekunden mit der Meldung „… 'Python integration' kutusunu işaretleyin …“; mit Haken verbindet er in Sekunden.

## 2. ACC – Konten

- [x] **ACC-01** Kontoliste laden — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /accounts liefert alle Konten aus configs/accounts.json; das Dropdown zeigt sie an und schreibt sie in useAccountStore.
  - **Prüfung:** Dashboard öffnen, Dropdown „Select Account“ aufklappen.
  - **Erwartet:** Alle registrierten Konten erscheinen (inkl. DEMO-Testkonto).
  - 📝 Claude: /accounts → 1 Konto (7942034, DEMO, Eightcap-Demo), Dropdown zeigt genau dieses
- [x] **ACC-02** Konto anlegen + Validierung — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25
  - Dialog „New MT5 Account“; Pflichtfelder Name, Login, Passwort, Server, MT5-Pfad; Notizen max. 1000 Zeichen; POST /accounts.
  - **Prüfung:** „Add new account“ klicken, leer absenden. → (Nur mit einem Wegwerf-Konto!) Alle Felder ausfüllen und speichern.
  - **Erwartet:** Leeres Formular zeigt Pflichtfeld-Fehler; gültiges Konto erscheint danach im Dropdown.
- [x] **ACC-03** Doppelter Login — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25
  - Gleicher Login wie ein bestehendes Konto → Rückfrage „bestehendes Konto bearbeiten?“; der Worker antwortet mit 409 (RFC-7807-Problem).
  - **Prüfung:** Neues Konto mit dem Login eines vorhandenen Kontos anlegen.
  - **Erwartet:** Browser-Rückfrage erscheint; es entsteht kein zweites Konto.
- [x] **ACC-04** Konto bearbeiten — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25
  - PUT /accounts/{id}; gesperrt, solange der Bot läuft.
  - **Prüfung:** Konto wählen, „Edit account“, Notiz ändern, speichern.
  - **Erwartet:** Änderung bleibt nach Neuladen erhalten; bei laufendem Bot ist der Button deaktiviert.
- [x] **ACC-05** Konto löschen — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25
  - DELETE /accounts/{id} nach Bestätigung („Delete Account“); gesperrt, solange der Bot läuft.
  - **Prüfung:** (Nur Wegwerf-Konto!) „Delete account“ → bestätigen.
  - **Erwartet:** Konto verschwindet aus dem Dropdown; bei laufendem Bot ist der Button deaktiviert.
- [x] **ACC-06** Kontoauswahl lädt Einstellungen — 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Auswahl im Dropdown lädt GET /settings/{id} in useSettingsStore; ohne Konto erscheint der Leerzustand „No account selected“.
  - **Prüfung:** Seite ohne Auswahl öffnen, dann das DEMO-Konto wählen.
  - **Erwartet:** Zuerst Leerzustand, danach erscheinen Zonen und allgemeine Einstellungen des Kontos.
  - 📝 Claude: ohne Auswahl Leerzustand; nach Auswahl /settings/7942034 geladen, UI = API (1 Zone USOUSD BOTH 20–200, Step 0.1, Lot 0.01, TP 0.1, SL 0; Intervall 1 s)
- [x] **ACC-07** LIVE/TEST-Kennzeichnung — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Badge im Header und im Dropdown aus env_type (DEMO/LIVE) des Kontos.
  - **Prüfung:** DEMO-Konto wählen.
  - **Erwartet:** Badge zeigt TEST/DEMO, nicht LIVE.
  - 📝 Claude: Header-Badge TEST, Badge neben Dropdown DEMO (env_type DEMO). Hinweis: ohne Kontoauswahl zeigt der Header ebenfalls TEST
- [x] **ACC-08** LIVE/DEMO-Sicherheitsprüfung — 🧪 unit ✅ 2026-09-25
  - Ein als LIVE markiertes Konto darf nur mit einem echten, ein DEMO-Konto nur mit einem Demo-Server verbinden – sonst wird die Verbindung verweigert.
  - **Prüfung:** Nicht manuell testen (würde ein falsch markiertes Konto erfordern).
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ACC-09** Passwort nie in API-Antworten — 🔌 api ✅ 2026-09-25
  - Der Worker gibt MT5-Passwörter in keiner Antwort zurück (Liste, Anlegen, Bearbeiten, 409-Problem), sondern nur has_password. Leeres Passwort beim Bearbeiten = unverändert.
  - **Prüfung:** DevTools → Network → Antwort von /api/accounts ansehen. → Konto bearbeiten, Passwortfeld leer lassen, speichern.
  - **Erwartet:** Kein Feld „password“ in der Antwort; das Konto verbindet sich danach weiterhin (Passwort unverändert).

## 3. SET – Allgemeine Einstellungen

- [x] **SET-01** Einstellungen laden — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /settings/{id} liest configs/settings_{id}*.json (verschachteltes „settings“ wird ausgepackt).
  - **Prüfung:** Konto wählen.
  - **Erwartet:** Zonen und Kontroll-Intervall entsprechen der Datei auf dem VPS.
  - 📝 Claude: GET /settings/7942034 → flache Datei settings_7942034.json (LOOP_INTERVAL_SECONDS, ZONES); UI zeigt alle Werte korrekt (siehe ACC-06)
- [x] **SET-02** Kontroll-Intervall (LOOP_INTERVAL_SECONDS) — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Stepper „Kontrol Sıklığı“ 1–60 s in 0,1er-Schritten; „Kaydet“ ist nur bei Änderung aktiv.
  - **Prüfung:** Mit −/+ den Wert ändern, 0 und 61 eintippen, speichern, neu laden.
  - **Erwartet:** Werte außerhalb 1–60 werden begrenzt; gespeicherter Wert bleibt nach Neuladen.
  - 📝 Claude: + → 1,1 und Kaydet aktiv; 61 → 60, 0 → 1 begrenzt; gespeichert → API 1,1, bleibt nach Neuladen; per − zurück auf 1 gespeichert
- [x] **SET-03** „Alle speichern“ + Dirty-Tracking — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Bei ungespeicherten Änderungen erscheint die schwebende Leiste „Kaydedilmemiş değişiklikler var“; „Tüm Ayarları Kaydet“ speichert alles (is_active wird beim Vergleich ignoriert).
  - **Prüfung:** Ein Zonenfeld ändern → Leiste prüfen → „Kaydet“.
  - **Erwartet:** Leiste erscheint, Button zeigt „Kaydediliyor…“ → „Kaydedildi“, Leiste verschwindet.
  - 📝 Claude: Max Fiyat 200 → 201 → schwebende Leiste + Badge 'Kaydedilmedi'; 'Kaydet' in der Leiste → API 201, Leiste weg; zurück auf 200 über 'Tüm Ayarları Kaydet' → API 200, 'Kaydedildi'
- [x] **SET-04** Werte bereinigen (Sanitizing) — 🧪 unit ✅ 2026-09-25 · 🔌 api ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Der Worker rundet Gleitkommazahlen beim Speichern (sanitize_settings).
  - **Prüfung:** Lot 0.0100000001 eingeben und speichern.
  - **Erwartet:** Gespeichert wird 0.01.
  - 📝 Claude: POST LOOP_INTERVAL_SECONDS 1.00000001 → gespeichert als 1.0
- [x] **SET-05** Einstellungen zusammenführen (Merge) — 🔌 api ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - POST /settings/{id} führt die neuen Werte mit der bestehenden Datei zusammen, statt sie zu überschreiben.
  - **Prüfung:** Nur das Intervall speichern.
  - **Erwartet:** Zonen bleiben unverändert.
  - 📝 Claude: POST nur mit LOOP_INTERVAL_SECONDS → ZONES unverändert; Gesamteinstellungen danach identisch mit Sicherung
- [x] **SET-06** Standardwerte (neue Datei, fehlende Zonenfelder) — 🧪 unit ✅ 2026-09-25
  - Eine neue Einstellungsdatei enthält nur LOOP_INTERVAL_SECONDS und ZONES. Fehlt einer Zone ein Feld, nimmt die Engine dieselben Standardwerte wie eine neue Zone im UI (defaultZone). Die früheren GLOBAL_*-Schlüssel wurden nie gelesen und sind entfernt.
  - **Prüfung:** Nicht manuell testbar.
  - **Erwartet:** Engine- und UI-Standardwerte stimmen überein; keine ungenutzten Schlüssel in neuen Dateien.

## 4. SYM – Symbole

- [x] **SYM-01** Symbolliste + Cache *(teilweise)* — 🧪 unit ✅ 2026-09-25 · 🔌 api ⏳ · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - GET /symbols/{id} liefert Broker-Symbole aus broker_symbols.json; 1-h-Cache, bei Ablauf wird die alte Liste geliefert und im Hintergrund aktualisiert (doppelte Anfragen werden zusammengelegt). Solange /start oder /stop für das Konto läuft, verbindet sich die Abfrage nicht selbst mit MT5 (alte Liste bzw. leer); /start füllt den Cache.
  - **Prüfung:** Zone öffnen, ins Symbolfeld klicken.
  - **Erwartet:** Symbolliste des Brokers erscheint schnell (auch bei wiederholtem Öffnen).
  - 📝 Claude: /symbols/7942034 → 200, 812 Symbole mit Details (USOUSD: digits 3, point 0.001, Volumen 0.01–50); 2. Abruf 72 ms statt 168 ms (Cache). 1-h-Ablauf/Hintergrund-Refresh nicht live prüfbar → Unit-Test
- [x] **SYM-02** Symbol-Autocomplete — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Feld „Sembol Ara…“ filtert die Symbolliste beim Tippen.
  - **Prüfung:** „XAU“ tippen und einen Vorschlag wählen.
  - **Erwartet:** Nur passende Symbole erscheinen; Auswahl übernimmt das Symbol.
  - 📝 Claude: 'XAU' → 5 Vorschläge mit Beschreibung; 'gold' findet auch über Beschreibung; 'ZZQQ' → 'Sembol bulunamadı'; nichts ausgewählt, per Neuladen verworfen
- [x] **SYM-03** Symboldetails — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Zu einem Symbol werden Details (Digits, Point, Volumen-Grenzen) geladen; daraus leiten die Zonenfelder Schrittweite, Minimum und Rundung ab, und unbekannte Symbole werden als „Geçersiz Sembol!“ markiert.
  - **Prüfung:** Symbol wählen, Schrittweite der Preis- und Lotfelder prüfen (Pfeiltasten / DevTools). → Ein unbekanntes Symbol eintippen (nicht speichern).
  - **Erwartet:** Preisfelder in Schritten von point (z. B. 0,001 bei 3 Digits), Lot mit volume_min/volume_step; unbekanntes Symbol zeigt „Geçersiz Sembol!“.
  - 📝 Claude: USOUSD → Preisfelder step/min 0.001, Lot min/step 0.01; unbekanntes Symbol → 'Geçersiz Sembol!'; nach Neuladen wieder USOUSD, API unverändert

## 5. ZON – Zonen-Konfiguration (UI ↔ Backend)

- [x] **ZON-01** Zone hinzufügen — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - „Bölge Ekle“ fügt eine neue Zone mit Standardwerten hinzu; die Anzahl im Badge steigt.
  - **Prüfung:** „Bölge Ekle“ klicken, speichern, neu laden.
  - **Erwartet:** Neue Zone bleibt nach dem Neuladen erhalten.
  - 📝 Claude: 'Bölge Ekle' → Zähler 2, neue Zone inaktiv (is_active false, Symbol der letzten Zone); gespeichert → API 2 Zonen, bleibt nach Neuladen
- [x] **ZON-02** Zone löschen — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Menü „…“ → „Bölgeyi Sil“ → Bestätigung „Bölge Sil“.
  - **Prüfung:** Test-Zone löschen und bestätigen, speichern.
  - **Erwartet:** Zone ist weg, auch nach Neuladen.
  - 📝 Claude: Menü '…' → 'Bölgeyi Sil' → Dialog 'Bölge Sil' → Delete → Zähler 1, Leiste 'ungespeichert'; nach 'Tüm Ayarları Kaydet' API = Sicherung
- [x] **ZON-03** Basisfelder (Symbol, Emir Tipi, Min/Max Fiyat) — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Symbol, Ordertyp BUY/SELL/BOTH und Preisbereich der Zone.
  - **Prüfung:** Jedes Feld ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten; Ordertyp-Badge im Kopf passt.
  - 📝 Claude (Test-Zone): Symbol per Autocomplete XAUUSD, Emir Tipi BOTH, Min/Max 500/600 → nach Neuladen in API und UI
- [x] **ZON-04** Grid-Felder (Grid Adımı, Lot, Kar Al, Zarar Durdur) — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Gridabstand, Lotgröße, Take Profit, Stop Loss der Zone.
  - **Prüfung:** Jedes Feld ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten.
  - 📝 Claude (Test-Zone): Grid 0.2, Lot 0.02, KA 0.3, ZD 1 → nach Neuladen in API und UI
- [x] **ZON-05** SELL-Felder + BUY/SELL-Sync — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Bei Ordertyp BOTH eigene SELL-Werte (SELL Grid/Lot/KA/ZD) oder Schalter „BUY ve SELL için aynı ayarları uygula“.
  - **Prüfung:** Ordertyp BOTH wählen, Sync aus → SELL-Felder ändern; Sync an.
  - **Erwartet:** SELL-Felder erscheinen nur bei BOTH und Sync aus; Werte bleiben nach Speichern erhalten.
  - 📝 Claude (Test-Zone): BOTH + Sync aus → SELL-Felder (und SELL-Pullback) erscheinen; SELL 0.4/0.03/0.6/2 und sync_buy_sell=false gespeichert
- [x] **ZON-06** Breakout-Felder — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Schalter „Sadece trend yönünde“, Pullback-Abstände, Alt/Üst Seviyeler (levels_below/above), Maks Pozisyon.
  - **Prüfung:** Breakout einschalten, Felder ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten.
  - 📝 Claude (Test-Zone): Breakout an, Pullback 0.7/SELL 0.9, Alt 3, Üst 4, Maks 2 → nach Neuladen in API und UI
- [x] **ZON-07** Exit-Felder (Bereinigen beim Verlassen) — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Schalter „Fiyat bölgeden çıkınca temizle“; dann Çıkış Yönü, Hedef Taraf, Temizleme Kapsamı, Çıkış Tetikleyici und bei „Mum Kapanışı“ zusätzlich Zaman Dilimi.
  - **Prüfung:** Schalter an → Auswahlfelder prüfen; Auslöser „Mum Kapanışı“ wählen.
  - **Erwartet:** Die vier Auswahlfelder erscheinen erst mit dem Schalter; Zeitrahmen nur bei Kerzenschluss.
  - 📝 Claude (Test-Zone): Schalter aus → 4 Auswahlfelder weg, an → wieder da; BUY (Yukarı)/Hepsi/Tüm İşlemler; 'Mum Kapanışı' blendet Zaman Dilimi (M1–D1) ein, H1 gespeichert
- [x] **ZON-08** Start/Pause pro Zone — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24
  - Button im Zonenkopf (Başladı / Başla / Hazır / Kapalı) setzt is_active (POST /settings) und START/PAUSE in ui_state (POST /ui-state); Warnung bei ungültigem Symbol oder ungespeicherter Zone.
  - **Prüfung:** Test-Zone starten und wieder pausieren. → Neue, ungespeicherte Zone starten.
  - **Erwartet:** Label wechselt passend; ungespeicherte Zone zeigt eine Warnung.
- [x] **ZON-09** „Kaydedilmedi“-Badge — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Zonen mit ungespeicherten Änderungen tragen den Badge „Kaydedilmedi“.
  - **Prüfung:** Ein Feld ändern, dann speichern.
  - **Erwartet:** Badge erscheint nach der Änderung und verschwindet nach dem Speichern.
  - 📝 Claude: Badge 'Kaydedilmedi' nur an der geänderten Zone, verschwindet nach Speichern (auch bei SET-03 gesehen)
- [x] **ZON-10** Zahlenfelder leerbar — 🖥️ e2e ✅ 2026-09-25
  - Zahlenfelder der Zone (Preis, Grid, Lot, KA/ZD, Pullback, Seviyeler) halten einen lokalen Text-Entwurf; die letzte Ziffer lässt sich löschen, erst beim Verlassen des Feldes erscheint wieder der echte Wert.
  - **Prüfung:** Ein Zahlenfeld mit Rücktaste komplett leeren, dann neu tippen (z. B. 0.05) und das Feld verlassen.
  - **Erwartet:** Feld bleibt beim Löschen leer, Zwischenstände wie „0.“ bleiben erhalten, nach dem Verlassen steht der gespeicherte Wert (leer → 0).
- [x] **ZON-11** Einzelne Zone speichern — 🖥️ e2e ✅ 2026-09-25
  - Jede Zonenkarte hat einen eigenen „Kaydet“-Button, der nur diese Zone im Worker ersetzt (neue Zone wird angehängt). Andere Zonen und Einstellungen mit ungespeicherten Änderungen bleiben ungespeichert; „Tüm Ayarları Kaydet“ (neben „Bölge Ekle“) speichert weiterhin alles.
  - **Prüfung:** Zone 1 ändern, Zone hinzufügen, nur bei der neuen Zone „Kaydet“ klicken. → Danach bei Zone 1 „Kaydet“ klicken.
  - **Erwartet:** Nach dem ersten Klick liegt die neue Zone im Worker, Zone 1 trägt weiter „Kaydedilmedi“ und „Tüm Ayarları Kaydet“ bleibt aktiv; nach dem zweiten Klick sind Badge und Dirty-Zustand weg.

## 6. BOT – Bot-Steuerung

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
- [x] **BOT-03** Neustart veralteter/hängender Bot — 🧪 unit ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Läuft ein Bot mit alter VERSION oder ohne frische Metriken (> 180 s), startet /start ihn neu; beim Worker-Start übernimmt startup_maintenance laufende Bots.
  - **Prüfung:** Nach einem Update „Restart Bot“ klicken.
  - **Erwartet:** Bot läuft danach mit der neuen Version (PID-Datei enthält neue VERSION).
  - 📝 Live: nach Worker-Neustart meldet der Worker '[AUTO] Bot eski bir kod sürümüyle çalışıyor; yeni sürümle yeniden başlatılıyor' und startet ihn neu (21:24 und 22:48, Positionen unverändert)
- [x] **BOT-04** Statusanzeige + Alarme — 🖥️ e2e ✅ 2026-09-25
  - Anzeige Connecting / Running / „process without MT5“ / Stopped, Marktstatus, Kontoname/Server; Alarme für API-Fehler, MT5-Verbindung, abgelehnte Order, Algo Trading aus.
  - **Prüfung:** In MT5 „Algo Trading“ ausschalten, während der Bot läuft.
  - **Erwartet:** Alarm „Algo Trading off“ erscheint; nach Einschalten verschwindet er.
- [x] **BOT-05** Watchdog-Neustart — 🧪 unit ✅ 2026-09-25
  - Alle 15 s Prüfung; abgestürzter oder hängender Bot (600 s ohne Metriken) wird mit Backoff 15/30/60/120/240 s neu gestartet.
  - **Prüfung:** Auf dem VPS den bot_runner-Prozess im Task-Manager beenden.
  - **Erwartet:** Nach ≤ 30 s läuft der Bot wieder (Robot-Log zeigt Neustart).
- [x] **BOT-06** Watchdog gibt auf — 🧪 unit ✅ 2026-09-25
  - Nach 5 Neustarts in 30 min hört der Watchdog auf; gelöschte Konten werden nicht mehr beobachtet.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **BOT-07** Bots nach Worker-/VPS-Neustart fortsetzen — 🧪 unit ✅ 2026-09-25 · 👤 manuell ⏳
  - Die Watchdog-Liste (Start ohne Stop) steht zusätzlich in data/watched_bots.json. Beim Worker-Start liest main.py sie ein; startup_maintenance startet jeden dort eingetragenen, nicht laufenden Bot neu (auch LIVE) und stellt ihn unter Watchdog, auch wenn der erste Start scheitert. Gestoppte Bots, gelöschte Konten und Bots, bei denen der Watchdog aufgegeben hat, fehlen in der Liste.
  - **Prüfung:** DEMO-Bot starten, dann auf der Seite „VPS“ → „VPS neu starten“.
  - **Erwartet:** Nach dem Reboot läuft der Bot wieder; das Robot-Log zeigt „[AUTO] Bot … devam ettirildi“.

## 7. ENG – Grid-Engine (Handelslogik)

- [x] **ENG-01** Zonenwahl — 🧪 unit ✅ 2026-09-25
  - Pro Symbol ist höchstens eine Zone aktiv – die erste aktive Zone dieses Symbols, deren Mittelkurs (oder Schlusskurs der letzten Kerze bei „Mum Kapanışı“, Zeitrahmen exit_timeframe) in [min_price, max_price] liegt. Zonen mit verschiedenen Symbolen (z. B. USOUSD + XAUUSD) laufen gleichzeitig.
  - **Prüfung:** Zwei Zonen mit verschiedenen Bereichen anlegen, Bot laufen lassen. → Eine zweite Zone mit anderem Symbol anlegen und starten.
  - **Erwartet:** Beim gleichen Symbol entstehen Orders nur in der Zone, in der der Preis liegt; eine Zone mit anderem Symbol bekommt zusätzlich eigene Orders.
- [x] **ENG-02** Sliding-Grid-Level — 🧪 unit ✅ 2026-09-25
  - Level werden an round(mid/step)*step verankert, levels_below/levels_above Stufen, auf die Zone begrenzt; acceptable-Sets mit ±2 Stufen Puffer.
  - **Prüfung:** Bot laufen lassen, Pending Orders in MT5 ansehen.
  - **Erwartet:** Orders liegen im Gridabstand um den Preis, nie außerhalb der Zone.
- [x] **ENG-03** Breakout / Pullback — 🧪 unit ✅ 2026-09-25
  - Im Breakout-Modus nur Orders in Trendrichtung, mit pullback_distance / sell_pullback_distance.
  - **Prüfung:** Breakout-Zone aktivieren, Orders ansehen.
  - **Erwartet:** Orders nur in Trendrichtung und im Pullback-Abstand.
- [x] **ENG-04** Zonen-Config lesen + Lot begrenzen — 🧪 unit ✅ 2026-09-25
  - extract_zone_config liest order_type, grid_step, lot_size (auf 0,01–5,0 begrenzt), TP/SL, Symbol, sync_buy_sell, sell_*-Overrides, max_positions, is_active.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-05** Order-Platzierung LIMIT/STOP + TP/SL *(teilweise)* — 🧪 unit ✅ 2026-09-25 · 🌐 live ⏭️ 2026-09-24
  - Fehlende Level bekommen Pending Orders mit TP/SL; LIMIT oder STOP je nach Seite des Marktes; Toleranz 0,45 × Gridabstand; manuelle Positionen zählen als belegte Level.
  - **Prüfung:** Test-Zone (0,01 Lot) um den aktuellen Preis starten.
  - **Erwartet:** BUY LIMIT unter / BUY STOP über dem Preis (bzw. SELL umgekehrt), jeweils mit TP/SL.
- [x] **ENG-06** Validierung + Bereinigung — 🧪 unit ✅ 2026-09-25
  - Orders außerhalb des Fensters oder mit falschem Lot/TP/SL werden gelöscht (erwartetes Lot berücksichtigt Teilausführungen).
  - **Prüfung:** Bei laufendem Bot TP der Zone ändern und speichern.
  - **Erwartet:** Alte Orders werden gelöscht und mit neuem TP neu gesetzt.
- [x] **ENG-07** Maximale Positionen *(teilweise)* — 🧪 unit ✅ 2026-09-25 · 🌐 live ⏳
  - Ist max_positions erreicht, werden die Pending Orders der Zone gelöscht; die Warnung erscheint einmal (erneut nur, wenn sich die Zahl ändert), nicht bei jedem Tick. Auch der Restlot-Nachschub (ENG-08) setzt dann nichts.
  - **Prüfung:** Maks Pozisyon = 1 setzen und eine Position füllen lassen.
  - **Erwartet:** Danach keine Pending Orders mehr in dieser Zone.
- [x] **ENG-08** Teilausführung + TP/SL-Resync — 🧪 unit ✅ 2026-09-25
  - Geänderte TP/SL-Werte werden auf offene Positionen übertragen; liegt der neue TP/SL schon auf der falschen Seite des Kurses (MT5 würde mit 10016 ablehnen), wartet der Bot mit einer einmaligen Meldung und setzt ihn, sobald der Kurs es zulässt. Bei Teilausführung wird das Restlot neu gesendet, gemessen am Volumen der eröffnenden Order (history_orders_get), nicht am Lot in den Einstellungen; ein später erhöhtes Lot löst also keinen Nachschub aus. Am Positionslimit (ENG-07) kein Nachschub.
  - **Prüfung:** Bei offener Position den TP der Zone ändern und speichern. → Nur DEMO: bei offenen 0,01-Positionen das Lot der Zone auf 0,02 erhöhen und speichern.
  - **Erwartet:** TP der offenen Position wird angepasst (liegt er schon hinter dem Kurs, steht einmal „TP/SL Bekliyor“ im Log). Nach der Lot-Erhöhung keine „Kısmi Dolum“-Meldungen und keine Orders auf den Leveln der offenen Positionen; neue Grid-Orders haben 0,02.
- [x] **ENG-09** Zombie-Orders entfernen — 🧪 unit ✅ 2026-09-25
  - Orders pausierter, bereinigter, inaktiver Zonen oder mit falschem Symbol werden gelöscht.
  - **Prüfung:** Zone mit offenen Orders pausieren.
  - **Erwartet:** Ihre Pending Orders verschwinden.
- [x] **ENG-10** Bereinigung beim Verlassen der Zone *(teilweise)* — 🧪 unit ✅ 2026-09-25 · 🌐 live ⏭️ 2026-09-24
  - Mit clear_on_exit: Richtung (clear_exit_side), Umfang („Sadece Bekleyen Emirler“ oder „Tüm İşlemler“ = auch Positionen schließen) und Zielseite (BUY/SELL/alle). Danach steht die Zone auf AUTO_CLEAR: keine neuen Orders – auch nicht, wenn der Kurs zurückkommt – bis „Yeniden Başlat“ im Dashboard (oder Bot-Neustart).
  - **Prüfung:** Test-Zone knapp um den Preis legen, „temizle“ an, warten bis der Preis sie verlässt. → Warten, bis der Preis zurückkommt; dann „Yeniden Başlat“ in der Zone klicken.
  - **Erwartet:** Orders (bei „Tüm İşlemler“ auch Positionen) werden entfernt; die Zone zeigt „Otomatik temizlendi“ und setzt keine Orders mehr, bis „Yeniden Başlat“ geklickt wird.
- [x] **ENG-11** Auto-Pause nach 3 Ablehnungen — 🧪 unit ✅ 2026-09-25
  - Nach 3 abgelehnten Orders in Folge wird die Zone pausiert (ui_state PAUSE) und order_rejected_alarm gesetzt.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-12** Order-Sicherheit (Stops-Level, order_check, 10027) — 🧪 unit ✅ 2026-09-25
  - safe_send_order normalisiert Volumen, hält den Broker-Stops-Level ein (vermeidet 10016), prüft vorab mit order_check, erkennt 10027 (Algo Trading aus) und prüft, ob die Order wirklich existiert.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [x] **ENG-13** Fernsteuerung per MT5-Handy-App — 🧪 unit ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-24
  - Manuelle BUY LIMIT 0,01 Lot bei 1 $ = STOP, bei 2 $ = START; alternativ Kommentar GRID:STOP / GRID:START. STOP löscht alle Robot-Orders; die Signal-Order wird danach entfernt.
  - **Prüfung:** In der MT5-App eine BUY LIMIT 0,01 bei Preis 1 setzen. → Danach BUY LIMIT 0,01 bei Preis 2 setzen.
  - **Erwartet:** Erst werden alle Robot-Orders gelöscht (remote_paused), dann läuft der Bot weiter; die Signal-Orders verschwinden.
  - 📝 Nutzer per MT5-App: $1 Buy Limit → STOP (Robot-Orders gelöscht, Signal-Order entfernt), $2 Buy Limit → START; Robot-Log 15:14/15:18 bestätigt, danach remote_paused false, Bot läuft
- [x] **ENG-14** Zustand beim Start wiederherstellen — 🧪 unit ✅ 2026-09-25
  - Beim Bot-Start sind alle Zonen PAUSE; active_zones_state wird aus den Magic-Numbers der vorhandenen Orders/Positionen aufgebaut (data/state_<id>.json), alte ui_state-Datei gelöscht.
  - **Prüfung:** Bot mit offenen Orders stoppen und neu starten.
  - **Erwartet:** Vorhandene Orders werden übernommen, nicht doppelt gesetzt.
- [x] **ENG-15** Markt geschlossen + Reconnect — 🧪 unit ✅ 2026-09-25
  - Bei geschlossenem Markt (trade_mode ≠ 4 oder Tick älter als 180 s) wartet die Schleife 60 s; Verbindungsverlust → Reconnect mit exponentiellem Backoff; nur „Algo Trading aus“ → warten statt neu einloggen.
  - **Prüfung:** Am Wochenende Dashboard ansehen.
  - **Erwartet:** Markt wird als geschlossen angezeigt, keine neuen Orders.
- [x] **ENG-16** Aufräumen beim Beenden der Schleife — 🧪 unit ✅ 2026-09-25
  - Beim Verlassen der Hauptschleife werden alle Pending Orders des Robots gelöscht.
  - **Prüfung:** Nicht manuell testen (/stop beendet den Prozess hart).
  - **Erwartet:** Abgedeckt durch Unit-Tests.

## 8. MET – Live-Daten & Diagramm

- [x] **MET-01** Kennzahlenleiste — 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Vier Kacheln Preis, Floating P/L, Offene Positionen, Pending Orders mit animierten Ziffern.
  - **Prüfung:** Bot laufen lassen, Werte mit MT5 vergleichen.
  - **Erwartet:** Werte stimmen mit MT5 überein und aktualisieren sich.
  - 📝 Claude: Kacheln = Bot-Metriken (97,199 → $97.20, P/L −25,68, 14 Positionen, 5 Orders, Market open). Hinweis: Preis mit 2 statt 3 Nachkommastellen
- [x] **MET-02** Chart (10-s-Kerzen + RSI) — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - lightweight-charts baut 10-s-Kerzen aus WebSocket-METRICS, RSI auf eigener Skala; Farben folgen dem Theme.
  - **Prüfung:** /formasyon öffnen und 1 Minute warten.
  - **Erwartet:** Kerzen und RSI-Linie entstehen.
  - 📝 v0.7.59 live: /formasyon zeichnet Kerzen, Preis 97,109, P/L −25,16, 14 Positionen; RSI '--' im Fallback-Modus
- [x] **MET-03** WebSocket-Metriken des Workers — 🧪 unit ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - ws_server sendet jede Sekunde Preis, RSI, MACD, P/L, Positionen für das erste Konto / Zone 0.
  - **Prüfung:** DevTools → WS-Nachrichten ansehen.
  - **Erwartet:** Jede Sekunde eine METRICS-Nachricht mit Preis und RSI.
  - 📝 v0.7.59 live: WS sendet METRICS 1/s (symbol USOUSD, Preis, 14 Pos., 6 Orders). Ohne MT5-Verbindung im API-Prozess (nach Worker-Neustart) kommt der Fallback aus der Bot-Metrik → RSI fehlt dann
- [x] **MET-04** Bot-Telemetrie — 🧪 unit ✅ 2026-09-25
  - calculate_live_metrics exportiert P/L, Positions-/Orderzahl, Preis, Alarme (algo_trading_error, order_rejected_alarm, last_error, remote_paused, connection_lost), market_open und die Zonen-Zustände der Engine (zone_states) nach met_<id>.json.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.

## 9. LOG – Logs

- [x] **LOG-01** Log-Tabs laden — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 🌐 live ✅ 2026-09-24 · 👤 manuell ✅ 2026-09-23
  - Tabs Activity, Robot Logs, MT5 Terminal; GET /logs/{id}?log_type=all&lines=200; ohne laufenden Bot wird mt5_connected=false erzwungen.
  - **Prüfung:** Alle drei Tabs öffnen, „Refresh“.
  - **Erwartet:** Jeder Tab zeigt seine Logs.
  - 📝 Claude: Activity, Robot Logs (200 Zeilen), MT5 Terminal laden und wechseln korrekt; Inhalt: siehe LOG-05 (Fragmente) und LOG-06 (MT5-Tab leer)
- [x] **LOG-02** Logs löschen — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25
  - Activity wird nur lokal geleert; Robot/MT5 nach Rückfrage per DELETE /logs/{id}.
  - **Prüfung:** Im Tab Robot Logs „Clear“ → bestätigen.
  - **Erwartet:** Log ist leer, auch nach Refresh.
- [x] **LOG-03** Logs als ZIP herunterladen — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - GET /logs/download/{id} liefert ein ZIP mit Logs, State- und Settings-Datei.
  - **Prüfung:** „Download log file“ klicken, ZIP öffnen.
  - **Erwartet:** ZIP enthält Logs, state_<id>.json und settings-Datei.
  - 📝 Claude: 'Download log file' → gültiges ZIP (54 KB) MT5_Logs_and_Configs_7942034.zip mit err-Log, met/pid/symbols, 3 MT5-Terminal-Logs, state und settings; Download im Browser abgefangen, nichts gespeichert
- [x] **LOG-04** Worker-Status + Polling — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Anzeige Worker online/offline; Abfrage alle 10 s (beim Verbinden alle 2 s).
  - **Prüfung:** Worker auf dem VPS stoppen.
  - **Erwartet:** Status wechselt nach ≤ 10 s auf offline.
  - 📝 Claude: 'Worker online · updated' aktualisiert exakt alle 10 s (22:19:02/12/22/32)
- [x] **LOG-05** Robot-Log schreiben — 🧪 unit ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Der Bot-Prozess schreibt seine Meldungen (log_message) nach logs/<id>/err_<id>.log.
  - **Prüfung:** Tab „Robot Logs“ öffnen und die letzten Zeilen ansehen.
  - **Erwartet:** Jede Meldung genau einmal, keine abgeschnittenen Zeilen.
  - 📝 v0.7.59 live: seit Bot-Neustart 22:48:40 keine Fragmente, keine doppelten Zeilen (vorher 4 Fragmente in 200 Zeilen)
- [x] **LOG-06** MT5-Terminal-Log anzeigen — 🔌 api ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Der Tab „MT5 Terminal“ zeigt das Tages-Log des MT5-Terminals, das beim Verbinden nach logs/<id>/mt5_terminal/ kopiert wird.
  - **Prüfung:** Tab „MT5 Terminal“ öffnen.
  - **Erwartet:** Zeilen aus MT5_Terminal_<Datum>.log erscheinen.
  - 📝 v0.7.59 live: MT5-Tab liefert 400 Zeilen aus mt5_terminal/MT5_Terminal_<Datum>.log, UTF-16 korrekt dekodiert

## 10. UPD – System & Updates

- [x] **UPD-01** Update-Prüfung — 🔌 api ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - „System Info“ → „Check for Updates“; GET /system/update/check vergleicht Git-Hash und VERSION mit origin/main.
  - **Prüfung:** „Check for Updates“ klicken.
  - **Erwartet:** „You are up to date“ oder alte → neue Version.
  - 📝 Claude: 'Check for Updates' → 'You are up to date'; API: local v0.7.58 = remote v0.7.58. Hinweis: System Info zeigt Host/Port des Frontends (localhost:3000), nicht des Workers
- [x] **UPD-02** Update anwenden — 🧪 unit ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-24
  - „Apply Update (git pull)“ → POST /system/update (stash nur bei lokalen Änderungen, pull, stash pop), danach Seiten-Reload. Scheitert der Pull (z. B. Datei gesperrt oder ohne Schreibrecht), wird der Stand davor wiederhergestellt – keine halb aktualisierten Dateien, der Stash wird zurückgespielt.
  - **Prüfung:** Nach einem Merge auf main das Update im Dashboard anwenden (Zahnrad → Check for Updates → Apply Update).
  - **Erwartet:** VERSION auf dem VPS entspricht main; nach einem Fehler zeigt git status keine geänderten Dateien und git stash list keinen neuen Eintrag.
  - 📝 VPS per Dashboard-Update von v0.7.69 auf v0.7.70 (Worker meldet local_ver = remote_ver = v0.7.70). Erster Versuch scheiterte an Datei-Rechten in docs/features; nach takeown/icacls auf das Repo ok.
- [x] **UPD-03** System herunterfahren — 🖥️ e2e ✅ 2026-09-25
  - Power-Button → Bestätigung → /stop, danach window.close().
  - **Prüfung:** Power-Button → bestätigen.
  - **Erwartet:** Bot wird gestoppt, Fenster schließt (falls vom Browser erlaubt).
- [x] **UPD-05** Server-Neustart nach Update — 🧪 unit ✅ 2026-09-25 · 🔌 api ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-24
  - Nach einem erfolgreichen POST /system/update beendet sich der Worker nach 1,5 s (schedule_restart); run_uvicorn_watchdog.bat (setzt WORKER_SUPERVISED=1) startet ihn mit dem neuen Code neu. Ohne Watchdog kein Neustart. Das Dashboard wartet 8 s und lädt dann neu; veraltete Bots startet der neue Worker selbst neu (BOT-03).
  - **Prüfung:** Update im Dashboard anwenden (System Info → Check for Updates → Apply Update). → Im Fenster „Uvicorn API“ auf dem VPS den Neustart beobachten.
  - **Erwartet:** Worker startet nach wenigen Sekunden mit der neuen Version; das Dashboard lädt neu und ist wieder online.
  - 📝 Apply Update v0.7.70→v0.7.71 im Dashboard: Worker beendet sich, Watchdog startet neu, meldet v0.7.71; laufender Bot mit neuem Code neu gestartet
- [x] **UPD-06** Abhängigkeiten nach Update installieren — 🧪 unit ✅ 2026-09-25
  - Ändert ein Pull worker_python/requirements.txt, führt execute_git_pull danach pip install -r mit dem Python des Workers (.venv) aus. Schlägt pip fehl, meldet das Update einen Fehler und der Worker startet nicht neu (neuer Code würde ohne Paket abstürzen).
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **UPD-07** Automatisches Update — 🧪 unit ✅ 2026-09-25 · 👤 manuell ⏳
  - Unter dem Watchdog (WORKER_SUPERVISED=1) prüft der Worker alle AUTO_UPDATE_MINUTES (Standard 5, 0 = aus) origin/main. Liegt der lokale Stand auf Branch main nur zurück, zieht er das Update (inkl. pip) und startet neu. Ein anderer Branch oder lokale Commits werden nicht angefasst. git läuft dabei mit den normalen Rechten des Workers.
  - **Prüfung:** Einen PR nach main mergen und 5–10 Minuten warten.
  - **Erwartet:** Die VPS-Seite zeigt die neue Version, ohne dass etwas geklickt wurde.

## 11. VPS – VPS-Fernsteuerung vom Mac

- [ ] **VPS-01** VPS-Status — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ⏳
  - Die Seite /vps zeigt per SSH (Route /api/vps/status → ops/windows/vps.ps1 status) Worker, ngrok samt öffentlicher URL, laufende Bots, Version/Branch, Autostart und Uptime. Ohne VPS_SSH_HOST (z. B. Vercel) erscheint nur ein Hinweis.
  - **Prüfung:** Lokal npm run dev:frontend, Seite „VPS“ öffnen.
  - **Erwartet:** Alle Kacheln grün; ist der Worker gestoppt, steht „Gestoppt“.
- [ ] **VPS-02** Aktionen (Update, Neustart, Reboot) — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ⏳
  - Update-Prüfung über den Worker; „Update & Neustart“ läuft über den Worker (POST /system/update) oder, wenn er nicht läuft, über die Aufgabe AutoGrid-Update; „Worker neu starten“ über die Aufgabe AutoGrid-Start (start.bat); „ngrok neu starten“ beendet ngrok, run_ngrok_watchdog.bat startet ihn neu; „VPS neu starten“ per shutdown /r. Jede Aktion mit Bestätigung. git läuft nie per SSH als Administrator.
  - **Prüfung:** „Worker neu starten“ → bestätigen. → „Update & Neustart“ nach einem Merge auf main.
  - **Erwartet:** Worker ist nach ~20 s wieder erreichbar bzw. die Version steigt.
- [x] **VPS-03** Logs vom VPS — 🖥️ e2e ✅ 2026-09-25
  - Tabs Worker (logs/worker_console.log), ngrok (logs/ngrok.log) und Update (logs/vps_update.log), jeweils die letzten 300 Zeilen per SSH. Das Log lädt mit dem Status-Poll neu, Farbcodes von uvicorn werden entfernt; fehlt die Neustart-Schleife (dann gibt es kein Log), erklärt ein Hinweis den Klick auf „Worker neu starten“.
  - **Prüfung:** Tabs wechseln. → Seite offen lassen, nachdem der VPS aktualisiert oder neu gestartet wurde.
  - **Erwartet:** Konsolenausgabe des Workers bzw. ngrok erscheint ohne Farbcodes und aktualisiert sich von selbst; ein alter Fehler bleibt nicht stehen.
- [x] **VPS-04** Schutz der VPS-Route — 🖥️ e2e ✅ 2026-09-25
  - /api/vps/* antwortet nur auf localhost; POST nur mit eigener Origin; ohne VPS_SSH_HOST 404. Nur geprüfte Aktionen/Argumente gelangen in den SSH-Befehl, SSH-Daten stehen nur server-seitig in .env.local (kein NEXT_PUBLIC_).
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch e2e-Tests.
- [x] **VPS-05** Konsolen-Log und ngrok-Watchdog — 🧪 unit ✅ 2026-09-25
  - Unter dem Watchdog schreibt der Worker seine Konsolenausgabe zusätzlich nach logs/worker_console.log (rotiert ab 5 MB). run_ngrok_watchdog.bat startet ngrok bei Absturz neu und loggt nach logs/ngrok.log; start.bat und cleanup_old_instances.ps1 kennen ihn. Die PowerShell-Skripte sind reines ASCII (PowerShell 5.1).
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **VPS-06** Einmalige Einrichtung und Autostart — 👤 manuell ⏳
  - ops/windows/setup_vps.ps1 (einmal als Administrator) installiert OpenSSH (nur Schlüssel), trägt den Mac-Schlüssel ein, setzt den Besitzer des Repos auf den normalen Benutzer, richtet Auto-Login ein (Passwort als LSA-Secret), entfernt bei MT5-Terminals den Haken „Als Administrator ausführen“ (RUNASADMIN, samt Leeren des Kompatibilitäts-Caches) und legt die Aufgaben AutoGrid-Start (bei Anmeldung) und AutoGrid-Update an, beide ohne höchste Rechte.
  - **Prüfung:** Einrichtung nach docs/windows_start_guide.md, danach VPS über die Seite „VPS“ neu starten.
  - **Erwartet:** Nach dem Reboot sind Auto-Login, Worker, ngrok und die vorher laufenden Bots von selbst wieder da.
- [ ] **VPS-07** Prozesse mit Adminrechten erkennen und beenden — 🧪 unit ✅ 2026-09-25 · 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ⏳
  - Laufen Neustart-Schleife, Worker, Bots, ngrok oder MT5 mit Adminrechten (alte Aufgabe mit höchsten Rechten, start.bat „Als Administrator“), kann der normale Worker sie weder sehen noch beenden. vps.ps1 status meldet sie (höhere Integritätsstufe als explorer.exe), die Seite „VPS“ zeigt eine rote Warnung mit „Admin-Prozesse beenden“ (fix-elevated, danach Neustart ohne Adminrechte, der Worker setzt die Bots fort); „Worker neu starten“ beendet Admin-Schleifen/-Worker/-ngrok vorher selbst. cleanup_old_instances.ps1 schreibt nicht beendbare Reste ins Worker-Log. Ein Worker mit Adminrechten warnt beim Start und macht kein git pull.
  - **Prüfung:** Seite „VPS“ öffnen, wenn nichts mit Adminrechten läuft. → Nur mit Absprache: auf dem VPS start.bat per Rechtsklick „Als Administrator ausführen“, danach Seite „VPS“ neu laden und „Admin-Prozesse beenden“.
  - **Erwartet:** Ohne Admin-Prozesse keine Warnung. Mit Admin-Start nennt die Warnung Neustart-Schleifen und Worker mit PID; nach „Admin-Prozesse beenden“ verschwindet sie, Worker und ngrok laufen wieder ohne Adminrechte und das Worker-Log zeigt keine neue Admin-Warnung.

## 12. UI – Oberfläche

- [x] **UI-01** Navigation — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Logo, Version, Links Dashboard, Formasyon und VPS mit animierter Markierung. Auf Mobil (375px) kompakter, ohne horizontales Scrollen.
  - **Prüfung:** Zwischen Dashboard und Formasyon wechseln. → Bei 375px Breite öffnen.
  - **Erwartet:** Aktiver Link ist markiert, Version entspricht VERSION. Bei 375px kein horizontales Scrollen, „Grid Robot“ bricht nicht um.
  - 📝 Claude: Dashboard ↔ Formasyon, Markierung wandert mit, Version v0.7.58 = VERSION
- [x] **UI-02** Theme hell / dunkel / System — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Umschalter „Açık / Koyu / Sistem“ (auf Mobil ein einzelner Button, der der Reihe nach durchschaltet), gespeichert in localStorage grid-robot-theme, ohne Aufblitzen beim Laden.
  - **Prüfung:** Alle drei Varianten wählen und die Seite neu laden.
  - **Erwartet:** Theme bleibt erhalten, kein helles Aufblitzen im Dunkelmodus.
  - 📝 Claude: Açık/Koyu/Sistem setzen Klasse 'dark' + localStorage; 'Açık' übersteht Neuladen; Script vor der Hydration vorhanden; zurück auf 'Sistem'
- [x] **UI-03** PWA / Service Worker — 🖥️ e2e ✅ 2026-09-25
  - Manifest und Registrierung von /service-worker.js im Layout.
  - **Prüfung:** DevTools → Application → Service Workers.
  - **Erwartet:** Service Worker ist registriert, keine 404 in der Konsole.
- [x] **UI-04** Zonen-Test-Link (/chart?zone=) — 🖥️ e2e ✅ 2026-09-25 · 👤 manuell ✅ 2026-09-23
  - Link „Test“ im Zonenkopf öffnet /chart?zone=<id>.
  - **Prüfung:** In einer Zone auf „Test“ klicken.
  - **Erwartet:** Das Chart zeigt die gewählte Zone.
  - 📝 v0.7.59 (Frontend aus main): 'Test'-Link → Karte 'Bölge 1 · USOUSD' mit allen Werten + Live-Chart; kein Symbol-Hinweis (Stream = USOUSD). Min/Max-Linien 20/200 liegen außerhalb des sichtbaren Kursbereichs (~97)
- [x] **UI-05** Sprache Türkisch / Englisch / Deutsch — 🖥️ e2e ✅ 2026-09-25
  - Umschalter TR · EN · DE in der Navigation (auf Mobil ein einzelner Button, der durchschaltet). Die Wahl liegt in localStorage grid-robot-locale, setzt <html lang> schon vor dem ersten Paint und gilt für alle Seiten, Dialoge, Toasts und Fehlermeldungen des Frontends. Texte stehen in frontend_nextjs/src/i18n/messages/*.ts (je Bereich tr, en, de nebeneinander, tsc erzwingt gleiche Schlüssel). Meldungen des Workers (detail-Texte, Logzeilen) bleiben unübersetzt.
  - **Prüfung:** Im Umschalter EN, dann DE, dann TR wählen und dabei Dashboard, /vps und /chart ansehen. → Seite neu laden.
  - **Erwartet:** Alle Texte wechseln sofort, die Sprache bleibt nach dem Reload erhalten, <html lang> stimmt. Keine hartcodierten Reste, keine überlaufenden Buttons (Deutsch ist am längsten).
- [x] **UI-06** Zahlen- und Zeitformat folgt der Sprache — 🖥️ e2e ✅ 2026-09-25
  - Preise und Gewinne ($97,25 in tr/de, $97.25 in en), Uhrzeiten in Logs und VPS-Seite sowie das Dezimalmuster im Symbol-Label („Sembol (0,00)“) richten sich nach der gewählten Sprache.
  - **Prüfung:** Bot mit MT5 verbinden, dann die Sprache zwischen EN und DE wechseln.
  - **Erwartet:** Der Preis in der Kennzahlenleiste wechselt zwischen Punkt und Komma als Dezimaltrenner.
- [x] **UI-07** Hinweise (Tooltips) zu jedem Feld und Button — 🖥️ e2e ✅ 2026-09-25
  - Jede Einstellung, jedes Feld, jeder Schalter, Button, Tab und Menüpunkt erklärt sich. Felder und Schalter tragen ein (i) hinter dem Label (Hover, Tastaturfokus oder Antippen), Buttons und Links zeigen den Tooltip bei Hover/Fokus, deaktivierte Buttons nennen den Grund. Der Tooltip ist ein Popover im Top-Layer (nicht von overflow-hidden abgeschnitten, über den Dialogen), Escape schließt zuerst nur ihn. Texte stehen als i18n-Schlüssel `<label-key>.hint` in src/i18n/messages/hints.ts (tr, en, de). `hint` ist Pflicht-Prop von InputField, Switch, Button, Tabs und ConfirmModal; der Abdeckungstest meldet jedes Bedienelement ohne Hinweis (hooks/RULES.md §5).
  - **Prüfung:** Im Dashboard mit der Maus über das (i) hinter „Alt Seviyeler“, „Maks Pozisyon“ und „Çıkış Tetikleyici“ fahren. → Mit Tab durch die Felder gehen; Escape drücken. → Bei laufendem Bot über „Edit“ fahren; im Konto-Dialog über ein (i) fahren. → Sprache auf EN und DE stellen.
  - **Erwartet:** Zu jedem Element erscheint ein verständlicher Text in der gewählten Sprache. Er wird nicht abgeschnitten, liegt im Dialog über dem Dialog, Escape schließt erst den Tooltip. Ein deaktivierter Button nennt den Grund. Der Abdeckungstest findet kein Bedienelement ohne Hinweis.
