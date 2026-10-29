# Projektlösungen

## Seitenfüllender Formationschart

- **Problem:** Der Chart hatte eine feste Höhe von 460 Pixeln; die Bedingungen beanspruchten eine eigene Seitenspalte.
- **Lösung:** Die Seite `/formasyon` nutzt den sichtbaren Seitenbereich vollständig. Auswahlleisten und Bedingungen liegen darüber.
- **Technik:** Lightweight Charts passt sich mit `autoSize` an den Container an. Bedienbare HTML-Elemente liegen über dem Canvas; Zeichnungen bleiben in der bestehenden SVG-Ebene.
- **Bedienung:** Das Bedingungsfenster scrollt unabhängig und lässt sich einklappen. Unter 900 Pixeln liegt es unten.
- **Grenzen:** Die Ansicht ist seitenfüllend innerhalb des Browsers. Ein Betriebssystem-Vollbildmodus oder Minimieren ist nicht Bestandteil dieser Änderung.
- **Prüfstatus:** Siehe [Projektjournal](docs/journal/2026-10-29-formation-full-page.md).
- **Testumgebung:** Bei belegtem Standardport einen freien `E2E_PORT` wählen. Fremde lokale Dienste unverändert lassen. Falls Turbopack keinen internen Port öffnen kann, den unveränderten Produktionscode mit `next build --webpack` bauen und die bestehenden Browsertests gegen diesen Testserver ausführen.
