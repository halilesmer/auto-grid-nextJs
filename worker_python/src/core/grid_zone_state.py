import os
import json
from src.utils.paths import get_ui_state_path

# Bu durumlardaki bölge emir koymaz; kalan emirleri clean_zombie_orders siler.
# AUTO_CLEAR: fiyat bölgeden çıkınca temizlendi (clear_on_exit) → kullanıcı arayüzden
# yeniden başlatana (START) veya bot yeniden başlayana kadar durur.
STOPPED_ZONE_STATES = ("PAUSE", "AUTO_CLEAR", "CLEAR")


def process_zone_commands(zones, active_zones_state):
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    ui_states_file = get_ui_state_path(account_id)
    if os.path.exists(ui_states_file):
        try:
            with open(ui_states_file, "r", encoding="utf-8") as f:
                ui_states = json.load(f)
                for k in list(active_zones_state.keys()):
                    if str(k) not in ui_states:
                        active_zones_state[k] = "CLEAR"
                for zone_idx_str, state in ui_states.items():
                    active_zones_state[int(zone_idx_str)] = state
        except Exception:
            pass
    else:
        for idx, zone in enumerate(zones):
            if idx not in active_zones_state:
                is_active = zone.get("is_active", True)
                active_zones_state[idx] = "START" if is_active else "PAUSE"