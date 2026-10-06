# src/core/wrappers.py
from .state import state
from src.core.grid_helpers import (
    log_message,
    is_market_open,
    determine_fill_mode,
)
from src.core.grid_metrics import calculate_live_metrics
from src.core.grid_orders import (
    BASE_MAGIC_NUMBER,
    zone_magic,
    get_all_robot_orders,
    get_all_robot_positions,
    cancel_order,
    send_pending_order_helper,
)
from src.core.grid_remote import check_remote_commands
from src.core.grid_zone_selector import get_active_zone as _get_active_zone
from src.core.grid_zone_state import (
    process_zone_commands as _process_zone_commands,
    rekey_zone_state,
)
from src.core.grid_orchestrator import manage_dynamic_grid as _manage_dynamic_grid
from src.utils.symbol_setups import settings_zones

try:
    import MetaTrader5 as mt5  # type: ignore
except ImportError:
    mt5 = None


def get_live_metrics():
    global state
    res = calculate_live_metrics(
        mt5, state.active_symbols, state.connection_lost, state.remote_paused, state.active_zones_state,
        state.zones,
    )
    state.connection_lost = res.get("connection_lost", False)
    return res


def load_dynamic_settings():
    global state
    from src.utils.config import load_settings

    # Ayar dosyası o an okunamıyorsa (API yazıyor, Windows kilidi, bozuk JSON) bu tur eski
    # bölgelerle devam: boş liste "bütün bölgeler silindi" sayılır, emirleri temizlenirdi
    try:
        settings = load_settings("Auto Grid", raise_on_error=True)
    except Exception as exc:
        if not getattr(load_dynamic_settings, "_read_failed", False):
            log_message(f"Ayar dosyası okunamadı, son okunan ayarla devam ediliyor: {exc}", "WARN")
        load_dynamic_settings._read_failed = True
        return
    load_dynamic_settings._read_failed = False

    # Ayar dosyası bozuk olsa bile döngü çökmemeli (eski davranış)
    try:
        previous_zones = state.zones
        # Her kurulum bir bölge (ZON-19): sembol sırası, sembol içinde kurulum sırası
        state.zones = settings_zones(settings)
        # Bölge silindiyse sıraya bağlı durumu magic'e göre taşı (ENG-27)
        try:
            rekey_zone_state(state, previous_zones, state.zones, log=log_message)
        except Exception as exc:
            log_message(f"Bölge durumu yeni sıraya taşınamadı: {exc}", "ERROR")
        state.loop_interval_seconds = settings.get("LOOP_INTERVAL_SECONDS", 1.0)
        state.active_symbols.clear()
        for zone in state.zones:
            if "symbol" in zone and zone["symbol"]:
                state.active_symbols.add(str(zone["symbol"]).upper().strip())

        for sym in state.active_symbols:
            if sym not in state.symbol_infos:
                try:
                    mt5.symbol_select(sym, True)
                    info = mt5.symbol_info(sym)
                    if info:
                        state.symbol_infos[sym] = info
                except Exception:
                    pass
    except Exception:
        pass


def get_active_zone():
    return _get_active_zone(mt5, state.zones)


def send_pending_order(price, lot, tp_price, sl_price=None, zone_idx=0, direction="BUY", symbol=None):
    zone = state.zones[zone_idx] if 0 <= zone_idx < len(state.zones) else {}
    return send_pending_order_helper(
        mt5,
        price,
        lot,
        tp_price,
        sl_price,
        zone_idx,
        direction,
        symbol,
        state.symbol_infos,
        state.consecutive_errors,
        state.active_zones_state,
        magic=zone_magic(zone, zone_idx),
    )


def process_zone_commands():
    _process_zone_commands(state.zones, state.active_zones_state)


def check_remote_commands_wrapper():
    global state
    found, state.remote_paused, reset_zone = check_remote_commands(mt5, state.remote_paused, state.zones)
    if reset_zone:
        state.active_zones.clear()
    return found


def manage_dynamic_grid():
    global state
    ok, state.active_zones = _manage_dynamic_grid(
        mt5,
        state.zones,
        state.active_zones,
        state.remote_paused,
        state.symbol_infos,
        state.consecutive_errors,
        state.active_zones_state,
        state.filling_mode,
    )
    return ok