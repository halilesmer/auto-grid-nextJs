# Mehrbenutzer-Betrieb: jeder sieht nur seine eigenen Broker-Konten

Mehrere Personen können denselben Worker (eine VPS) nutzen. Jede Person verbindet sich mit einem **persönlichen Schlüssel** und sieht und steuert nur die MT5-Konten, die ihr gehören. Der Administrator (du) sieht alle Konten und verwaltet die Benutzer.

Kurzfassung:

| | Administrator | Benutzer |
|---|---|---|
| Schlüssel | `WORKER_API_KEY` (wie bisher) | persönlicher Schlüssel, vom Administrator erzeugt |
| Sieht Konten | alle | nur eigene |
| Legt Konten an | ja, mit frei wählbarem Besitzer | ja, gehören automatisch ihm |
| Benutzer verwalten (`/users`) | ja | nein |
| VPS-Seite (`/vps`), Worker-Update | ja | nein |

Es gibt bewusst **kein Login-Formular mit Passwort**: Der Schlüssel ist der Zugang. Dein Admin-Schlüssel ist damit dein „Admin-Passwort“ (siehe [Admin-Schlüssel](#admin-schlüssel)).

---

## 1. Einrichtung (einmalig, als Administrator)

1. **Worker aktualisieren.** Der Worker holt Updates von `origin/main` automatisch (alle `AUTO_UPDATE_MINUTES`, Standard 5) und startet neu; alternativ auf der Seite `/vps` „Update“ auslösen. Danach ändert sich für dich **nichts**: Dein bisheriger Schlüssel ist jetzt der Admin-Schlüssel, alle bestehenden Konten gehören dir (Konten ohne Besitzer = Administrator).
2. **Frontend aktualisieren** (Vercel baut jeden Merge nach `main` automatisch; lokal `npm run dev:frontend` neu starten).
3. Mit dem **Admin-Schlüssel** verbinden wie bisher (Verbindungs-Chip oben rechts → Dialog „Mit VPS verbinden“). In der Kopfzeile erscheint jetzt der Eintrag **Benutzer**.

> Der Worker muss dafür `WORKER_API_KEY` gesetzt haben (`setx WORKER_API_KEY "<schluessel>"`, siehe [`windows_start_guide.md`](windows_start_guide.md)). Ohne diese Variable ist jeder Administrator; der Worker **verweigert deshalb das Anlegen von Benutzern** (Fehler 409), damit der erste Benutzer nicht alle Admin-Rechte wegnimmt.

## 2. Benutzer anlegen und den Schlüssel weitergeben

1. **Benutzer** öffnen → **Benutzer anlegen** → Namen eingeben (1–40 Zeichen, eindeutig, z. B. „Anna“).
2. Es erscheint ein Fenster mit:
   - dem **persönlichen Schlüssel** und
   - einem fertigen **Verbindungs-Link** (Adresse des Workers + Schlüssel).
3. **Kopiere den Link (oder den Schlüssel) sofort** und gib ihn auf einem sicheren Weg weiter (nicht per öffentlichem Chat/Ticket). Der Schlüssel wird **nur jetzt** angezeigt – auf dem Worker steht nur sein Hash. Geht er verloren, erzeugst du einen neuen (siehe [Schlüssel erneuern](#schlüssel-erneuern-oder-benutzer-sperren)).

Der Benutzer öffnet den Link (oder trägt Adresse und Schlüssel im Dialog „Mit VPS verbinden“ ein), prüft den Test und klickt „Verbinden“. Nichts wird gespeichert, bevor er bestätigt; der Schlüssel liegt danach nur im `localStorage` seines Browsers.

## 3. Was Benutzer sehen und dürfen

- **Kontoliste:** nur die eigenen Konten. Fremde Konten existieren für ihn nicht (der Worker antwortet mit „nicht gefunden“, nicht mit „verboten“).
- **Alles rund ums Konto** (Einstellungen, Zonen, Logs lesen/löschen/herunterladen, Bot starten/stoppen, Symbole, Konto bearbeiten/löschen) nur für die eigenen Konten.
- **Konto anlegen:** ja. Das Konto gehört automatisch ihm. Der MT5-Pfad ist Pflicht und muss eines der **auf der VPS gefundenen Terminals** sein (Rescan im Formular), das **nicht schon zu einem Konto eines anderen Besitzers gehört** (auch nicht zu einem Konto ohne Besitzer/Administrator). Ein eigener Pfad wird abgelehnt (Schutz: der Worker startet dieses Programm; außerdem würde ein Login im Terminal eines anderen dessen Bot stören). Braucht jemand ein Terminal außerhalb der Standard-Ordner, legt der Administrator das Konto an oder trägt den Pfad ein. **Jeder Benutzer braucht also sein eigenes MT5-Terminal auf der VPS.**
- **Bearbeiten und Löschen** eines Kontos geht nur bei **gestopptem Bot** – der Worker verweigert es sonst mit 409 (die Oberfläche sperrt es ohnehin).
- **Nicht sichtbar / nicht möglich:** Seiten **VPS** und **Benutzer**, Worker-Update, Update-Prüfung. Der Menüpunkt „System herunterfahren“ (Einstellungsmenü im Dashboard) stoppt nur den Bot des gewählten eigenen Kontos und schließt das Fenster.
- Der Dialog „Mit VPS verbinden“ zeigt: *Verbunden als Anna (Benutzer).*

Eine Login-Nummer kann nur **einem** Besitzer gehören. Legt jemand ein Konto mit der Login-Nummer eines fremden Kontos an, bekommt er einen Fehler „existiert bereits“ – ohne Angaben zum fremden Konto.

## 4. Konten und Besitzer (Administrator)

- **Bestehende Konten** haben keinen Besitzer und gehören damit dem Administrator. Zum Übergeben: Konto bearbeiten → Feld **Besitzer** → Benutzer wählen → Speichern. (Das Feld erscheint, sobald mindestens ein Benutzer existiert; bei laufendem Bot ist Bearbeiten wie bisher gesperrt.)
- **Neues Konto für einen Benutzer:** beim Anlegen den Besitzer auswählen.
- In der Kontoauswahl steht bei jedem Konto der **Besitzername** (nur für den Administrator, nur wenn es Benutzer gibt). „Administrator“ = ohne Besitzer.
- Die Spalte **Konten** auf der Benutzerseite zeigt, wie viele Konten ein Benutzer hat.

## 5. Schlüssel erneuern oder Benutzer sperren

Auf der Benutzerseite pro Zeile:

- **Neuer Schlüssel** (mit Bestätigung): erzeugt einen neuen Schlüssel und macht den alten **sofort ungültig**. Nutze das bei verlorenem/kompromittiertem Schlüssel; der neue Schlüssel wird wieder nur einmal angezeigt.
- **Löschen** (mit Bestätigung): der Schlüssel wird sofort ungültig. Die **Konten und laufende Bots bleiben erhalten** und gehören danach dem Administrator (Besitzer leer). Bots werden nicht gestoppt.

Alle REST-Anfragen mit dem alten Schlüssel werden **sofort** mit 401 abgelehnt. Eine schon geöffnete WebSocket-Verbindung (Live-Kurse) prüft der Worker alle 5 Sekunden neu und schließt sie, sobald Schlüssel oder Konto-Zugriff nicht mehr gelten (Schlüssel erneuert, Benutzer gelöscht, Konto anderem Besitzer zugewiesen oder gelöscht).

## Admin-Schlüssel

Der Admin-Schlüssel ist der Wert von `WORKER_API_KEY` auf der VPS. Ändern:

```powershell
setx WORKER_API_KEY "<neuer-schluessel>"
```

Danach Worker neu starten (`/vps` → Neustart) und im Frontend mit dem neuen Schlüssel neu verbinden. Wähle einen langen Zufallswert (z. B. 32+ Zeichen); der Bootstrap-Befehl erzeugt einen. Verlorener Admin-Schlüssel: auf der VPS einen neuen setzen wie oben – Benutzer und Konten bleiben unberührt.

---

## Was der Worker schützt

Die Trennung passiert **im Worker**, nicht nur im Frontend: Auch wer die API direkt aufruft (z. B. mit `curl`), erreicht mit seinem Schlüssel nur seine eigenen Konten.

| Bereich | Regel |
|---|---|
| Jede Anfrage | Schlüssel im Header `X-API-Key` bzw. WebSocket `?api_key=` → sonst 401. Der Schlüssel bestimmt die Rolle. |
| `GET /api/accounts` | Benutzer: nur eigene Konten; Administrator: alle |
| `POST /api/accounts` | Benutzer: Besitzer = er selbst (auch wenn der Body etwas anderes sagt); Administrator: Besitzer frei wählbar |
| `PUT/DELETE /api/accounts/{id}` | Nur eigene Konten; Besitzer bleibt beim Bearbeiten erhalten, nur der Administrator ändert ihn; bei laufendem Bot 409 |
| `/settings`, `/ui-state`, `/symbols`, `/logs` (lesen, löschen, `download`), `/start`, `/stop`, `/action` | Nur eigene Konten, sonst **404** |
| WebSocket `/ws/stream` | Benutzer: `account_id` Pflicht und eigenes Konto, sonst Abbruch (Code 1008); kein „erstes Konto“-Fallback. Die Berechtigung wird bei offener Verbindung alle 5 s neu geprüft |
| `POST /api/system/update`, `GET /api/system/update/check` | Nur Administrator (403) |
| `GET /api/system/platform`, `GET /api/system/scan-mt5` | Alle (Verbindungstest bzw. MT5-Pfade im Konto-Formular) |
| `/api/users`, `POST /api/users/{id}/key`, `DELETE /api/users/{id}` | Nur Administrator (403) |
| `GET /api/auth/me` | Alle: liefert `{id, name, role}` |

Zusätzlich abgesichert:

- **Konto-ID nur aus Ziffern.** IDs landen in Dateinamen (`settings_<id>.json`, `logs/<id>/`). Bisher hätten Werte wie `*` oder `..` (Muster-/Pfad-Tricks) fremde Dateien erreichen können; jetzt werden sie beim Anlegen abgelehnt und jede Anfrage muss auf ein existierendes eigenes Konto passen.
- **id und login dürfen nicht kollidieren.** `/start` findet ein Konto über id *oder* login; damit niemand mit einer passenden Login-Nummer den Bot eines anderen erwischt, prüft der Worker beide Felder gegen alle Konten.
- **MT5-Pfad** für Benutzer: Pflicht, nur aus den gefundenen Terminals und nicht das Terminal eines anderen Besitzers (siehe oben).
- **Beschädigte `users.json`** öffnet den Worker nicht: Existiert die Datei, ist aber unlesbar, gilt der Worker weiter als „mit Benutzern“ und lehnt Anfragen ohne Schlüssel ab (kein versehentlicher Admin-Zugang). Fehlt die Datei ganz, gilt der Altmodus.
- **Duplikat-Meldungen** (409) geben nur eigene Konten preis.

## Technik

- **Benutzerspeicher:** `worker_python/configs/users.json` (gitignoriert, wie `accounts.json`): `{"users": [{"id": "u_ab12cd34", "name": "Anna", "key_hash": "<sha256>", "created_at": "…"}]}`. Schlüssel sind 256-Bit-Zufallswerte (`secrets.token_urlsafe(32)`); gespeichert wird nur der SHA-256-Hash, Vergleich zeitkonstant. Schreiben ist atomar (Temp-Datei + Ersetzen).
- **Besitzer:** Feld `owner` (Benutzer-ID) in `configs/accounts.json`. Fehlt es oder ist es leer, gehört das Konto dem Administrator. Ältere Worker-Dateien bleiben lesbar.
- **Rollenauflösung:** `worker_python/src/api/auth.py` (`authenticate()` → `Principal`), gesetzt in der Middleware in `main.py`; Besitzerprüfung in `worker_python/src/api/access.py` (`account_access`); Benutzerverwaltung in `users.py`/`users_store.py`.
- **Altmodus:** Ohne `WORKER_API_KEY` **und** ohne Benutzer bleibt der Worker offen (alle Administrator), wie vor diesem Feature. Gibt es Benutzer, aber keinen `WORKER_API_KEY`, wird jede Anfrage ohne Schlüssel mit 401 abgelehnt.
- **Frontend:** `useAuthStore` (Rolle, geladen über `GET /api/auth/me` sobald der Worker antwortet; ältere Worker ohne diesen Endpunkt gelten als Administrator), `useUsersStore`, `services/usersApi.ts`; Seiten `/users` (nur Administrator) und `/vps`; Komponente `AdminOnly`.
- **Neue Worker-Endpunkte richtig absichern:** kontobezogene Route → `dependencies=[Depends(account_access)]`; Administrator-Route → `Depends(require_admin)`. Sonst würde die Trennung dort fehlen.

## Fehlersuche

| Beobachtung | Ursache / Lösung |
|---|---|
| Chip zeigt „API-Key abgelehnt“ | Schlüssel falsch, erneuert oder Benutzer gelöscht → neuen Schlüssel/Link vom Administrator holen |
| Benutzer sieht keine Konten | Konto gehört ihm noch nicht: Administrator setzt den Besitzer (Konto bearbeiten → Besitzer) |
| Fehler „existiert bereits“ beim Anlegen | Die Login-Nummer ist schon einem anderen Besitzer zugeordnet (jede Nummer nur einmal) |
| Fehler „mt5_path must be an installed MT5 terminal“ oder „already used by another account“ | Benutzer hat einen eigenen oder fremden Pfad gewählt; Rescan und ein freies Terminal aus der Liste wählen, sonst muss der Administrator eins einrichten |
| Fehler „Stop the bot before changing or deleting this account“ (409) | Bot des Kontos zuerst stoppen |
| Fehler „WORKER_API_KEY must be set …“ beim Anlegen eines Benutzers | Auf der VPS `WORKER_API_KEY` setzen (`setx`) und den Worker neu starten |
| Der Verbindungs-Link zeigt auf `localhost` | Du arbeitest lokal: ersetze den Anfang des Links durch die öffentliche Adresse des Frontends (Vercel); der Teil `#connect=…` bleibt gleich (das Fenster weist darauf hin) |
| Seite „Nur für Administratoren“ | Mit einem persönlichen Schlüssel verbunden; für `/users` und `/vps` mit dem Admin-Schlüssel verbinden |
| Live-Kurse fehlen auf Chart-Seiten | Benutzer müssen zuerst ein Konto auswählen (kein Stream ohne Konto) |
| 403 bei Update/Benutzerverwaltung | Nur mit Admin-Schlüssel erlaubt |
| Alle bekommen 401, nachdem die erste Benutzerin angelegt wurde | `WORKER_API_KEY` ist auf der VPS nicht gesetzt: `setx` nachholen und Worker neu starten |

## Grenzen (bewusst)

- **Der Administrator hat vollen Zugriff:** MT5-Passwörter liegen wie bisher im Klartext in `accounts.json` auf der VPS. Wer Zugriff auf die VPS hat, sieht sie.
- **Kein Login-Formular:** Wer den Schlüssel hat, ist der Benutzer. Schlüssel gehören nicht in Chats, Tickets oder Screenshots; die Verbindungs-Links enthalten den Schlüssel (im Fragment `#…`, das nie an einen Server gesendet und nach dem Öffnen aus der Adresszeile entfernt wird).
- **Konto löschen** räumt Einstellungen, Zonen und Logs nicht auf (damit „löschen und neu anlegen“ die Zonen behält). Legt später ein anderer Benutzer dieselbe Login-Nummer an, erbt er diese Dateien. Dasselbe gilt für eine Umbenennung der Konto-ID auf eine verwaiste ID.
- **Ein Terminal, ein Besitzer:** Das MT5-Journal ist pro Terminal. Weise als Administrator **nie zwei Benutzern dasselbe Terminal** zu (Konten verschiedener Besitzer mit gleichem `mt5_path`): Benutzer sehen über die Logs sonst Einträge fremder Konten dieses Terminals. Über das Formular kann das ein Benutzer nicht auslösen.
- **Alle Konten teilen die MT5-Verbindung des API-Prozesses:** Symbol-Abrufe und Starts verschiedener Benutzer laufen nacheinander. Jeder Bot läuft weiterhin in einem eigenen Prozess (und sollte ein eigenes Terminal haben, siehe ACC-11).
- Die Webseite selbst ist öffentlich erreichbar (Vercel); geschützt sind die Daten und Aktionen im Worker.

## Rückbau

`configs/users.json` löschen (oder alle Benutzer auf `/users` löschen) → der Worker verhält sich wieder wie im Einzelbetrieb. Die `owner`-Felder in `accounts.json` schaden nicht.

## Tests

Funktionskatalog Kategorie **USR** (`docs/features/features.yaml`, Checkliste `docs/features/FEATURES.md`):

| ID | Prüft |
|---|---|
| USR-01 | Schlüssel und Rollen, Altmodus |
| USR-02 | Benutzerverwaltung (anlegen, erneuern, löschen, nur Administrator) |
| USR-03 | Konto-Besitzer, ID-Regeln, MT5-Pfad, Duplikate |
| USR-04 | Isolation aller kontobezogenen Endpunkte (fremdes Konto → 404) |
| USR-05 | WebSocket-Isolation |
| USR-06 | Systemrouten nur für Administrator |
| USR-07 | Benutzerseite (Oberfläche) |
| USR-08 | Ansicht eines Benutzers ohne Admin-Oberfläche |

```bash
scripts/features/run.sh USR
```
