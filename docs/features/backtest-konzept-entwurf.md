# Konzept: Backtest-Modul (eigene Seite `/backtest`)

## Kontext

Du hast `docs/features/konzept_und_architekturplan_f_r_das_backtest_modul.md` geschrieben (liegt ungetrackt im Haupt-Checkout). Gewünscht: das Dokument prüfen und daraus ein breites Konzept **nur für den Backtest** machen.

Dazu deine Vorgaben aus dem Chat:
- **Eigene Seite** `/backtest`, nicht nur ein Tab.
- **Test-Knopf in der Zone** → Sprung auf die Backtest-Seite, mit den Werten der Zone (auch ungespeicherten).
- **Auf der Backtest-Seite** lassen sich Zonen auch frei einstellen, ganz ohne Zonenseite.
- **Von der Backtest-Seite zurück:** Eine getestete Einstellung lässt sich in die Zonenseite übernehmen.

Grundlage bleibt der genehmigte Analyse-Plan (`ich-m-chte-die-chart-parsed-wombat.md`), sein Journal-Eintrag `docs/journal/2026-10-02-analyse-statistics-tab-plan.md` (Schritte 7–9 offen) und die festen Rechenregeln in `docs/analyse-regeln.md`.

**Stand Worktree:** Der Sync mit `main` (#108 Statistik-Tab, #109 MFE/MAE) ist blockiert, weil der Merge die geschützte Datei `.claude/agents/reviewer.md` ändert und der Git-Origin in der App noch nicht bestätigt ist. Die Inhalte aus `main` sind über `origin/main` gelesen und hier eingearbeitet.

---

## 1. Analyse deines Dokuments

### 1.1 Was gut ist und übernommen wird

- Strikte Trennung von Live-Bot und Backtest.
- Rechnen im Browser per Web Worker, der VPS liefert nur Kerzen.
- Kerzenpfad O→L→H→C / O→H→L→C mit optionalem „SL zuerst“.
- Spread je Kerze, Kommission, Swap, Kurslücken.
- Badges je Setup und mehrere Setups vergleichen.
- Presets und „Ins Dashboard übernehmen“ **ohne** automatisches Speichern.
- Chart mit Equity-Bereich und Wiedergabe.
- Höchstens rund 50.000 Anzeige-Kerzen, gerechnet wird mit allen.

### 1.2 Was schon fertig ist (Phase 1 deines Fahrplans)

- **Kursdatenbank:** SQLite-Kursdatenbank mit Abdeckung (`worker_python/src/utils/market_db.py`, `market_sync.py`).
- **Kerzen-Abruf:** `GET /api/market/{id}/rates`, spaltenweise, höchstens 50.000 Balken je Antwort, `next_from`, `missing`.
- **Musterlösungen des Python-Bots:** 18 Szenarien in `worker_python/tests/parity/` (BKT-01, BKT-09 bestanden).
- **Schon portiert:** `src/lib/analysis/levels.ts` (Grid-Stufen), `candles.ts`, `fractals.ts`, `tradePairing.ts`.
- **Statistik-Tab (PR #108, ANA-09) und MFE/MAE (PR #109, ANA-12), beide in `main`:**
  - `src/lib/analysis/stats.ts`: `computeStats(trades)` → `TradeStats` (Netto, Profit-Faktor, Win-Rate, Zyklen, max. Drawdown …);
  - `curves.ts`: `realizedCurve`, `drawdownCurve`, `balanceCurve`;
  - `groupings.ts`: `breakdown(trades, 'zone'|'setup'|'weekday'|'hour')`, `inScope`;
  - `excursions.ts`: `excursion(trade, m1)`, `m1Spans` (MFE/MAE aus M1);
  - Komponenten `components/analysis/stats/StatsKpis`, `CurveChart`, `BreakdownTable`, `StatsTab` und `components/analysis/TradesTable.tsx`.
  - Alle arbeiten auf dem `Trade`-Typ aus `tradePairing.ts`.
- **Bibliotheken:** lightweight-charts 5.2, react-day-picker, date-fns.

### 1.3 Was korrigiert werden muss

| # | Stelle im Dokument | Problem | Korrektur |
|---|---|---|---|
| 1 | Spread-Kosten = Spread × Tick-Value × Volumen | Wird doppelt gezählt: Die Ausführung zu Ask = Bid + Spread kostet den Spread schon. | Der Spread steckt in den Füllpreisen. „Davon Spread“ wird nur als **Info** ausgewiesen, nicht noch einmal abgezogen. |
| 2 | Swap „3x am Mittwoch“ | Der Dreifach-Tag hängt vom Symbol ab (`swap_rollover3days`), bei Indizes oft Freitag. | Buchung an jedem Brokertag-Wechsel; Dreifach-Tag und Swap-Art (`swap_mode`) kommen vom Symbol. |
| 3 | Profit-Faktor „Soll > 1,5“ | Faustregel ohne Grundlage, in den Regeln schon gestrichen. | Kennzahl ohne Bewertung. |
| 4 | Float32Array für Preise | Float32 hat nur etwa 7 Stellen. Bei BTC oder Indizes rundet das, und die Parität mit Python (Rundung `pyRound`) bricht. | **Float64Array** für Preise. 1 Jahr M1 ≈ 370.000 × 4 × 8 Byte ≈ 12 MB, das passt. |
| 5 | „1 Jahr M1 aus MT5“ | MT5 liefert nur „Max. Balken im Chart“ (Standard 100.000 ≈ 70 Handelstage M1). | Auf dem VPS im Terminal „Max. Balken“ auf „Unbegrenzt“ stellen (prüfen) **oder** CSV-Import. Fehlende Bereiche bleiben sichtbar (`missing`). |
| 6 | Timeframe-Auswahl 1m … 1D | Zwei Dinge sind vermischt: die **Datenauflösung** (wie genau gerechnet wird) und die **Zeitrahmen der Strategie** (Fraktal-TF, Exit-TF der Zone). | Zwei getrennte Felder (siehe 3.2). Die Strategie-Zeitrahmen werden immer aus den Daten zusammengebaut. |
| 7 | Gap → „nächster Eröffnungskurs“ | Im **Paritätsmodus** füllt der Python-FakeMT5 zum Orderpreis. | Zwei Modelle: „Parität“ (wie Musterlösung) und „Gap-Ausführung“ (Standard für echte Läufe). |
| 8 | Ergebnis nur Nettogewinn | Offene Verluste am Testende fehlen. | Immer zusammen anzeigen: realisierter Gewinn, offener G/V, End-Equity, offene Positionen. Dazu der Hinweis „Margin/Stop-out nicht geprüft“, **nicht abschaltbar**. |
| 9 | Phase 1 „SQLite + /rates“ | Ist erledigt. | Der Fahrplan beginnt bei Kostendaten und Engine-Port (Abschnitt 6). |

---

## 2. Grundprinzipien (fest)

1. **Labor:**
   - Ein Backtest speichert nie eine echte Zone.
   - Im Ordner `components/backtest/` und `lib/backtest/` gibt es keinen Import von `mergeAndSaveSettings` und keinen `POST /settings`; ein Test prüft das.
2. **Ein Weg zurück:** Übernahme in die Zonenseite heißt, die Werte landen **ungespeichert** im Formular. Aktiv wird erst, was du dort speicherst.
3. **Gleiche Regeln wie der Bot:** Die TypeScript-Engine muss dieselbe Ereignisfolge liefern wie die Python-Musterlösungen.
4. **Ehrlichkeit:** Datenlücken, Modellgrenzen, das Fehlen von Margin-Prüfung und „geschätzte Kosten“ sind immer sichtbar.
5. **Rechnen im Browser:** Der VPS liefert und speichert nur Kerzen, Symbolwerte und Presets, keine Ergebnisse.

---

## 3. Seite `/backtest`

### 3.1 Aufbau

```
+---------------------------------------------------------------------------+
| Konto [v]  Datenquelle: MT5-Server / CSV-Import   (i) Lizenz              |
| [+ Backtest erstellen] [Presets v] [CSV importieren]                      |
+---------------------------------------------------------------------------+
| Setups:                                                                   |
| (#1 EURUSD·M1·Grid 15p·TP 30p·Spread ~1.2·0.10) [✎][⧉][In Zone][x]  ✓ fertig |
| (#2 EURUSD·M1·Grid 25p·…)                        [✎][⧉][In Zone][x]  ▓▓░ 62 %  |
+---------------------------------------------------------------------------+
| Hinweise (nicht abschaltbar): Datenlücken · Modell · Margin nicht geprüft  |
+---------------------------------------------------------------------------+
| KPIs des gewählten Setups   | [Vergleich: alle Setups als Tabelle]        |
+---------------------------------------------------------------------------+
| Chart: Kerzen · Zonenband · Grid-Stufen · Pfeile · TP/SL                  |
| Equity-/Balance-Bereich                                                   |
| [▶/❚❚] [1x 5x 10x Max]  Anzeige-TF [H1 v]                                 |
+---------------------------------------------------------------------------+
| Laufprotokoll (aufklappbar) · Trades-Tabelle                              |
+---------------------------------------------------------------------------+
```

- **Menü:** neuer Eintrag „Backtest“ in `AppNav.tsx`.
- **Analyse-Seite:** Der leere Backtest-Tab auf `/chart` entfällt; ANA-01 wird angepasst.
- **URL-Zustand** (Neuladen und geteilte Links): `?account=&zone=&setup=`.
- **Handy (375 px):** Der Dialog wird zur Vollbildseite, die Badges brechen um, die KPIs stehen in 2 Spalten.

### 3.2 Dialog „Backtest erstellen / bearbeiten“

Der Dialog ist **groß** (Sheet von rechts, auf dem Handy Vollbild) und hat vier Abschnitte.

1. **Basis:**
   - Konto (Datenquelle = MT5-Server des Kontos) und Symbol.
   - Zeitraum über den vorhandenen `DateRangePicker` (Brokerzeit), Vorauswahl 30/90 Tage, 6 Monate, 1 Jahr, frei.
   - **Datenauflösung:** M1 (Standard, am genauesten), M5, M15, H1.
     - Ab M5 erscheint ein Hinweis.
     - Ein automatischer Hinweis „unsicher“ kommt, wenn der Grid-Abstand kleiner ist als die mittlere Kerzenspanne der gewählten Auflösung.
   - Die Abdeckung (`/coverage`) wird angezeigt: Wie viel ist vorhanden, was fehlt, was wird nachgeladen.
2. **Kosten:**
   - **Spread:** „je Kerze aus MT5“ (Standard) / „fest“ / „Maximum aus beidem“. Daneben steht der Durchschnitts-Spread des Zeitraums als Info.
   - **Kommission** pro Lot (hin und zurück), vorgeschlagen aus deinen echten Deals (`/history/deals`: Kommission ÷ Volumen).
   - **Swap** an/aus, mit Werten des Symbols (Anzeige der Sätze und des Dreifach-Tags).
3. **Zone:**
   - **Derselbe Editor wie auf der Zonenseite:** Die Feld-Komponenten aus `src/components/zone/` (Basic, Grid, Sell, Breakout, Exit, Fractal, FractalSetup) werden ohne Kopf und Logs in einen neuen `ZoneFieldsEditor` gelegt. ZoneCard und Backtest nutzen ihn beide; Tooltips (RULES §5) gelten dann automatisch.
   - **Startwert wählbar:** „aus Zone X von Konto Y“, „aus Preset“ oder „leer (Standardwerte)“.
4. **Modell:**
   - Ausführung: „Gap-Ausführung“ (Standard) / „Parität“.
   - „SL zuerst“ (konservativ).
   - „Beide Kerzenwege“ (rechnet zweimal und zeigt die Spanne).
   - „Am Ende alles schließen“.
   - Startkapital (nur für % und Drawdown %).

**Aktionen:** [Jetzt testen] · [Als Preset speichern] · [Abbrechen].

### 3.3 Mehrere Setups

- **Unabhängige Läufe:** Jedes Setup ist ein eigener Lauf mit eigener `runId`, eigenem Web Worker und Fortschritt.
- **Grenzen:** Höchstens 2 Läufe gleichzeitig, weitere warten. Höchstens 6 Setups auf der Seite.
- **Badges:** Symbol, Datenauflösung, Modus (Grid/Fraktal), Abstand, TP, Spread, Lot, Zeitraum, Status.
- **Bedienung:**
  - Ein Klick wählt das Setup für Chart und KPIs.
  - ✎ bearbeitet das Setup und rechnet neu.
  - ⧉ dupliziert es, um eine Variante zu bauen.
- **Vergleichstabelle:** KPIs aller Setups nebeneinander.
- **Equity überlagern:** Im Equity-Bereich lassen sich die Kurven mehrerer Setups überlagern.
- **„Aggregiert“** (Summe) gibt es nur, wenn Zeitraum und Kontowährung gleich sind; sonst ist die Option aus und der Grund wird angezeigt.
- **Kontowechsel:** Er leert alle Ergebnisse (Regel 4.7). Die Setups (Parameter) bleiben in der Sitzung erhalten.

---

## 4. Verknüpfung mit der Zonenseite

### 4.1 Zone → Backtest (Test-Knopf)

1. Der Test-Knopf in `ZoneHeader.tsx` (heute ein Link auf `/chart?zone=`) wird ein Knopf:
   - Er legt `structuredClone(zone)` plus Konto und Herkunft (`zoneId`, „enthält ungespeicherte Änderungen“ ja/nein über `modified`) in den neuen `useBacktestHandoffStore` (zustand `persist` in **sessionStorage**).
   - Danach navigiert er zu `/backtest?account=…&zone=…`.
2. Die Backtest-Seite öffnet den Dialog vorbefüllt:
   - Zone, Symbol, Zeitraum „letzte 30 Tage“, M1;
   - Kommission aus dem Vorschlag.
3. **Ohne Übergabe** (Neuladen, geteilter Link) gelten die **gespeicherten** Werte der Zone (`useAccountSettings`).
4. Das Laufprotokoll vermerkt die Herkunft und „ungespeicherte Änderungen“.

### 4.2 Backtest → Zonenseite („In Zone übernehmen“)

1. **Knopf** am Setup-Badge und an jedem Preset.
2. **Dialog:**
   - **Zielkonto:** nur eigene Konten (Mehrbenutzer).
   - **Ziel:** „Zone X ersetzen“ (Liste der Zonen dieses Kontos mit gleichem Symbol; vorausgewählt, wenn das Setup aus einer Zone kam) **oder** „als neue Zone anlegen“.
   - **Prüfungen:**
     - Das Symbol muss auf dem Zielkonto vorhanden sein, sonst gesperrt mit Grund.
     - Die Lots werden mit `normalizeZoneLots` an das Symbol angepasst; der Hinweis zeigt, was sich geändert hat.
3. **Übergabe:** in `useZoneTransferStore` (sessionStorage).
   - **Ersetzen:** behält `id`, `magic`, `is_active` und die `sid` der Fraktal-Setups der Zielzone.
   - **Neue Zone:** neue `id`, ohne `magic` (vergibt der Worker), ohne `sid`, **`is_active = false`**.
4. Danach `selectAccount(Ziel)` und Navigation zu `/`.
5. **Dashboard:**
   - `ZoneSettingsPanel` wendet die Übergabe einmal an, sobald `loadedAccount === Ziel`.
   - Dann leert es den Store.
   - Die Zone erscheint als **geändert** (Dirty-Tracking vergleicht mit dem gespeicherten Stand).
   - Ein Banner sagt: „Aus Backtest übernommen, noch nicht gespeichert“; läuft der Bot, kommt der Hinweis „Speichern wirkt sofort auf den laufenden Bot“.
6. **Nichts wird automatisch gespeichert.** Erst dein Klick auf „Speichern“ macht die Übernahme wirksam; sonst verfällt sie beim Verlassen.

### 4.3 Presets

- **Inhalt:** Name, Zone (ohne `id`, `magic`, `sid`, `is_active`), Kosten, Modell, Datenauflösung, letzter Zeitraum, Symbol und App-Version. **Keine Ergebnisse** (bleibt bei deiner Entscheidung).
- **Speicherort (Vorschlag):** im Worker, je Benutzer.
  - Tabelle `backtest_presets` in `market.sqlite` mit `owner` (Principal aus `auth.py`), damit sie auf jedem Gerät da sind und Benutzer sich nicht sehen.
  - Endpunkte: `GET/POST /api/backtest/presets`, `PUT/DELETE /api/backtest/presets/{pid}`.
  - Fremde Presets liefern 404, wie `account_access`.
- **Bedienung** im Menü „Presets“: laden (als neues Setup), umbenennen, löschen, „In Zone übernehmen“.

---

## 5. Technik

### 5.1 Datenfluss

```
VPS (FastAPI)                               Browser
 market.sqlite ── /rates (50k/Seite) ──▶  backtest.worker.ts (besitzt Kursdaten, Float64Array)
 /symbols (+Kosten-Felder)          ──▶   │ engine/ (Port) · broker/simBroker · costs · pathModel
 /history/deals (Kommissions-Vorschlag)   │ → result: Anzeige-Kerzen, Trades, Kurven (Min/Max je Pixel),
 /backtest/presets                         │   Ereignisse für Wiedergabe, KPIs, Laufprotokoll
 /market/imports (CSV)                    ▼
                                         useBacktestStore (Ergebnisse je runId) → Seite
```

- **Kursdaten:** Der Rechen-Worker lädt die Kerzen selbst (Basis-URL und Schlüssel bekommt er je Lauf) und hält sie. Der Hauptthread bekommt nur das Zusammengefasste.
- **Anzeige-Zeitrahmen:** Der Chart fragt den Worker nach Kerzen für einen Anzeige-Zeitrahmen und Bereich (Nachricht `bars`). So bleiben es höchstens etwa 50.000 Kerzen, und beim Hineinzoomen wird feiner nachgeladen.
- **Nachrichten:** `run{runId,…}`, `progress`, `result`, `error`, `bars`, Abbruch per `terminate()`. Veraltete `runId` werden verworfen.
- **Obergrenze:** 1 Mio. Kerzen je Lauf, 100.000 Ereignisse je Kerze, darüber Abbruch mit Meldung.

### 5.2 Dateien (neu, Frontend)

- `src/app/backtest/page.tsx`
- `src/lib/backtest/`
  - **Engine** (`engine/`), eine Datei je Python-Modul, Quelle im Kopf:
    - Grundlagen: `pyRound`, `config`, `validation`, `placement`, `instantEntry`, `vanished` (nur das Nötige);
    - Order und Zonen: `orderManager`, `zoneSelector`, `zoneState`, `orchestrator`;
    - Fraktal: `fractalSignals`, `fractalEntry`, `indicators` (ATR, SAR);
    - `levels` aus `lib/analysis/levels.ts` wiederverwenden.
  - **Broker:** `broker/simBroker.ts` (Modus Parität / Gap), `broker/costs.ts` (Spread-Info, Kommission halb/halb, Swap je Brokertag nach `swap_mode` und `swap_rollover3days`, Gewinn über `trade_tick_value_profit/loss`).
  - **Daten:**
    - `data/loadRates.ts`: blättert `/rates` mit `next_from` durch und sammelt `missing`;
    - `data/bars.ts`: höhere Zeitrahmen ohne Blick in die Zukunft;
    - `data/pathModel.ts`.
  - **Rechner und Protokoll:** `backtest.worker.ts`, `protocol.ts` (Nachrichten-Typen), `runContext.ts` (Laufprotokoll).
- **Statistik wird wiederverwendet, nicht neu angelegt:**
  - Der Simulator erzeugt Trades im **selben `Trade`-Typ** (`tradePairing.ts`): `positionId`, `exitTicket`, `exitReason` (5 = TP, damit `cycles` stimmt), `magic`, `zone`, `net` = Gewinn + Kommission + Swap.
  - KPIs: `computeStats` aus `stats.ts`. Nur das Backtest-Testende kommt dazu (offener G/V, End-Equity, offene Positionen) in `lib/backtest/runSummary.ts`.
  - Kurven: `realizedCurve` und `drawdownCurve` aus `curves.ts`. Die **Equity-Kurve** liefert der Simulator selbst, im `CurvePoint`-Format. `balanceCurve` (rückwärts vom heutigen Stand) braucht der Backtest nicht.
  - Aufteilung: `breakdown` aus `groupings.ts` (Setup, Wochentag, Stunde).
  - MFE/MAE: Der Simulator rechnet sie **exakt im Modell** mit und liefert sie fertig, im `Excursion`-Format aus `excursions.ts`.
- **Stores:**
  - `useBacktestStore`: Setups, Läufe und Ergebnisse je `runId`; ein Kontowechsel leert die Ergebnisse.
  - `useBacktestHandoffStore` und `useZoneTransferStore`: sessionStorage.
- **Komponenten wiederverwendet:**
  - `StatsKpis`, `CurveChart` (realisiert, Drawdown, Equity), `BreakdownTable` aus `components/analysis/stats/`.
  - `TradesTable.tsx`: bekommt eine optionale Prop für **fertige MFE/MAE-Werte**. Ist sie gesetzt, entfallen der Knopf „MFE/MAE berechnen“ und das Laden von M1 (`useExcursions`). `missing` und `openEntries` kommen aus dem Laufergebnis.
- **Komponenten neu** (`src/components/backtest/`): `BacktestToolbar`, `SetupDialog`, `SetupBadges`, `CompareTable` (nutzt `computeStats` je Setup), `RunSummary` (Testende neben `StatsKpis`), `BacktestChart` (auf `analysis/chart/ChartCore.tsx` + `primitives.ts`, mit Equity-Bereich), `ReplayControls`, `RunProtocol`, `TransferDialog`, `PresetMenu`, `CsvImportDialog`.
- `src/components/zone/ZoneFieldsEditor.tsx`: wird aus `ZoneCard.tsx` herausgelöst.
- **i18n:** `src/i18n/messages/backtest.ts`, Hinweise in `hints.ts` (tr/en/de).

### 5.3 Worker-Änderungen

- **Symbolwerte:** `build_detailed_symbols` (`src/utils/mt5_helpers.py:416`) liefert zusätzlich:
  - `trade_calc_mode`, `trade_tick_value_profit`, `trade_tick_value_loss`, `currency_profit`;
  - `swap_mode`, `swap_long`, `swap_short`, `swap_rollover3days`, `spread`, `trade_stops_level`.
  - Die Feldliste gibt es schon in `mt5_market.py:44`. Der TS-Typ `SymbolDetail` wird erweitert.
- **Presets:** neues Modul `src/api/backtest.py` (Presets) und eine neue Tabelle in `market_db.py`.
- **CSV-Import:** `POST /market/{id}/imports`, `PUT …/chunk`, `POST …/commit`, `DELETE`, wie im Analyse-Plan 11.4 (Staging, Prüfung, `source = csv:<import_id>`).
- **Mock-Worker:** `e2e/fixtures/mock-worker.ts` bekommt dieselben Routen.

### 5.4 Nicht simuliert (steht im Journal-Eintrag und im Laufprotokoll)

- Margin und Stop-out.
- Ablehnungen, verschwundene Orders (ENG-25), Auto-Pause (ENG-11), Teilfüllungen.
- Remote-Befehle, Reconnect, mehrere Zonen auf einem Konto gleichzeitig. V1 testet je Setup eine Zone; das Portfolio aus mehreren Zonen kommt in V2.
- Kosten sind Schätzungen; Swap und Fremdwährung rechnen mit heutigen Sätzen.

---

## 6. Schritte (je ein PR, mit Abnahmekriterium)

| # | Schritt | Feature-IDs | Abnahme |
|---|---|---|---|
| **B0** | **Konzept ins Repo** (RULES §7): neuer Journal-Eintrag `docs/journal/2026-10-06-backtest-module-plan.md` (`type: plan`, Englisch, STE, ohne Kontonummern) ersetzt deine Datei; im alten Eintrag `2026-10-02-analyse-statistics-tab-plan.md` zeigen die Schritte 7–9 auf den neuen; Katalog-Einträge BKT-02…13 als „offen“; `proje_dosya_krokisi.md` aktualisieren | – | Katalog-Check grün |
| **B1** | **Kosten-Symbolwerte im Worker** + Typ + Kommissions-Vorschlag | BKT-04 (Teil) | pytest: alle Felder da; Mock-Worker liefert sie |
| **B2** | **Engine-Port Grid** + `simBroker` Paritätsmodus + Spec-Projekt `logic` | BKT-02 | Die 13 Grid-/Exit-/Instant-Szenarien liefern **dieselbe Ereignisfolge** wie die Golden-Dateien; `pyround`-Spec grün |
| **B3** | **Engine-Port Fraktal** (ATR/SAR/Setups) | BKT-03 | Die 5 Fraktal-Szenarien gleich der Golden-Dateien |
| **B4** | **Rechner:** Pfadmodell, höhere TFs, Kosten, Gap-Modell, Web Worker mit Fortschritt/Abbruch | BKT-04, BKT-09 (TS) | Handgerechnete Fälle (Kauf, Verkauf, Lücke, Swap mit Dreifach-Tag, Testende mit offenem Verlust) stimmen; Zukunftsdaten-Test in TS grün; kein Ereignis wird übersprungen |
| **B5** | **Seite `/backtest`:** Toolbar, `SetupDialog` mit `ZoneFieldsEditor`, ein Lauf, KPIs (`StatsKpis` + `RunSummary`), Kurven (`CurveChart`), `TradesTable` mit fertigen MFE/MAE, Laufprotokoll; Test-Knopf leitet um | BKT-06, BKT-07 (Teil), BKT-10, BKT-12 (Zone→Backtest) | e2e: Test-Knopf übergibt ungespeicherte Werte; während des ganzen Ablaufs kein `POST /settings` (Mock zählt); Kontowechsel leert Ergebnisse |
| **B6** | **Chart:** Kerzen, Band, Stufen, Pfeile, Equity-/Balance-Bereich, Wiedergabe 1x/5x/10x/Max, Anzeige-TF | BKT-07 | Bei 1 Jahr M1 höchstens 50.000 gezeichnete Kerzen; Wiedergabe springt nie in die Zukunft der Daten; Lücken grau |
| **B7** | **Mehrere Setups:** Badges, Duplizieren, Vergleichstabelle (`computeStats` je Setup), Equity-Überlagerung, Aufteilung über `BreakdownTable` | BKT-08, BKT-13 | Zwei Setups laufen parallel, ein spät fertiger Lauf überschreibt kein anderes Setup |
| **B8** | **Presets** (Worker + UI) und **„In Zone übernehmen“** | BKT-11, BKT-12 | pytest: fremdes Preset liefert 404. e2e: Übernahme landet **ungespeichert** und markiert im Dashboard; neue Zone ist inaktiv; Symbol fehlt → gesperrt |
| **B9** | **CSV-Import** (Worker-Vorgang + Dialog) | BKT-05 | Abgebrochener oder fehlerhafter Import ist nicht wählbar; Überlappung nur mit „ersetzen“ |

- **Reihenfolge:** B0 → B1 und B2 parallel → B3 → B4 → B5 → B6 → B7 → B8.
- **B9:** Wird vorgezogen, wenn auf dem VPS „Max. Balken = Unbegrenzt“ nicht reicht, um 1 Jahr M1 zu bekommen. Das wird in B1 auf dem DEMO-Konto nur lesend geprüft.

**Neue Feature-IDs:**
- BKT-11: Presets.
- BKT-12: Zonen-Übernahme in beide Richtungen.
- BKT-13: Setup-Vergleich.

Die übrigen IDs stammen aus dem Analyse-Plan (11.11).

---

## 7. Version 2 (nicht in diesem Konzept umgesetzt)

- **Parameter-Suche** (Raster über Abstand/TP), Kontrollzeitraum 70/30, Heatmap gegen Zufallstreffer.
- **Portfolio** aus mehreren Zonen eines Kontos in einem Lauf.
- **Bot-Schutzschalter** (`grid_safety.py`) im Backtest.
- **Tick-genauer Backtest** für kurze Zeiträume.
- **Export** des Laufprotokolls und der Trades (CSV/PDF).

---

## 8. Prüfung (Verifikation)

- **Worker (pytest):**
  - Symbol-Kostenfelder; Presets mit `owner`, 404 für Fremde;
  - CSV-Vorgang (prüfen, abbrechen, ersetzen).
  - Ausführen: `scripts/features/run.sh unit BKT` und `api BKT`.
- **Logik (Playwright-Projekt `logic`, ohne Browserseite):**
  - Parität aller 18 Szenarien und `pyround`;
  - handgerechnete Fälle; Zukunftsdaten-Test.
- **Oberfläche (Mock-Worker, `npm run test:e2e`):**
  - Test-Knopf → Backtest mit ungespeicherten Werten.
  - Kein `POST /settings` aus dem Backtest.
  - Übernahme → Dashboard ungespeichert und markiert.
  - Kontowechsel ohne alte Ergebnisse.
  - Hinweise nicht abschaltbar.
  - Tooltips (UI-07) und 375 px (UI-08).
- **Live, nur lesend auf DEMO** (`run.sh live`): echter Lauf über 30 Tage M1 auf dem DEMO-Konto aus `hooks/test-account.local.md`.
  - Zahlen gegen die Trades der gleichen Zone plausibel prüfen (nicht identisch erwartet).
  - Ladezeit und Speicher bei 1 Jahr M1 messen.
- **Sichtprüfung:** Screenshots per temporärer Playwright-Spec im Worktree (`npm ci`, siehe Worktree-Setup).

## 9. Annahmen (bitte bei der Freigabe bestätigen oder ändern)

- Presets liegen **im Worker je Benutzer** (nicht nur im Browser).
- **Mehrere Setups** sind schon in V1 dabei (wie in deinem Dokument); die automatische Parameter-Suche bleibt V2.
- Der Backtest-Tab auf `/chart` entfällt zugunsten von `/backtest`.
- Nach der Freigabe entsteht als Erstes **B0**: Journal-Eintrag + Katalog als PR. Deine Datei aus dem Haupt-Checkout wird darin aufgenommen und kann danach gelöscht werden.
