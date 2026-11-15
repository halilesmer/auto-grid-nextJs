"""USR-09: Kişisel tercihler kullanıcıya ait (dil, tema, ipucu süreleri …), data/user_prefs_<kullanıcı>.json.

`ui_prefs.py` ile aynı kalıp (anahtar başına serbest JSON nesnesi), ama hesaba değil isteği yapan kullanıcıya bağlı:
admin `admin` dosyasını, bir kullanıcı kendi `u_…` dosyasını kullanır. Her rol kullanabilir; başkasının dosyasına
yol yoktur, çünkü kimlik yoldan değil anahtardan (Principal) gelir.
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
from src.api.auth import Principal, get_principal
from src.api import ui_prefs
from src.utils.paths import get_user_prefs_path, safe_user_id

router = APIRouter(tags=["User Prefs"])

KEY_PATTERN = re.compile(r"^[a-z0-9_-]{1,40}$")
MAX_VALUE_BYTES = 8 * 1024
MAX_KEYS = 40
MAX_FILE_BYTES = 128 * 1024
_lock = threading.Lock()  # iki anahtarın okuma-yazma döngüsü birbirini ezmesin


def _read(user_id: str, strict: bool = False) -> dict:
    """Dosya yoksa boş. Bozuk JSON boş sayılır (bir sonraki PUT onarır); `strict`: başka okuma hataları yükselir,
    böylece PUT geçici bir hatada diğer anahtarları silmez."""
    try:
        with open(get_user_prefs_path(user_id), "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except ValueError as exc:  # JSONDecodeError, UnicodeDecodeError
        print(f"⚠️ [USER-PREFS] Dosya bozuk, boş dönüyor: {exc}")
        return {}
    except OSError as exc:
        if strict:
            raise
        print(f"⚠️ [USER-PREFS] Dosya okunamadı, boş dönüyor: {exc}")
        return {}


def _write(user_id: str, prefs: dict) -> None:
    path = get_user_prefs_path(user_id)
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


def _read_locked(user_id: str) -> dict:
    with _lock:
        return _read(user_id)


def _user_id(principal: Principal) -> str:
    try:
        safe_user_id(principal.user_id)
    except ValueError:
        raise HTTPException(status_code=403, detail="no preferences for this principal")
    return principal.user_id


@router.get("/me/prefs")
async def get_user_prefs(principal: Principal = Depends(get_principal)):
    user_id = _user_id(principal)
    return {"user_id": user_id, "prefs": await asyncio.to_thread(_read_locked, user_id)}


@router.put("/me/prefs/{key}")
async def put_user_pref(key: str, body: dict = Body(...), principal: Principal = Depends(get_principal)):
    user_id = _user_id(principal)
    if not KEY_PATTERN.fullmatch(key):
        raise HTTPException(status_code=422, detail="invalid key")
    value = body.get("value")
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail="value must be an object")
    try:
        size = len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8"))
    except ValueError:  # NaN / Infinity
        raise HTTPException(status_code=422, detail="value must be valid JSON")
    if size > MAX_VALUE_BYTES:
        raise HTTPException(status_code=413, detail="value too large")

    def _store() -> None:
        with _lock:
            prefs = _read(user_id, strict=True)
            prefs[key] = value
            if len(prefs) > MAX_KEYS:
                raise OverflowError("too many keys")
            if len(json.dumps(prefs, ensure_ascii=False, allow_nan=False).encode("utf-8")) > MAX_FILE_BYTES:
                raise OverflowError("file too large")
            _write(user_id, prefs)

    try:
        await asyncio.to_thread(_store)
    except OverflowError:
        raise HTTPException(status_code=413, detail="too many preferences")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️ [USER-PREFS] Yazılamadı: {exc}")
        raise HTTPException(status_code=500, detail="could not save preference")
    return {"user_id": user_id, "key": key, "value": value}


# USR-11: Haber filtresi ve haber uyarısı eskiden hesaba bağlıydı (`ui_prefs`); kullanıcıya taşınır (karar 1114-A2.2).
# Göç tek seferliktir: kullanıcıda değer yoksa seçili hesabın değeri alınır. Hesap anahtarları silinmez.
ACCOUNT_KEYS_TO_IMPORT = ("news_filter", "news_alerts")


@router.post("/me/prefs/import-account/{account_id}", dependencies=[Depends(account_access)])
async def import_account_prefs(account_id: str, principal: Principal = Depends(get_principal)):
    user_id = _user_id(principal)
    # account_access lässt den Admin für jede ID durch; ohne Konto gibt es nichts zu übernehmen
    if not any(str(a.get("id")) == account_id for a in await asyncio.to_thread(_load_accounts)):
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")

    def _import() -> tuple[list[str], dict]:
        with _lock:
            prefs = _read(user_id, strict=True)
            account_prefs = ui_prefs._read_locked(account_id)
            imported = [
                k for k in ACCOUNT_KEYS_TO_IMPORT
                if k not in prefs and isinstance(account_prefs.get(k), dict)
                and len(json.dumps(account_prefs[k], ensure_ascii=False, allow_nan=False).encode("utf-8")) <= MAX_VALUE_BYTES
            ]
            if imported:
                for k in imported:
                    prefs[k] = account_prefs[k]
                if len(prefs) > MAX_KEYS or len(json.dumps(prefs, ensure_ascii=False, allow_nan=False).encode("utf-8")) > MAX_FILE_BYTES:
                    raise OverflowError("too many keys")
                _write(user_id, prefs)
            return imported, prefs

    try:
        imported, prefs = await asyncio.to_thread(_import)
    except OverflowError:
        raise HTTPException(status_code=413, detail="too many preferences")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️ [USER-PREFS] Göç yazılamadı: {exc}")
        raise HTTPException(status_code=500, detail="could not import preferences")
    return {"user_id": user_id, "imported": imported, "prefs": prefs}
