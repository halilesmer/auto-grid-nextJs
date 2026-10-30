# Projektlösungen

## Seitenfüllender Formationschart

- **Problem:** Der Chart hatte eine feste Höhe von 460 Pixeln; die Bedingungen beanspruchten eine eigene Seitenspalte.
- **Lösung:** Die Seite `/formasyon` nutzt den sichtbaren Seitenbereich vollständig. Auswahlleisten und Bedingungen liegen darüber.
- **Technik:** Lightweight Charts passt sich mit `autoSize` an den Container an. Bedienbare HTML-Elemente liegen über dem Canvas; Zeichnungen bleiben in der bestehenden SVG-Ebene.
- **Bedienung:** Das Bedingungsfenster scrollt unabhängig und lässt sich einklappen. Unter 900 Pixeln liegt es zunächst unten. Der Kopfgriff verschiebt es per Maus oder Touch innerhalb der Chart-Fläche; Pfeiltasten bewegen es um 10 Pixel, Umschalt mit Pfeil um 50 Pixel. Bei Größenänderung und Aufklappen bleibt es erreichbar. Die Position gilt bis zum Neuladen oder Verlassen der Seite.
- **Grenzen:** Die Ansicht ist seitenfüllend innerhalb des Browsers. Ein Betriebssystem-Vollbildmodus oder Minimieren ist nicht Bestandteil dieser Änderung.
- **Prüfstatus:** Siehe [Projektjournal](docs/journal/2026-10-29-formation-full-page.md).
- **Testumgebung:** Bei belegtem Standardport einen freien `E2E_PORT` wählen. Fremde lokale Dienste unverändert lassen. Falls Turbopack keinen internen Port öffnen kann, den unveränderten Produktionscode mit `next build --webpack` bauen und die bestehenden Browsertests gegen diesen Testserver ausführen.

## Git wählt ein anderes GitHub-Konto

- **Problem:** Ein Push meldet HTTP 403, obwohl die aktive Anmeldung in `gh` Schreibrechte besitzt.
- **Ursache:** Der standardmäßige Git-Zugang kann ein anderes gespeichertes Konto als die aktive `gh`-Anmeldung verwenden.
- **Lösung:** Nach Prüfung der aktiven Anmeldung den Zugang nur für diesen Aufruf über `gh` beziehen: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`. Die globale Git-Konfiguration bleibt unverändert; es wird kein Token ausgegeben.
- **Prüfstatus:** Der Branch dieses Umbaus wurde damit erfolgreich übertragen; die Commit- und Push-Prüfungen bestanden.

## Responsive Navigation und Einstellungszahnrad

- **Problem:** Auf der Formationsseite wurde auch am Desktop das kompakte Mobilmenü erzwungen; der Einstellungs-Auslöser zeigte eine breite Verbindungsadresse.
- **Ursache:** Die Routenausnahme in `AppNav` galt unabhängig von der Bildschirmbreite.
- **Lösung:** Unter 1024 px bleibt die Formationsnavigation schwebend; ab 1024 px wird die normale 56 px hohe Desktopleiste verwendet. Die Chartfläche beginnt dann darunter. Einstellungen öffnen bei jeder Breite über ein Zahnrad.
- **Bedienung:** Host und Verbindungsstatus bleiben im geöffneten Menü sichtbar; Tooltip und zugänglicher Name nennen den Status.
- **Prüfstatus:** Siehe [Projektjournal](docs/journal/2026-10-29-responsive-navigation-settings.md).
- **Grenzen:** Die verfügbare Browserbreite entscheidet über die Ansicht, nicht die Geräteerkennung.

## Gemeinsame Kurscharts und freie Symbolwahl

- **Problem:** Die Analyse war an ein Setup gebunden; Zeichnen, Indikatoren und Darstellung hatten keinen gemeinsamen Zustand.
- **Lösung:** `chart-workspace` verbindet die drei Kursansichten mit Lightweight Charts v5 und dem Drittanbieter `lightweight-charts-drawing` 0.6.2. Ohne Setup-Link öffnet die Analyse den freien Modus. Broker-Symbole werden über die vorhandene authentifizierte Symbolliste ausgewählt.
- **Alte Setup-Links:** Ein `zone=`-Link wählt den Setup-Modus implizit. Beim Kontowechsel wird `mode=setup` ausdrücklich übernommen, während die fremde Zone entfernt wird. So bleibt der gewählte Chartmodus erhalten.
- **Speicherung:** Darstellung und Vorlagen gelten browserweit. Zeichnungen und Indikatoren sind nach Datenquelle, Ansicht, Modus, Konto und Symbol getrennt; Backtests zusätzlich nach Ergebnis. Lokale Bilddaten liegen getrennt von den Dokument-Metadaten.
- **Lokale Bilder nach Neuladen:** Vor dem Zeichnungsimport `setImageReader` für die geprüften lokalen Bilddaten registrieren. Ein bloßes asynchrones `decodeImage`/`cacheImage` reicht nicht: Der Standard-Reader der Bibliothek kann den noch leeren Cache als fehlende Datei werten und das Bildobjekt löschen. Der Regressionstest verzögert die Dekodierung gezielt.
- **Berechnung:** RSI verwendet Wilder-Glättung. EWO ist SMA(5) minus SMA(35), optional als Prozent des Schlusskurses. Datenlücken starten die Anlaufphase neu; bestätigte Marktpausen nicht. Höhere Zeitrahmen veröffentlichen bestätigte Werte erst am Ende ihrer Kerze.
- **Replay:** Zukünftige Zeichnungsanker werden nur vorübergehend ausgeblendet. Die gespeicherte Sichtbarkeit bleibt erhalten.
- **Lebensdauer:** Zeichnungsmanager und Indikatorserien werden vor `chart.remove()` über die gemeinsame Chart-Bindung freigegeben. Beim Formationswechsel lehnen nachlaufende Effekte bereits freigegebene Bindungen ab; geplante Neuzeichnungen werden abgebrochen. Kerzendaten für Zeichenwerkzeuge werden außerhalb der Mausereignisse vorbereitet.
- **Grenzen:** Keine Pine-Ausführung, neuen Handelsaktionen, Alarmdienste oder Nachrichten. Volumenwerkzeuge fehlen mangels belastbarer Kerzenvolumina. Die Bibliothek ist kein offizielles TradingView Advanced Charts.
- **Prüfstatus:** Typprüfung, ESLint und Produktionsbuild bestanden. Referenzberechnungen, freier Chart, Vorschau, Speicherung, Bildimport, Rückgängig und Formationswechsel wurden mit gemockten Brokerdaten geprüft. Laufprotokolle und Grenzen stehen im [Projektjournal](docs/journal/2026-10-30-chart-workspace.md).
