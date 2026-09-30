from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from src.api import users_store
from src.api.access import account_access
from src.api.auth import Principal, get_principal
from src.api.models import AccountModel
from src.api.errors import DuplicateAccountProblem
from src.api.helpers import _load_accounts, _public_account, _save_accounts
from src.api.system import find_mt5_terminals
from src.utils.bot_manager import is_bot_running

router = APIRouter(tags=["Accounts"])


def _has_password(account: AccountModel) -> bool:
    return bool((account.password or "").strip())


def _norm_path(path: str) -> str:
    return path.strip().replace("\\", "/").lower()


def _terminal_dir(path: str) -> str:
    return _norm_path(path).rsplit("/", 1)[0]


def _check_mt5_path(
    principal: Principal,
    path: Optional[str],
    accounts: list,
    stored: str = "",
    skip: Optional[int] = None,
) -> None:
    """Kullanıcı yalnızca kayıtlı (değişmemiş) ya da kurulu bir MT5 terminali verebilir.

    - Aksi halde `mt5.initialize(path=...)` VPS'te (UNC dahil) keyfi bir dosyayı çalıştırırdı.
    - Boş yol yasak: yolsuz initialize çalışan herhangi bir terminale bağlanır (ACC-11).
    - Başka bir sahibin (veya sahipsiz/yönetici) hesabının terminali seçilemez: aynı terminalde
      giriş yapmak onun botunun oturumunu değiştirir.
    Yönetici serbesttir.
    """
    if principal.is_admin:
        return
    wanted = _norm_path(path or "")
    if not wanted:
        raise HTTPException(status_code=422, detail="mt5_path is required (pick an installed MT5 terminal, see scan-mt5)")
    if wanted == _norm_path(stored or ""):
        return
    if wanted not in {_norm_path(p) for p in find_mt5_terminals()}:
        raise HTTPException(
            status_code=422,
            detail="mt5_path must be an installed MT5 terminal (see scan-mt5)",
        )
    for i, other in enumerate(accounts):
        if i == skip:
            continue
        other_path = (other.get("mt5_path") or "").strip()
        if other_path and other.get("owner") != principal.user_id and _terminal_dir(other_path) == _terminal_dir(wanted):
            raise HTTPException(status_code=422, detail="This MT5 terminal is already used by another account")


def _ensure_bot_stopped(account_id: str) -> None:
    # Nur die UI sperrte das bisher; per API ließe sich sonst ein Konto mit laufendem Bot löschen/
    # umbenennen, das der Benutzer danach nicht mehr stoppen kann (/stop → 404)
    if is_bot_running(account_id):
        raise HTTPException(status_code=409, detail="Stop the bot before changing or deleting this account")


def _admin_owner(owner: Optional[str]) -> Optional[str]:
    """Yöneticinin verdiği sahip: boş = kimse (yönetici), aksi halde var olan kullanıcı."""
    owner = (owner or "").strip() or None
    if owner is not None and users_store.get_user(owner) is None:
        raise HTTPException(status_code=422, detail=f"Unknown owner '{owner}'")
    return owner


def _conflict(accounts: list, account: AccountModel, skip: Optional[int] = None) -> Optional[dict]:
    """Aynı id/login'e sahip başka hesap. _start_bot id VEYA login eşleştirdiği için ikisi de
    karşılaştırılır; aksi halde bir hesabın id'si başkasının login'iyle çakışıp onun botunu açardı."""
    mine = {str(account.id), str(account.login)}
    for i, other in enumerate(accounts):
        if i == skip:
            continue
        if mine & {str(other.get("id")), str(other.get("login"))}:
            return other
    return None


def _duplicate_error(principal: Principal, account: AccountModel, existing: dict) -> HTTPException:
    # Başkasının hesabının adı/sunucusu/notu sızmasın: ayrıntıyı yalnızca görebilen alır
    if principal.is_admin or existing.get("owner") == principal.user_id:
        detail = DuplicateAccountProblem(
            detail=f"Account '{account.id}' already exists",
            existing_account=_public_account(existing),
        ).model_dump()
    else:
        detail = f"Account '{account.id}' already exists"
    return HTTPException(status_code=409, detail=detail)


@router.get("/accounts")
async def get_accounts(principal: Principal = Depends(get_principal)):
    try:
        accounts = _load_accounts()
        if not principal.is_admin:
            accounts = [a for a in accounts if a.get("owner") == principal.user_id]
        return {"accounts": [_public_account(a) for a in accounts]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post(
    "/accounts",
    status_code=201,
    responses={409: {"model": DuplicateAccountProblem, "description": "Account already exists"}},
)
async def create_account(account: AccountModel, principal: Principal = Depends(get_principal)):
    try:
        if not _has_password(account):
            raise HTTPException(status_code=422, detail="Password is required")
        accounts = _load_accounts()
        _check_mt5_path(principal, account.mt5_path, accounts)
        existing = _conflict(accounts, account)
        if existing:
            raise _duplicate_error(principal, account, existing)
        record = account.model_dump()
        record["owner"] = _admin_owner(account.owner) if principal.is_admin else principal.user_id
        accounts.append(record)
        _save_accounts(accounts)
        return {"status": "created", "account": _public_account(accounts[-1])}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put(
    "/accounts/{account_id}",
    dependencies=[Depends(account_access)],
    responses={409: {"model": DuplicateAccountProblem, "description": "Account already exists"}},
)
async def update_account(
    account_id: str, account: AccountModel, principal: Principal = Depends(get_principal)
):
    try:
        accounts = _load_accounts()
        idx = next(
            (i for i, a in enumerate(accounts) if str(a.get("id")) == str(account_id)),
            None,
        )
        if idx is None:
            raise HTTPException(
                status_code=404, detail=f"Account '{account_id}' not found"
            )
        _ensure_bot_stopped(account_id)
        _check_mt5_path(principal, account.mt5_path, accounts, accounts[idx].get("mt5_path") or "", skip=idx)
        existing = _conflict(accounts, account, skip=idx)
        if existing:
            raise _duplicate_error(principal, account, existing)
        updated = account.model_dump()
        # Sahip güncellemede kaybolmasın (model_dump ile tüm kayıt değişiyor); yalnızca
        # yönetici, ve yalnızca alanı gönderdiyse değiştirir
        if principal.is_admin and "owner" in account.model_fields_set:
            updated["owner"] = _admin_owner(account.owner)
        else:
            updated["owner"] = accounts[idx].get("owner")
        # Şifre API'den hiç dönmediği için form onu boş gönderir: boş/eksik = değişmedi
        if not _has_password(account):
            stored = accounts[idx].get("password")
            if not stored:
                raise HTTPException(status_code=422, detail="Password is required")
            updated["password"] = stored
        accounts[idx] = updated
        _save_accounts(accounts)
        return {"status": "updated", "account": _public_account(accounts[idx])}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/accounts/{account_id}", dependencies=[Depends(account_access)])
async def delete_account(account_id: str):
    try:
        _ensure_bot_stopped(account_id)
        accounts = _load_accounts()
        filtered = [a for a in accounts if str(a.get("id")) != str(account_id)]
        if len(filtered) == len(accounts):
            raise HTTPException(
                status_code=404, detail=f"Account '{account_id}' not found"
            )
        _save_accounts(filtered)
        return {"status": "deleted", "account_id": account_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
