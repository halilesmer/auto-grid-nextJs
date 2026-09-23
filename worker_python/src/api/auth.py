"""Paylaşılan gizli anahtar (API key) ile basit erişim kontrolü.

Worker ngrok üzerinden internete açık olduğu için `WORKER_API_KEY` ortam değişkeni
ayarlıysa her /api/* isteği `X-API-Key` başlığını, /ws/stream WebSocket'i ise
`api_key` sorgu parametresini (tarayıcılar WS'e başlık ekleyemez) göndermek zorundadır.
Değişken ayarlı değilse eskisi gibi herkese açık çalışır (geriye dönük uyumluluk);
başlangıçta uyarı yazılır.
"""
import hmac
import os
import re
from typing import Optional

API_KEY_HEADER = "X-API-Key"
API_KEY_QUERY_PARAM = "api_key"

WORKER_API_KEY = os.getenv("WORKER_API_KEY", "").strip()

_QUERY_KEY_RE = re.compile(rf"({API_KEY_QUERY_PARAM}=)[^&\s\"']+")


def api_key_required() -> bool:
    return bool(WORKER_API_KEY)


def is_valid_api_key(provided: Optional[str]) -> bool:
    """Anahtar ayarlı değilse her istek geçer; ayarlıysa sabit zamanlı karşılaştırma yapılır."""
    if not WORKER_API_KEY:
        return True
    if not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), WORKER_API_KEY.encode("utf-8"))


def redact_api_key(text: str) -> str:
    """Log satırlarındaki `api_key=...` değerini gizler (uvicorn WS erişim logları)."""
    return _QUERY_KEY_RE.sub(r"\1***", text)
