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
