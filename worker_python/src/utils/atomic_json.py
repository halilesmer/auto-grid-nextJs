"""Atomares JSON-Schreiben für Dateien, die auch ein anderer Prozess (Bot) liest.

Die Temp-Datei heißt ``<datei>.<zufall>.api.tmp``: sie kollidiert nicht mit dem
``<datei>.tmp`` der Bot-Schreiber (anderer Prozess, gleiche Zieldatei).
"""
import json
import os
import tempfile
import time

REPLACE_RETRIES = 5
REPLACE_DELAY_SECONDS = 0.05


def atomic_write_json(path, data, *, indent=4):
    """Schreibt ``data`` als JSON nach ``path`` (Temp-Datei + ``os.replace``).

    Windows: ``os.replace`` kann mit ``PermissionError`` scheitern, solange ein
    anderer Prozess die Zieldatei offen hält; es gibt kurze, begrenzte Wiederholungen.
    Bei Fehler bleibt die alte Datei unverändert, die Temp-Datei wird entfernt und
    die Ausnahme weitergereicht.
    """
    directory = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(prefix=os.path.basename(path) + ".", suffix=".api.tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent, ensure_ascii=False)
        for attempt in range(REPLACE_RETRIES):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == REPLACE_RETRIES - 1:
                    raise
                time.sleep(REPLACE_DELAY_SECONDS * (attempt + 1))
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
