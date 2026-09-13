import os
import json
from src.utils.paths import get_ui_state_path
from src.core.grid_helpers import log_message
from src.core.grid_orders import cancel_order, get_all_robot_orders

BASE_MAGIC_NUMBER = 200000
REMOTE_COMMAND_PREFIX = "GRID:"
REMOTE_SIGNAL_STOP_PRICE = 1.0
REMOTE_SIGNAL_START_PRICE = 2.0
REMOTE_SIGNAL_VOLUME = 0.01


def check_remote_commands(mt5, remote_paused, zones):
    if mt5 is None:
        return False, remote_paused, False

    orders = mt5.orders_get()
    if orders is None or len(orders) == 0:
        return False, remote_paused, False

    command_found = False
    active_zone_reset = False

    for order in orders:
        if BASE_MAGIC_NUMBER <= order.magic < BASE_MAGIC_NUMBER + 1000:
            continue

        order_volume = getattr(
            order, "volume_current", getattr(order, "volume_initial", 0.0)
        )
        is_signal_format = (
            order.type == mt5.ORDER_TYPE_BUY_LIMIT
            and abs(float(order_volume) - REMOTE_SIGNAL_VOLUME) < 1e-6
        )

        comment = order.comment or ""
        cmd = None

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

        if cmd == "STOP":
            if not remote_paused:
                remote_paused = True
                log_message(
                    "🛑 Motor uzaktan DURDURULDU. Bekleyen robot emirleri siliniyor.",
                    "WARN",
                )
                for ro in get_all_robot_orders(mt5) or []:
                    cancel_order(mt5, ro)
                _sync_ui_states("PAUSE", zones)
        elif cmd == "START":
            if remote_paused:
                remote_paused = False
                active_zone_reset = True
                log_message("🚀 Motor uzaktan TEKRAR BAŞLATILDI. (GRID:START)", "WARN")
                _sync_ui_states("START", zones)

        if cancel_order(mt5, order):
            log_message(f"🧹 Sinyal emri {order.ticket} temizlendi (self-destruct).")

    return command_found, remote_paused, active_zone_reset


def _sync_ui_states(new_state, zones):
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    states_file = get_ui_state_path(account_id)
    try:
        bg_states = {}
        if os.path.exists(states_file):
            with open(states_file, "r", encoding="utf-8") as f:
                bg_states = json.load(f)

        target_count = len(zones) if zones else len(bg_states)
        for i in range(max(1, target_count)):
            if bg_states.get(str(i)) != "CLEAR":
                bg_states[str(i)] = new_state

        tmp_file = states_file + ".tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(bg_states, f)
        os.replace(tmp_file, states_file)
    except Exception:
        pass
