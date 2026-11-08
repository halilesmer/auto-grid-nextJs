"""Hesap medyası depolaması (1107-A20, ACC-12): hesap başına en çok 3 dosya (PDF, resim, not).

Düzen: data/media/<hesap>/index.json + her dosya <mediaId>.<uzantı>. Dosya adı yalnız index'te durur
(temizlenmiş); diskteki ad id'den gelir, bu yüzden yol gezinme olamaz. Tür ilk baytlardan belirlenir
(uzantıya/istemci MIME'ına güvenilmez). Hesap başına kilit: paralel yüklemeler sınırı aşamaz.
index.json "owner" yüklemedeki hesap sahibidir; farklı sahip aynı id'yi alırsa klasör silinir (1107-A6.3).
"""
import json
import os
import re
import shutil
import threading
from datetime import datetime, timezone
from typing import Optional

from src.utils import paths

MAX_ITEMS = 3
MAX_BYTES = {"image": 10 * 1024 * 1024, "pdf": 10 * 1024 * 1024, "note": 1024 * 1024}
MAX_UPLOAD_BYTES = max(MAX_BYTES.values())
MAX_NAME_LEN = 120
MEDIA_ID_RE = re.compile(r"^[a-f0-9]{12}$")
SNIFF_BYTES = 12

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


class MediaError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def lock_for(account_id: str) -> threading.Lock:
    key = paths.safe_account_id(account_id)
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def clean_name(raw: str) -> str:
    """Yol parçalarını ve kontrol karakterlerini at, en çok 120 karakter; boş kalırsa hata."""
    name = re.split(r"[\\/]", raw or "")[-1]
    name = "".join(ch for ch in name if ch.isprintable()).strip().strip(".")
    name = name[:MAX_NAME_LEN].strip()
    if not name:
        raise MediaError(422, "File name is required")
    return name


def sniff_binary(head: bytes) -> Optional[tuple[str, str, str]]:
    """(kind, mime, ext) ya da None. Yalnız PDF, PNG, JPEG, WebP."""
    if head.startswith(b"%PDF-"):
        return "pdf", "application/pdf", "pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "image/png", "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image", "image/jpeg", "jpg"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", "image/webp", "webp"
    return None


def note_ext(name: str) -> Optional[str]:
    lowered = name.lower()
    if lowered.endswith(".txt"):
        return "txt"
    if lowered.endswith(".md"):
        return "md"
    return None


def classify(name: str, head: bytes) -> tuple[str, str, str]:
    """Başlangıç baytlarından tür; olmazsa .txt/.md adı → not (içerik sonra doğrulanır). Aksi 415."""
    found = sniff_binary(head)
    if found:
        return found
    ext = note_ext(name)
    if ext:
        return "note", "text/markdown; charset=utf-8" if ext == "md" else "text/plain; charset=utf-8", ext
    raise MediaError(415, "Only PDF, PNG, JPEG, WebP images and .txt/.md notes are allowed")


def validate_note(path: str) -> None:
    with open(path, "rb") as f:
        data = f.read()
    if b"\x00" in data:
        raise MediaError(415, "Note must be plain text")
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        raise MediaError(415, "Note must be UTF-8 text")


def _dir(account_id: str) -> str:
    return paths.get_media_dir(account_id)


def _read_index(account_id: str) -> dict:
    try:
        with open(os.path.join(_dir(account_id), "index.json"), "r", encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items")
        if isinstance(items, list):
            return {"owner": data.get("owner"), "items": items}
    except (OSError, ValueError, AttributeError):
        pass
    return {"owner": None, "items": []}


def _write_index(account_id: str, index: dict) -> None:
    directory = _dir(account_id)
    tmp = os.path.join(directory, "index.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(directory, "index.json"))


def list_items(account_id: str) -> list[dict]:
    with lock_for(account_id):
        return list(_read_index(account_id)["items"])


def count_items(account_id: str) -> int:
    return len(list_items(account_id))


def new_part_path(account_id: str) -> str:
    import secrets

    directory = _dir(account_id)
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f".{secrets.token_hex(6)}.part")


def commit(account_id: str, part_path: str, name: str, kind: str, mime: str, ext: str, size: int,
           owner: Optional[str]) -> dict:
    """Sayıyı kilit altında yeniden denetler, dosyayı yerine koyar, index'i atomik yazar."""
    import secrets

    with lock_for(account_id):
        index = _read_index(account_id)
        if index["items"] and index["owner"] != owner:
            # Sahip değişmiş (ör. yönetici devretti): eski sahibin dosyaları yeni sahibe geçmez
            for item in index["items"]:
                _unlink_item(account_id, item)
            index["items"] = []
        if len(index["items"]) >= MAX_ITEMS:
            raise MediaError(409, f"At most {MAX_ITEMS} files per account")
        media_id = secrets.token_hex(6)
        final = os.path.join(_dir(account_id), f"{media_id}.{ext}")
        try:
            os.replace(part_path, final)
        except FileNotFoundError:
            raise MediaError(409, "Upload was cancelled")
        item = {
            "id": media_id, "name": name, "kind": kind, "mime": mime, "size": size, "ext": ext,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        index["owner"] = owner
        index["items"].append(item)
        try:
            _write_index(account_id, index)
        except Exception:
            _silent_remove(final)
            raise
        return item


def public_item(item: dict) -> dict:
    return {k: item[k] for k in ("id", "name", "kind", "mime", "size", "created_at")}


def get_item(account_id: str, media_id: str) -> tuple[dict, str]:
    if not MEDIA_ID_RE.match(media_id or ""):
        raise MediaError(404, "Media not found")
    with lock_for(account_id):
        item = next((i for i in _read_index(account_id)["items"] if i.get("id") == media_id), None)
    if item is None:
        raise MediaError(404, "Media not found")
    path = os.path.join(_dir(account_id), f"{media_id}.{item['ext']}")
    if not os.path.isfile(path):
        raise MediaError(404, "Media not found")
    return item, path


def delete_item(account_id: str, media_id: str) -> None:
    if not MEDIA_ID_RE.match(media_id or ""):
        raise MediaError(404, "Media not found")
    with lock_for(account_id):
        index = _read_index(account_id)
        item = next((i for i in index["items"] if i.get("id") == media_id), None)
        if item is None:
            raise MediaError(404, "Media not found")
        index["items"] = [i for i in index["items"] if i is not item]
        _write_index(account_id, index)
        _unlink_item(account_id, item)


def claim_account(account_id: str, owner: Optional[str]) -> bool:
    """Hesap bu id ile oluşturuldu/adlandırıldı. Klasörün sahibi farklıysa klasör silinir (True).
    Okunamayan index = sahip bilinmiyor = silinir. Silme başarısızsa hata fırlar (fail-closed)."""
    directory = _dir(account_id)
    with lock_for(account_id):
        if not os.path.isdir(directory):
            return False
        try:
            with open(os.path.join(directory, "index.json"), "r", encoding="utf-8") as f:
                stored = json.load(f).get("owner")
            if stored == owner:
                return False
        except (OSError, ValueError, AttributeError):
            pass
        shutil.rmtree(directory)
    return True


def _unlink_item(account_id: str, item: dict) -> None:
    _silent_remove(os.path.join(_dir(account_id), f"{item.get('id')}.{item.get('ext')}"))


def _silent_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
