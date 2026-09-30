from fastapi import APIRouter, Depends, HTTPException
from src.api.access import account_access
from src.utils.mt5_helpers import get_or_fetch_symbols, get_symbols_fetch_error
from src.utils.mt5_connection import safe_log

router = APIRouter(tags=["Symbols"])


@router.get("/symbols/{account_id}", dependencies=[Depends(account_access)])
async def get_symbols(account_id: str):
    try:
        symbols = await get_or_fetch_symbols(account_id, safe_log)

        response = {
            "status": "success",
            "account_id": account_id,
            "symbols": symbols,
        }
        # Boş liste + MT5 hatası: arayüz "sembol yok" yerine nedenini gösterebilsin
        error = None if symbols else get_symbols_fetch_error(account_id)
        if error:
            response["error"] = error
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
