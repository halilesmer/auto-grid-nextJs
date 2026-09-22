from fastapi import APIRouter, HTTPException
from src.api.models import AccountModel
from src.api.errors import DuplicateAccountProblem
from src.api.helpers import _load_accounts, _save_accounts

router = APIRouter(tags=["Accounts"])


@router.get("/accounts")
async def get_accounts():
    try:
        return {"accounts": _load_accounts()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post(
    "/accounts",
    status_code=201,
    responses={409: {"model": DuplicateAccountProblem, "description": "Account already exists"}},
)
async def create_account(account: AccountModel):
    try:
        accounts = _load_accounts()
        existing = next(
            (a for a in accounts if str(a.get("id")) == str(account.id)),
            None,
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=DuplicateAccountProblem(
                    detail=f"Account '{account.id}' already exists",
                    existing_account=dict(existing),
                ).model_dump(),
            )
        accounts.append(account.model_dump())
        _save_accounts(accounts)
        return {"status": "created", "account": account.model_dump()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put(
    "/accounts/{account_id}",
    responses={409: {"model": DuplicateAccountProblem, "description": "Account already exists"}},
)
async def update_account(account_id: str, account: AccountModel):
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
        existing = next(
            (a for i, a in enumerate(accounts) if i != idx and str(a.get("id")) == str(account.id)),
            None,
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=DuplicateAccountProblem(
                    detail=f"Account '{account.id}' already exists",
                    existing_account=dict(existing),
                ).model_dump(),
            )
        accounts[idx] = account.model_dump()
        _save_accounts(accounts)
        return {"status": "updated", "account": accounts[idx]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str):
    try:
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