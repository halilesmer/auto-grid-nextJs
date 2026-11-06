from fastapi import APIRouter, Depends, HTTPException
from src.api.access import account_access
from src.utils.mt5_helpers import get_or_fetch_symbols, get_symbols_fetch_error
from src.utils.mt5_connection import safe_log
from src.utils import trade_sessions
from src.api.helpers import _load_accounts

router = APIRouter(tags=["Symbols"])


@router.get("/symbols/{account_id}", dependencies=[Depends(account_access)])
async def get_symbols(account_id: str):
    try:
        symbols = await get_or_fetch_symbols(account_id, safe_log)

        server = next((a.get("server") for a in _load_accounts() if str(a.get("id")) == account_id), "")
        # BKT-21: Seans planı önbelleğe girmez (dosya değişince hemen geçerli olur); yoksa null
        symbols = [{**s, "trade_sessions": trade_sessions.sessions_for(s.get("name", ""), server)} for s in symbols]

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
