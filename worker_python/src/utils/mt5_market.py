# src/utils/mt5_market.py
"""Analiz sayfası için MT5'ten salt-okunur sorgular (ANA-13, docs/analyse-regeln.md).

API sürecinde çalışır. Bot ayrı bir süreçtir, _MT5_LOCK onu kilitlemez; terminal ise ortaktır.
Bu yüzden bağlantı veri sorgusu kipindedir (data_query: gereksiz login yok, çalışan başka bir
botun oturumu değiştirilmez), terminal yeniden başlatılmaz (allow_restart=False), emir/ayar
değiştirilmez ve kilit tutulurken sorgular küçük tutulur.

Zamanlar MT5'in verdiği gibi döner ("MT5 zamanı" = broker saati, saniye). Zaman kontrolü
bunu VPS'in gerçek UTC'siyle karşılaştırıp broker farkını tahmin eder.
"""
import time

from src.utils import mt5_connection as mc
from src.utils.mt5_helpers import SYMBOL_COST_FIELDS

CONNECT_TIMEOUT_SEC = 15
# Son M1 mumlarını ararken geriye bakış: hafta sonunu ve uzun bayram aralarını (Paskalya) kapsar
RATES_LOOKBACK_SEC = 7 * 86400
# Son işlem önce kısa pencerede aranır (kilit kısa tutulur), yoksa uzun pencerede
DEALS_LOOKBACK_DAYS = (7, 90)
RECENT_BARS = 3
# Broker saati UTC'nin en fazla +14 saat ilerisindedir: sorgu sonu "VPS UTC + 1 gün" her farkı kapsar
FUTURE_MARGIN_SEC = 86400
# Broker saat farkları yarım saatin katıdır. Ham fark bundan en fazla 2 dk sapıyorsa
# tick tazedir, fark güvenilir sayılır (piyasa kapalıyken tick eskidir → çoğunlukla güvenilmez)
OFFSET_STEP_SEC = 30 * 60
OFFSET_TOLERANCE_SEC = 120
# Bölge sembolünün tick'i eskiyse Market Watch taranır; kilit tutulurken en fazla bu kadar
FRESHEST_TICK_BUDGET_SEC = 2
RES_S_OK = 1  # last_error() kodu "hata yok": None boş sonuç demektir

MARGIN_MODES = {0: "netting", 1: "exchange", 2: "hedging"}
MARGIN_MODE_HEDGING = 2
# Backtest'in kâr hesabı bu türleri tam destekler (docs/analyse-regeln.md §6):
# FOREX, CFD, CFDINDEX, CFDLEVERAGE, FOREX_NO_LEVERAGE
BACKTEST_CALC_MODES = (0, 2, 3, 4, 5)
WEEKDAYS = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
DEAL_TYPE_BUY, DEAL_TYPE_SELL = 0, 1

_DEAL_FIELDS = (
    "ticket", "order", "position_id", "time", "time_msc", "type", "entry", "magic", "reason",
    "symbol", "volume", "price", "profit", "commission", "swap", "fee", "comment",
)
_SYMBOL_FIELDS = ("digits", "point", "trade_tick_size", "trade_tick_value", "trade_contract_size", *SYMBOL_COST_FIELDS)
_BAR_FIELDS = ("time", "open", "high", "low", "close", "tick_volume", "spread")


class MarketDataError(Exception):
    """MT5'e ulaşılamadı veya hesap/sembol uygun değil; `status` HTTP koduna çevrilir."""

    def __init__(self, detail: str, status: int = 503):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def _plain(value):
    """numpy/MT5 tiplerini JSON'a uygun Python tiplerine çevirir."""
    if hasattr(value, "item"):
        return value.item()
    return value


def _fields(obj, names) -> dict:
    return {n: _plain(getattr(obj, n, None)) for n in names}


def _has(row, key) -> bool:
    try:
        row[key]
    except (KeyError, ValueError, IndexError):
        return False
    return True


def _bar(row) -> dict:
    """copy_rates_range satırı (numpy yapısal satır veya dict) → dict."""
    return {k: _plain(row[k]) for k in _BAR_FIELDS if _has(row, k)}


def _enum_name(mt5, prefix: str, value):
    """MetaTrader5 sabitinin adı (ör. SYMBOL_CALC_MODE_CFD → "cfd"); bilinmiyorsa "unknown"."""
    for name in dir(mt5):
        if name.startswith(prefix) and getattr(mt5, name) == value:
            return name[len(prefix):].lower()
    return "unknown"


def broker_offset(server_time: float, utc_now: float) -> dict:
    """Broker saatinin UTC'ye farkı: ham, yarım saate yuvarlanmış ve güvenilir mi."""
    raw = server_time - utc_now
    rounded = round(raw / OFFSET_STEP_SEC) * OFFSET_STEP_SEC
    return {
        "raw_sec": round(raw, 1),
        "offset_sec": rounded,
        "offset_hours": rounded / 3600,
        "reliable": abs(raw - rounded) <= OFFSET_TOLERANCE_SEC,
    }


def _mt5_error(mt5, name, result, errors) -> bool:
    """MT5 None döndürdü ve last_error gerçek bir hata mı? Öyleyse errors'a yazar.

    None + "hata yok" boş sonuçtur; hata ise boş bir hesap gibi görünmesin diye raporlanır.
    """
    if result is not None:
        return False
    err = mt5.last_error()
    if err and err[0] != RES_S_OK:
        errors.append(f"{name}: {err}")
        return True
    return False


def _offset_reading(mt5, symbol):
    """Fark ölçümü için tick ve onu okuduğumuz andaki VPS UTC'si (aralarında süre geçmesin)."""
    tick = mt5.symbol_info_tick(symbol)
    return tick, time.time()


def _freshest_reading(mt5, symbol, tick, utc_at_tick):
    """Fark ölçümünde kullanılacak (sembol, tick, okunduğu UTC).

    Bölge sembolünün tick'i tazeyse (piyasa açık) o kullanılır. Eskiyse (hafta sonu, günlük ara)
    Market Watch'ta daha taze bir tick aranır, ör. 7/24 işlem gören bir kripto sembolü.
    symbols_get() sunucunun tüm sembollerini verir: tarama yalnızca bu durumda ve süre sınırlı.
    """
    if tick is not None and tick.time and broker_offset(tick.time, utc_at_tick)["reliable"]:
        return symbol, tick, utc_at_tick
    best = (symbol, tick, utc_at_tick) if tick is not None and tick.time else (None, None, None)
    stop = time.monotonic() + FRESHEST_TICK_BUDGET_SEC
    for info in mt5.symbols_get() or ():
        if time.monotonic() >= stop:
            break
        if not getattr(info, "visible", False) or info.name == symbol:
            continue
        other, utc_at = _offset_reading(mt5, info.name)
        if other is not None and other.time and (best[1] is None or other.time - utc_at > best[1].time - best[2]):
            best = (info.name, other, utc_at)
    return best


def _last_trade_deal(mt5, now, end, errors):
    """Son alış/satış işlemi (bakiye vb. hariç), kaç gün geriye bakıldığı ve işlem sayısı."""
    count = 0
    for days in DEALS_LOOKBACK_DAYS:
        deals = mt5.history_deals_get(now - days * 86400, end)
        failed = _mt5_error(mt5, "history_deals_get", deals, errors)
        deals = deals or ()
        count = len(deals)
        trades = [d for d in deals if d.type in (DEAL_TYPE_BUY, DEAL_TYPE_SELL)]
        if trades:
            return max(trades, key=lambda d: d.time_msc), days, count
        if failed:
            break
    return None, days, count


def time_check(account_config: dict, symbol: str) -> dict:
    """Bağlanır (veri sorgusu kipinde) ve zaman/hesap/sembol bilgisini toplar.

    Bağlantı + sorgu tek kilit altında: arada başka bir istek terminali başka hesaba geçiremez.
    """
    return _connected(account_config, lambda mt5: collect_time_check(mt5, account_config, symbol))


def _connected(account_config: dict, collect):
    """Kilit altında veri sorgusu kipinde bağlanır ve `collect(mt5)` sonucunu döner."""
    if not mc._MT5_LOCK.acquire(timeout=CONNECT_TIMEOUT_SEC):
        raise MarketDataError(
            f"[TIMEOUT] Başka bir MT5 bağlantısı {CONNECT_TIMEOUT_SEC} sn içinde bitmedi. Tekrar deneyin."
        )
    try:
        ok, _is_timeout, detail = mc.connect_to_mt5_with_timeout(
            account_config, CONNECT_TIMEOUT_SEC, allow_restart=False, data_query=True
        )
        if not ok:
            raise MarketDataError(detail or "MT5 bağlantısı kurulamadı")
        return collect(mc.mt5)
    finally:
        mc._MT5_LOCK.release()


def measure_clock(account_config: dict, symbol: str | None) -> dict:
    """Broker saati: sembolün (yoksa Market Watch'ın) en taze tick'inden fark ölçümü."""

    def collect(mt5):
        _check_account(mt5, account_config)
        tick, utc_at = _offset_reading(mt5, symbol) if symbol else (None, time.time())
        name, best, best_utc = _freshest_reading(mt5, symbol, tick, utc_at)
        if best is None:
            raise MarketDataError("[TICK] Market Watch'ta tick yok; broker saati ölçülemedi.")
        return {**broker_offset(best.time, best_utc), "source_symbol": name, "measured_at": round(best_utc, 3)}

    return _connected(account_config, collect)


def _check_account(mt5, account_config: dict):
    """Terminal bu hesapta mı? Değilse sorgu yapılmaz (başka hesabın verisi dönmesin)."""
    try:
        login = int(account_config.get("login") or 0)
    except (TypeError, ValueError):
        raise MarketDataError(f"[CONFIG] Hesap numarası geçersiz: {account_config.get('login')!r}", status=400)
    acc = mt5.account_info()
    if acc is None or acc.login != login:
        raise MarketDataError(f"[ACCOUNT] Terminal {login} hesabında değil; sorgu yapılmadı.")
    return acc


def collect_time_check(mt5, account_config: dict, symbol: str) -> dict:
    acc = _check_account(mt5, account_config)
    info = mt5.symbol_info(symbol)
    if info is None:
        raise MarketDataError(f"[SYMBOL] {symbol} bu hesapta bulunamadı.", status=404)

    errors: list[str] = []
    utc_now = time.time()
    now = int(utc_now)
    end = now + FUTURE_MARGIN_SEC
    # Mumlar tick'ten önce okunur: arada yeni dakika başlasa da son mum tick'ten sonra olamaz
    rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, now - RATES_LOOKBACK_SEC, end)
    _mt5_error(mt5, "copy_rates_range", rates, errors)
    bars = [_bar(r) for r in rates[-RECENT_BARS:]] if rates is not None and len(rates) else []

    tick, utc_at_tick = _offset_reading(mt5, symbol)
    tick_data = None
    if tick is not None:
        tick_data = {k: _plain(getattr(tick, k, None)) for k in ("time", "time_msc", "bid", "ask")}
    offset = None
    offset_symbol, offset_tick, offset_utc = _freshest_reading(mt5, symbol, tick, utc_at_tick)
    if offset_tick is not None:
        offset = {**broker_offset(offset_tick.time, offset_utc), "source_symbol": offset_symbol}

    last, deal_days, deal_count = _last_trade_deal(mt5, now, end, errors)
    last_deal = None
    if last is not None:
        last_deal = _fields(last, _DEAL_FIELDS)
        last_deal["time_msc_matches_time"] = int(last.time_msc) // 1000 == int(last.time)

    margin_mode = _plain(getattr(acc, "margin_mode", None))
    calc_mode = _plain(getattr(info, "trade_calc_mode", None))
    rollover = _plain(getattr(info, "swap_rollover3days", None))
    symbol_data = {"name": symbol, **_fields(info, _SYMBOL_FIELDS)}
    symbol_data["trade_calc_mode_name"] = _enum_name(mt5, "SYMBOL_CALC_MODE_", calc_mode)
    symbol_data["swap_rollover3days_name"] = WEEKDAYS[rollover] if isinstance(rollover, int) and 0 <= rollover < 7 else None

    return {
        "symbol": symbol,
        "vps_utc": round(utc_now, 3),
        # VPS'in kendi saat dilimi (MetaTrader5 kütüphanesi naive datetime'ı yerel saatle çevirir)
        "vps_tz_offset_sec": time.localtime(utc_now).tm_gmtoff,
        "tick": tick_data,
        "broker_offset": offset,
        "rates_m1": bars,
        "last_deal": last_deal,
        "deals_lookback_days": deal_days,
        "deals_in_lookback": deal_count,
        "account": {
            "login": acc.login,
            "server": getattr(acc, "server", None),
            "currency": getattr(acc, "currency", None),
            "trade_mode": _plain(getattr(acc, "trade_mode", None)),
            "margin_mode": margin_mode,
            "margin_mode_name": MARGIN_MODES.get(margin_mode, "unknown"),
        },
        "symbol_info": symbol_data,
        "backtest_support": {
            "account_hedging": margin_mode == MARGIN_MODE_HEDGING,
            "calc_mode_supported": calc_mode in BACKTEST_CALC_MODES,
        },
        "errors": errors,
    }
