"""Hesap sahipliği kontrolü: kullanıcı yalnızca `owner`'ı kendisi olan hesaplara erişir.

Yönetici her hesaba erişir (davranışı eskisi gibi). Kullanıcı için yabancı ya da olmayan
hesap aynı 404'ü alır: hesabın var olduğu sızmaz. Hesap kimliği yalnızca mevcut bir hesabın
`id`'siyle eşleşince dosya yollarında kullanılır; bu, `/settings/*` (glob) ve
`/logs/download/..` (yol gezinme) gibi girdileri de kapatır.
"""
from typing import Optional

from fastapi import HTTPException, Request

from src.api.auth import Principal, get_principal
from src.api.helpers import _load_accounts


def find_owned_account(principal: Principal, account_id: str) -> Optional[dict]:
    """Kullanıcının kendi hesabı (id eşleşmesi ve owner); yoksa None."""
    for account in _load_accounts():
        if str(account.get("id")) == account_id and account.get("owner") == principal.user_id:
            return account
    return None


def can_access_account(principal: Principal, account_id: str) -> bool:
    return principal.is_admin or find_owned_account(principal, account_id) is not None


def assert_account_access(request: Request, account_id: str) -> None:
    if not can_access_account(get_principal(request), account_id):
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")


def account_access(request: Request, account_id: str) -> str:
    """FastAPI bağımlılığı: `account_id` yol ya da sorgu parametresinden gelir."""
    assert_account_access(request, account_id)
    return account_id
