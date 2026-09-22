from fastapi import APIRouter, HTTPException
from src.utils.mt5_helpers import get_or_fetch_symbols
from src.utils.mt5_connection import safe_log

router = APIRouter(tags=["Symbols"])


@router.get("/symbols/{account_id}")
async def get_symbols(account_id: str):
    try:
        symbols = await get_or_fetch_symbols(account_id, safe_log)
        
        return {
            "status": "success",
            "account_id": account_id,
            "symbols": symbols,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))