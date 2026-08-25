# src/utils/state_manager.py
"""
Hesap ID'ye (MT5 Login) bağlı kalıcı sistem durumu — Source of Truth senkronizasyonu.

Kural: Yerel JSON dosyalarına körü körüne güvenilmez. Bot her başladığında
gerçek durum MT5 sunucusundan (Account ID + Magic Number) sorgulanır, yerel
grid ayarları (configs) ile birleştirilir ve data/state_{account_id}.json
olarak yeniden inşa edilir.

Port, makine adı veya Streamlit durumu bu dosyanın ADINDA asla yer almaz.
"""
import json
import os
import time
import datetime

from src.utils.paths import get_state_path, get_settings_path


def _atomic_write(file_path, data):
    tmp = file_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    os.replace(tmp, file_path)


def load_state(account_id):
    path = get_state_path(account_id)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(account_id, state):
    _atomic_write(get_state_path(account_id), state)


def _position_summary(p):
    ptype = int(getattr(p, "type", -1))
    return {
        "ticket": int(getattr(p, "ticket", 0)),
        "symbol": getattr(p, "symbol", ""),
        "type": ptype,
        "type_name": "BUY" if ptype == 0 else "SELL",
        "volume": float(getattr(p, "volume", 0.0)),
        "price_open": float(getattr(p, "price_open", 0.0)),
        "profit": round(float(getattr(p, "profit", 0.0)), 2),
        "swap": round(float(getattr(p, "swap", 0.0)), 2),
        "magic": getattr(p, "magic", 0),
        "comment": getattr(p, "comment", ""),
        "tp": float(getattr(p, "tp", 0.0) or 0.0),
        "sl": float(getattr(p, "sl", 0.0) or 0.0),
    }


def _order_summary(o):
    return {
        "ticket": int(getattr(o, "ticket", 0)),
        "symbol": getattr(o, "symbol", ""),
        "type": int(getattr(o, "type", -1)),
        "price_open": float(getattr(o, "price_open", 0.0)),
        "volume_current": float(getattr(o, "volume_current", 0.0)),
        "magic": getattr(o, "magic", 0),
        "comment": getattr(o, "comment", ""),
        "tp": float(getattr(o, "tp", 0.0) or 0.0),
        "sl": float(getattr(o, "sl", 0.0) or 0.0),
    }


def get_magic_range(bot_engine):
    base = int(getattr(bot_engine, "BASE_MAGIC_NUMBER", 200000))
    return base, base + 1000


def _get_mt5(bot_engine):
    """Gerçek MetaTrader5 modülü veya DummyMT5 (Mac test modu) döndürür."""
    mt5_mod = getattr(bot_engine, "mt5", None)
    if mt5_mod is None:
        import MetaTrader5 as mt5_mod
    return mt5_mod


def build_synced_state(bot_engine, account_id, log_func=None):
    """
    MT5'i "Source of Truth" olarak kullanarak sistem durumunu yeniden inşa eder.

    1) Açık pozisyonları Magic Number aralığından sorgular.
    2) Bekleyen emirleri sorgular.
    3) Yerel grid ayarlarını (configs) okur.
    4) Toplam kâr/zarar hesaplar.
    5) Sonucu dict olarak döndürür (kaydetme çağırana bırakılır).

    🚨 Bu fonksiyon ASLA işlem kapatmaz / emir silmez. Sadece okur ve raporlar.
    """
    mt5_stub = _get_mt5(bot_engine)
    magic_min, magic_max = get_magic_range(bot_engine)

    start = time.time()

    try:
        positions_raw = mt5_stub.positions_get()
    except Exception:
        positions_raw = None
    try:
        orders_raw = mt5_stub.orders_get()
    except Exception:
        orders_raw = None

    robot_positions, manual_positions = [], []
    if positions_raw:
        for p in positions_raw:
            magic = getattr(p, "magic", 0)
            (robot_positions if magic_min <= magic < magic_max else manual_positions).append(
                _position_summary(p)
            )

    robot_orders, manual_orders = [], []
    if orders_raw:
        for o in orders_raw:
            magic = getattr(o, "magic", 0)
            (robot_orders if magic_min <= magic < magic_max else manual_orders).append(
                _order_summary(o)
            )

    total_profit = round(sum(float(p.get("profit", 0.0)) for p in robot_positions), 2)

    # Yerel grid ayarları (config) — gerçeğin kaynağı MT5 ama parametre kaynağı buradadır.
    settings = {}
    try:
        settings_path = get_settings_path(account_id)
        if os.path.exists(settings_path):
            with open(settings_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
    except Exception:
        pass

    state = {
        "account_id": str(account_id),
        "sync_ts": datetime.datetime.now().isoformat(timespec="seconds"),
        "sync_elapsed_ms": round((time.time() - start) * 1000, 1),
        "port": None,  # Port ARTIK hafızanın parçası DEĞİL
        "pid": os.getpid(),
        "source_of_truth": "MT5",
        "summary": {
            "open_positions": len(robot_positions),
            "pending_orders": len(robot_orders),
            "total_profit": total_profit,
            "manual_positions": len(manual_positions),
        },
        "positions": robot_positions,
        "pending_orders": robot_orders,
        "config": {
            "zones": settings.get("ZONES", []),
            "loop_interval_seconds": settings.get("LOOP_INTERVAL_SECONDS", 1.0),
            "symbol": settings.get("SYMBOL", ""),
        },
    }

    if log_func:
        log_func(
            f"🧠 MT5 SENKRONİZASYONU: {len(robot_positions)} pozisyon, "
            f"{len(robot_orders)} bekleyen emir. Toplam P/L: {total_profit} "
            f"({state['sync_elapsed_ms']}ms)"
        )

    return state