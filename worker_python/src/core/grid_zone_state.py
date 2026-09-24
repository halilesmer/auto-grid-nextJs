import os
import json
from src.utils.paths import get_ui_state_path

# Bu durumlardaki bölge emir koymaz; kalan emirleri clean_zombie_orders siler.
# AUTO_CLEAR: fiyat bölgeden çıkınca temizlendi (clear_on_exit) → kullanıcı arayüzden
# yeniden başlatana (START) veya bot yeniden başlayana kadar durur.
STOPPED_ZONE_STATES = ("PAUSE", "AUTO_CLEAR", "CLEAR")


def _default_state(zone) -> str:
    """Komut yoksa bölgenin durumu ayardaki is_active'ten gelir."""
    return "PAUSE" if str(zone.get("is_active", True)).lower() == "false" else "START"


def process_zone_commands(zones, active_zones_state):
    account_id = os.environ.get("ACTIVE_ACCOUNT_ID", "default")
    ui_states_file = get_ui_state_path(account_id)
    if os.path.exists(ui_states_file):
        try:
            with open(ui_states_file, "r", encoding="utf-8") as f:
                ui_states = json.load(f)
                for k in list(active_zones_state.keys()):
                    if str(k) not in ui_states:
                        # Dosyada olmayan bölge: arayüz bu bölgeye hiç komut göndermedi (dosya,
                        # başka bir bölgenin Başlat/Duraklat'ı, 3 red veya çıkış temizliğiyle
                        # oluşmuş olabilir). Eskiden CLEAR yapılıyordu → o bölgenin emirleri
                        # sessizce siliniyordu. Artık bölgenin kendi is_active ayarı geçerli;
                        # silinmiş bölgeler (index artık yok) CLEAR kalır.
                        if 0 <= k < len(zones):
                            active_zones_state[k] = _default_state(zones[k])
                        else:
                            active_zones_state[k] = "CLEAR"
                for zone_idx_str, state in ui_states.items():
                    active_zones_state[int(zone_idx_str)] = state
        except Exception:
            pass
    else:
        for idx, zone in enumerate(zones):
            if idx not in active_zones_state:
                active_zones_state[idx] = _default_state(zone)