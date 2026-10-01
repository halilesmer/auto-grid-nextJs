import os
import json
import time
from src.core.state import state as _grid_state
from src.utils.paths import get_ui_state_path
from src.utils.zone_magic import remap_ui_states, zone_index_by_magic, zone_magics

# Sıraya (bölge indeksine) göre tutulan motor durumları; bölge silinince rekey_zone_state taşır
_INDEX_KEYED_STATE = (
    "active_zones_state",
    "consecutive_errors",
    "limit_warned_zones",
    "fractal_tracked",
    "vanished_times",
)

# Bu durumlardaki bölge emir koymaz; kalan emirleri clean_zombie_orders siler.
# AUTO_CLEAR: fiyat bölgeden çıkınca temizlendi (clear_on_exit) → kullanıcı arayüzden
# yeniden başlatana (START) veya bot yeniden başlayana kadar durur.
STOPPED_ZONE_STATES = ("PAUSE", "AUTO_CLEAR", "CLEAR")


def _default_state(zone) -> str:
    """Komut yoksa bölgenin durumu ayardaki is_active'ten gelir."""
    return "PAUSE" if str(zone.get("is_active", True)).lower() == "false" else "START"


def process_zone_commands(zones, active_zones_state):
    if _grid_state.ui_remap_pending is not None:
        # Bölge silindi ama dosya henüz yeni sıraya taşınamadı: eski sıradaki dosya yerine
        # (taşınmış) bellekteki durum geçerli (rekey_zone_state)
        return
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


def _remap_file(old_zones, new_zones):
    """ui_state dosyasını yeni sıraya taşır; Windows'ta başka süreç dosyayı o an açık tutuyorsa
    os.replace reddedilir → kısa tekrar. Dönüş: başarılı (veya gerek yok) mu."""
    path = get_ui_state_path(os.environ.get("ACTIVE_ACCOUNT_ID", "default"))
    for attempt in range(3):
        try:
            remap_ui_states(path, old_zones, new_zones)
            return True
        except OSError:
            if attempt < 2:
                time.sleep(0.05)
    return False


def rekey_zone_state(st, old_zones, new_zones, log=None):
    """Bölge listesinin sırası değiştiyse (bölge silindi) motorun sıraya bağlı durumunu taşır.

    Bot her turda ayarları yeniden okur (wrappers.load_dynamic_settings). Bölge silinince
    arkadakiler bir sıra öne kayar; bellekteki durum (aktif bölge, PAUSE/AUTO_CLEAR, fraktal
    takibi, red sayaçları...) eski sırayla kalırsa komşu bölge silinenin durumunu devralırdı:
    ör. silinen aktif bölge yerine komşusu "aktif" sayılır, kurs onun aralığı dışındaysa
    bölge çıkışı (clear_on_exit) onun emirlerini siler. Eşleştirme magic üzerindendir (ENG-27);
    silinen bölgenin durumu düşer. ui_state dosyası da aynı turda taşınır; taşınamazsa
    (st.ui_remap_pending) dosya okunmaz ve her ayar okumasında yeniden denenir.
    Dönüş: bellekteki durum taşındı mı.
    """
    old_magics = zone_magics(old_zones)
    new_index = zone_index_by_magic(new_zones)
    # İlk okuma (sıra bilinmiyor) veya her bölge yerinde (yalnızca sona ekleme): taşınacak bir şey yok
    changed = not all(new_index.get(m) == i for i, m in enumerate(old_magics))

    if changed:
        def moved(idx):
            if isinstance(idx, int) and 0 <= idx < len(old_magics):
                return new_index.get(old_magics[idx])
            return None

        # Yerinde güncellenir: döngü bu sözlüklerin kendisini motora verir
        for name in _INDEX_KEYED_STATE:
            table = getattr(st, name)
            rekeyed = {moved(k): v for k, v in table.items() if moved(k) is not None}
            table.clear()
            table.update(rekeyed)
        active = {sym: moved(i) for sym, i in st.active_zones.items() if moved(i) is not None}
        st.active_zones.clear()
        st.active_zones.update(active)
        # (bölge, ...) anahtarlı tablolar: anında giriş freni, tek seferlik fraktal logları
        for table in (st.instant_entry_sent, st.fractal_logged):
            rekeyed = {(moved(k[0]), *k[1:]): v for k, v in table.items()
                       if isinstance(k, tuple) and k and moved(k[0]) is not None}
            table.clear()
            table.update(rekeyed)

    if changed or st.ui_remap_pending is not None:
        # Dosya hâlâ ilk başarısız taşımadan önceki sıradaysa oradan taşı
        file_order = st.ui_remap_pending if st.ui_remap_pending is not None else old_zones
        if _remap_file(file_order, new_zones):
            st.ui_remap_pending = None
        else:
            if st.ui_remap_pending is None and log:
                log("Bölge durumları (ui_state) yeni sıraya taşınamadı; dosya taşınana kadar "
                    "bellekteki durum geçerli, her turda yeniden deneniyor.", "ERROR")
            st.ui_remap_pending = file_order

    if changed and log:
        log(f"🔀 Bölge listesi değişti: motor durumu magic'e göre yeni sıraya taşındı "
            f"({old_magics} → {zone_magics(new_zones)}).")
    return changed
