"""Kullanıcı deposu (configs/users.json): kullanıcı başına kişisel API anahtarı.

Anahtar yalnızca oluşturulurken/yenilenirken bir kez gösterilir; dosyada sadece sha256
özeti durur. Anahtarlar yüksek entropili (32 bayt rastgele) olduğu için yavaş bir parola
özeti gerekmez. Dosya yolu her çağrıda `helpers.USERS_FILE`'dan okunur (testler yolu değiştirir).
"""
import hashlib
import hmac
import json
import os
import secrets
import tempfile
import threading
from datetime import datetime, timezone
from typing import Optional

from src.api import helpers

_lock = threading.Lock()
# Her istekte kimlik doğrulama için okunur → dosya değişmediği sürece önbellekten
# broken: Datei existiert, ist aber unlesbar/kaputt → users_exist() bleibt True (fail-closed, s. auth.py)
_cache: dict = {"sig": None, "users": [], "broken": False}


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _signature(path: str):
    try:
        st = os.stat(path)
    except OSError:
        return None
    return (path, st.st_mtime_ns, st.st_size)


def load_users() -> list[dict]:
    """users.json → list[dict] (dosya yoksa/bozuksa boş liste)."""
    path = helpers.USERS_FILE
    sig = _signature(path)
    if sig is None:
        _cache.update(sig=None, users=[], broken=False)
        return []
    if _cache["sig"] == sig:
        return [dict(u) for u in _cache["users"]]
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        users = data.get("users", []) if isinstance(data, dict) else []
        users = [u for u in users if isinstance(u, dict) and u.get("id") and u.get("key_hash")]
    except Exception:
        # Kaputte/unlesbare Datei: keine Benutzer, aber der Worker gilt weiter als „mit Benutzern“
        _cache.update(sig=None, users=[], broken=True)
        return []
    _cache.update(sig=sig, users=users, broken=False)
    return [dict(u) for u in users]


def users_exist() -> bool:
    """Gibt es Benutzer? Eine vorhandene, aber unlesbare users.json zählt als ja: sonst würde ein
    Worker ohne WORKER_API_KEY durch eine beschädigte Datei für alle offen (Admin für jeden)."""
    users = load_users()
    return bool(users) or bool(_cache["broken"])


def _save_users(users: list[dict]) -> None:
    """Atomik yazım: yarım kalmış dosya kimlik doğrulamayı bozmasın."""
    path = helpers.USERS_FILE
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".users_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"users": users}, f, indent=4, ensure_ascii=False)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    _cache["sig"] = None


def public_user(user: dict) -> dict:
    """API yanıtı için kullanıcı: anahtar özeti asla dışarı verilmez."""
    return {"id": user["id"], "name": user.get("name", ""), "created_at": user.get("created_at")}


def get_user(user_id: str) -> Optional[dict]:
    return next((u for u in load_users() if u["id"] == user_id), None)


def find_user_by_key(key: str) -> Optional[dict]:
    """Anahtarın sahibi; tüm kayıtlar sabit zamanlı karşılaştırılır."""
    digest = hash_key(key)
    found = None
    for user in load_users():
        if hmac.compare_digest(digest, str(user["key_hash"])):
            found = user
    return found


def name_taken(name: str, exclude_id: Optional[str] = None) -> bool:
    wanted = name.strip().casefold()
    return any(
        u.get("name", "").strip().casefold() == wanted and u["id"] != exclude_id
        for u in load_users()
    )


def _new_key() -> str:
    return secrets.token_urlsafe(32)


def create_user(name: str) -> tuple[dict, str]:
    """Yeni kullanıcı; (kayıt, düz anahtar) döner. Anahtar başka yerde tutulmaz."""
    key = _new_key()
    user = {
        "id": "u_" + secrets.token_hex(4),
        "name": name.strip(),
        "key_hash": hash_key(key),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with _lock:
        users = load_users()
        users.append(user)
        _save_users(users)
    return user, key


def rotate_key(user_id: str) -> Optional[tuple[dict, str]]:
    key = _new_key()
    with _lock:
        users = load_users()
        for user in users:
            if user["id"] == user_id:
                user["key_hash"] = hash_key(key)
                _save_users(users)
                return user, key
    return None


def delete_user(user_id: str) -> bool:
    with _lock:
        users = load_users()
        remaining = [u for u in users if u["id"] != user_id]
        if len(remaining) == len(users):
            return False
        _save_users(remaining)
    return True
