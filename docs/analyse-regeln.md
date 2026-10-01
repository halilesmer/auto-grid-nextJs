# Analyse-Seite: feste Rechenregeln

Dieses Dokument legt fest, wie die geplante Analyse-Seite rechnet: Chart, Statistik und Backtest.
Es gilt **vor** dem Bauen. Jeder Schritt (Chart, Datenbank, Statistik, Backtest) wird an diesen
Regeln gemessen. Ändert sich eine Regel, wird zuerst dieses Dokument geändert, dann der Code.

Kurz gesagt:
- Der VPS speichert und liefert nur Daten.
- Gerechnet wird im Browser.
- Die echte Zone wird vom Backtest nie verändert.

---

## 1. Zeit

- **Gespeichert wird MT5-Zeit.** Kerzen- und Trade-Zeiten werden so gespeichert, wie MT5 sie
  liefert (Sekunden, meist Brokerzeit). Spalten und Felder heißen ausdrücklich „MT5-Zeit“. Es wird
  nichts umgerechnet, also geht nichts verloren.
- **Warum nicht UTC?** Für vergangene Daten ist der Abstand Broker ↔ UTC nicht sicher bekannt, zum
  Beispiel wegen Sommerzeit. Eine pauschale Umrechnung würde Fehler erzeugen, die man später nicht
  mehr sieht.
- **Abstand messen:** Der Worker misst den Abstand zur echten Uhr bei jedem MT5-Kontakt und
  speichert jede Messung mit Datum (ab der Datenbank, Schritt 2). Den ersten Messpunkt liefert der
  Zeit-Check (Schritt 0, unten). Gezählt werden nur „verlässliche“ Messungen (frischer Tick); je Tag
  gilt der häufigste Wert.
- **Tage und Kalender:** Tagesgrenzen gelten in MT5-Zeit, also so, wie der Broker seinen Tag
  rechnet. So liegen auch Swap und D1-Kerzen.
- **Zeiträume sind halb offen.** „Vom 01.03. bis 31.03.“ heißt intern: ab 01.03. 00:00 bis vor
  01.04. 00:00. Es gibt kein künstliches 23:59:59.
- **„Heute“, „diese Woche“:** Diese Vorauswahlen nutzen die aktuelle Brokerzeit (VPS-Uhr + gemessener
  Abstand), nicht die Uhr des Browsers.
- **Anzeige:** Chart und Tabellen zeigen MT5-Zeit, beschriftet als „Brokerzeit (MT5)“.
  Lightweight Charts kennt keine Zeitzonen; die Zeiten gehen deshalb unverändert an den Chart.
- **Abfragen an MT5** bekommen Zeiten als ganze Sekunden, nie als `datetime` ohne Zeitzone: die
  MetaTrader5-Bibliothek würde ein solches `datetime` mit der Zeitzone des VPS umrechnen.
- **CSV-Dateien:** Beim Import wird die Zeitbasis der Datei gewählt. Standard ist „wie MT5“,
  alternativ eine Verschiebung in Stunden.

## 2. Zonen-Identität

- **Jede Zone hat eine feste Magic-Nummer** (ENG-27). Sie ändert sich nie und wird nie wiederverwendet.
- **Zonen-Register (ab Schritt 2):** Die Datenbank merkt sich, welche Zone welche Magic-Nummer
  hat, auch für gelöschte Zonen. Dazu jede gespeicherte Fassung der Zonen-Einstellungen mit
  Zeitstempel. So zeigt die Statistik, unter welchen Einstellungen ein Trade lief.
- **Alte Trades** aus der Zeit vor dem Register werden nicht geraten, sie heißen „Zone unbekannt“.
  Eine Übernahme der heutigen Zuordnung gibt es nur mit Bestätigung und dauerhafter Kennzeichnung.
- **Ein- und Ausstiege** werden über die Positionsnummer (`position_id`) zusammengeführt.
- **Magic 200000** gehört zu keiner Zone und wird ausgeschlossen.

## 3. Vollständigkeit der Daten

„Abgefragt“ heißt nicht „vollständig“. Jeder Kerzen-Zeitraum hat genau einen dieser Zustände:

| Zustand | Bedeutung | Was passiert |
|---|---|---|
| vollständig | MT5 hat Kerzen geliefert, der Bereich liegt zwischen erster und letzter gelieferter Kerze | wird nicht erneut geholt |
| bestätigte Pause | Lücke **zwischen** zwei gelieferten Kerzen (Wochenende, Feiertag, Tagespause) | als Pause gezeichnet, nie als Kerze |
| nicht verfügbar | vor der ersten oder nach der letzten gelieferten Kerze kam nichts | nach 24 h neu versucht, nie als „Pause“ behandelt |
| Fehler | MT5 nicht erreichbar | nicht gespeichert, beim nächsten Mal neu versucht |

- Die laufende Kerze zählt nie als vollständig.
- Jede Antwort an den Browser sagt, welche Teilbereiche fehlen, warum, und wann zuletzt geprüft wurde.
- **Trade-Historie:** Archiviert werden **alle** Deals des Kontos, auch manuelle Trades sowie Ein-
  und Auszahlungen; gefiltert wird erst bei der Auswertung. Abgeglichene Zeiträume werden einzeln
  gespeichert. Der jüngste Rand wird immer mit 24 h Überlappung neu abgeglichen.
- **Ehrliches Versprechen:** Was einmal archiviert ist, bleibt. Was MT5 schon beim ersten Abruf
  nicht mehr hatte, kann die Datenbank nicht zurückholen.

## 4. Kennzahlen

| Begriff | Regel |
|---|---|
| Trade | ein Ausstieg aus einer Position; eine Teilschließung ist ein eigener Trade; Einstiegskosten werden nach Volumen anteilig verteilt |
| Netto | Gewinn + Kommission + Swap + Gebühr |
| Gewinn-/Verlust-Trade | Netto > 0 / Netto < 0; Netto = 0 wird eigens gezählt |
| Zeitpunkt für Filter, Wochentag, Stunde | Schließzeit (MT5-Zeit); ein Trade, der vor dem Zeitraum eröffnet wurde, zählt mit und wird markiert |
| Grid-Zyklus | ein Trade, der durch TP geschlossen wurde |
| Profit-Faktor | Summe der Gewinne ÷ Summe der Verluste (netto), ohne Bewertung wie „gut ab 1,5“ |

**Drei getrennte Kurven, überall so beschriftet:**

1. **Realisierter Zonen-Gewinn:** Summe der abgeschlossenen Trades der Zone.
2. **Kontostand (Balance):** alle Deals inklusive Ein- und Auszahlungen, rückwärts vom heutigen
   Kontostand gerechnet. Nur wenn das Archiv lückenlos bis heute reicht, sonst keine Kurve, mit Grund.
3. **Equity:** nur im Backtest, als Ergebnis des Modells. Für echte Konten liefert MT5 keinen Equity-Verlauf.

**Testende im Backtest:** Immer zusammen angezeigt werden realisierter Gewinn, offener
Gewinn/Verlust, End-Equity und Anzahl offener Positionen. „Am Ende alles schließen“ ist eine
gekennzeichnete Option.

## 5. Simulationsmodell („Kerzenpfad-Modell“)

Ein eigenes Modell, nicht „wie der MT5-Tester“.

- **Preisweg je Kerze:** steigend Eröffnung → Tief → Hoch → Schluss; fallend Eröffnung → Hoch → Tief → Schluss.
- **Ereignisse statt Stichproben:** Auf jedem Wegstück werden **alle** Auslösungen in
  Preis-Reihenfolge verarbeitet (Orders, TP, SL, Zonengrenzen, Neuausrichtung des Grids), danach ist
  der Bot dran. Nichts wird übersprungen. Mehr als 100.000 Ereignisse in einer Kerze: Abbruch mit Meldung.
- **Zeit in der Kerze:** nach Weglänge auf die Wegstücke verteilt; Eröffnung am Kerzenanfang,
  Schluss 1 s vor Kerzenende (wichtig für die 30-s-Bremse und den Swap um Mitternacht).
- **Kein Blick in die Zukunft:** Zum Zeitpunkt t sieht der Bot nur abgeschlossene Kerzen, die
  laufende Kerze bis zum bisher gelaufenen Weg und den aktuellen Preis.
- **Optionen:** „Konservative Ausführungsregel“ (TP und SL im selben Wegstück: SL zuerst),
  „Sensitivität: beide Kerzenwege“ (zwei Läufe, Spanne anzeigen; eine Prüfung, keine Garantie),
  „Modell mit Gap-Ausführung“ (bei Kurslücken Füllung zum Marktpreis).

## 6. Was unterstützt wird

- **Kontomodell:** Der Backtest unterstützt nur **Hedging-Konten**. Bei Netting startet er nicht
  und nennt den Grund. Die Statistik wertet beide aus.
- **Gewinnrechnung** über `trade_tick_value_profit` / `trade_tick_value_loss`. Unterstützte
  MT5-Berechnungsarten: Forex, Forex ohne Hebel, CFD, CFD-Index, CFD mit Hebel. Andere Arten nur mit
  bewusst gewähltem „Näherungsmodus“. Ist die Gewinnwährung nicht die Kontowährung: Hinweis
  „umgerechnet mit heutigem Kurs“.
- **Kosten:** Spread je Kerze, fest oder das Maximum aus beidem. Kommission pro Lot (je zur Hälfte
  bei Ein- und Ausstieg). Swap mit dem Dreifach-Tag **des Symbols** (`swap_rollover3days`).
- **Schnappschuss:** Alle Symbol- und Kostenwerte werden beim Start eines Laufs festgehalten.
- **Margin und Stop-out** werden nicht simuliert. Das steht immer sichtbar im Ergebnis.

## 7. Laufkontext

- Jedes Backtest-Ergebnis gehört zu einem festen Kontext: Konto, Zone, Einstellungs-Kopie,
  Symbolwerte, Datenquelle mit Datenstand, Zeitraum, Modell-Optionen, Kosten, App-Version. Er steht
  als Laufprotokoll über dem Ergebnis.
- Die Einstellungs-Kopie kommt aus der Zone, auch mit ungespeicherten Änderungen. Das
  Laufprotokoll vermerkt das dann.
- Kontowechsel: alte Ergebnisse verschwinden. Verspätete Antworten werden über eine Anfrage- bzw.
  Lauf-Nummer verworfen.
- Nicht abschaltbar: Datenqualitäts-Warnungen, die aktive Datenquelle, die Modellgrenzen.

## 8. Schutz des Live-Bots

- Der Bot läuft in einem eigenen Prozess, das MT5-Terminal teilt er mit dem Worker.
- **Datenabrufe ändern die Sitzung nicht unnötig:** Datenabrufe des Workers (Symbolliste, Analyse)
  verbinden sich mit `data_query=True` (`worker_python/src/utils/mt5_helpers.py`).
  - Ist das Terminal schon in diesem Konto (und auf diesem Server) angemeldet, wird `mt5.login()`
    nicht aufgerufen. Ein Login baut die Sitzung auch beim selben Konto neu auf und kann den Bot dort
    kurz trennen. Meldet das Terminal direkt nach dem Verbinden noch keine Kontodaten, wartet der
    Abruf bis zu 3 s darauf, statt sich auf Verdacht anzumelden.
  - Ist das Terminal in einem anderen Konto angemeldet, dessen Bot gerade läuft (geteiltes
    Terminal), meldet der Datenabruf es nicht um, sondern bricht mit einer Meldung ab.
  - Nur `/start` meldet sich weiterhin immer an.
- Datenabrufe starten nie ein Terminal neu (`allow_restart=False`) und laufen nicht, während `/start`
  oder `/stop` dasselbe Konto bearbeitet (409).
- Historien-Abrufe kommen später in kleinen Stücken, einer nach dem anderen, mit Pausen (Schritt 2).

---

## Schritt 0: Prüfung auf dem VPS (ANA-13)

**Zeit-Check:** `GET /api/market/{account_id}/time-check?symbol=…`
- nur lesend, nur mit dem Admin-Schlüssel;
- ohne `symbol` nimmt er das Symbol der ersten Zone.

Er liefert:
- Tick-Zeit (Brokerzeit) und echte UTC des VPS, daraus der Broker-Abstand;
- die letzten 3 M1-Kerzen (`copy_rates_range`, Zeiten als Sekunden);
- den letzten Trade-Deal (zuerst in den letzten 7 Tagen gesucht, sonst in 90 Tagen);
- Kontomodell (`margin_mode`) und Kontowährung;
- Berechnungsart, Gewinnwährung und Dreifach-Swap-Tag des Symbols.

Für den Broker-Abstand nimmt der Check den Tick des Zonen-Symbols. Ist der alt (Markt zu), sucht er
bis zu 2 s lang in der Marktübersicht einen frischeren. Ein Symbol, das rund um die Uhr handelt
(z. B. BTCUSD), macht die Messung so auch am Wochenende möglich. Der Abstand gilt als „verlässlich“,
wenn er höchstens 2 min von der nächsten halben Stunde abweicht. Das ist eine
Schätzung: Ist jeder Tick alt (alle Märkte zu), kann sie in seltenen Fällen trotzdem „verlässlich“
melden. Deshalb bei offenem Markt messen.

Fehlerantworten von MT5 (`None`) stehen im Feld `errors`, damit ein Fehler nicht wie ein leeres Konto
aussieht.

**So prüfen** (DEMO-Konto, Markt offen, Bot läuft):

1. Worker auf dem VPS mit diesem Stand neu starten.
2. Auf dem Mac `scripts/features/run.sh live ANA-13` ausführen (braucht in `frontend_nextjs/.env.local`
   den Admin-Schlüssel). Der Test druckt die Werte als „Zeit-Check“-Zeilen.
3. Per RDP in MT5:
   - unter Werkzeuge → Historie den genannten letzten Deal suchen und Ticket und Uhrzeit vergleichen;
   - in der Marktübersicht die Serverzeit mit der Tick-Zeit vergleichen.
4. Im MT5-Journal nachsehen: Während des Checks darf keine neue Zeile „authorized on …“ erscheinen.
   Im Bot-Log darf kein Verbindungsabbruch stehen.
5. Ergebnis eintragen (Tabelle unten) und `scripts/features/run.sh sign ANA-13 bestanden "Notiz"`.

**Messergebnisse:**

| Prüfung | Ergebnis |
|---|---|
| Letzter Deal: Ticket und Zeit in MT5 = API | offen |
| Kerzen- und Tickzeit passen zur MT5-Serverzeit | offen |
| Broker-Abstand (Sommer/Winter) | offen |
| Zeitzone des VPS | offen |
| Kontomodell des DEMO-Kontos (Hedging?) | offen |
| Berechnungsart der genutzten Symbole | offen |
| Kein neuer Login im MT5-Journal beim Datenabruf | offen |
