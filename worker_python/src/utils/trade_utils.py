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
    step = symbol_info.volume_step
    # Adıma göre tam yuvarlama yap ve string üzerinden float'a çevirerek bozulmayı önle
    rounded_vol = round(volume / step) * step
    return float(f"{rounded_vol:.6f}")


def safe_send_order(mt5_module, request, log_func=None):
    """
    Merkezi Emir Gönderici ve Hata Yakalayıcı.
    """
    try:
        # KESİN KURAL: Gönderilmeden önce LOT değerini MT5'in beklediği hassasiyete göre kusursuzlaştır
        if "volume" in request and "symbol" in request:
            request["volume"] = normalize_volume(
                mt5_module, request["symbol"], request["volume"]
            )

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
                    TradeState.last_error_message = "Algo Trading kapali!"
                if log_func:
                    log_func(f"❌ MT5 Check Hatası! Kodu: {retcode}", "ERROR")
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
                TradeState.last_error_message = "Algo Trading kapali!"
            else:
                TradeState.last_error_message = (
                    f"Reddedildi: {err_code} - {err_comment}"
                )

            if log_func:
                # Senin tam olarak istediğin formatta detaylı hata logu
                log_func(
                    f"🔴 MT5 EMİR REDDİ ({err_code}): {err_comment} | Seviye Fiyatı: {request.get('price', 'Bilinmiyor')}",
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
