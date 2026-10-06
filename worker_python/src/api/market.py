"""Analiz sayfasının piyasa verisi uçları (docs/analyse-regeln.md).

- /time-check (ANA-13): salt-okunur, yalnızca yönetici. Broker saati, hesap modeli
  (hedging/netting) ve sembolün kâr hesabı türü VPS'te bununla ölçülür.
- /clock (ANA-10): takvimin "bugün/bu hafta" gibi seçimleri için broker saati farkı.
- /rates, /coverage (ANA-04): mum veritabanı; eksik parçalar MT5'ten ihtiyaç anında çekilir.
- /history/{id}/deals (ANA-07): hesabın deal arşivi ve bölge kaydı.
"""
import asyncio
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.access import account_access
from src.api.auth import require_admin
from src.api.helpers import _find_settings_file, _load_accounts, _load_settings_data
from src.utils import market_db, market_sync, mt5_market
from src.utils.bot_watchdog import is_account_busy
from src.utils.symbol_setups import settings_zones

router = APIRouter(tags=["Market"])

# Broker saati farkı yalnızca yaz/kış saatinde değişir: güvenilir ölçüm 10 dk tekrar kullanılır
# (sayfa her açılışta MT5'e bağlanmasın). Son güvenilir ölçüm, MT5'e ulaşılamayınca yedek olur.
CLOCK_CACHE_SEC = 600
OFFSET_LOG_MAX_AGE = 24 * 3600  # /rates, /coverage: DB-Protokoll nur so lange als „aktuell“
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
        zones = settings_zones(_load_settings_data(path))
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


def _account_or_404(account_id: str) -> dict:
    account = next((a for a in _load_accounts() if str(a.get("id")) == account_id), None)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")
    # Mumlar sunucuya aittir (kaynak = sunucu adı): sunucusu olmayan hesaplar karışmasın
    if not str(account.get("server") or "").strip():
        raise HTTPException(status_code=400, detail="Hesapta MT5 sunucusu yok; önce hesabı düzenleyin.")
    return account


def _clock_now(account_id: str, server: str = "") -> tuple[float | None, int | None]:
    """Son güvenilir ölçümden şimdiki broker saati ve farkı (ölçüm yoksa None).

    Önce /clock'un bellekteki ölçümü; yoksa (ör. worker yeniden başladı) veritabanına mum
    çekerken kaydedilen son güvenilir fark (en fazla OFFSET_LOG_MAX_AGE eski, yaz saati değişimi).
    """
    last = _last_clock.get(account_id)
    offset = last[0]["offset_sec"] if last else None
    if offset is None and server:
        try:
            offset = market_db.last_broker_offset(server, OFFSET_LOG_MAX_AGE)
        except market_db.MarketDbUnavailable:
            offset = None
    if offset is None:
        return None, None
    return round(time.time() + offset, 3), offset


@router.get("/market/{account_id}/rates", dependencies=[Depends(account_access)])
async def rates(
    account_id: str,
    symbol: str,
    timeframe: str = "M1",
    from_: int = Query(..., alias="from", ge=0),
    to: int = Query(..., gt=0),
):
    """Mumlar [from, to) MT5 zamanında, sütun sütun. Eksik/alınamayan parçalar `missing`'de."""
    if timeframe not in market_sync.TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Zaman dilimi {timeframe} desteklenmiyor")
    if to <= from_:
        raise HTTPException(status_code=400, detail="'to', 'from'dan büyük olmalı")
    account = _account_or_404(account_id)
    symbol = symbol.strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Sembol boş")
    try:
        result = await asyncio.to_thread(
            market_sync.get_rates, account, symbol, timeframe, from_, to, is_account_busy(account_id)
        )
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except mt5_market.MarketDataError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
    server_now, offset = _clock_now(account_id, str(account.get("server") or ""))
    return {"account_id": account_id, **result, "server_now": server_now, "offset_sec": offset}


@router.get("/market/{account_id}/coverage", dependencies=[Depends(account_access)])
async def coverage(account_id: str, symbol: str):
    """Bu sembol için veritabanındaki durum: zaman dilimi ve durum başına aralık, veritabanı boyutu."""
    account = _account_or_404(account_id)
    try:
        summary = await asyncio.to_thread(market_db.coverage_summary, str(account.get("server") or ""), symbol)
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    server_now, offset = _clock_now(account_id, str(account.get("server") or ""))
    return {
        "account_id": account_id,
        "symbol": symbol,
        "source": account.get("server"),
        "coverage": summary,
        "db_bytes": market_db.size_bytes(),
        "db_max_bytes": market_db.max_bytes(),
        "server_now": server_now,
        "offset_sec": offset,
    }


@router.get("/history/{account_id}/deals", dependencies=[Depends(account_access)])
async def deals(
    account_id: str,
    from_: int = Query(0, alias="from", ge=0),
    to: Optional[int] = Query(None, gt=0),
    resync: bool = False,
):
    """Hesabın tüm deal'leri [from, to) MT5 zamanında (bakiye işlemleri dahil) + bölge kaydı."""
    account = _account_or_404(account_id)
    # Üst sınır yoksa "şimdi": broker en fazla UTC+14, bir gün pay her farkı kapsar
    to = to or int(time.time()) + mt5_market.FUTURE_MARGIN_SEC
    if to <= from_:
        raise HTTPException(status_code=400, detail="'to', 'from'dan büyük olmalı")
    try:
        return await asyncio.to_thread(
            market_sync.get_deals, account_id, account, from_, to, is_account_busy(account_id), resync
        )
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
