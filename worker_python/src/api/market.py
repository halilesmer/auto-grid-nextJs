"""Analiz sayfasının piyasa verisi uçları (docs/analyse-regeln.md).

- /time-check (ANA-13): salt-okunur, yalnızca yönetici. Broker saati, hesap modeli
  (hedging/netting) ve sembolün kâr hesabı türü VPS'te bununla ölçülür.
- /clock (ANA-10): takvimin "bugün/bu hafta" gibi seçimleri için broker saati farkı.
"""
import asyncio
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from src.api.access import account_access
from src.api.auth import require_admin
from src.api.helpers import _find_settings_file, _load_accounts, _load_settings_data
from src.utils import mt5_market
from src.utils.bot_watchdog import is_account_busy

router = APIRouter(tags=["Market"])

# Broker saati farkı yalnızca yaz/kış saatinde değişir: güvenilir ölçüm 10 dk tekrar kullanılır
# (sayfa her açılışta MT5'e bağlanmasın). Son güvenilir ölçüm, MT5'e ulaşılamayınca yedek olur.
CLOCK_CACHE_SEC = 600
# Piyasa kapalıyken (güvenilir ölçüm yok) her sayfa açılışı MT5'e bağlanmasın: kısa süre tekrar kullanılır
UNSURE_CACHE_SEC = 60
_last_clock: dict[str, tuple[dict, float]] = {}
_last_unsure: dict[str, float] = {}
# Aynı hesap için eşzamanlı istekler (iki sekme) tek ölçüm yapsın
_clock_locks: dict[str, asyncio.Lock] = {}


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


def _clock_reply(account_id: str, measured: dict | None, cached: bool) -> dict:
    """Güvenilir ölçüm (measured) veya güvenilir ölçüm yok (None: fark bilinmiyor)."""
    if measured is None:
        return {"account_id": account_id, "reliable": False, "offset_sec": None, "offset_hours": None,
                "server_now": None, "cached": cached}
    return {
        "account_id": account_id,
        **measured,
        # Şimdiki broker saati: ölçülen fark + şimdiki VPS UTC'si
        "server_now": round(time.time() + measured["offset_sec"], 3),
        "cached": cached,
    }


@router.get("/market/{account_id}/clock", dependencies=[Depends(account_access)])
async def clock(account_id: str, symbol: Optional[str] = None):
    """Broker saatinin UTC farkı (salt-okunur).

    Yalnızca güvenilir ölçüm (taze tick) bir fark döndürür. Piyasa kapalıyken eski tick'ten çıkan
    fark anlamsızdır (ör. 2 gün eski tick → "UTC−45"): o zaman son güvenilir ölçüm, o da yoksa
    reliable=false ve offset_sec=null döner. MT5'e ulaşılamazsa da son güvenilir ölçüm geçerlidir.
    """
    lock = _clock_locks.setdefault(account_id, asyncio.Lock())
    async with lock:
        now = time.monotonic()
        last = _last_clock.get(account_id)
        if last and now - last[1] < CLOCK_CACHE_SEC:
            return _clock_reply(account_id, last[0], cached=True)
        unsure_at = _last_unsure.get(account_id)
        if unsure_at is not None and now - unsure_at < UNSURE_CACHE_SEC:
            return _clock_reply(account_id, last[0] if last else None, cached=True)
        account = next((a for a in _load_accounts() if str(a.get("id")) == account_id), None)
        if account is None:
            raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")

        error: Optional[HTTPException] = None
        if is_account_busy(account_id):
            error = HTTPException(status_code=409, detail="Hesap şu an başlatılıyor/durduruluyor.")
        else:
            symbol = (symbol or "").strip() or _first_zone_symbol(account_id)
            try:
                measured = await asyncio.to_thread(mt5_market.measure_clock, account, symbol)
            except mt5_market.MarketDataError as exc:
                error = HTTPException(status_code=exc.status, detail=exc.detail)
            else:
                if measured["reliable"]:
                    _last_clock[account_id] = (measured, time.monotonic())
                    _last_unsure.pop(account_id, None)
                    return _clock_reply(account_id, measured, cached=False)
                _last_unsure[account_id] = time.monotonic()
                return _clock_reply(account_id, last[0] if last else None, cached=bool(last))
        if last:
            return _clock_reply(account_id, last[0], cached=True)
        raise error
