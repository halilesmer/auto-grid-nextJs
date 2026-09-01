# src/utils/trade_utils.py
import time


class TradeState:
    """Auto Grid motoru için durum hafızası"""

    algo_trading_disabled = False
    last_error_message = ""


def normalize_volume(mt5_module, symbol, volume):
    """Lot miktarını MT5'in kabul edeceği tam formata zorlar (Örn: 0.020000001 -> 0.02)"""
    symbol_info = mt5_module.symbol_info(symbol)
    if symbol_info is None:
        return float(volume)
    step = getattr(symbol_info, "volume_step", 0.01)
    if step and step > 0:
        rounded_vol = round(volume / step) * step
        return float(f"{rounded_vol:.6f}")
    return float(volume)


def _format_request_prices(request: dict) -> str:
    """Loglarda 'Bilinmiyor' görünmesini engelleyen dinamik fiyat biçimlendirici."""
    parts = []
    if request.get("price") is not None and request.get("price") > 0:
        parts.append(f"Fiyat: {request['price']}")
    if request.get("tp") is not None and request.get("tp") > 0:
        parts.append(f"TP: {request['tp']}")
    if request.get("sl") is not None and request.get("sl") > 0:
        parts.append(f"SL: {request['sl']}")
    return ", ".join(parts) if parts else "Fiyat Belirtilmedi"


def enforce_stops_level(mt5_module, request: dict) -> dict:
    """
    Broker'ın minimum stops_level (durma mesafesi) kuralını denetler.
    10016 (Invalid stops) hatasını önlemek için yakın TP/SL seviyelerini sınıra çeker.
    """
    symbol = request.get("symbol")
    if not symbol:
        return request

    symbol_info = mt5_module.symbol_info(symbol)
    if not symbol_info:
        return request

    stops_level = getattr(symbol_info, "trade_stops_level", 0)
    point = getattr(symbol_info, "point", 0.00001)
    digits = getattr(symbol_info, "digits", 5)
    min_dist = stops_level * point

    if min_dist <= 0:
        return request

    action = request.get("action")

    # AÇIK POZİSYON TP/SL GÜNCELLEMESİ
    if action == getattr(mt5_module, "TRADE_ACTION_SLTP", None):
        ticket = request.get("position")
        positions = mt5_module.positions_get(ticket=ticket) if ticket else None
        if positions and len(positions) > 0:
            pos = positions[0]
            tick = mt5_module.symbol_info_tick(symbol)
            if tick:
                if pos.type == mt5_module.POSITION_TYPE_BUY:
                    ref_price = tick.bid
                    if (
                        request.get("tp", 0.0) > 0
                        and request["tp"] < ref_price + min_dist
                    ):
                        request["tp"] = round(ref_price + min_dist, digits)
                    if (
                        request.get("sl", 0.0) > 0
                        and request["sl"] > ref_price - min_dist
                    ):
                        request["sl"] = round(ref_price - min_dist, digits)
                elif pos.type == mt5_module.POSITION_TYPE_SELL:
                    ref_price = tick.ask
                    if (
                        request.get("tp", 0.0) > 0
                        and request["tp"] > ref_price - min_dist
                    ):
                        request["tp"] = round(ref_price - min_dist, digits)
                    if (
                        request.get("sl", 0.0) > 0
                        and request["sl"] < ref_price + min_dist
                    ):
                        request["sl"] = round(ref_price + min_dist, digits)

    # BEKLEYEN EMİR VERİLMESİ
    elif action == getattr(mt5_module, "TRADE_ACTION_PENDING", None):
        order_type = request.get("type")
        price = request.get("price", 0.0)

        if order_type in [
            getattr(mt5_module, "ORDER_TYPE_BUY_LIMIT", None),
            getattr(mt5_module, "ORDER_TYPE_BUY_STOP", None),
        ]:
            if request.get("tp", 0.0) > 0 and request["tp"] < price + min_dist:
                request["tp"] = round(price + min_dist, digits)
            if request.get("sl", 0.0) > 0 and request["sl"] > price - min_dist:
                request["sl"] = round(price - min_dist, digits)

        elif order_type in [
            getattr(mt5_module, "ORDER_TYPE_SELL_LIMIT", None),
            getattr(mt5_module, "ORDER_TYPE_SELL_STOP", None),
        ]:
            if request.get("tp", 0.0) > 0 and request["tp"] > price - min_dist:
                request["tp"] = round(price - min_dist, digits)
            if request.get("sl", 0.0) > 0 and request["sl"] < price + min_dist:
                request["sl"] = round(price + min_dist, digits)

    return request


def safe_send_order(mt5_module, request, log_func=None):
    """
    Merkezi Emir Gönderici ve Hata Yakalayıcı.
    """
    try:
        # 1. KORUMA: Lot değerini temizle
        if "volume" in request and "symbol" in request:
            request["volume"] = normalize_volume(
                mt5_module, request["symbol"], request["volume"]
            )

        # 2. KORUMA: Broker stops_level mesafe denetimi (10016 engelleme)
        request = enforce_stops_level(mt5_module, request)

        # Sadece yeni emir gönderimlerinde (PENDING/DEAL) ön kontrol yapılır.
        if request.get("action") in [
            mt5_module.TRADE_ACTION_PENDING,
            mt5_module.TRADE_ACTION_DEAL,
        ]:
            check = mt5_module.order_check(request)
            if check is None or check.retcode != 0:
                retcode = check.retcode if check else -1
                if retcode == 10027:
                    TradeState.algo_trading_disabled = True
                    TradeState.last_error_message = "Algo Trading kapalı!"
                if log_func:
                    prices_str = _format_request_prices(request)
                    log_func(
                        f"❌ MT5 Check Hatası! Kodu: {retcode} | {prices_str}", "ERROR"
                    )
                return False

        # Asıl Emri Gönder
        result = mt5_module.order_send(request)

        if result is None:
            last_err = mt5_module.last_error()
            TradeState.last_error_message = f"MT5 Terminal Yanıt Vermedi: {last_err}"
            if log_func:
                log_func(f"❌ MT5 Request başarısız (None): {last_err}", "ERROR")
            return False

        # 10009 = TRADE_RETCODE_DONE
        if result.retcode != 10009:
            err_code = result.retcode
            err_comment = getattr(result, "comment", "Terminal Yanıt Vermedi")

            if result.retcode == 10027:
                TradeState.algo_trading_disabled = True
                TradeState.last_error_message = "Algo Trading kapalı!"
            else:
                TradeState.last_error_message = (
                    f"Reddedildi: {err_code} - {err_comment}"
                )

            if log_func:
                prices_str = _format_request_prices(request)
                log_func(
                    f"🔴 MT5 EMİR REDDİ ({err_code}): {err_comment} | Seviye Fiyatı: {prices_str}",
                    "ERROR",
                )
            return False

        # 🌟 ADIM 2: CIFT DIKIS DOGRULAMA (POST-TRADE CHECK) - SESSIZ RET KORUMASI
        if request.get("action") == mt5_module.TRADE_ACTION_PENDING and result.order:
            time.sleep(0.1)  # Broker sunucusuna yansimasi icin mini tolerans
            tahta_kontrol = mt5_module.orders_get(ticket=result.order)
            if not tahta_kontrol or len(tahta_kontrol) == 0:
                TradeState.last_error_message = (
                    "SESSIZ RET: Emir gonderildi ama Broker tahtadan sildi!"
                )
                if log_func:
                    log_func(
                        f"🚨 ALARM: Broker emri (Bilet: {result.order}) sessizce iptal etti!",
                        "ERROR",
                    )
                return False

        # İşlem başarılıysa hatayı sıfırla
        TradeState.algo_trading_disabled = False
        TradeState.last_error_message = ""
        return True

    except Exception as e:
        TradeState.last_error_message = f"Kritik Hata: {str(e)}"
        if log_func:
            log_func(f"💥 MT5 Request Exception: {str(e)}", "ERROR")
        return False
