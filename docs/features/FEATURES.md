# Auto Grid – Funktions-Checkliste

> Automatisch erzeugt aus [`features.yaml`](features.yaml) – **nicht von Hand bearbeiten**.
> Aktualisieren: `scripts/features/run.sh` (oder in Claude Code `/feature-test`).
> Manuelles Ergebnis eintragen: `scripts/features/run.sh sign ENG-13 bestanden`.

**Stand:** 2026-09-23 · **2/69** abgehakt · ❌ 1 mit Fehlern · 🐞 6 bekannte Fehler

Legende: 🧪 unit · 🔌 api · 🖥️ e2e (gemockt) · 🌐 live (DEMO-Konto) · 👤 manuell — ✅ bestanden · ❌ fehlgeschlagen · 🐞 bekannter Fehler (xfail) · ⏭️ übersprungen · ⏳ noch kein Ergebnis

Häkchen = kein Fehler, mindestens ein bestandener Test bzw. manuelle Freigabe, und bei 👤 eine Freigabe. *(teilweise)* = es fehlen noch Ergebnisse auf anderen Ebenen.

## Testreihenfolge

| # | Kategorie | Stand |
|---|---|---|
| 1 | **SYS** – Verbindung & Infrastruktur | 2/4 |
| 2 | **ACC** – Konten | 0/8 |
| 3 | **SET** – Allgemeine Einstellungen | 0/6 |
| 4 | **SYM** – Symbole | 0/3 |
| 5 | **ZON** – Zonen-Konfiguration (UI ↔ Backend) | 0/9 |
| 6 | **BOT** – Bot-Steuerung | 0/6 |
| 7 | **ENG** – Grid-Engine (Handelslogik) | 0/16 |
| 8 | **MET** – Live-Daten & Diagramm | 0/4 |
| 9 | **LOG** – Logs | 0/4 |
| 10 | **UPD** – System & Updates | 0/5 |
| 11 | **UI** – Oberfläche | 0/4 |

## 1. SYS – Verbindung & Infrastruktur

- [x] **SYS-01** Worker erreichbar (REST über ngrok) *(teilweise)* — 🌐 live ⏳ · 👤 manuell ✅ 2026-09-23
  - Das Frontend erreicht den Worker über NEXT_PUBLIC_API_URL + /api; axios sendet den ngrok-skip-browser-warning-Header.
  - **Prüfung:** Worker auf dem VPS starten (start.bat), Frontend lokal starten (npm run dev:frontend). → http://localhost:3000 öffnen.
  - **Erwartet:** Kontoliste lädt, im Log-Bereich steht der Worker als online.
  - 📝 Claude im App-Browser: /api/accounts 200 über ngrok, DEMO-Konto 7942034 im Dropdown, 'Worker online'
- [x] **SYS-02** WebSocket-Stream + Reconnect *(teilweise)* — 🖥️ e2e ⏳ · 🌐 live ⏳ · 👤 manuell ✅ 2026-09-23
  - Verbindung zu /ws/stream; Nachrichten METRICS, LIVE_DATA, LOG werden in die Stores geleitet; bei Abbruch automatischer Reconnect.
  - **Prüfung:** Dashboard öffnen, DevTools → Network → WS prüfen. → Worker kurz neu starten.
  - **Erwartet:** WS verbindet sich, nach dem Neustart verbindet er sich von selbst wieder.
  - 📝 Claude im App-Browser: WS offen nach ~0,1 s, 1 Nachricht/s; nach Worker-Neustart 4 Fehlversuche mit Backoff 2/4/8/16 s, dann verbunden (~60 s). Inhalt fehlerhaft → siehe MET-03
- [ ] **SYS-03** Plattform-Erkennung — 🔌 api ⏳ · 🖥️ e2e ⏳
  - GET /system/platform meldet, ob der Worker unter Windows läuft (steuert u. a. die Anzeige des Preis-Simulators).
  - **Prüfung:** Dashboard gegen den VPS-Worker öffnen.
  - **Erwartet:** Auf Windows wird die „Mac Test Mode“-Leiste NICHT angezeigt.
- [ ] **SYS-04** MT5-Terminal-Scanner — 🔌 api ⏳ · 🖥️ e2e ⏳ · 🌐 live ⏳
  - GET /system/scan-mt5 sucht terminal64.exe auf dem VPS; der Konto-Dialog bietet die Pfade zur Auswahl an (Rescan, eigener Pfad).
  - **Prüfung:** „Neues Konto“ öffnen, Feld MT5-Pfad ansehen, „Rescan“ klicken. → Checkbox „eigener Pfad“ aktivieren.
  - **Erwartet:** Installierte Terminals erscheinen in der Liste; mit „eigener Pfad“ erscheint ein Textfeld.

## 2. ACC – Konten

- [ ] **ACC-01** Kontoliste laden — 🔌 api ⏳ · 🖥️ e2e ⏳ · 🌐 live ⏳
  - GET /accounts liefert alle Konten aus configs/accounts.json; das Dropdown zeigt sie an und schreibt sie in useAccountStore.
  - **Prüfung:** Dashboard öffnen, Dropdown „Select Account“ aufklappen.
  - **Erwartet:** Alle registrierten Konten erscheinen (inkl. DEMO-Testkonto).
- [ ] **ACC-02** Konto anlegen + Validierung — 🔌 api ⏳ · 🖥️ e2e ⏳
  - Dialog „New MT5 Account“; Pflichtfelder Name, Login, Passwort, Server, MT5-Pfad; Notizen max. 1000 Zeichen; POST /accounts.
  - **Prüfung:** „Add new account“ klicken, leer absenden. → (Nur mit einem Wegwerf-Konto!) Alle Felder ausfüllen und speichern.
  - **Erwartet:** Leeres Formular zeigt Pflichtfeld-Fehler; gültiges Konto erscheint danach im Dropdown.
- [ ] **ACC-03** Doppelter Login — 🔌 api ⏳ · 🖥️ e2e ⏳
  - Gleicher Login wie ein bestehendes Konto → Rückfrage „bestehendes Konto bearbeiten?“; der Worker antwortet mit 409 (RFC-7807-Problem).
  - **Prüfung:** Neues Konto mit dem Login eines vorhandenen Kontos anlegen.
  - **Erwartet:** Browser-Rückfrage erscheint; es entsteht kein zweites Konto.
- [ ] **ACC-04** Konto bearbeiten — 🔌 api ⏳ · 🖥️ e2e ⏳
  - PUT /accounts/{id}; gesperrt, solange der Bot läuft.
  - **Prüfung:** Konto wählen, „Edit account“, Notiz ändern, speichern.
  - **Erwartet:** Änderung bleibt nach Neuladen erhalten; bei laufendem Bot ist der Button deaktiviert.
- [ ] **ACC-05** Konto löschen — 🔌 api ⏳ · 🖥️ e2e ⏳
  - DELETE /accounts/{id} nach Bestätigung („Delete Account“); gesperrt, solange der Bot läuft.
  - **Prüfung:** (Nur Wegwerf-Konto!) „Delete account“ → bestätigen.
  - **Erwartet:** Konto verschwindet aus dem Dropdown; bei laufendem Bot ist der Button deaktiviert.
- [ ] **ACC-06** Kontoauswahl lädt Einstellungen — 🖥️ e2e ⏳ · 🌐 live ⏳
  - Auswahl im Dropdown lädt GET /settings/{id} in useSettingsStore; ohne Konto erscheint der Leerzustand „No account selected“.
  - **Prüfung:** Seite ohne Auswahl öffnen, dann das DEMO-Konto wählen.
  - **Erwartet:** Zuerst Leerzustand, danach erscheinen Zonen und allgemeine Einstellungen des Kontos.
- [ ] **ACC-07** LIVE/TEST-Kennzeichnung — 🖥️ e2e ⏳
  - Badge im Header und im Dropdown aus env_type (DEMO/LIVE) des Kontos.
  - **Prüfung:** DEMO-Konto wählen.
  - **Erwartet:** Badge zeigt TEST/DEMO, nicht LIVE.
- [ ] **ACC-08** LIVE/DEMO-Sicherheitsprüfung — 🧪 unit ⏳
  - Ein als LIVE markiertes Konto darf nur mit einem echten, ein DEMO-Konto nur mit einem Demo-Server verbinden – sonst wird die Verbindung verweigert.
  - **Prüfung:** Nicht manuell testen (würde ein falsch markiertes Konto erfordern).
  - **Erwartet:** Abgedeckt durch Unit-Tests.

## 3. SET – Allgemeine Einstellungen

- [ ] **SET-01** Einstellungen laden — 🔌 api ⏳ · 🖥️ e2e ⏳ · 🌐 live ⏳
  - GET /settings/{id} liest configs/settings_{id}*.json (verschachteltes „settings“ wird ausgepackt).
  - **Prüfung:** Konto wählen.
  - **Erwartet:** Zonen und Kontroll-Intervall entsprechen der Datei auf dem VPS.
- [ ] **SET-02** Kontroll-Intervall (LOOP_INTERVAL_SECONDS) — 🖥️ e2e ⏳
  - Stepper „Kontrol Sıklığı“ 1–60 s in 0,1er-Schritten; „Kaydet“ ist nur bei Änderung aktiv.
  - **Prüfung:** Mit −/+ den Wert ändern, 0 und 61 eintippen, speichern, neu laden.
  - **Erwartet:** Werte außerhalb 1–60 werden begrenzt; gespeicherter Wert bleibt nach Neuladen.
- [ ] **SET-03** „Alle speichern“ + Dirty-Tracking — 🖥️ e2e ⏳
  - Bei ungespeicherten Änderungen erscheint die schwebende Leiste „Kaydedilmemiş değişiklikler var“; „Tüm Ayarları Kaydet“ speichert alles (is_active wird beim Vergleich ignoriert).
  - **Prüfung:** Ein Zonenfeld ändern → Leiste prüfen → „Kaydet“.
  - **Erwartet:** Leiste erscheint, Button zeigt „Kaydediliyor…“ → „Kaydedildi“, Leiste verschwindet.
- [ ] **SET-04** Werte bereinigen (Sanitizing) — 🧪 unit ⏳ · 🔌 api ⏳
  - Der Worker rundet Gleitkommazahlen beim Speichern (sanitize_settings).
  - **Prüfung:** Lot 0.0100000001 eingeben und speichern.
  - **Erwartet:** Gespeichert wird 0.01.
- [ ] **SET-05** Einstellungen zusammenführen (Merge) — 🔌 api ⏳
  - POST /settings/{id} führt die neuen Werte mit der bestehenden Datei zusammen, statt sie zu überschreiben.
  - **Prüfung:** Nur das Intervall speichern.
  - **Erwartet:** Zonen bleiben unverändert.
- [ ] **SET-06** Globale Standardwerte (GLOBAL_*) — 🧪 unit ⏳
  - Standardwerte GLOBAL_GRID_STEP, GLOBAL_TAKE_PROFIT, GLOBAL_DEFAULT_LOT, MAX_OPEN_POSITIONS, MIN/MAX_PRICE_LIMIT, CLEAR_ON_ZONE_EXIT in utils/config.py.
  - **Prüfung:** Nicht manuell testbar.
  - **Erwartet:** Die Engine sollte diese Werte als Fallback nutzen.
  - 🐞 **Bekannter Fehler:** Die Engine liest diese Werte nie; nur LOOP_INTERVAL_SECONDS wird auf oberster Ebene verwendet.

## 4. SYM – Symbole

- [ ] **SYM-01** Symbolliste + Cache — 🧪 unit ⏳ · 🔌 api ⏳ · 🌐 live ⏳
  - GET /symbols/{id} liefert Broker-Symbole aus broker_symbols.json; 1-h-Cache, bei Ablauf wird die alte Liste geliefert und im Hintergrund aktualisiert (doppelte Anfragen werden zusammengelegt).
  - **Prüfung:** Zone öffnen, ins Symbolfeld klicken.
  - **Erwartet:** Symbolliste des Brokers erscheint schnell (auch bei wiederholtem Öffnen).
- [ ] **SYM-02** Symbol-Autocomplete — 🖥️ e2e ⏳
  - Feld „Sembol Ara…“ filtert die Symbolliste beim Tippen.
  - **Prüfung:** „XAU“ tippen und einen Vorschlag wählen.
  - **Erwartet:** Nur passende Symbole erscheinen; Auswahl übernimmt das Symbol.
- [ ] **SYM-03** Symboldetails — 🖥️ e2e ⏳
  - Zu einem Symbol werden Details (Digits, Point, Volumen-Grenzen) geladen und zur Anzeige/Validierung genutzt.
  - **Prüfung:** Symbol wählen, Preisfelder ansehen.
  - **Erwartet:** Preise werden mit der richtigen Anzahl Nachkommastellen angezeigt.

## 5. ZON – Zonen-Konfiguration (UI ↔ Backend)

- [ ] **ZON-01** Zone hinzufügen — 🖥️ e2e ⏳
  - „Bölge Ekle“ fügt eine neue Zone mit Standardwerten hinzu; die Anzahl im Badge steigt.
  - **Prüfung:** „Bölge Ekle“ klicken, speichern, neu laden.
  - **Erwartet:** Neue Zone bleibt nach dem Neuladen erhalten.
- [ ] **ZON-02** Zone löschen — 🖥️ e2e ⏳
  - Menü „…“ → „Bölgeyi Sil“ → Bestätigung „Bölge Sil“.
  - **Prüfung:** Test-Zone löschen und bestätigen, speichern.
  - **Erwartet:** Zone ist weg, auch nach Neuladen.
- [ ] **ZON-03** Basisfelder (Symbol, Emir Tipi, Min/Max Fiyat) — 🖥️ e2e ⏳
  - Symbol, Ordertyp BUY/SELL/BOTH und Preisbereich der Zone.
  - **Prüfung:** Jedes Feld ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten; Ordertyp-Badge im Kopf passt.
- [ ] **ZON-04** Grid-Felder (Grid Adımı, Lot, Kar Al, Zarar Durdur) — 🖥️ e2e ⏳
  - Gridabstand, Lotgröße, Take Profit, Stop Loss der Zone.
  - **Prüfung:** Jedes Feld ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten.
- [ ] **ZON-05** SELL-Felder + BUY/SELL-Sync — 🖥️ e2e ⏳
  - Bei Ordertyp BOTH eigene SELL-Werte (SELL Grid/Lot/KA/ZD) oder Schalter „BUY ve SELL için aynı ayarları uygula“.
  - **Prüfung:** Ordertyp BOTH wählen, Sync aus → SELL-Felder ändern; Sync an.
  - **Erwartet:** SELL-Felder erscheinen nur bei BOTH und Sync aus; Werte bleiben nach Speichern erhalten.
- [ ] **ZON-06** Breakout-Felder — 🖥️ e2e ⏳
  - Schalter „Sadece trend yönünde“, Pullback-Abstände, Alt/Üst Seviyeler (levels_below/above), Maks Pozisyon.
  - **Prüfung:** Breakout einschalten, Felder ändern, speichern, neu laden.
  - **Erwartet:** Alle Werte bleiben erhalten.
- [ ] **ZON-07** Exit-Felder (Bereinigen beim Verlassen) — 🖥️ e2e ⏳
  - Schalter „Fiyat bölgeden çıkınca temizle“; dann Çıkış Yönü, Hedef Taraf, Temizleme Kapsamı, Çıkış Tetikleyici und bei „Mum Kapanışı“ zusätzlich Zaman Dilimi.
  - **Prüfung:** Schalter an → Auswahlfelder prüfen; Auslöser „Mum Kapanışı“ wählen.
  - **Erwartet:** Die vier Auswahlfelder erscheinen erst mit dem Schalter; Zeitrahmen nur bei Kerzenschluss.
- [ ] **ZON-08** Start/Pause pro Zone — 🔌 api ⏳ · 🖥️ e2e ⏳ · 🌐 live ⏳
  - Button im Zonenkopf (Başladı / Başla / Hazır / Kapalı) setzt is_active (POST /settings) und START/PAUSE in ui_state (POST /ui-state); Warnung bei ungültigem Symbol oder ungespeicherter Zone.
  - **Prüfung:** Test-Zone starten und wieder pausieren. → Neue, ungespeicherte Zone starten.
  - **Erwartet:** Label wechselt passend; ungespeicherte Zone zeigt eine Warnung.
- [ ] **ZON-09** „Kaydedilmedi“-Badge — 🖥️ e2e ⏳
  - Zonen mit ungespeicherten Änderungen tragen den Badge „Kaydedilmedi“.
  - **Prüfung:** Ein Feld ändern, dann speichern.
  - **Erwartet:** Badge erscheint nach der Änderung und verschwindet nach dem Speichern.

## 6. BOT – Bot-Steuerung

- [ ] **BOT-01** Bot starten — 🌐 live ⏳
  - POST /start verbindet MT5 (Timeout 120 s), cached die Symbole, startet bot_runner.py als eigenen Prozess und stellt ihn unter Watchdog. UI-Timeout für „Connecting“ 180 s.
  - **Prüfung:** DEMO-Konto wählen, „Start Bot“.
  - **Erwartet:** Status wechselt über „Connecting“ zu „Running“, Markt offen/geschlossen wird angezeigt.
- [ ] **BOT-02** Bot stoppen — 🌐 live ⏳
  - POST /stop nimmt den Bot aus dem Watchdog und beendet den Prozess; Positionen und Orders bleiben unangetastet. Bestätigung „Disconnect MT5“.
  - **Prüfung:** „Stop Bot“ → bestätigen; in MT5 die offenen Positionen prüfen.
  - **Erwartet:** Status „Stopped“; Positionen sind noch da.
- [ ] **BOT-03** Neustart veralteter/hängender Bot — 🧪 unit ⏳
  - Läuft ein Bot mit alter VERSION oder ohne frische Metriken (> 180 s), startet /start ihn neu; beim Worker-Start übernimmt startup_maintenance laufende Bots.
  - **Prüfung:** Nach einem Update „Restart Bot“ klicken.
  - **Erwartet:** Bot läuft danach mit der neuen Version (PID-Datei enthält neue VERSION).
- [ ] **BOT-04** Statusanzeige + Alarme — 🖥️ e2e ⏳
  - Anzeige Connecting / Running / „process without MT5“ / Stopped, Marktstatus, Kontoname/Server; Alarme für API-Fehler, MT5-Verbindung, abgelehnte Order, Algo Trading aus.
  - **Prüfung:** In MT5 „Algo Trading“ ausschalten, während der Bot läuft.
  - **Erwartet:** Alarm „Algo Trading off“ erscheint; nach Einschalten verschwindet er.
- [ ] **BOT-05** Watchdog-Neustart — 🧪 unit ⏳
  - Alle 15 s Prüfung; abgestürzter oder hängender Bot (600 s ohne Metriken) wird mit Backoff 15/30/60/120/240 s neu gestartet.
  - **Prüfung:** Auf dem VPS den bot_runner-Prozess im Task-Manager beenden.
  - **Erwartet:** Nach ≤ 30 s läuft der Bot wieder (Robot-Log zeigt Neustart).
- [ ] **BOT-06** Watchdog gibt auf — 🧪 unit ⏳
  - Nach 5 Neustarts in 30 min hört der Watchdog auf; gelöschte Konten werden nicht mehr beobachtet.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.

## 7. ENG – Grid-Engine (Handelslogik)

- [ ] **ENG-01** Zonenwahl — 🧪 unit ⏳
  - Aktiv wird die erste aktive Zone, deren Mittelkurs (oder Schlusskurs der letzten Kerze bei „Mum Kapanışı“, Zeitrahmen exit_timeframe) in [min_price, max_price] liegt.
  - **Prüfung:** Zwei Zonen mit verschiedenen Bereichen anlegen, Bot laufen lassen.
  - **Erwartet:** Orders entstehen nur in der Zone, in der der Preis liegt.
- [ ] **ENG-02** Sliding-Grid-Level — 🧪 unit ⏳
  - Level werden an round(mid/step)*step verankert, levels_below/levels_above Stufen, auf die Zone begrenzt; acceptable-Sets mit ±2 Stufen Puffer.
  - **Prüfung:** Bot laufen lassen, Pending Orders in MT5 ansehen.
  - **Erwartet:** Orders liegen im Gridabstand um den Preis, nie außerhalb der Zone.
- [ ] **ENG-03** Breakout / Pullback — 🧪 unit ⏳
  - Im Breakout-Modus nur Orders in Trendrichtung, mit pullback_distance / sell_pullback_distance.
  - **Prüfung:** Breakout-Zone aktivieren, Orders ansehen.
  - **Erwartet:** Orders nur in Trendrichtung und im Pullback-Abstand.
- [ ] **ENG-04** Zonen-Config lesen + Lot begrenzen — 🧪 unit ⏳
  - extract_zone_config liest order_type, grid_step, lot_size (auf 0,01–5,0 begrenzt), TP/SL, Symbol, sync_buy_sell, sell_*-Overrides, max_positions, is_active.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **ENG-05** Order-Platzierung LIMIT/STOP + TP/SL — 🧪 unit ⏳ · 🌐 live ⏳
  - Fehlende Level bekommen Pending Orders mit TP/SL; LIMIT oder STOP je nach Seite des Marktes; Toleranz 0,45 × Gridabstand; manuelle Positionen zählen als belegte Level.
  - **Prüfung:** Test-Zone (0,01 Lot) um den aktuellen Preis starten.
  - **Erwartet:** BUY LIMIT unter / BUY STOP über dem Preis (bzw. SELL umgekehrt), jeweils mit TP/SL.
- [ ] **ENG-06** Validierung + Bereinigung — 🧪 unit ⏳
  - Orders außerhalb des Fensters oder mit falschem Lot/TP/SL werden gelöscht (erwartetes Lot berücksichtigt Teilausführungen).
  - **Prüfung:** Bei laufendem Bot TP der Zone ändern und speichern.
  - **Erwartet:** Alte Orders werden gelöscht und mit neuem TP neu gesetzt.
- [ ] **ENG-07** Maximale Positionen — 🧪 unit ⏳ · 🌐 live ⏳
  - Ist max_positions erreicht, werden die Pending Orders der Zone gelöscht.
  - **Prüfung:** Maks Pozisyon = 1 setzen und eine Position füllen lassen.
  - **Erwartet:** Danach keine Pending Orders mehr in dieser Zone.
- [ ] **ENG-08** Teilausführung + TP/SL-Resync — 🧪 unit ⏳
  - Geänderte TP/SL-Werte werden auf offene Positionen übertragen; bei Teilausführung wird das Restlot neu gesendet.
  - **Prüfung:** Bei offener Position den TP der Zone ändern und speichern.
  - **Erwartet:** TP der offenen Position wird angepasst.
- [ ] **ENG-09** Zombie-Orders entfernen — 🧪 unit ⏳
  - Orders pausierter, bereinigter, inaktiver Zonen oder mit falschem Symbol werden gelöscht.
  - **Prüfung:** Zone mit offenen Orders pausieren.
  - **Erwartet:** Ihre Pending Orders verschwinden.
- [ ] **ENG-10** Bereinigung beim Verlassen der Zone — 🧪 unit ⏳ · 🌐 live ⏳
  - Mit clear_on_exit: Richtung (clear_exit_side), Umfang (nur Orders / auch Positionen) und Zielseite (BUY/SELL/alle); danach ui_state AUTO_CLEAR.
  - **Prüfung:** Test-Zone knapp um den Preis legen, „temizle“ an, warten bis der Preis sie verlässt.
  - **Erwartet:** Orders (bzw. Positionen je nach Umfang) werden entfernt, Zone steht auf AUTO_CLEAR.
- [ ] **ENG-11** Auto-Pause nach 3 Ablehnungen — 🧪 unit ⏳
  - Nach 3 abgelehnten Orders in Folge wird die Zone pausiert (ui_state PAUSE) und order_rejected_alarm gesetzt.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **ENG-12** Order-Sicherheit (Stops-Level, order_check, 10027) — 🧪 unit ⏳
  - safe_send_order normalisiert Volumen, hält den Broker-Stops-Level ein (vermeidet 10016), prüft vorab mit order_check, erkennt 10027 (Algo Trading aus) und prüft, ob die Order wirklich existiert.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.
- [ ] **ENG-13** Fernsteuerung per MT5-Handy-App — 🧪 unit ⏳ · 👤 manuell ⏳
  - Manuelle BUY LIMIT 0,01 Lot bei 1 $ = STOP, bei 2 $ = START; alternativ Kommentar GRID:STOP / GRID:START. STOP löscht alle Robot-Orders; die Signal-Order wird danach entfernt.
  - **Prüfung:** In der MT5-App eine BUY LIMIT 0,01 bei Preis 1 setzen. → Danach BUY LIMIT 0,01 bei Preis 2 setzen.
  - **Erwartet:** Erst werden alle Robot-Orders gelöscht (remote_paused), dann läuft der Bot weiter; die Signal-Orders verschwinden.
- [ ] **ENG-14** Zustand beim Start wiederherstellen — 🧪 unit ⏳
  - Beim Bot-Start sind alle Zonen PAUSE; active_zones_state wird aus den Magic-Numbers der vorhandenen Orders/Positionen aufgebaut (data/state_<id>.json), alte ui_state-Datei gelöscht.
  - **Prüfung:** Bot mit offenen Orders stoppen und neu starten.
  - **Erwartet:** Vorhandene Orders werden übernommen, nicht doppelt gesetzt.
- [ ] **ENG-15** Markt geschlossen + Reconnect — 🧪 unit ⏳
  - Bei geschlossenem Markt (trade_mode ≠ 4 oder Tick älter als 180 s) wartet die Schleife 60 s; Verbindungsverlust → Reconnect mit exponentiellem Backoff; nur „Algo Trading aus“ → warten statt neu einloggen.
  - **Prüfung:** Am Wochenende Dashboard ansehen.
  - **Erwartet:** Markt wird als geschlossen angezeigt, keine neuen Orders.
- [ ] **ENG-16** Aufräumen beim Beenden der Schleife — 🧪 unit ⏳
  - Beim Verlassen der Hauptschleife werden alle Pending Orders des Robots gelöscht.
  - **Prüfung:** Nicht manuell testen (/stop beendet den Prozess hart).
  - **Erwartet:** Abgedeckt durch Unit-Tests.

## 8. MET – Live-Daten & Diagramm

- [ ] **MET-01** Kennzahlenleiste — 🖥️ e2e ⏳ · 🌐 live ⏳
  - Vier Kacheln Preis, Floating P/L, Offene Positionen, Pending Orders mit animierten Ziffern.
  - **Prüfung:** Bot laufen lassen, Werte mit MT5 vergleichen.
  - **Erwartet:** Werte stimmen mit MT5 überein und aktualisieren sich.
- [ ] **MET-02** Chart (10-s-Kerzen + RSI) — 🖥️ e2e ⏳
  - lightweight-charts baut 10-s-Kerzen aus WebSocket-METRICS, RSI auf eigener Skala; Farben folgen dem Theme.
  - **Prüfung:** /formasyon öffnen und 1 Minute warten.
  - **Erwartet:** Kerzen und RSI-Linie entstehen.
- [ ] **MET-03** WebSocket-Metriken des Workers — 🧪 unit ⏳ · 🌐 live ⏳ · 👤 manuell ❌ 2026-09-23
  - ws_server sendet jede Sekunde Preis, RSI, MACD, P/L, Positionen für das erste Konto / Zone 0.
  - **Prüfung:** DevTools → WS-Nachrichten ansehen.
  - **Erwartet:** Jede Sekunde eine METRICS-Nachricht mit Preis und RSI.
  - 🐞 **Bekannter Fehler:** ws_server liest settings["settings"]["ZONES"], gespeicherte Dateien sind aber flach; außerdem wird der Stream über ein Router-lifespan registriert, das beim include_router evtl. nie ausgelöst wird.
  - 📝 Live bestätigt: nur LIVE_DATA mit mt5_connected=false, nie METRICS (ws_server.py:136 liest settings.settings.ZONES, Datei ist flach)
- [ ] **MET-04** Bot-Telemetrie — 🧪 unit ⏳
  - calculate_live_metrics exportiert P/L, Positions-/Orderzahl, Preis, Alarme (algo_trading_error, order_rejected_alarm, last_error, remote_paused, connection_lost), market_open nach met_<id>.json.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Abgedeckt durch Unit-Tests.

## 9. LOG – Logs

- [ ] **LOG-01** Log-Tabs laden — 🔌 api ⏳ · 🖥️ e2e ⏳ · 🌐 live ⏳
  - Tabs Activity, Robot Logs, MT5 Terminal; GET /logs/{id}?log_type=all&lines=200; ohne laufenden Bot wird mt5_connected=false erzwungen.
  - **Prüfung:** Alle drei Tabs öffnen, „Refresh“.
  - **Erwartet:** Jeder Tab zeigt seine Logs.
- [ ] **LOG-02** Logs löschen — 🔌 api ⏳ · 🖥️ e2e ⏳
  - Activity wird nur lokal geleert; Robot/MT5 nach Rückfrage per DELETE /logs/{id}.
  - **Prüfung:** Im Tab Robot Logs „Clear“ → bestätigen.
  - **Erwartet:** Log ist leer, auch nach Refresh.
- [ ] **LOG-03** Logs als ZIP herunterladen — 🔌 api ⏳ · 🖥️ e2e ⏳
  - GET /logs/download/{id} liefert ein ZIP mit Logs, State- und Settings-Datei.
  - **Prüfung:** „Download log file“ klicken, ZIP öffnen.
  - **Erwartet:** ZIP enthält Logs, state_<id>.json und settings-Datei.
- [ ] **LOG-04** Worker-Status + Polling — 🖥️ e2e ⏳
  - Anzeige Worker online/offline; Abfrage alle 10 s (beim Verbinden alle 2 s).
  - **Prüfung:** Worker auf dem VPS stoppen.
  - **Erwartet:** Status wechselt nach ≤ 10 s auf offline.

## 10. UPD – System & Updates

- [ ] **UPD-01** Update-Prüfung — 🔌 api ⏳ · 🖥️ e2e ⏳
  - „System Info“ → „Check for Updates“; GET /system/update/check vergleicht Git-Hash und VERSION mit origin/main.
  - **Prüfung:** „Check for Updates“ klicken.
  - **Erwartet:** „You are up to date“ oder alte → neue Version.
- [ ] **UPD-02** Update anwenden — 🖥️ e2e ⏳ · 👤 manuell ⏳
  - „Apply Update (git pull)“ → POST /system/update (stash, pull, stash pop), danach Seiten-Reload.
  - **Prüfung:** Nach einem Merge auf main das Update im Dashboard anwenden, danach Worker/Bot neu starten.
  - **Erwartet:** VERSION auf dem VPS entspricht main.
- [ ] **UPD-03** System herunterfahren — 🖥️ e2e ⏳
  - Power-Button → Bestätigung → /stop, danach window.close().
  - **Prüfung:** Power-Button → bestätigen.
  - **Erwartet:** Bot wird gestoppt, Fenster schließt (falls vom Browser erlaubt).
- [ ] **UPD-04** Preis-Simulator (Mac-Testmodus) — 🖥️ e2e ⏳
  - Schieberegler 50–150, nur sichtbar wenn der Worker nicht unter Windows läuft; POST /bot/simulate-price.
  - **Prüfung:** Nur mit einem Nicht-Windows-Worker sichtbar.
  - **Erwartet:** Der simulierte Preis sollte in die Engine einfließen.
  - 🐞 **Bekannter Fehler:** /bot/simulate-price schreibt sim_<id>.json, das von niemandem gelesen wird – der Regler hat keine Wirkung.
- [ ] **UPD-05** Server-Neustart nach Update — 🧪 unit ⏳
  - self_updater.hard_restart_server soll den Worker nach einem Update neu starten.
  - **Prüfung:** Nicht manuell testen.
  - **Erwartet:** Worker startet neu.
  - 🐞 **Bekannter Fehler:** hard_restart_server verweist auf scripts/launcher.py, das nicht existiert.

## 11. UI – Oberfläche

- [ ] **UI-01** Navigation — 🖥️ e2e ⏳
  - Logo, Version, Links Dashboard und Formasyon mit animierter Markierung.
  - **Prüfung:** Zwischen Dashboard und Formasyon wechseln.
  - **Erwartet:** Aktiver Link ist markiert, Version entspricht VERSION.
- [ ] **UI-02** Theme hell / dunkel / System — 🖥️ e2e ⏳
  - Umschalter „Açık / Koyu / Sistem“, gespeichert in localStorage grid-robot-theme, ohne Aufblitzen beim Laden.
  - **Prüfung:** Alle drei Varianten wählen und die Seite neu laden.
  - **Erwartet:** Theme bleibt erhalten, kein helles Aufblitzen im Dunkelmodus.
- [ ] **UI-03** PWA / Service Worker — 🖥️ e2e ⏳
  - Manifest und Registrierung von /service-worker.js im Layout.
  - **Prüfung:** DevTools → Application → Service Workers.
  - **Erwartet:** Service Worker ist registriert, keine 404 in der Konsole.
  - 🐞 **Bekannter Fehler:** /service-worker.js fehlt in public/ → 404 bei der Registrierung.
- [ ] **UI-04** Zonen-Test-Link (/chart?zone=) — 🖥️ e2e ⏳
  - Link „Test“ im Zonenkopf öffnet /chart?zone=<id>.
  - **Prüfung:** In einer Zone auf „Test“ klicken.
  - **Erwartet:** Das Chart zeigt die gewählte Zone.
  - 🐞 **Bekannter Fehler:** /chart ignoriert den Parameter zone.
