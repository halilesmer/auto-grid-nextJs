"""Paylaşılan gizli anahtar (API key) ile basit erişim kontrolü.

Worker ngrok üzerinden internete açık olduğu için `WORKER_API_KEY` ortam değişkeni
ayarlıysa her /api/* isteği `X-API-Key` başlığını, /ws/stream WebSocket'i ise
`api_key` sorgu parametresini (tarayıcılar WS'e başlık ekleyemez) göndermek zorundadır.
Değişken ayarlı değilse eskisi gibi herkese açık çalışır (geriye dönük uyumluluk);
başlangıçta uyarı yazılır.

Çok kullanıcı: `WORKER_API_KEY` yönetici (admin) anahtarıdır ve her hesabı görür. Yönetici,
`configs/users.json` içinde kullanıcı başına kişisel anahtar üretir (bkz. users_store.py);
bu anahtarla gelen istek yalnızca sahibi olduğu hesaplara erişir (bkz. access.py).
"""
import hmac
import os
import re
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request

from src.api import users_store

API_KEY_HEADER = "X-API-Key"
API_KEY_QUERY_PARAM = "api_key"

ROLE_ADMIN = "admin"
ROLE_USER = "user"

WORKER_API_KEY = os.getenv("WORKER_API_KEY", "").strip()

_QUERY_KEY_RE = re.compile(rf"({API_KEY_QUERY_PARAM}=)[^&\s\"']+")


@dataclass(frozen=True)
class Principal:
    """İsteği yapan: yönetici veya bir kullanıcı (`user_id` = hesaplardaki `owner`)."""

    user_id: str
    name: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN


ADMIN = Principal(user_id="admin", name="admin", role=ROLE_ADMIN)


def api_key_required() -> bool:
    """Anahtar ayarlıysa veya kullanıcı varsa kimlik doğrulama zorunludur."""
    return bool(WORKER_API_KEY) or users_store.users_exist()


def authenticate(provided: Optional[str]) -> Optional[Principal]:
    """Anahtarın sahibi; geçersizse None.

    Ne WORKER_API_KEY ne kullanıcı varsa worker eskisi gibi açıktır (herkes admin).
    WORKER_API_KEY boş ama kullanıcı varsa anahtarsız istek reddedilir (yanlışlıkla admin olmaz).
    """
    if not api_key_required():
        return ADMIN
    if not provided:
        return None
    if WORKER_API_KEY and hmac.compare_digest(
        provided.encode("utf-8"), WORKER_API_KEY.encode("utf-8")
    ):
        return ADMIN
    user = users_store.find_user_by_key(provided)
    if user is None:
        return None
    return Principal(user_id=user["id"], name=user.get("name", ""), role=ROLE_USER)


def is_valid_api_key(provided: Optional[str]) -> bool:
    return authenticate(provided) is not None


def get_principal(request: Request) -> Principal:
    """Middleware'in (main.py) çözdüğü istek sahibi; yoksa başlıktan çözülür."""
    principal = getattr(request.state, "principal", None)
    if principal is None:
        principal = authenticate(request.headers.get(API_KEY_HEADER))
    if principal is None:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return principal


def require_admin(request: Request) -> Principal:
    principal = get_principal(request)
    if not principal.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return principal


def redact_api_key(text: str) -> str:
    """Log satırlarındaki `api_key=...` değerini gizler (uvicorn WS erişim logları)."""
    return _QUERY_KEY_RE.sub(r"\1***", text)
