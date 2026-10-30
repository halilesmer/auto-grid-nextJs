# Gemeinsame Chart-Einstellungen

Die Analyse, der Backtest und die Formationsansicht verwenden Lightweight Charts v5. Die Zeichenwerkzeuge stammen aus `lightweight-charts-drawing` 0.6.2 von deepentropy. Sie sind eine eigenständige Erweiterung.

Ohne Setup-Bezug öffnet `/chart` den freien Modus. Die Suche verwendet echte Broker-Symbolnamen und Beschreibungen. Alte `zone=`-Links sowie `mode=setup` öffnen den Setup-Modus. Im freien Modus werden keine Setup-Einstellungen, Zonen oder Trades benötigt. Ein passender Kurs aus dem kontogebundenen Bot-Stream darf die aktuelle Kerze aktualisieren; andere Symbole werden verworfen. Die regelmäßigen Markt-Abfragen laufen unabhängig davon.

## Einstellung → Wirkung → Ansichten

„Alle“ bezeichnet die drei Kursansichten einschließlich des freien Charts. Eine abhängige Anzeige kann vorbereitet werden, während sie ausgeblendet ist.

| Einstellung | Sichtbare Wirkung | Ansichten |
|---|---|---|
| Kerzenkörper | Gefüllte Kerzenkörper ein/aus | Alle |
| Steigende/fallende Kerzen | Getrennte Körperfarben | Alle |
| Kerzenränder | Umrisse ein/aus | Alle |
| Rand steigend/fallend | Getrennte Umrissfarben | Alle |
| Dochte | Dochte ein/aus | Alle |
| Docht steigend/fallend | Getrennte Dochtfarben | Alle |
| Farbe nach vorherigem Schlusskurs | Körper, Rand und Docht vergleichen den Schlusskurs mit der vorherigen Kerze | Alle |
| Preispräzision | Nachkommastellen und kleinster Anzeigeschritt; Auto verwendet die Brokerpräzision | Alle |
| Symbolname | Symbol in der Statuszeile ein/aus | Alle |
| Zeitrahmen | Zeitrahmen in der Statuszeile ein/aus | Alle |
| OHLC | Werte der Kerze unter dem Fadenkreuz ein/aus | Analyse, Backtest |
| Kerzenänderung | Schlusskurs minus Eröffnung unter dem Fadenkreuz | Analyse, Backtest |
| Indikatornamen | Namen der Anzeigeindikatoren ein/aus | Alle |
| Indikatorparameter | Perioden neben den Namen ein/aus | Alle |
| Indikatorwerte | Letzte berechnete Werte ein/aus | Alle |
| Statushintergrund | Hintergrund der Status- und Indikatorzeile ein/aus | Alle |
| Statusfarbe und Deckkraft | Farbe und Transparenz dieses Hintergrunds | Alle |
| Skalierung | Linear, logarithmisch oder prozentual | Alle |
| Automatische Skalierung | Automatische Anpassung des Kursbereichs | Alle |
| Skala umkehren | Vertikale Richtung der Kursskala | Alle |
| Links/rechts | Platzierung der Preisachsen | Alle |
| Überlappende Labels vermeiden | Ausrichtung der Skalenlabels | Alle |
| Aktuelle Preislinie | Linie des letzten Kurses ein/aus | Alle |
| Preislinienfarbe und -stil | Farbe sowie durchgezogene, gestrichelte oder gepunktete Linie | Alle |
| Aktuelles Preislabel | Letzten Kurs an der Preisachse ein/aus | Alle |
| Countdown | Sekunden bis zur Kerzengrenze; nur bei verlässlicher aktueller Zeitbasis angeboten | Aktuelle Analysecharts |
| Indikator-Achsenlabels | Letzte Werte der Anzeigeindikatoren an deren Achsen | Alle |
| Hintergrund | Einfarbiger Canvas-Hintergrund | Alle |
| Vertikales/horizontales Raster | Beide Rasterrichtungen unabhängig ein/aus | Alle |
| Rasterfarbe | Farbe beider Rasterrichtungen | Alle |
| Fadenkreuz | Fadenkreuz ein/aus | Alle |
| Fadenkreuzfarbe und -stil | Farbe und Linienmuster | Alle |
| Wasserzeichen | Symbol im Chart-Hintergrund ein/aus | Alle |
| Wasserzeichenfarbe | Farbe des transparenten Symboltexts | Alle |
| Achsenschriftgröße und -farbe | Größe und Farbe der Achsentexte | Alle |
| Achsenfarbe | Randlinien der Zeit- und Preisachsen | Alle |
| Bereichstrenner | Farbe zwischen Chart-Bereichen | Alle |
| Oberer/unterer Abstand | Freier Anteil des Kursbereichs in Prozent; explizite Werte ersetzen den bisherigen Formationsabstand | Alle |
| Navigation | Zoom/Reset; im Formationschart kompakter Reset über der vollständigen Chartfläche | Alle |
| Zeichnungen anzeigen | Alle manuellen Zeichnungen ein/aus | Alle |
| Magnetmodus | Kein, schwaches oder starkes Einrasten an echten Kerzenpreisen | Alle |
| Weiterzeichnen | Werkzeug bleibt nach einer Zeichnung aktiv | Alle |
| Zonen, Grid-Stufen, Positionen, Orders, Historie, Fraktale | Bestehende Legende und Einstellungsfenster teilen denselben Zustand | Setup-Analyse, jeweils fachlich vorhandene Anzeigen |
| Zonen, Grid-Stufen, Trade-Historie, Balance und Equity | Unabhängige Backtest-Anzeigen | Backtest |
| Marktpausen und Datenlückenschraffur | Optionale Linien/Schraffur; Pflichtwarnungen bleiben sichtbar | Analyse, Backtest |
| Formationszeichnungen und System-RSI | Erkannte Zeichnungen und RSI(7) unabhängig ein/aus; Erkennung bleibt unverändert | Formation |

OHLC und Kerzenänderung werden in der Formationsansicht nicht angeboten, solange dort keine entsprechende Hover-Statuszeile angebunden ist. Setup-Anzeigen werden im freien Chart nicht angeboten.

## Indikatoren

- SMA(20), EMA(20), RSI(14), EWO(5/35), MACD(12/26/9), Bollinger(20/2) und ATR(14).
- RSI, EWO, MACD und ATR haben in der Bereichsleiste die Aktionen Verschieben, Einklappen, Vergrößern und Entfernen. Vergrößern gilt nur für den geöffneten Chart und Zeitrahmen und wird nicht gespeichert.
- Das Menü je Indikator bietet Sichtbarkeit, Einstellungen, Skala, Wechsel in einen anderen oder neuen Bereich, Alarm, Favorit, Kopie, Info, lesbare schreibgeschützte Formel und Entfernen. Favoriten gelten je Indikatorart und stehen oben in der Indikatorauswahl.
- Reihenfolge, Sichtbarkeit, Bereich, Einklappen, Skala, Zeitrahmen-Einschränkungen und Alarme liegen im lokalen Chart-Dokument und sind dadurch je Chart-Kontext getrennt. Ältere Dokumente laden ohne Umstellung: Jeder Indikator erhält seinen eigenen Bereich, die Skala folgt weiter der Chart-Achse.
- Alarme gibt es nur im Analyse- und im freien Chart. Ein Alarm meldet einmalig den Übertritt zwischen zwei Werten desselben Charts und Zeitrahmens, solange dieser Chart geöffnet ist, und bleibt danach als ausgelöst stehen. Ein Zeitrahmenwechsel ist kein Übertritt. In einem Hintergrund-Tab wird der Übertritt erst beim Zurückkehren erkannt. Es gibt keine Hintergrund-, E-Mail- oder Push-Dienste.
- Die Objektliste enthält Indikatoren und Zeichnungen. „Indikator hinzufügen“ öffnet die vorhandene Auswahl. Eigene Skripte und Strategien werden nicht ausgeführt.
- Mehrere Instanzen, Perioden, Quellen, Farben, Linienbreite, Sichtbarkeit und Achsen-/Statuswerte. ATR bietet keine wirkungslose Quellenwahl; Histogramme bieten keine Linienbreite.
- Preisindikatoren im Kursbereich; Oszillatoren in eigenen Bereichen. System-RSI und Anzeige-RSI bleiben unabhängig.
- RSI verwendet Wilder-Glättung. Zusätzliche Glättung: keine, SMA, EMA, RMA, WMA oder SMA mit Bollinger-Bändern. Die Schwellen 70/50/30 sind einstellbar, ebenso Hintergrund und Überkauft-/Überverkauft-Füllungen.
- Reguläre RSI-Divergenzen verwenden bestätigte 5/5-Pivots und einen Abstand von 5 bis 60 Kerzen. Sie werden erst nach den Bestätigungskerzen veröffentlicht.
- EWO berechnet die Differenz zweier einfacher Durchschnitte der gewählten Quelle. Prozentmodus teilt diese Differenz durch den Schlusskurs und multipliziert mit 100.
- Höhere Zeitrahmen entstehen aus verfügbaren Chart-Kerzen. Ein unvollständiger Anfang und bekannte Datenlücken liefern keine höheren Kerzen. Bestätigte Werte erscheinen frühestens an der letzten zugehörigen Chart-Kerze.
- Datenlücken beginnen eine neue Anlaufphase. Bestätigte Marktpausen tun dies nicht. Replay übergibt nur bereits sichtbare Kerzen.

## Speicherung und Bedienung

Auf `/chart` werden Darstellung und sichtbarer Balkenbereich je Datenquelle, Ansicht, Modus, Konto und Symbol im lokalen Chart-Dokument gespeichert. Ein Wechsel des Zeitrahmens oder Zeitraums behält die letzte Ansicht dieses Chart-Kontexts. Backtest und Formation verwenden weiter die browserweite Darstellung. Favoriten und Vorlagen gelten browserweit. Gruppenauswahl, Cursor, letzte Magnetstärke, globale Sperre und Indikatorsichtbarkeit werden je Chartkontext gespeichert. Zeichnungen und Indikatorinstanzen bleiben nach Datenquelle, Ansicht, Modus, Konto und tatsächlichem Symbol getrennt; Backtests verwenden zusätzlich eine stabile Identität ihrer Eingaben und Ergebnisse. Zeitrahmenwechsel erhalten Preis- und Brokerzeitanker. Replay blendet spätere Anker vorübergehend aus, ohne gespeicherte Sichtbarkeitsflags zu überschreiben.

„Abbrechen“ stellt Darstellung und Anzeige-Schalter wieder her. „Übernehmen“ speichert die Vorschau. Während einer Vorschau schreibt die Speicherung weiterhin den vorherigen Stand der Anzeige-Schalter. Ein hartes Neuladen übernimmt keine unbestätigten Schalter. Speicherfehler werden angezeigt; die laufende Sitzung bleibt bedienbar. Bilddaten liegen lokal getrennt von den Dokument-Metadaten.

Die Vorlagen **Auto Grid** und **Klassisch dunkel** können verändert und unter eigenen Namen gespeichert werden. Zurücksetzen stellt die Ausgangswerte wieder her. Bestehende Analyse-Schalter bleiben erhalten.

Zeichnungen lassen sich auswählen, ziehen, bearbeiten, benennen, duplizieren, sperren, ausblenden und löschen. Objektliste und Verlauf gehören zum jeweiligen Chart. Strg/Cmd+Z und Strg/Cmd+Umschalt+Z gelten im fokussierten Chart; Eingabefelder sind ausgenommen. Text, Tabellenzellen und lokale PNG/JPEG/WebP-Bilder haben eigene Eingaben. Der Bildimport ist auf 2 MB und 2000 Pixel je Seite begrenzt.

Keine neuen Handelsaktionen, Alarmdienste, Nachrichten, Wirtschaftstermine oder Pine-Ausführung. Volumenwerkzeuge bleiben ausgeschlossen. Brokerzeit, Datenqualitätswarnungen und Lizenzhinweise sind verbindlich.


## Senkrechte Werkzeugleiste

Die gemeinsame Leiste bleibt links am Chart, auch auf schmalen Bildschirmen. Sie ist 52 px breit und verwendet 40 px große Hauptschaltflächen. Bei geringer Höhe scrollt der Werkzeugbereich; der Favoritenstern bleibt unten erreichbar. Seitliche Menüs liegen im obersten Browser-Layer. Tab, Enter, Pfeiltasten und Escape bedienen die Menüs.

| Bereich | Bedienung |
|---|---|
| Cursor | Fadenkreuz, Punkt oder Pfeil; die Zeichnungsauswahl bleibt möglich. |
| Werkzeuggruppen | Hauptsymbol aktiviert das zuletzt verwendete Werkzeug; der kleine Pfeil öffnet alle vorhandenen Werkzeuge. |
| Favoriten | Sterne in den Werkzeuglisten verwalten die kompakte Leiste mit Werkzeugsymbolen. |
| Messen | Im Hauptchart ziehen; Preisänderung, Prozentänderung und Kerzenabstand erscheinen vorübergehend. Escape entfernt die Messung. |
| Bereichszoom | Rechteck im Hauptchart ziehen; anschließend wieder Auswahl. Das Menü stellt den vorherigen Zeit- und Preisbereich wieder her. |
| Magnet | Hauptschalter wechselt zwischen Aus und zuletzt gewählter Stärke. Das Menü wählt Aus, Schwach oder Stark. |
| Weiterzeichnen | Das Werkzeug bleibt nach einer fertigen Zeichnung aktiv. |
| Globale Sperre | Verhindert Verschieben, Bearbeiten, Zeichnungslöschen und Verlaufänderungen. Ursprüngliche Objektsperren bleiben beim Entsperren erhalten. |
| Sichtbarkeit | Zeichnungen und eigene Indikatoren einzeln oder gemeinsam zeigen und verbergen. Systemindikatoren bleiben unabhängig. |
| Papierkorb | Eine ausgewählte ungesperrte Zeichnung direkt löschen; mehrere ausgewählte Zeichnungen, alle ungesperrten Zeichnungen oder eigene Indikatoren nach Bestätigung entfernen. Zeichnungslöschungen sind rückgängig machbar. |

## Zeichnungen in diesem Browser verknüpfen

Die Kette ist standardmäßig aus und wird je Chartkontext gespeichert. Analyse, Formationen und Backtest verwenden beim Verknüpfen dieselbe Identität aus Datenquelle, Konto und exaktem Symbolnamen. CSV-Importe haben eine eigene Datenquelle.

Beim Aktivieren werden die privaten Zeichnungen zum gemeinsamen Bestand hinzugefügt. Identische Objekt-IDs mit identischem Inhalt erscheinen einmal. Unterschiedliche Inhalte mit gleicher ID bleiben als getrennte Objekte erhalten. Lokale Bilddaten gehören zum gemeinsamen Bestand und werden vor dem Import über den lokalen Bildleser bereitgestellt.

Der private Ausgangsbestand bleibt gespeichert. Beim Trennen erscheint dieser private Bestand wieder. Änderungen im gemeinsamen Bestand werden beim Trennen nicht in den privaten Bestand kopiert. Indikatoren, Handelsmarkierungen und Chartdarstellung gehören nicht zur Verknüpfung. Replay blendet zukünftige Zeichnungen weiterhin nur vorübergehend aus.

Änderungen erreichen andere Tabs über Browser-Speicherereignisse. Die Web Locks API serialisiert das Zusammenführen und Speichern. Fremde Ergänzungen bleiben bei lokalen Zeichenaktionen erhalten. Ohne Web Locks funktioniert die lokale Speicherung weiterhin; gleichzeitige Schreibaktionen mehrerer Tabs sind dann nicht vollständig serialisiert. Es gibt keine Geräte- oder Backend-Synchronisierung.
