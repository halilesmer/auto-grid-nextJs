# 🧪 Konzept- und Architekturplan: Backtest-Modul (Grid Robot)

Dieses Dokument beschreibt das vollständige UI/UX-Konzept, die technische Architektur und die Features für das dedizierte **Backtest-Modul**. Ziel ist eine extrem präzise, marktnahe Simulation von Grid- und Fraktal-Strategien im Browser ohne direkte Koppelung an den laufenden Live-Bot.

---

## 💡 Kernphilosophie & Grundprinzipien

1. **Strikte Entkopplung von Live und Backtest:** 
   Der Backtest ist ein isoliertes Labor. Es gibt **keine automatische Auswirkung** auf aktive Bot-Zonen. Ergebnisse und Einstellungen werden separat verwaltet.
2. **Manueller Datenaustausch (Presets):** 
   Erfolgreiche Backtest-Setups können als **Konfigurations-Preset** gespeichert und bei Bedarf manuell im Dashboard für Demo- oder Echtgeld-Konten übernommen werden.
3. **Berechnung im Browser (Web Worker):** 
   Der VPS dient rein als Datenlieferant für historische Kerzen (SQLite-Datenbank). Der Backtest läuft ressourcenschonend im Hintergrund-Thread des Browsers (Web Worker).
4. **Maximale Realitätstreue:** 
   Simulation von dynamischem/festem Spread, Kommissionen, Swap (inkl. 3x Mittwoch), Gaps/Slippage und pessimistischer Kerzen-Ausführung.

---

## 📐 1. Benutzeroberfläche (UI/UX Konzept)

Die Backtest-Seite ist übersichtlich in drei Hauptbereiche gegliedert: **Aktionsleiste**, **Setup-Übersicht (Badges)** und **Ergebnis-Visualisierung (Chart & Statistik)**.

```
+-----------------------------------------------------------------------------------+
| [ Backtest erstellen ]   [ Gespeicherte Presets v ]   [ CSV Import ]              |
+-----------------------------------------------------------------------------------+
| Aktive Test-Setups:                                                               |
| [ Setup #1: EURUSD | M1 | Grid 15p | TP 30p | Spread: ~1.2 | Lots: 0.10 ] [x]     |
| [ Setup #2: EURUSD | M5 | Grid 25p | TP 50p | Spread: ~1.2 | Lots: 0.10 ] [x]     |
+-----------------------------------------------------------------------------------+
| STATISTIK-ERGEBNIS (Aggregiert oder je Setup)                                     |
| Net Profit: $420.50 | Profit Factor: 1.85 | Max DD: 4.2% | Win Rate: 72%              |
+-----------------------------------------------------------------------------------+
| TRADINGVIEW CHART (Lightweight Charts v5)                                         |
| [Kerzen, Zonenband, Grid-Linien, Kauf/Verkauf-Pfeile, Equity-Kurve unten]         |
| [Play/Pause] [1x / 5x / 10x Speed]                                                |
+-----------------------------------------------------------------------------------+
```

### 1.1 Modalsystem: „Backtest erstellen“
Beim Klick auf den Button **„Backtest erstellen“** öffnet sich ein strukturiertes Modalformular.

* **1. Basis-Einstellungen:**
  * **Symbol & Konto-Quelle:** Z.B. EURUSD (über den MT5-Server des gewählten Kontos).
  * **Timeframe-Auswahl:** `1m`, `5m`, `15m`, `1H`, `4H`, `1D`.
  * **Test-Zeitraum:** Kalender-Auswahl (z. B. 1 volles Jahr, z. B. 01.01.2025 – 01.01.2026).
    * *Vorauswahlen:* Letzte 30 Tage, 90 Tage, 6 Monate, 1 Jahr, Benutzerdefiniert.
* **2. Handelskosten & Broker-Bedingungen:**
  * **Ungefähre Spreadkosten:** Automatisch ermittelter Durchschnitts-Spread aus MT5 mit manuellem Überschreibfeld (z. B. `1.2 Pips`).
  * **Kommission:** Feld für `Kommission pro Lot (Roundturn)` in Kontowährung.
  * **Swap-Berechnung:** Umschalter (Aktiv/Inaktiv) inklusive Berücksichtigung des 3x Swaps am Mittwoch.
* **3. Zonen- & Grid-Konfiguration:**
  * Eingabemaske für alle bekannten Parameter: Zonen-Grenzen (Min/Max), Grid-Abstand, Lot-Größe, TP/SL-Modus, Fraktal-Filter, Breakout-Regeln, Max. Positionen.
* **4. Aktionen im Modal:**
  * **[ Jetzt Testen ]**: Startet die Berechnung im Browser.
  * **[ Als Preset speichern ]**: Speichert die Parameter unter einem Namen (z.B. *"EURUSD M1 Scalper V2"*) für die spätere Nutzung im Dashboard.

### 1.2 Setup-Verwaltung mit Badges
* Jedes erstelle Test-Setup erscheint nach dem Ausführen als **Kompakt-Karte mit kleinen Badges**:
  * `Symbol: EURUSD` | `TF: M1` | `Grid: 15pt` | `Spread: ~1.2p` | `TP: 30pt` | `Lots: 0.01`
* Möchte man ein zweites Setup (z.B. mit abweichendem Grid-Abstand oder anderem Timeframe) vergleichen, klickt man erneut auf **„Backtest erstellen“**.
* Mehrere Setups können nebeneinander oder nacheinander im Chart / in der Statistik umgeschaltet werden.

### 1.3 Übernahme ins Dashboard (Live / Demo Mode)
* In der Preset-Verwaltung befindet sich bei jedem gespeicherten Backtest ein Button **„Ins Dashboard übernehmen“**.
* **Ablauf:**
  1. Klick auf „Ins Dashboard übernehmen“.
  2. Dialog wählt das Zielkonto (Demo oder Live).
  3. Die Zonen-Parameter werden in die Formulardaten des Dashboards kopiert.
  4. Die Zone wird erst aktiv, wenn der Nutzer im Dashboard explizit auf **„Zone Speichern / Starten“** klickt.

---

## ⚙️ 2. Eigenschaften & Technische Spezifikationen

### 2.1 Unterstützte Timeframes & Datenmengen
* **Timeframes:** `1m`, `5m`, `15m`, `1H`, `4H`, `1D`.
* **Kerzen-Historie bis zu 1 Jahr:**
  * Ein Jahr M1-Kerzen umfasst ca. **370.000 bis 500.000 Balken**.
  * **Optimierung:** Verwendung von `TypedArrays` (Float32Array / Int32Array) im JavaScript Web Worker. Speicherbedarf liegt bei unter 25 MB RAM.
  * **Chart-Render-Schutz:** Der Chart verarbeitet maximal 50.000 visuelle Balken gleichzeitig (Downsampling für die Anzeige), während der Algorithmus im Hintergrund mit der vollen M1-Präzision rechnet.

### 2.2 Realistische Handels-Simulation
Die Simulation bildet das Verhalten der Python-Grid-Engine 1:1 nach:

1. **Intra-Candle Ausführung (Path Walker):**
   * Kerzen werden virtuell in 4 Teilschritte zerlegt:
     * Steigende Kerze: `Open` $\rightarrow$ `Low` $\rightarrow$ `High` $\rightarrow$ `Close`
     * Fallende Kerze: `Open` $\rightarrow$ `High` $\rightarrow$ `Low` $\rightarrow$ `Close`
   * *Pessimistischer Modus (Optional):* Prüft bei extremen Kerzen zuerst den Stop-Loss (SL) vor dem Take-Profit (TP).
2. **Spread & Slippage:**
   * Anhand der MT5-Spread-Daten je Kerze wird der Ausführungspreis dynamisch angepasst (`Ask = Bid + Spread`).
   * **Gaps (Kurslücken):** Wenn ein Preis über ein Limit/Stop-Level springt, führt die Simulation den Trade zum nächsten verfügbaren Eröffnungskurs (Market Price) aus.
3. **Kostenberechnung (`broker/costs.ts`):**
   * $\text{Spread-Kosten} = \text{Spread (in Punkten)} \times \text{Tick-Value} \times \text{Volume}$
   * $\text{Kommission} = \text{Lot} \times \text{Kommissionsrate}$
   * $\text{Swap} = \text{Tages-Swap} \times \text{Haltedauer in Tagen} \ (\times 3 \text{ am Mittwoch})$

---

## 📊 3. Statistikergebnis auf der Backtest-Seite

Unterhalb der Setup-Badges und über dem Chart wird ein übersichtliches Dashboard mit allen relevanten Kennzahlen eingeblendet:

### 3.1 Kennzahlen-Übersicht (KPIs)
* **Finanziell:** Nettogewinn ($ / %), Bruttogewinn, Bruttoverlust, Geschätzte Gesamtkosten (Spread + Kommission + Swap).
* **Performance:** Profit-Faktor (Soll: $> 1.5$), Erholungsfaktor (Recovery Factor), Erwartungswert pro Trade.
* **Risiko:** Maximaler Drawdown ($ / %), Max. aufeinanderfolgende Verluste.
* **Trade-Statistik:** Gesamtzahl Trades, Win Rate gesamt / Long / Short, Durchschnittliche Haltedauer.
* **Grid-Spezifisch:** Geschlossene Grid-Zyklen pro Tag, Zeit im Gewinn vs. Zeit im Verlust.

### 3.2 Visualisierung
* **TradingView Lightweight Charts:**
  * **Haupt-Pane:** Kerzenchart mit farbigem Zonenband, Grid-Level-Linien, TP/SL-Markierungen und Buy/Sell-Pfeilen bei Orderausführung.
  * **Unteres Pane:** Kontostandsverlauf (Balance- & Equity-Kurve) synchron zur Zeitachse des Charts.
* **Replay-Funktion:** Play/Pause-Buttons mit einstellbarer Geschwindigkeit (1x, 5x, 10x, Max), um die Grid-Entwicklung im Zeitraffer zu beobachten.

---

## 📂 4. Datenhaltung & Performance-Konzept

```
+----------------------------------+          +-----------------------------------+
|          VPS / Fast-API          |          |          BROWSER CLIENT           |
|                                  |          |                                   |
|  +----------------------------+  |  HTTP    |  +-----------------------------+  |
|  | SQLite (market.sqlite)     |  | REST API |  | Main UI Thread              |  |
|  | - rates (MT5 & CSV)        |  |--------->|  | - Backtest Modal / Badges   |  |
|  | - rate_coverage            |  |  JSON    |  | - TradingView Chart         |  |
|  +----------------------------+  |          |  +-----------------------------+  |
|                                  |          |                 |                 |
|  +----------------------------+  |          |                 v (Message)       |
|  | MT5 Terminal               |  |          |  +-----------------------------+  |
|  | - Liest fehlende Kerzen    |  |          |  | Web Worker Thread           |  |
|  +----------------------------+  |          |  | - TypeScript Grid Engine    |  |
|                                  |          |  | - Path Walker & Costs       |  |
+----------------------------------+          |  +-----------------------------+  |
                                              +-----------------------------------+
```

1. **VPS Cache (`market.sqlite`):**
   * Verhindert unnötige, mehrfache Abfragen an das MT5-Terminal.
   * Fehlen Kerzen für ein Jahr, holt der Worker diese einmalig paketweise aus MT5 und speichert sie lokal ab.
2. **CSV-Import:**
   * Über einen Upload-Dialog können historische CSV-Dateien aus MT4/MT5 importiert werden. Diese werden isoliert in der VPS-Datenbank unter einer eigenen Quell-ID gespeichert (`source = csv:<account_id>`).
3. **Web Worker Threading:**
   * Der eigentliche Backtest läuft in einem separaten Browser-Worker (`backtest.worker.ts`). Dadurch bleibt die Benutzeroberfläche selbst bei 500.000 Kerzen jederzeit flüssig und bedienbar.

---

## 🗺️ 5. Schritt-für-Schritt Umsetzungsfahrplan

| Phase | Aufgabenbereich | Key Deliverables |
|---|---|---|
| **Phase 1** | **Datenbasis & VPS** | SQLite `rates` Tabelle, `GET /api/market/{id}/rates` Endpunkt mit Monats-Chunking & Caching. |
| **Phase 2** | **TS Engine Parität** | Portierung der Python Grid-Logik nach TypeScript (`src/lib/backtest/engine/`), Unit-Tests gegen Golden Parity Fixtures. |
| **Phase 3** | **UI & Modal** | Modal "Backtest erstellen", Parameter-Formular, Badges-Anzeige für aktive Setups, Timeframe/Datum-Picker. |
| **Phase 4** | **Simulation & Costs** | `simBroker.ts`, Kostenberechnung (`costs.ts` - Spread, Swap, Kommission), Web Worker Anbindung. |
| **Phase 5** | **Chart & Statistik** | Lightweight Charts Integration, Equity-Pane, Replay-Steuerung, KPI-Berechnung. |
| **Phase 6** | **Preset Transfer** | Speichern von Presets, "Ins Dashboard übernehmen"-Button mit Ziel-Konto-Auswahl. |
