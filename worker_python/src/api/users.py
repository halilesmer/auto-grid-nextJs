"""Kullanıcı yönetimi (yalnızca yönetici) ve `GET /auth/me`.

Yönetici bir kullanıcı oluşturur, kişisel anahtarı bir kez görür ve kullanıcıya iletir.
Kullanıcı bu anahtarla bağlanınca yalnızca kendi hesaplarını görür (bkz. access.py).
"""
from fastapi import APIRouter, Depends, HTTPException

from src.api import auth, users_store
from src.api.auth import Principal, get_principal, require_admin
from src.api.helpers import _load_accounts, _save_accounts
from src.api.models import UserCreate

router = APIRouter(tags=["Users"])


def _with_account_count(user: dict, accounts: list) -> dict:
    public = users_store.public_user(user)
    public["account_count"] = sum(1 for a in accounts if a.get("owner") == user["id"])
    return public


@router.get("/auth/me")
async def me(principal: Principal = Depends(get_principal)):
    return {"id": principal.user_id, "name": principal.name, "role": principal.role}


@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users():
    accounts = _load_accounts()
    return {"users": [_with_account_count(u, accounts) for u in users_store.load_users()]}


@router.post("/users", status_code=201, dependencies=[Depends(require_admin)])
async def create_user(payload: UserCreate):
    # Im offenen Modus (kein WORKER_API_KEY) ist jeder Admin; der erste Benutzer würde den offenen
    # Modus beenden und danach hätte niemand mehr Admin-Rechte
    if not auth.WORKER_API_KEY:
        raise HTTPException(
            status_code=409,
            detail="WORKER_API_KEY must be set on the worker before users can be created (setx WORKER_API_KEY …, then restart)",
        )
    if users_store.name_taken(payload.name):
        raise HTTPException(status_code=409, detail=f"User '{payload.name}' already exists")
    user, key = users_store.create_user(payload.name)
    # Düz anahtar yalnızca bu yanıtta döner; sonradan okunamaz (yalnızca yenilenebilir)
    return {"user": _with_account_count(user, _load_accounts()), "key": key}


@router.post("/users/{user_id}/key", dependencies=[Depends(require_admin)])
async def rotate_user_key(user_id: str):
    rotated = users_store.rotate_key(user_id)
    if rotated is None:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    user, key = rotated
    return {"user": _with_account_count(user, _load_accounts()), "key": key}


@router.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
async def delete_user(user_id: str):
    if not users_store.delete_user(user_id):
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    # Hesaplar ve çalışan botlar kalır; sahipsiz (yöneticiye ait) olurlar
    accounts = _load_accounts()
    released = 0
    for account in accounts:
        if account.get("owner") == user_id:
            account["owner"] = None
            released += 1
    if released:
        _save_accounts(accounts)
    return {"status": "deleted", "user_id": user_id, "released_accounts": released}
