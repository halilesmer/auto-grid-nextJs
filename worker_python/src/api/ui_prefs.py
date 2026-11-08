"""NWS-02: Arayüz tercihleri hesap başına (örn. haber filtresi), data/ui_prefs_<id>.json.

`ui_state.py` yalnız zone durumunu saklar; bu modül anahtar başına serbest bir JSON nesnesi saklar.
"""
import asyncio
import json
import os
import re
import threading
import time

from fastapi import APIRouter, Body, Depends, HTTPException

from src.api.access import account_access
from src.api.helpers import _load_accounts
from src.utils.paths import get_ui_prefs_path

router = APIRouter(tags=["UI Prefs"])

KEY_PATTERN = re.compile(r"^[a-z0-9_-]{1,40}$")
MAX_VALUE_BYTES = 8 * 1024
MAX_KEYS = 20
MAX_FILE_BYTES = 64 * 1024
_lock = threading.Lock()  # iki anahtarın okuma-yazma döngüsü birbirini ezmesin


def _read(account_id: str, strict: bool = False) -> dict:
    """Dosya yoksa boş. Bozuk JSON boş sayılır (bir sonraki PUT onarır); `strict`: başka okuma hataları (izin vb.) yükselir,
    böylece PUT geçici bir hatada diğer anahtarları silmez."""
    try:
        with open(get_ui_prefs_path(account_id), "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except ValueError as exc:  # JSONDecodeError, UnicodeDecodeError
        print(f"⚠️ [UI-PREFS] Dosya bozuk, boş dönüyor: {exc}")
        return {}
    except OSError as exc:
        if strict:
            raise
        print(f"⚠️ [UI-PREFS] Dosya okunamadı, boş dönüyor: {exc}")
        return {}


def _write(account_id: str, prefs: dict) -> None:
    path = get_ui_prefs_path(account_id)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(prefs, f, ensure_ascii=False, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())
        # Windows'ta eşzamanlı okuma os.replace'i kısa süre engelleyebilir: birkaç kısa deneme
        for attempt in range(4):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == 3:
                    raise
                time.sleep(0.05)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _read_locked(account_id: str) -> dict:
    with _lock:
        return _read(account_id)


@router.get("/ui-prefs/{account_id}", dependencies=[Depends(account_access)])
async def get_ui_prefs(account_id: str):
    return {"account_id": account_id, "prefs": await asyncio.to_thread(_read_locked, account_id)}


@router.put("/ui-prefs/{account_id}/{key}", dependencies=[Depends(account_access)])
async def put_ui_pref(account_id: str, key: str, body: dict = Body(...)):
    if not KEY_PATTERN.fullmatch(key):
        raise HTTPException(status_code=422, detail="invalid key")
    value = body.get("value")
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail="value must be an object")
    try:
        size = len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8"))
    except ValueError:  # NaN / Infinity: JSON-Antwort würde scheitern
        raise HTTPException(status_code=422, detail="value must be valid JSON")
    if size > MAX_VALUE_BYTES:
        raise HTTPException(status_code=413, detail="value too large")
    # account_access lässt den Admin für jede ID durch; ohne Konto darf keine Datei entstehen
    if not any(str(a.get("id")) == account_id for a in await asyncio.to_thread(_load_accounts)):
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")

    def _store() -> None:
        with _lock:
            prefs = _read(account_id, strict=True)
            prefs[key] = value
            if key not in prefs or len(prefs) > MAX_KEYS:
                raise OverflowError("too many keys")
            if len(json.dumps(prefs, ensure_ascii=False, allow_nan=False).encode("utf-8")) > MAX_FILE_BYTES:
                raise OverflowError("file too large")
            _write(account_id, prefs)

    try:
        await asyncio.to_thread(_store)
    except OverflowError:
        raise HTTPException(status_code=413, detail="too many preferences")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️ [UI-PREFS] Yazılamadı: {exc}")
        raise HTTPException(status_code=500, detail="could not save preference")
    return {"account_id": account_id, "key": key, "value": value}
