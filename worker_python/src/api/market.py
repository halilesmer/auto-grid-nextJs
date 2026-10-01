"""Analiz sayfasının piyasa verisi uçları (docs/analyse-regeln.md).

Şimdilik yalnızca zaman kontrolü (ANA-13): salt-okunur, yalnızca yönetici. Broker saati,
hesap modeli (hedging/netting) ve sembolün kâr hesabı türü VPS'te bununla ölçülür.
"""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from src.api.access import account_access
from src.api.auth import require_admin
from src.api.helpers import _find_settings_file, _load_accounts, _load_settings_data
from src.utils import mt5_market
from src.utils.bot_watchdog import is_account_busy

router = APIRouter(tags=["Market"])


def _first_zone_symbol(account_id: str) -> Optional[str]:
    path = _find_settings_file(account_id)
    if path is None:
        return None
    try:
        zones = _load_settings_data(path).get("ZONES") or []
    except Exception:
        return None
    return next((z["symbol"] for z in zones if isinstance(z, dict) and z.get("symbol")), None)


@router.get(
    "/market/{account_id}/time-check",
    dependencies=[Depends(require_admin), Depends(account_access)],
)
async def time_check(account_id: str, symbol: Optional[str] = None):
    """Broker saati ↔ VPS UTC, son M1 mumları, son işlem, hesap ve sembol modeli.

    `symbol` verilmezse hesabın ilk bölgesinin sembolü kullanılır.
    """
    account = next((a for a in _load_accounts() if str(a.get("id")) == account_id), None)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")
    symbol = (symbol or "").strip() or _first_zone_symbol(account_id)
    if not symbol:
        raise HTTPException(
            status_code=400, detail="Sembol yok: ?symbol= verin veya hesaba bir bölge ekleyin."
        )
    # /start, /stop veya bekçi bu hesapla MT5'e bağlanıyor: araya girip süresini yeme
    if is_account_busy(account_id):
        raise HTTPException(
            status_code=409,
            detail="Hesap şu an başlatılıyor/durduruluyor; birkaç saniye sonra tekrar deneyin.",
        )
    try:
        result = await asyncio.to_thread(mt5_market.time_check, account, symbol)
    except mt5_market.MarketDataError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
    return {"account_id": account_id, **result}
