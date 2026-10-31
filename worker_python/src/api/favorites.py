"""FRM-28: /formasyon favori ürünleri, hesap başına configs/favorites_<id>.json."""
import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException

from src.api.access import account_access
from src.api.helpers import _load_accounts
from src.api.models import FavoritesModel
from src.utils.paths import get_favorites_path

router = APIRouter(tags=["Favorites"])


def _read(account_id: str) -> list[str]:
    try:
        with open(get_favorites_path(account_id), "r", encoding="utf-8") as f:
            return FavoritesModel(**json.load(f)).symbols
    except FileNotFoundError:
        return []
    except Exception as exc:  # noqa: BLE001  (bozuk dosya boş liste sayılır, bir sonraki PUT onarır)
        print(f"⚠️ [FAVORITES] Dosya okunamadı, boş liste dönüyor: {exc}")
        return []


@router.get("/favorites/{account_id}", dependencies=[Depends(account_access)])
async def get_favorites(account_id: str):
    return {"status": "success", "account_id": account_id, "symbols": _read(account_id)}


@router.put("/favorites/{account_id}", dependencies=[Depends(account_access)])
async def put_favorites(account_id: str, body: FavoritesModel):
    # account_access lässt den Admin für jede ID durch; ohne Konto darf keine Datei entstehen
    if not any(str(a.get("id")) == account_id for a in await asyncio.to_thread(_load_accounts)):
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")
    path = get_favorites_path(account_id)
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"symbols": body.symbols}, f, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"status": "success", "account_id": account_id, "symbols": body.symbols}
