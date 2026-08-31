import time
import datetime
import json
import os
from pathlib import Path
from src.utils.trade_utils import safe_send_order, TradeState
from src.utils.config import get_settings_file

# 🌟 YENİ: Merkezi yol yöneticisi
from src.utils.paths import (
    get_err_log_path,
    get_ui_state_path,
    get_metrics_path,
    get_symbols_path,
)

project_root = Path(__file__).parent.parent.parent

# ==========================================
# TEMEL DEĞİŞKENLER VE AYARLAR
# ==========================================
# Arayüzden bağımsız çalışan ana döngünün saniye cinsinden dinlenme süresi
LOOP_INTERVAL_SECONDS = (
    3.0  # 🌟 1.0 saniyeden 3.0 saniyeye çıkarılarak CPU ve Log rahatlatıldı
)
ZONES = []
ORDER_TYPE = "BUY"  # Sadece ilk başlatma koruması için tutuluyor
SYMBOL = "USOUSD"

# ==========================================
# GLOBAL DEĞİŞKENLER (Bot Manager İçin Zorunlu)
# ==========================================
SYMBOL_INFO = None
FILLING_MODE = None
ACTIVE_ZONE = None
ACTIVE_ZONE_IDX = None

IS_RUNNING = False
INITIAL_CLEANUP_DONE = False

# 🌟 YENİ: MT5 bağlantı durumu izleyici (Arayüze "bağlantı koptu" bilgisini iletir)
CONNECTION_LOST = False

# 🌟 Devre Kesici İçin Hata Takip Sayacı
CONSECUTIVE_ERRORS = {}

# 📡 Mobil MT5 Uzaktan Kumanda (Sinyal Emri) Değişkenleri
REMOTE_PAUSED = False  # True ise motor uzaktan durdurulmuştur (ağ örmez)
REMOTE_COMMAND_PREFIX = "GRID:"  # Emir yorumu bu önekle başlamalı (masaüstü MT5)
# 🔌 Mobil MT5'te yorum alanı olmadığı için uç fiyatlardaki Buy Limit emirleri kullanılır
REMOTE_SIGNAL_STOP_PRICE = 1.0  # STOP sinyal fiyatı ($1)
REMOTE_SIGNAL_START_PRICE = 2.0  # 🌟 YENİ: START sinyal fiyatı ($2)
REMOTE_SIGNAL_VOLUME = 0.01  # Sinyal emri her zaman 0.01 lot olmalı

active_zones_state = {}  # Hafıza Kurtarma ve Zombi Emir Yönetimi


# ==========================================
# METRİK ARAYÜZÜ (Dashboard için)
# ==========================================
def get_live_metrics():
    global CONNECTION_LOST
    metrics = {
        "profit": 0.0,
        "open_positions": 0,
        "pending_orders": 0,
        "current_price": 0.0,
        "algo_trading_error": TradeState.algo_trading_disabled,
        "order_rejected_alarm": bool(TradeState.last_error_message),
        "last_error": TradeState.last_error_message,
        "remote_paused": REMOTE_PAUSED,
        "mt5_connected": True,
        "connection_lost": CONNECTION_LOST,
        "market_open": is_market_open(),
    }

    terminal_info = mt5.terminal_info()
    if terminal_info is None or not getattr(terminal_info, "connected", False):
        # 🔴 MT5'e ulaşılamıyor VEYA Broker/Sunucu bağlantısı koptu!
        CONNECTION_LOST = True
        metrics["mt5_connected"] = False
        metrics["market_open"] = False
        return metrics

    # Bağlantı geri geldi
    CONNECTION_LOST = False
    metrics["mt5_connected"] = True

    if not terminal_info.trade_allowed:
        metrics["algo_trading_error"] = True

    positions = mt5.positions_get(symbol=SYMBOL)
    if positions:
        metrics["open_positions"] = len(positions)
        metrics["profit"] = round(sum(pos.profit for pos in positions), 2)

    orders = mt5.orders_get(symbol=SYMBOL)
    if orders:
        metrics["pending_orders"] = len(orders)

    tick = mt5.symbol_info_tick(SYMBOL)
    if tick:
        metrics["current_price"] = tick.bid

    return metrics


# ==========================================
# GÜVENLİ YÜKLEME VE LOGLAMA FONKSİYONLARI
# ==========================================
def load_dynamic_settings():
    global ZONES, LOOP_INTERVAL_SECONDS, SYMBOL, SYMBOL_INFO

    try:
        settings_file = get_settings_file("Auto Grid")
        with open(settings_file, "r", encoding="utf-8") as f:
            settings = json.load(f)
            ZONES = settings.get("ZONES", [])
            LOOP_INTERVAL_SECONDS = settings.get("LOOP_INTERVAL_SECONDS", 1.0)

            # Dinamik sembol vizyonu için global sembolü de güncelliyoruz
            if ZONES and "symbol" in ZONES[0]:
                new_symbol = str(ZONES[0]["symbol"]).upper().strip()

                # 🌟 KRİTİK HATA ÇÖZÜMÜ: Sembol değiştiğinde arka plandaki matematik kurallarını (digits, point, lot) da MT5'ten güncelleyerek hafızaya al!
                if new_symbol != SYMBOL or SYMBOL_INFO is None:
                    SYMBOL = new_symbol
                    try:
                        mt5.symbol_select(SYMBOL, True)
                        SYMBOL_INFO = mt5.symbol_info(SYMBOL)
                    except Exception:
                        pass
    except Exception:
        pass


def log_message(msg, level="INFO"):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{level}] {msg}"
    print(formatted)

    # 🌟 YENİ: Hesaba özel (Account ID bazlı) loglama
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    if LOG_TO_FILE:
        log_file_path = get_err_log_path(account_id)
        try:
            with open(log_file_path, "a", encoding="utf-8") as f:
                f.write(formatted + "\n")
        except Exception:
            pass


# ===============================================================================
# MT5 BAĞLANTISI
# ===============================================================================
try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None

# ═══════════════════════════════════════════════════════════════════════════════
# KULLANICI AYARLARI
# ═══════════════════════════════════════════════════════════════════════════════

BASE_MAGIC_NUMBER = 200000
MAX_DEVIATION = 20
MARKET_CLOSED_CHECK_INTERVAL = 60
LOG_TO_FILE = True
LOG_FILE_PATH = "logs/grid_robot_log.txt"


def normalize_price(price):
    if SYMBOL_INFO is None:
        return round(price, 2)
    point = SYMBOL_INFO.point
    if point == 0:
        return price
    return round(round(price / point) * point, SYMBOL_INFO.digits)


def normalize_volume(volume):
    if SYMBOL_INFO is None:
        return volume
    volume = max(SYMBOL_INFO.volume_min, min(volume, SYMBOL_INFO.volume_max))
    if SYMBOL_INFO.volume_step > 0:
        steps = round((volume - SYMBOL_INFO.volume_min) / SYMBOL_INFO.volume_step)
        volume = SYMBOL_INFO.volume_min + steps * SYMBOL_INFO.volume_step
    return round(volume, 8)


def get_current_market_price(direction="BUY"):
    try:
        tick = mt5.symbol_info_tick(SYMBOL)
        if tick is None:
            return None
        return tick.ask if direction == "BUY" else tick.bid
    except Exception as e:
        log_message(f"Fiyat alınamadı: {e}", "ERROR")
        return None


def is_market_open():
    term_info = mt5.terminal_info()
    if term_info is None or not getattr(term_info, "connected", False):
        return False

    info = mt5.symbol_info(SYMBOL)
    if info is None or getattr(info, "trade_mode", 0) != 4:
        return False

    tick = mt5.symbol_info_tick(SYMBOL)
    if tick is None or getattr(tick, "time_msc", 0) == 0:
        return False

    # time_msc her zaman UTC bazlı milisaniyedir. time.time() da UTC saniyesi verir.
    # Bu sayede Broker'ın saat diliminden etkilenmeden KUSURSUZ ölçüm yapılır.
    return (time.time() * 1000 - tick.time_msc) <= 180000


def determine_fill_mode():
    global FILLING_MODE
    if SYMBOL_INFO is None:
        return None
    if SYMBOL_INFO.filling_mode & 2:
        FILLING_MODE = mt5.ORDER_FILLING_IOC
    elif SYMBOL_INFO.filling_mode & 1:
        FILLING_MODE = mt5.ORDER_FILLING_FOK
    else:
        FILLING_MODE = mt5.ORDER_FILLING_RETURN
    return FILLING_MODE


def get_all_robot_orders():
    orders = mt5.orders_get(symbol=SYMBOL)
    if orders is None:
        return None
    return [
        o for o in orders if BASE_MAGIC_NUMBER <= o.magic < BASE_MAGIC_NUMBER + 1000
    ]


def get_all_robot_positions():
    positions = mt5.positions_get(symbol=SYMBOL)
    if positions is None:
        return None
    return [
        p for p in positions if BASE_MAGIC_NUMBER <= p.magic < BASE_MAGIC_NUMBER + 1000
    ]


def get_all_manual_positions():
    positions = mt5.positions_get(symbol=SYMBOL)
    if positions is None:
        return None
    return [
        p
        for p in positions
        if not (BASE_MAGIC_NUMBER <= p.magic < BASE_MAGIC_NUMBER + 1000)
    ]


def get_existing_levels_by_direction(buy_grid_step, sell_grid_step):
    buy_levels = set()
    sell_levels = set()

    orders = get_all_robot_orders()
    r_pos = get_all_robot_positions()
    m_pos = get_all_manual_positions()

    def add_to_set(price, is_buy):
        if is_buy:
            snapped = round(price / buy_grid_step) * buy_grid_step
            buy_levels.add(normalize_price(snapped))
        else:
            snapped = round(price / sell_grid_step) * sell_grid_step
            sell_levels.add(normalize_price(snapped))

    if orders:
        for o in orders:
            is_buy = o.type in [mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP]
            add_to_set(o.price_open, is_buy)
    if r_pos:
        for p in r_pos:
            add_to_set(p.price_open, p.type == mt5.POSITION_TYPE_BUY)
    if m_pos:
        for p in m_pos:
            add_to_set(p.price_open, p.type == mt5.POSITION_TYPE_BUY)

    return buy_levels, sell_levels


def cancel_order(order):
    request = {
        "action": mt5.TRADE_ACTION_REMOVE,
        "order": order.ticket,
        "symbol": SYMBOL,
    }
    return safe_send_order(mt5, request, log_message)


def modify_position_tp_sl(position, tp_price, sl_price=None):
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": position.ticket,
        "symbol": SYMBOL,
        "tp": tp_price,
        "sl": sl_price if sl_price is not None and sl_price > 0 else 0.0,
    }
    return safe_send_order(mt5, request, log_message)


def get_mt5_timeframe(tf_str):
    mapping = {
        "M1": mt5.TIMEFRAME_M1,
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30,
        "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1,
    }
    return mapping.get(tf_str, mt5.TIMEFRAME_M15)


# 1. ESKİ get_active_zone FONKSİYONUNU BUNUNLA DEĞİŞTİR (Giriş/Çıkış Asimetrisi Çözümü)
def get_active_zone(tick_price):
    for zone in ZONES:
        i = zone.get("magic_idx", 0)
        z_min = float(zone.get("min_price", 0))
        z_max = float(zone.get("max_price", 0))
        cond = zone.get("exit_condition", "Anlık Fiyat")

        if cond == "Anlık Fiyat":
            if round(z_min, 5) <= round(tick_price, 5) <= round(z_max, 5):
                return zone, i
        else:
            # Bölgenin kuralı "Mum Kapanışı" ise, giriş için de mum kapanışını kontrol et
            tf_str = zone.get("exit_timeframe", "M15")
            tf = get_mt5_timeframe(tf_str)
            rates = mt5.copy_rates_from_pos(SYMBOL, tf, 1, 1)  # Son kapanan mumu al
            if rates is not None and len(rates) > 0:
                close_price = (
                    rates[0]["close"]
                    if isinstance(rates[0], dict)
                    else getattr(
                        rates[0],
                        "close",
                        (
                            rates[0][4]
                            if isinstance(rates[0], tuple)
                            else rates[0]["close"]
                        ),
                    )
                )
            else:
                close_price = tick_price

            if round(z_min, 5) <= round(close_price, 5) <= round(z_max, 5):
                return zone, i

    return None, None


def send_pending_order(
    price, lot, tp_price, sl_price=None, zone_idx=0, direction="BUY"
):
    current_price = get_current_market_price(direction)
    if current_price is None:
        return False

    if direction == "BUY":
        order_type = (
            mt5.ORDER_TYPE_BUY_LIMIT
            if price < current_price
            else mt5.ORDER_TYPE_BUY_STOP
        )
    else:
        order_type = (
            mt5.ORDER_TYPE_SELL_LIMIT
            if price > current_price
            else mt5.ORDER_TYPE_SELL_STOP
        )

    request = {
        "action": mt5.TRADE_ACTION_PENDING,
        "symbol": SYMBOL,
        "volume": normalize_volume(lot),
        "type": order_type,
        "price": price,
        "deviation": MAX_DEVIATION,
        "magic": BASE_MAGIC_NUMBER + zone_idx + 1,
        "comment": f"AutoGrid_Z{zone_idx + 1}",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_RETURN,  # 🌟 KESİN ÇÖZÜM: Bekleyen emirlerin FOK(0) kabul edilip sunucu tarafından silinmemesi için RETURN(2) zorunludur.
        "tp": tp_price,
    }

    if sl_price is not None and sl_price > 0:
        request["sl"] = sl_price

    # 🌟 HATA YAKALAMA (Back-off): Emri gönder ve sonucu kontrol et
    success = safe_send_order(mt5, request, log_message)
    if not success:
        # 🚨 DEVRE KESİCİ: Hata koduna bakılmaksızın (Sessiz Ret dahil) başarısızlığı say
        global CONSECUTIVE_ERRORS

        # Hata sayacını artır
        CONSECUTIVE_ERRORS[zone_idx] = CONSECUTIVE_ERRORS.get(zone_idx, 0) + 1

        if CONSECUTIVE_ERRORS[zone_idx] >= 3:
            last_err_msg = (
                TradeState.last_error_message
                if TradeState.last_error_message
                else "Bilinmeyen Hata"
            )
            log_message(
                f"🚨 DİKKAT: Bölge {zone_idx+1} için üst üste {CONSECUTIVE_ERRORS[zone_idx]} işlem reddedildi! (Detay: {last_err_msg}). Bölge güvenliğe alınıyor.",
                "ERROR",
            )
            # 🛑 Bölgeyi PAUSE (Bekleme) durumuna çek!
            account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
            states_file = get_ui_state_path(account_id)
            try:
                bg_states = {}
                if os.path.exists(states_file):
                    with open(states_file, "r", encoding="utf-8") as f:
                        bg_states = json.load(f)

                bg_states[str(zone_idx)] = "PAUSE"

                tmp_states_file = states_file + ".tmp"
                with open(tmp_states_file, "w", encoding="utf-8") as f:
                    json.dump(bg_states, f)
                os.replace(tmp_states_file, states_file)
            except Exception as e:
                pass

            # Arayüz güncellensin diye global state'i de değiştir
            global active_zones_state
            active_zones_state[zone_idx] = "PAUSE"

            # Sayacı sıfırla ki arayüzden tekrar başlatıldığında hemen patlamasın
            CONSECUTIVE_ERRORS[zone_idx] = 0

        return False
    else:
        # Emir başarılı olduysa o bölge için hata sayacını sıfırla
        if "CONSECUTIVE_ERRORS" in globals() and zone_idx in CONSECUTIVE_ERRORS:
            CONSECUTIVE_ERRORS[zone_idx] = 0

    return True


# ═══════════════════════════════════════════════════════════════════════════════
# ANA DİNAMİK YÖNETİM MOTORU (AUTO GRID)
# ═══════════════════════════════════════════════════════════════════════════════
def process_zone_commands():
    global active_zones_state
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")

    ui_states_file = get_ui_state_path(account_id)
    if os.path.exists(ui_states_file):
        try:
            with open(ui_states_file, "r", encoding="utf-8") as f:
                ui_states = json.load(f)

                # 🛡️ GÜVENLİK: Eğer arayüzden bir bölge silinmişse (JSON'da yoksa),
                # RAM'de asılı kalan o bölgeyi Zombi olmaması için "CLEAR" (Temizle) yap!
                for k in list(active_zones_state.keys()):
                    if str(k) not in ui_states:
                        active_zones_state[k] = "CLEAR"

                for zone_idx_str, state in ui_states.items():
                    active_zones_state[int(zone_idx_str)] = state
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════════════════════
# 📡 MOBİL MT5 UZAKTAN KUMANDA (SİNYAL EMRİ DİNLEYİCİ)
# ═══════════════════════════════════════════════════════════════════════════════
def check_remote_commands():
    """
    Mobil MT5'ten uzaktan kumanda sinyallerini dinler. İki yöntem desteklenir:

    1) 🔌 YENİ — COMMENT'SİZ (mobil için): Uç fiyatlardaki MANUEL Buy Limit emirleri (0.01 lot):
       - $1 = STOP (Durdur)
       - $2 = START (Yeniden Başlat)
       Fiyat çok uçta kaldığından bu emirler asla tetiklenmez, sadece tuş görevi görür.

    2) Masaüstü MT5: comment'i GRID:STOP / GRID:START ile başlayan manuel
       bekleyen emir → ilgili komut işlenir.

    Kural: Sinyal emri magic=0 (manuel) olmalıdır. Komut işlendikten sonra o
    emir KENDİSİ SİLİNİR (self-destruct) böylece tek seferlik tuş gibi çalışır.
    """
    global REMOTE_PAUSED, ACTIVE_ZONE, ACTIVE_ZONE_IDX

    orders = mt5.orders_get(symbol=SYMBOL)
    if orders is None or len(orders) == 0:
        return False

    command_found = False
    for order in orders:
        # Sinyal emirleri asla robotun kendi emirleri (magic 200000+) olmamalı
        if BASE_MAGIC_NUMBER <= order.magic < BASE_MAGIC_NUMBER + 1000:
            continue

        order_volume = getattr(order, "volume_current", None)
        if order_volume is None:
            order_volume = getattr(order, "volume_initial", 0.0)

        # Sinyal emri 0.01 lot Buy Limit mi?
        is_signal_format = (
            order.type == mt5.ORDER_TYPE_BUY_LIMIT
            and abs(float(order_volume) - REMOTE_SIGNAL_VOLUME) < 1e-6
        )

        # Masaüstü GRID: yorum komutu
        comment = order.comment or ""
        cmd = None

        # Sinyalleri Ayrıştır
        if (
            is_signal_format
            and abs(float(order.price_open) - REMOTE_SIGNAL_STOP_PRICE) < 1e-6
        ):
            cmd = "STOP"
            command_found = True
            log_message(
                f"📡 MOBİL MT5 YORUMSUZ STOP SİNYALİ: $1 Buy Limit (Bilet: {order.ticket})",
                "WARN",
            )
        elif (
            is_signal_format
            and abs(float(order.price_open) - REMOTE_SIGNAL_START_PRICE) < 1e-6
        ):
            cmd = "START"
            command_found = True
            log_message(
                f"📡 MOBİL MT5 YORUMSUZ START SİNYALİ: $2 Buy Limit (Bilet: {order.ticket})",
                "WARN",
            )
        elif comment.strip().upper().startswith(REMOTE_COMMAND_PREFIX):
            cmd = comment.strip().upper().split(":")[-1].strip()
            command_found = True
            log_message(
                f"📡 Mobil MT5 UZAKTAN KOMUT ALINDI: {cmd} (Sinyal Bileti: {order.ticket})",
                "WARN",
            )
        else:
            continue

        # Komutu işle
        if cmd == "STOP":
            if not REMOTE_PAUSED:
                REMOTE_PAUSED = True
                log_message(
                    "🛑 Motor uzaktan DURDURULDU. Bekleyen robot emirleri siliniyor. (Açık pozisyonlar korunur)",
                    "WARN",
                )
                # Tüm robot bekleyen emirlerini temizle, pozisyonlara dokunma
                for ro in get_all_robot_orders() or []:
                    cancel_order(ro)

                # 🌟 UI-BACKEND SENKRONİZASYONU: Arayüzdeki butonları "Beklet" konumuna al
                account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
                states_file = get_ui_state_path(account_id)
                try:
                    bg_states = {}
                    if os.path.exists(states_file):
                        with open(states_file, "r", encoding="utf-8") as f:
                            bg_states = json.load(f)

                    target_count = len(ZONES) if ZONES else len(bg_states)
                    for i in range(max(1, target_count)):
                        if bg_states.get(str(i)) != "CLEAR":
                            bg_states[str(i)] = "PAUSE"

                    with open(states_file + ".tmp", "w", encoding="utf-8") as f:
                        json.dump(bg_states, f)
                    os.replace(states_file + ".tmp", states_file)
                except Exception:
                    pass
            else:
                log_message("ℹ️ Motor zaten uzaktan durdurulmuştu. (STOP tekrarlandı)")

        elif cmd == "START":
            if REMOTE_PAUSED:
                REMOTE_PAUSED = False
                # Bölge durumları ayakta kalmış olabilir; ağ örmenin devam etmesi için
                # aktif bölge bilgisini sıfırlayarak yeniden girişe izin ver.
                ACTIVE_ZONE = None
                ACTIVE_ZONE_IDX = None
                log_message("🚀 Motor uzaktan TEKRAR BAŞLATILDI. (GRID:START)", "WARN")

                # 🌟 UI-BACKEND SENKRONİZASYONU: Arayüzdeki butonları "Başlat" konumuna al
                account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
                states_file = get_ui_state_path(account_id)
                try:
                    bg_states = {}
                    if os.path.exists(states_file):
                        with open(states_file, "r", encoding="utf-8") as f:
                            bg_states = json.load(f)

                    for i in range(len(ZONES)):
                        if bg_states.get(str(i)) != "CLEAR":
                            bg_states[str(i)] = "START"

                    with open(states_file + ".tmp", "w", encoding="utf-8") as f:
                        json.dump(bg_states, f)
                    os.replace(states_file + ".tmp", states_file)
                except Exception:
                    pass
            else:
                log_message("ℹ️ Motor zaten çalışıyordu. (START tekrarlandı)")

        else:
            log_message(
                f"⚠️ Bilinmeyen uzaktan komut: {cmd} (Beklenen: STOP / START)",
                "ERROR",
            )

        # 🔫 Self-destruct: Sinyal emrini sil (tek seferlik tuş mantığı)
        # Düşük seviyeli mt5.order_send yerine safe_send_order kullanıyoruz;
        # böylece retcode 10009 kontrol edilir ve emir silinemezse log'a düşer.
        if cancel_order(order):
            log_message(f"🧹 Sinyal emri {order.ticket} temizlendi (self-destruct).")
        else:
            log_message(
                f"⚠️ Sinyal emri {order.ticket} silinemedi! Boşta kalan sinyal, sonraki döngüde tekrar işlenecek.",
                "ERROR",
            )

    return command_found


# 2. ESKİ manage_dynamic_grid FONKSİYONUNU BUNUNLA DEĞİŞTİR (Canlı Güncelleme Çözümü)
def manage_dynamic_grid():
    global ACTIVE_ZONE, ACTIVE_ZONE_IDX

    process_zone_commands()

    # 📡 UZAKTAN DURDURMA KALE DUVARI: Motor uzaktan kapatıldıysa ağ örme, silme
    # ve temizlik işlemlerinin TAMAMI devre dışı kalır (pozisyonlar korunur).
    if REMOTE_PAUSED:
        return True

    # CANLI AYAR GÜNCELLEMESİ (Stale Reference Koruması)
    if ACTIVE_ZONE_IDX is not None:
        found_zone = next(
            (z for z in ZONES if z.get("magic_idx") == ACTIVE_ZONE_IDX), None
        )
        if found_zone:
            ACTIVE_ZONE = found_zone
        else:
            ACTIVE_ZONE = None
            ACTIVE_ZONE_IDX = None

    robot_positions = get_all_robot_positions()
    robot_orders = get_all_robot_orders()

    if robot_positions is None or robot_orders is None:
        return False

    current_price_buy = get_current_market_price("BUY")
    current_price_sell = get_current_market_price("SELL")
    if current_price_buy is None or current_price_sell is None:
        return False

    current_avg_price = (current_price_buy + current_price_sell) / 2.0

    # 1. ZOMBİ EMİR TEMİZLİĞİ VE BÖLGE KAPATMA (MUTLAK TEMİZLİK KURALI)
    for order in robot_orders:
        order_zone_idx = order.magic - BASE_MAGIC_NUMBER - 1
        zone_state = active_zones_state.get(order_zone_idx, "CLEAR")

        # 🛡️ GÜVENLİK: Bölge "START" değilse (PAUSE veya CLEAR ise), ayardaki BUY/SELL ayrımını
        # tamamen yok sayar ve ACIK POZİSYONLAR HARİÇ tüm bekleyen emirleri acımasızca çöpe atar.
        if zone_state != "START":
            dir_str = (
                "BUY"
                if order.type in [mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP]
                else "SELL"
            )
            log_message(
                f"🧹 Mutlak Temizlik (Durum: {zone_state}): Bölge {order_zone_idx+1} için {dir_str} emri iptal ediliyor. (Bilet: {order.ticket})"
            )
            cancel_order(order)

    robot_orders = get_all_robot_orders()
    robot_positions = get_all_robot_positions()
    if robot_orders is None or robot_positions is None:
        return False

    # 2. KISMİ DOLUM (PARTIAL FILL) KONTROLÜ - ÇİFT YÖNLÜ
    processed_prices = set()
    for pos in robot_positions:
        pos_zone_idx = pos.magic - BASE_MAGIC_NUMBER - 1
        if 0 <= pos_zone_idx < len(ZONES):
            z_data = ZONES[pos_zone_idx]
            direction = "BUY" if pos.type == mt5.POSITION_TYPE_BUY else "SELL"

            is_sync = bool(z_data.get("sync_buy_sell", True))
            base_lot = float(z_data.get("lot_size", 0.01))

            if direction == "BUY" or is_sync:
                target_lot = max(0.01, min(5.0, base_lot))
                tp_val = float(z_data.get("take_profit", 0.05))
                sl_val = float(z_data.get("stop_loss", 0.0))
            else:
                target_lot = max(
                    0.01, min(5.0, float(z_data.get("sell_lot_size", base_lot)))
                )
                tp_val = float(
                    z_data.get("sell_take_profit", z_data.get("take_profit", 0.05))
                )
                sl_val = float(
                    z_data.get("sell_stop_loss", z_data.get("stop_loss", 0.0))
                )

            # 1. TP/SL GÜNCELLEMESİ (Tüm açık pozisyonlar için bağımsız çalışır)
            expected_tp = (
                normalize_price(pos.price_open + tp_val)
                if direction == "BUY"
                else normalize_price(pos.price_open - tp_val)
            )
            expected_sl = 0.0
            if sl_val > 0:
                expected_sl = (
                    normalize_price(pos.price_open - sl_val)
                    if direction == "BUY"
                    else normalize_price(pos.price_open + sl_val)
                )

            pos_tp = pos.tp if pos.tp else 0.0
            pos_sl = pos.sl if pos.sl else 0.0

            if (
                abs(float(pos_tp) - float(expected_tp)) > 0.00001
                or abs(float(pos_sl) - float(expected_sl)) > 0.00001
            ):
                log_message(
                    f"🔄 Açık Pozisyon Güncellemesi: Bölge {pos_zone_idx+1} | Bilet {pos.ticket} için yeni TP/SL ayarlanıyor."
                )
                modify_position_tp_sl(pos, expected_tp, expected_sl)

            # 2. KISMİ DOLUM EMİR OLUŞTURMA (Aynı fiyattaki pozisyon hacimlerini toplayarak tek seferde işler)
            grid_step_tmp = float(z_data.get("grid_step", 0.05))
            sell_grid_step_tmp = float(z_data.get("sell_grid_step", grid_step_tmp))
            tolerance_step = (
                grid_step_tmp * 0.4 if direction == "BUY" else sell_grid_step_tmp * 0.4
            )

            is_processed = any(
                direction == p_dir
                and abs(round(pos.price_open, 5) - round(p_price, 5))
                <= round(tolerance_step, 5)
                for p_dir, p_price in processed_prices
            )

            if not is_processed:
                processed_prices.add((direction, pos.price_open))

                total_pos_volume = sum(
                    p.volume
                    for p in robot_positions
                    if p.magic == pos.magic
                    and p.type == pos.type
                    and abs(round(p.price_open, 5) - round(pos.price_open, 5))
                    <= round(tolerance_step, 5)
                )
                remaining_lot = round(target_lot - total_pos_volume, 8)
                vol_min = SYMBOL_INFO.volume_min if SYMBOL_INFO else 0.01

                if remaining_lot >= vol_min:
                    has_pending = any(
                        o.magic == pos.magic
                        and abs(round(o.price_open, 5) - round(pos.price_open, 5))
                        <= round(tolerance_step, 5)
                        for o in robot_orders
                    )

                    if (
                        not has_pending
                        and active_zones_state.get(pos_zone_idx, "START") == "START"
                    ):
                        log_message(
                            f"🔄 Kısmi Dolum: Bölge {pos_zone_idx+1} | Kalan {remaining_lot} lot ({direction}) emir gönderiliyor."
                        )
                        send_pending_order(
                            pos.price_open,
                            remaining_lot,
                            expected_tp,
                            expected_sl if expected_sl > 0 else None,
                            zone_idx=pos_zone_idx,
                            direction=direction,
                        )

    robot_orders = get_all_robot_orders()

    # 3. BÖLGE ÇIKIŞI VE TEMİZLİK (ANLIK FİYAT VE MUM KAPANIŞI MANTIĞI)
    if ACTIVE_ZONE is not None:
        is_exited = False
        exit_cond = ACTIVE_ZONE.get("exit_condition", "Anlık Fiyat")
        z_min = float(ACTIVE_ZONE.get("min_price", 0))
        z_max = float(ACTIVE_ZONE.get("max_price", 0))

        if exit_cond == "Anlık Fiyat":
            if round(current_avg_price, 5) < round(z_min, 5) or round(
                current_avg_price, 5
            ) > round(z_max, 5):
                is_exited = True
        else:
            tf_str = ACTIVE_ZONE.get("exit_timeframe", "M15")
            tf = get_mt5_timeframe(tf_str)
            rates = mt5.copy_rates_from_pos(SYMBOL, tf, 1, 1)
            if rates is not None and len(rates) > 0:
                close_price = (
                    rates[0]["close"]
                    if isinstance(rates[0], dict)
                    else getattr(
                        rates[0],
                        "close",
                        (
                            rates[0][4]
                            if isinstance(rates[0], tuple)
                            else rates[0]["close"]
                        ),
                    )
                )
            else:
                close_price = current_avg_price

            if round(close_price, 5) < round(z_min, 5) or round(close_price, 5) > round(
                z_max, 5
            ):
                is_exited = True

        if is_exited:
            if ACTIVE_ZONE.get("clear_on_exit", True):
                # 🚨 Güvenli referans fiyatı (Anlık fiyat hatası için)
                ref_price = (
                    current_avg_price if exit_cond == "Anlık Fiyat" else close_price
                )
                actual_exit_dir = (
                    "BUY (Yukarı)" if ref_price > z_max else "SELL (Aşağı)"
                )
                trigger_side = ACTIVE_ZONE.get("clear_exit_side", "Farketmez")

                if trigger_side != "Farketmez" and trigger_side != actual_exit_dir:
                    log_message(
                        f"ℹ️ Fiyat bölgeden çıktı ({actual_exit_dir}) ancak temizlik '{trigger_side}' ayarlandığı için işlemler pas geçildi. Bölge pasif duruma alınıyor."
                    )
                else:
                    scope = "Sadece Bekleyen Emirler"
                    target = ACTIVE_ZONE.get("clear_target_side", "Farketmez (Hepsi)")

                    log_message(
                        f"🧹 Bölge ({z_min}-{z_max}) DIŞINA ÇIKILDI! ({actual_exit_dir}). Kapsam: {scope} | Kapatılacak Yön: {target}"
                    )
                    target_magic = BASE_MAGIC_NUMBER + ACTIVE_ZONE_IDX + 1

                    silinen_emir_sayisi = 0
                    for order in robot_orders:
                        if order.magic == target_magic:
                            if target == "Farketmez (Hepsi)":
                                cancel_order(order)
                                silinen_emir_sayisi += 1
                            elif target == "Sadece BUY İşlemleri" and order.type in [
                                mt5.ORDER_TYPE_BUY_LIMIT,
                                mt5.ORDER_TYPE_BUY_STOP,
                            ]:
                                cancel_order(order)
                                silinen_emir_sayisi += 1
                            elif target == "Sadece SELL İşlemleri" and order.type in [
                                mt5.ORDER_TYPE_SELL_LIMIT,
                                mt5.ORDER_TYPE_SELL_STOP,
                            ]:
                                cancel_order(order)
                                silinen_emir_sayisi += 1

                    log_message(
                        f"🧹 Toplam {silinen_emir_sayisi} adet bekleyen {target} emri temizlendi. (Açık pozisyonlar korundu)"
                    )

                robot_orders = get_all_robot_orders()
                robot_positions = get_all_robot_positions()

                if robot_orders is None or robot_positions is None:
                    return False

                # 3. ARAYÜZE "DURDURULDU" BİLGİSİNİ İLET
                account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
                states_file = get_ui_state_path(account_id)
                try:
                    bg_states = {}
                    if os.path.exists(states_file):
                        with open(states_file, "r", encoding="utf-8") as f:
                            bg_states = json.load(f)

                    bg_states[str(ACTIVE_ZONE_IDX)] = "AUTO_CLEAR"

                    tmp_states_file = states_file + ".tmp"
                    with open(tmp_states_file, "w", encoding="utf-8") as f:
                        json.dump(bg_states, f)
                    os.replace(tmp_states_file, states_file)
                except Exception as e:
                    pass

            ACTIVE_ZONE = None
            ACTIVE_ZONE_IDX = None

    # YENİ BÖLGEYE GİRİŞ (Güncellenmiş get_active_zone ile tutarlı)
    new_zone, new_zone_idx = get_active_zone(current_avg_price)
    if ACTIVE_ZONE is None and new_zone is not None:
        ACTIVE_ZONE = new_zone
        ACTIVE_ZONE_IDX = new_zone_idx
        log_message(
            f"📍 Yeni Bölgeye Girildi: Bölge {ACTIVE_ZONE_IDX+1} ({ACTIVE_ZONE.get('min_price')}-{ACTIVE_ZONE.get('max_price')})"
        )

    # 4. KAYAN AĞ (SLIDING GRID) ÖRÜLMESİ VE EKSİK TAMAMLAMA

    # 🛑 GÜVENLİK DUVARI 1: Arayüzden bu bölge Başlatılmadıysa (PAUSE/CLEAR) pas geç
    if (
        ACTIVE_ZONE is None
        or active_zones_state.get(ACTIVE_ZONE_IDX, "START") != "START"
    ):
        return True

    # Ayarları Çek
    z_type = ACTIVE_ZONE.get("order_type", "BUY")
    z_min = float(ACTIVE_ZONE.get("min_price", 0))
    z_max = float(ACTIVE_ZONE.get("max_price", 0))
    grid_step = max(0.00001, float(ACTIVE_ZONE.get("grid_step", 0.05)))
    lot_val = max(0.01, min(5.0, float(ACTIVE_ZONE.get("lot_size", 0.01))))
    tp_val = float(ACTIVE_ZONE.get("take_profit", 0.05))
    sl_val = float(ACTIVE_ZONE.get("stop_loss", 0.0))

    # 🌟 YENİ: Eşitleme (Sync) ve Asimetrik Ayarlar
    is_sync = bool(ACTIVE_ZONE.get("sync_buy_sell", True))

    if is_sync:
        sell_grid_step = grid_step
        sell_lot_val = lot_val
        sell_tp_val = tp_val
        sell_sl_val = sl_val
        sell_pullback_distance = float(ACTIVE_ZONE.get("pullback_distance", 0.50))
    else:
        sell_grid_step = max(
            0.00001, float(ACTIVE_ZONE.get("sell_grid_step", grid_step))
        )
        sell_lot_val = max(
            0.01, min(5.0, float(ACTIVE_ZONE.get("sell_lot_size", lot_val)))
        )
        sell_tp_val = float(ACTIVE_ZONE.get("sell_take_profit", tp_val))
        sell_sl_val = float(ACTIVE_ZONE.get("sell_stop_loss", sl_val))
        sell_pullback_distance = float(
            ACTIVE_ZONE.get(
                "sell_pullback_distance", ACTIVE_ZONE.get("pullback_distance", 0.50)
            )
        )

    # Yeni Arayüz Parametreleri
    levels_below = int(ACTIVE_ZONE.get("levels_below", 5))
    levels_above = int(ACTIVE_ZONE.get("levels_above", 5))
    max_positions_allowed = int(ACTIVE_ZONE.get("max_positions", 10))

    # 🌟 Kırılım (Breakout) Stratejisi Parametreleri
    is_breakout = bool(ACTIVE_ZONE.get("is_breakout", False))
    pullback_distance = float(ACTIVE_ZONE.get("pullback_distance", 0.50))

    # EĞER 0 GİRİLDİYSE GÜVENLİK İÇİN SINIRI 500 OLARAK BELİRLE
    if max_positions_allowed == 0:
        max_positions_allowed = 500

    # 🛑 GÜVENLİK DUVARI 2: Maksimum Açık Pozisyon Sınırı (Hesap Patlama Koruması)
    target_magic = BASE_MAGIC_NUMBER + ACTIVE_ZONE_IDX + 1
    current_open_positions = len(
        [p for p in robot_positions if p.magic == target_magic]
    )

    if current_open_positions >= max_positions_allowed:
        log_message(
            f"⚠️ DİKKAT: Bölge {ACTIVE_ZONE_IDX+1} Maksimum pozisyon sınırına ulaştı ({max_positions_allowed}). Yeni ağ örülmeyecek!",
            "WARN",
        )
        # Bekleyen emir varsa ve pozisyon sınırı dolduysa, tehlikeyi önlemek için onları da sil
        silinen = 0
        for order in robot_orders:
            if order.magic == target_magic:
                cancel_order(order)
                silinen += 1
        if silinen > 0:
            log_message(
                f"🛡️ Güvenlik Koruması: Sınır aşıldığı için {silinen} bekleyen emir temizlendi."
            )
        return True

    # Merkez Fiyatı (Anchor) Bul: Güncel fiyata en yakın "Grid Katı" - BUY ve SELL için AYRI
    buy_anchor_price = round(current_avg_price / grid_step) * grid_step
    sell_anchor_price = round(current_avg_price / sell_grid_step) * sell_grid_step

    desired_buy_levels = []
    desired_sell_levels = []

    # --- TİTREMEYİ (LOOP) ÖNLEYEN TAMPON BÖLGE ---
    acceptable_buy_levels = []
    acceptable_sell_levels = []
    buffer_steps = 2  # Silme işlemi için 2 kademe fazladan esneklik (Hysteresis)
    # 🌟 DÜZELTME: Kısmi Dolum emirlerinin silinmesini ve Sonsuz Döngüyü engelle!
    for pos in robot_positions:
        if pos.magic == target_magic:
            if pos.type == mt5.POSITION_TYPE_BUY:
                acceptable_buy_levels.append(normalize_price(pos.price_open))
            elif pos.type == mt5.POSITION_TYPE_SELL:
                acceptable_sell_levels.append(normalize_price(pos.price_open))
    # --------------------------------------------------

    # KAYAN PENCEREYİ OLUŞTUR (Sliding Window)
    if z_type in ["BUY", "BOTH"]:
        # 🌟 Pullback (Geri Çekilme) Koruması (Kırılım modunda çalışır)
        # Fiyat, hedeflenen emirden (p) yeterince uzağa (pullback_distance) düşmediyse o emri listeye alma!

        # Alttaki emirler (Limit) - (Kırılım modu açıksa Limit emir DİZİLMEZ)
        if not is_breakout:
            for i in range(1, levels_below + 1):
                p = buy_anchor_price - (i * grid_step)
                if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                    desired_buy_levels.append(normalize_price(p))

        # Üstteki emirler (Stop)
        for i in range(1, levels_above + 1):
            p = buy_anchor_price + (i * grid_step)
            # Pullback Kontrolü: Güncel fiyat, p seviyesinden 'pullback_distance' kadar aşağıda mı?
            if is_breakout and round(p - current_avg_price, 5) < round(
                pullback_distance, 5
            ):
                continue  # Fiyat yeterince geri çekilmedi, bu seviyeyi şimdilik pas geç

            if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                desired_buy_levels.append(normalize_price(p))

        # Toleranslı Kabul Bölgesi (Silinmeyecek Emirler)
        for i in range(-levels_below - buffer_steps, levels_above + buffer_steps + 1):
            level_p = buy_anchor_price + (i * grid_step)
            # 🌟 DÜZELTME: i=0 olsa dahi fiyat altındaysa Limit Emir sayılır, engelle!
            if is_breakout and level_p < current_avg_price:
                continue

            acceptable_buy_levels.append(normalize_price(level_p))

    if z_type in ["SELL", "BOTH"]:
        # Üstteki emirler (Limit) - (Kırılım modu açıksa Limit emir DİZİLMEZ)
        if not is_breakout:
            for i in range(1, levels_above + 1):
                p = sell_anchor_price + (i * sell_grid_step)
                if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                    desired_sell_levels.append(normalize_price(p))

        # Alttaki emirler (Stop)
        for i in range(1, levels_below + 1):
            p = sell_anchor_price - (i * sell_grid_step)
            # Pullback Kontrolü (SELL için): Güncel fiyat, p seviyesinden 'sell_pullback_distance' kadar yukarıda mı?
            if is_breakout and round(current_avg_price - p, 5) < round(
                sell_pullback_distance, 5
            ):
                continue  # Fiyat yeterince yukarı sekti mi? Hayır, o zaman pas geç.

            if round(z_min, 5) <= round(p, 5) <= round(z_max, 5):
                desired_sell_levels.append(normalize_price(p))

        # Toleranslı Kabul Bölgesi (Silinmeyecek Emirler)
        for i in range(-levels_below - buffer_steps, levels_above + buffer_steps + 1):
            level_p = sell_anchor_price + (i * sell_grid_step)
            # 🌟 DÜZELTME: i=0 olsa dahi fiyat üstündeyse Limit Emir sayılır, engelle!
            if is_breakout and level_p > current_avg_price:
                continue

            acceptable_sell_levels.append(normalize_price(level_p))

    # BUY ve SELL yönleri için ayrı esnek tolerans (Grid'in %40'ı)
    buy_tolerance = grid_step * 0.4
    sell_tolerance = sell_grid_step * 0.4

    # UZAKLAŞAN/GEREKSİZ EMİRLERİ SİL (Pencere Kayması) - YENİ TAMPON BÖLGE İLE
    silinen_emir_sayisi = 0
    for order in robot_orders:
        if order.magic != target_magic:
            continue

        order_price = normalize_price(order.price_open)
        is_valid = False

        if order.type in [mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP]:
            is_valid = any(
                abs(round(order_price, 5) - round(al, 5)) <= round(buy_tolerance, 5)
                for al in acceptable_buy_levels
            )
            # 🌟 YENİ: Arayüzden güncellenen Lot, TP veya SL değerleri mevcut emirle uyuşmuyorsa emri sil
            if is_valid:
                expected_tp = normalize_price(order_price + tp_val)
                expected_sl = (
                    normalize_price(order_price - sl_val) if sl_val > 0 else 0.0
                )
                order_tp = order.tp if order.tp else 0.0
                order_sl = order.sl if order.sl else 0.0

                # Kısmi Dolum Koruması: O fiyatta zaten bir pozisyon varsa beklenen lot fark kadar olmalı
                pos_vol = sum(
                    p.volume
                    for p in robot_positions
                    if p.magic == target_magic
                    and p.type == mt5.POSITION_TYPE_BUY
                    and abs(
                        round(normalize_price(p.price_open), 5) - round(order_price, 5)
                    )
                    <= round(buy_tolerance, 5)
                )
                if pos_vol > 0:
                    expected_lot = round(float(lot_val) - pos_vol, 8)
                    if expected_lot < (SYMBOL_INFO.volume_min if SYMBOL_INFO else 0.01):
                        expected_lot = 0.0
                else:
                    expected_lot = float(lot_val)

                expected_lot_norm = (
                    normalize_volume(expected_lot) if expected_lot > 0 else 0.0
                )

                if (
                    expected_lot_norm == 0.0
                    or abs(float(order.volume_initial) - expected_lot_norm) > 0.00001
                    or abs(float(order_tp) - float(expected_tp)) > 0.00001
                    or abs(float(order_sl) - float(expected_sl)) > 0.00001
                ):
                    is_valid = False

        elif order.type in [mt5.ORDER_TYPE_SELL_LIMIT, mt5.ORDER_TYPE_SELL_STOP]:
            is_valid = any(
                abs(round(order_price, 5) - round(al, 5)) <= round(sell_tolerance, 5)
                for al in acceptable_sell_levels
            )
            # 🌟 YENİ: Arayüzden güncellenen Lot, TP veya SL değerleri mevcut emirle uyuşmuyorsa emri sil
            if is_valid:
                expected_tp = normalize_price(order_price - sell_tp_val)
                expected_sl = (
                    normalize_price(order_price + sell_sl_val)
                    if sell_sl_val > 0
                    else 0.0
                )
                order_tp = order.tp if order.tp else 0.0
                order_sl = order.sl if order.sl else 0.0

                # Kısmi Dolum Koruması: O fiyatta zaten bir pozisyon varsa beklenen lot fark kadar olmalı
                pos_vol = sum(
                    p.volume
                    for p in robot_positions
                    if p.magic == target_magic
                    and p.type == mt5.POSITION_TYPE_SELL
                    and abs(
                        round(normalize_price(p.price_open), 5) - round(order_price, 5)
                    )
                    <= round(sell_tolerance, 5)
                )
                if pos_vol > 0:
                    expected_lot = round(float(sell_lot_val) - pos_vol, 8)
                    if expected_lot < (SYMBOL_INFO.volume_min if SYMBOL_INFO else 0.01):
                        expected_lot = 0.0
                else:
                    expected_lot = float(sell_lot_val)

                expected_lot_norm = (
                    normalize_volume(expected_lot) if expected_lot > 0 else 0.0
                )

                if (
                    expected_lot_norm == 0.0
                    or abs(float(order.volume_initial) - expected_lot_norm) > 0.00001
                    or abs(float(order_tp) - float(expected_tp)) > 0.00001
                    or abs(float(order_sl) - float(expected_sl)) > 0.00001
                ):
                    is_valid = False

        if not is_valid:
            cancel_order(order)
            silinen_emir_sayisi += 1

    if silinen_emir_sayisi > 0:
        log_message(
            f"🧹 Pencere Kaydı: Fiyattan uzaklaşan {silinen_emir_sayisi} adet emir silindi."
        )

    # EKSİK EMİRLERİ TAMAMLA (TP Olanların Yerini Doldurur)
    exist_buy_levels, exist_sell_levels = get_existing_levels_by_direction(
        grid_step, sell_grid_step
    )
    eklenen_emir_sayisi = 0

    # 🌟 GÜVENLİ TOLERANS: Doldurma işleminde aynı emri 2. kez vermemek için daha katı kontrol (Asimetrik)
    buy_fill_tolerance = grid_step * 0.45
    sell_fill_tolerance = sell_grid_step * 0.45

    # BUY Eksikleri
    for level_price in desired_buy_levels:
        is_occupied = any(
            abs(round(level_price, 5) - round(el, 5)) <= round(buy_fill_tolerance, 5)
            for el in exist_buy_levels
        )
        if not is_occupied:
            tp_price = normalize_price(level_price + tp_val)
            sl_price = normalize_price(level_price - sl_val) if sl_val > 0 else None
            if send_pending_order(
                level_price,
                lot_val,
                tp_price,
                sl_price,
                zone_idx=ACTIVE_ZONE_IDX,
                direction="BUY",
            ):
                eklenen_emir_sayisi += 1

    # SELL Eksikleri
    for level_price in desired_sell_levels:
        is_occupied = any(
            abs(round(level_price, 5) - round(el, 5)) <= round(sell_fill_tolerance, 5)
            for el in exist_sell_levels
        )
        if not is_occupied:
            tp_price = normalize_price(level_price - sell_tp_val)
            sl_price = (
                normalize_price(level_price + sell_sl_val) if sell_sl_val > 0 else None
            )
            if send_pending_order(
                level_price,
                sell_lot_val,
                tp_price,
                sl_price,
                zone_idx=ACTIVE_ZONE_IDX,
                direction="SELL",
            ):
                eklenen_emir_sayisi += 1

    if eklenen_emir_sayisi > 0:
        log_message(
            f"🌱 Ağ Tazelendi: TP olan/eksik {eklenen_emir_sayisi} adet emir yerleştirildi."
        )

    return True


# ═══════════════════════════════════════════════════════════════════════════════
# BAŞLANGIÇ KONTROLLERİ VE ANA DÖNGÜ
# ═══════════════════════════════════════════════════════════════════════════════


def run_startup_checks():
    global SYMBOL_INFO, FILLING_MODE, active_zones_state, CONSECUTIVE_ERRORS
    CONSECUTIVE_ERRORS = {}  # Başlangıçta hata sayacını sıfırla

    log_message("=" * 60)
    log_message("USOUSD Çift Yönlü Grid Robot(AUTO GRID) Baslatiliyor...")
    log_message("=" * 60)

    # ==============================================================
    # 🌟 GÜNCELLEME: MT5 BAĞLANTISI ZATEN bot_runner.py TARAFINDAN KURULDU.
    # İkinci kez initialize()/login() yapmak IPC çakışmasına yol açar.
    # Bunun yerine sadece mevcut bağlantının canlı olduğunu doğrula.
    # ==============================================================
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    term_info = mt5.terminal_info()
    if term_info is None or not getattr(term_info, "connected", False):
        log_message(
            "🔴 MT5 bağlantısı koptu! Terminal bilgisi alınamadı.",
            "ERROR",
        )
        mt5.shutdown()
        return False
    account_info = mt5.account_info()
    if account_info is not None:
        log_message(
            f"✅ MT5 bağlantısı canlı doğrulandı (Hesap: {account_info.login}, "
            f"Sunucu: {account_info.server})"
        )
    else:
        log_message(
            "⚠️ Hesap bilgisi alınamadı ama terminal bağlı. Devam ediliyor...",
            "WARN",
        )

    # 🌟 YENİ: Bütün sembolleri MT5'ten çek ve arayüz (Autocomplete + Lot Kuralları) için JSON'a kaydet
    try:
        if hasattr(mt5, "symbols_get"):
            all_symbols = mt5.symbols_get()
            if all_symbols:
                sym_data = {}
                for s in all_symbols:
                    if hasattr(s, "name"):
                        sym_data[s.name] = {
                            "vol_min": getattr(s, "volume_min", 0.01),
                            "vol_max": getattr(s, "volume_max", 100.0),
                            "vol_step": getattr(s, "volume_step", 0.01),
                            "contract_size": getattr(
                                s, "trade_contract_size", 100000.0
                            ),
                        }
                if sym_data:
                    sym_file = get_symbols_path(account_id)
                    tmp_sym = sym_file + ".tmp"
                    with open(tmp_sym, "w", encoding="utf-8") as f:
                        json.dump(sym_data, f)
                    os.replace(tmp_sym, sym_file)
    except Exception as e:
        log_message(f"Sembol listesi güncellenemedi: {e}", "WARN")

    # 2. Aşama: Sembolü doğrudan senin inputundan alır ve MT5'e otomatik ekleme emri verir
    mt5.symbol_select(SYMBOL, True)

    SYMBOL_INFO = mt5.symbol_info(SYMBOL)
    if SYMBOL_INFO is None or not SYMBOL_INFO.visible:
        # 🌟 İŞLEM ÖNCESİ SEMBOL (Pre-Flight) KONTROLÜ
        log_message(
            f"🚨 HATA: Sembol ({SYMBOL}) aracı kurum sunucusunda bulunamadı!",
            "ERROR",
        )
        log_message(
            "Lütfen arayüze girdiğiniz sembol adının (örn: XTIUSD) brokerınızla birebir aynı olduğundan emin olun.",
            "ERROR",
        )

        # Arayüze başlangıç hatası olarak bildir (Startup Error)
        account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
        try:
            metrics_file = get_metrics_path(account_id)
            if os.path.exists(metrics_file):
                with open(metrics_file, "r", encoding="utf-8") as f:
                    metrics_data = json.load(f)

                metrics_data["startup_error"] = (
                    f"Sembol hatası: {SYMBOL} piyasa izleminde yok veya bu hesapta işlem görmüyor."
                )

                tmp_metrics_file = metrics_file + ".tmp"
                with open(tmp_metrics_file, "w", encoding="utf-8") as f:
                    json.dump(metrics_data, f)
                os.replace(tmp_metrics_file, metrics_file)
        except Exception:
            pass

        mt5.shutdown()
        return False

    if determine_fill_mode() is None:
        mt5.shutdown()
        return False

    if not is_market_open():
        log_message("Piyasa su anda kapali. Acilmasi bekleniyor...", "WARN")
    else:
        tick = mt5.symbol_info_tick(SYMBOL)
        if tick:
            log_message(f"Piyasa acik. Bid: {tick.bid}, Ask: {tick.ask}")

    active_zones_state = {}
    robot_positions = get_all_robot_positions()
    robot_orders = get_all_robot_orders()

    if robot_positions is None or robot_orders is None:
        log_message(
            "Kritik Hata: MT5'ten veri alınamadı. Bağlantı stabil değil.", "ERROR"
        )
        mt5.shutdown()
        return False

    for item in robot_positions + robot_orders:
        active_zones_state[item.magic - BASE_MAGIC_NUMBER - 1] = "START"

    if active_zones_state:
        log_message(
            f"🧠 Hafıza Kurtarıldı: Aktif bölgeler: {list(active_zones_state.keys())}"
        )

    # 🛡️ YENİ KORUMA: Önceki oturumdan kalan "Temizle" (CLEAR) komutlarını yok et
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    ui_states_file = get_ui_state_path(account_id)
    if os.path.exists(ui_states_file):
        try:
            os.remove(ui_states_file)
            log_message(
                "🛡️ Güvenlik Koruması: Arayüzden kalan eski temizlik komutları (ui_states) silindi."
            )
        except Exception:
            pass

    log_message("Tum baslangic kontrolleri basarili!")
    return True


def main_loop():
    global IS_RUNNING, INITIAL_CLEANUP_DONE, CONNECTION_LOST

    # 1. Aşama: Motor uyanır uyanmaz, MT5 kontrollerinden önce senin inputunu (XTIUSD vb.) okur
    load_dynamic_settings()

    if not run_startup_checks():
        log_message("Baslangic kontrolleri basarisiz. Robot durduruluyor.", "ERROR")
        time.sleep(
            10
        )  # 🌟 KÖK NEDEN ÇÖZÜMÜ: Başlangıç hatasında spam restart döngüsünü kıran fren!
        return

    log_message("Robot calismaya basladi. (Durdurmak icin Ctrl+C)")

    try:
        while IS_RUNNING:
            load_dynamic_settings()

            # 📡 MOBİL MT5 UZAKTAN KOMUT: Sinyal emri var mı diye bak
            try:
                check_remote_commands()
            except Exception as e:
                log_message(f"Uzaktan komut okuması başarısız: {e}", "ERROR")

            term_info = mt5.terminal_info()
            if (
                term_info is None
                or not getattr(term_info, "connected", False)
                or not getattr(term_info, "trade_allowed", False)
            ):
                if (
                    term_info is None or not getattr(term_info, "connected", False)
                ) and not CONNECTION_LOST:
                    # 🚨 MT5 ile BAĞLANTI KOPTU — arayüze bildir ve logla
                    CONNECTION_LOST = True
                    log_message(
                        "🚨 KRİTİK: MT5 BAĞLANTISI KOPTU! Terminal kapatıldı veya "
                        "Broker sunucusuna bağlantı yok. Bağlantı geri gelene kadar işlem yapılmayacak.",
                        "ERROR",
                    )
                time.sleep(10)
                continue
            else:
                if CONNECTION_LOST:
                    # ✅ Bağlantı geri geldi
                    CONNECTION_LOST = False
                    log_message(
                        "✅ MT5 bağlantısı geri geldi. Robot çalışmaya devam ediyor.",
                        "WARN",
                    )

            if not is_market_open():
                time.sleep(MARKET_CLOSED_CHECK_INTERVAL)
                continue

            if not INITIAL_CLEANUP_DONE:
                # 🚀 Başlangıç Temizliği İPTAL EDİLDİ (Açık işlemlerin ve emirlerin korunması için)
                log_message(
                    "✅ Başlangıç emir koruması aktif. Eski bekleyen emirler silinmedi."
                )
                INITIAL_CLEANUP_DONE = True

            try:
                manage_dynamic_grid()
            except Exception as e:
                log_message(
                    f"🚨 Hata (Crash Koruması): manage_dynamic_grid'de hata: {e}",
                    "ERROR",
                )

            time.sleep(LOOP_INTERVAL_SECONDS)

    except KeyboardInterrupt:
        log_message("Kullanici tarafindan durduruldu.", "WARN")
    finally:
        log_message(
            "🛑 Robot durduruldu. Sadece bekleyen nöbetçi emirler temizleniyor. AÇIK POZİSYONLAR BIRAKILDI."
        )
        eski_emirler = get_all_robot_orders()
        if eski_emirler:
            for emir in eski_emirler:
                cancel_order(emir)
        mt5.shutdown()


if __name__ == "__main__":
    main_loop()
