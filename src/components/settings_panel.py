# components/settings_panel.py
import streamlit as st
import uuid
import json
import os

# Modal (Dialog) pencerelerimizi içeri alıyoruz:
from src.components.dialogs import confirm_delete_zone_dialog, symbol_error_dialog

# 🌟 YENİ: Merkezi yol (path) yöneticisini içeri aktarıyoruz
from src.utils.paths import get_ui_state_path, get_symbols_path

@st.dialog("⚠️ Kaydedilmemiş Ayarlar")
def confirm_start_with_changes_dialog(account_id, zone_id, idx):
    st.write("Bu bölgede değiştirdiğiniz ancak henüz kaydetmediğiniz ayarlar var.")
    st.write("**Değiştirdiğiniz yeni ayarlar ile mi başlasın?**")

    c1, c2 = st.columns(2)
    if c1.button("✅ Evet (Kaydet ve Başlat)", width="stretch"):
        st.session_state[f"save_req_{account_id}"] = True
        _handle_zone_action(account_id, zone_id, idx, "START")
        st.rerun()
    if c2.button("❌ Hayır (İptal)", width="stretch"):
        st.rerun()


def render_settings_panel(
    current_settings,
    engine_name="Auto Grid",
    account_id="default",
    live_data=None,
    active_account=None,
    is_running=False,
    is_connecting=False,
):
    return render_auto_grid_settings(
        current_settings, account_id, live_data, active_account, is_running, is_connecting
    )


def _default_zone():
    return {
        "id": str(uuid.uuid4()),
        "symbol": "USOUSD",
        "order_type": "BUY",
        "min_price": 70.0,
        "max_price": 80.0,
        "grid_step": 0.05,
        "lot_size": 0.01,
        "take_profit": 0.05,
        "stop_loss": 0.0,
        "sell_grid_step": 0.05,
        "sell_lot_size": 0.01,
        "sell_take_profit": 0.05,
        "sell_stop_loss": 0.0,
        "is_breakout": False,
        "pullback_distance": 0.50,
        "sync_buy_sell": True,
        "levels_below": 5,
        "levels_above": 5,
        "max_positions": 10,
        "clear_on_exit": True,
        "clear_exit_side": "SELL (Aşağı)",       # 🌟 EKLENDİ
        "clear_target_side": "Sadece BUY İşlemleri", # 🌟 EKLENDİ
        "clear_scope": "Sadece Bekleyen Emirler",
        "exit_condition": "Anlık Fiyat",
        "exit_timeframe": "M15",
    }


def _handle_zone_action(account_id: str, zone_id: str, idx: int, state: str):
    """Buton tıklamalarında UI'ı çökertmeden durumu güncelleyen Callback fonksiyonu."""
    ui_state_key = f"ui_zone_states_{account_id}"
    if ui_state_key not in st.session_state:
        st.session_state[ui_state_key] = {}

    st.session_state[ui_state_key][zone_id] = state

    # 🌟 RACE CONDITION KORUMASI: Dosyaya SADECE kullanıcı butona bastığında yaz
    zones_session_key = f"auto_grid_zones_{account_id}"
    if zones_session_key in st.session_state:
        backend_states = {}
        for z in st.session_state[zones_session_key]:
            z_id = z.get("id")
            magic_key = str(z.get("magic_idx"))
            if z_id and magic_key:
                backend_states[magic_key] = st.session_state[ui_state_key].get(
                    z_id, "CLEAR"
                )

        try:
            ui_file = get_ui_state_path(account_id)
            tmp_ui_file = ui_file + ".tmp"
            with open(tmp_ui_file, "w", encoding="utf-8") as f:
                json.dump(backend_states, f)
            os.replace(tmp_ui_file, ui_file)
        except Exception:
            pass


def _force_upper_symbol(key: str):
    """Sembol inputuna yazılan değeri anında büyük harfe çevirir."""
    if key in st.session_state:
        st.session_state[key] = str(st.session_state[key]).upper().strip()


def render_auto_grid_settings(
    current_settings, account_id, live_data, active_account, is_running=False, is_connecting=False
):
    zones_session_key = f"auto_grid_zones_{account_id}"
    ui_state_key = f"ui_zone_states_{account_id}"

    # 1. İlk açılış: Kayıtlı bölgelere ID ataması yaparak güvenle yükle
    if zones_session_key not in st.session_state:
        saved_zones = current_settings.get("ZONES", [])
        for i, z in enumerate(saved_zones):
            if "id" not in z:
                z["id"] = str(uuid.uuid4())
            # 🛡️ GÜVENLİK (Kıyamet Bug'ı Çözümü): Her bölgeye kalıcı bir Magic Kimliği ver
            if "magic_idx" not in z:
                z["magic_idx"] = i

        if not saved_zones:
            new_zone = _default_zone()
            new_zone["magic_idx"] = 0
            saved_zones = [new_zone]

        st.session_state[zones_session_key] = saved_zones

    # 2. Arayüz Kalıcı Hafızasını ve Bot'tan Gelen Bildirimleri Yükle
    if ui_state_key not in st.session_state:
        st.session_state[ui_state_key] = {}

    # 🌟 GÜNCELLENDİ: Diskteki en son durumu oku (İlk açılışta veya yenilemede durumu koru)
    states_file = get_ui_state_path(account_id)
    if os.path.exists(states_file):
        try:
            with open(states_file, "r", encoding="utf-8") as f:
                saved_states = json.load(f)
                for i, z in enumerate(st.session_state[zones_session_key]):
                    zone_id = z["id"]
                    # Eğer bölge durum hafızasında yoksa veya Bot arka planda durum değiştirdiyse diskten yükle
                    magic_idx_str = str(z.get("magic_idx", i))
                    if zone_id not in st.session_state[ui_state_key]:
                        st.session_state[ui_state_key][zone_id] = saved_states.get(
                            magic_idx_str, "CLEAR"
                        )
                    elif saved_states.get(magic_idx_str) in ("AUTO_CLEAR", "PAUSE", "START"):
                        st.session_state[ui_state_key][zone_id] = saved_states.get(magic_idx_str)
        except Exception:
            pass

    # 🌟 YENİ: Otomatik Tamamlama (Autocomplete) ve Lot Kuralları için diskten oku
    available_symbols = []
    symbols_dict = {}
    sym_file = get_symbols_path(account_id)
    if os.path.exists(sym_file):
        try:
            with open(sym_file, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                if isinstance(raw_data, dict):
                    symbols_dict = raw_data
                    available_symbols = list(raw_data.keys())
                elif isinstance(raw_data, list):
                    available_symbols = raw_data
        except Exception:
            pass

    # 🌟 GÜNCELLENDİ: MT5 Bağlantısı ve Kontrol Sıklığı yan yana
    h_col1, h_col2, h_col3, h_col4, h_col5 = st.columns(
        [0.45, 0.20, 0.02, 0.20, 0.13], vertical_alignment="center"
    )
    with h_col1:
        st.markdown("###### 🎯 Dinamik Bölgeler (Zones)")

    with h_col2:
        zone_states = list(st.session_state.get(ui_state_key, {}).values())
        any_zone_start = any(s == "START" for s in zone_states)

        mt5_connected = live_data.get("mt5_connected", False) if live_data else False

        # 🌟 DURUM HESAPLAMA (Bağlantı ve Motor Durumu)
        if is_connecting:
            motor_status = "connecting"
            emoji = "⏳"
        elif not is_running:
            motor_status = "stopped"
            emoji = "🔴"
        elif not mt5_connected:
            motor_status = "disconnected"
            emoji = "🔴"
        else:
            motor_status = "running" if any_zone_start else "paused"
            emoji = "🟢" if any_zone_start else "🟡"

        st.markdown(
            f"<div style='text-align:center;font-size:16px; margin-bottom: -5px;'>Durum: {emoji}</div>",
            unsafe_allow_html=True,
        )

        # Sadece Tek Buton: Bağlan / Bağlandı / Hazırlanıyor
        btn_disabled = False
        if is_connecting:
            btn_label = "⏳ Hazırlanıyor..."
            btn_type = "secondary"
            btn_disabled = True
        elif is_running and not mt5_connected:
            # 🛠️ DÜZELTME: Motor çalışıyorken bağlantı koptuysa, tıklayınca kapatacağı için "Bağlan" diyemez!
            btn_label = "🛑 Süreci Durdur"
            btn_type = "secondary"
        elif not is_running:
            btn_label = "🚀 MT5'e Bağlan"
            btn_type = "primary"
        else:
            btn_label = "🟢 Bağlandı"
            btn_type = "secondary"

        if st.button(
            btn_label,
            type=btn_type,
            width="stretch",
            disabled=btn_disabled,
            key=f"motor_main_{account_id}",
        ):
            st.session_state[f"motor_toggle_{account_id}"] = True
            st.rerun()
    with h_col3:
        st.markdown(
            "<div style='text-align: center; font-size: 20px; color: #555;'>|</div>",
            unsafe_allow_html=True,
        )
    with h_col4:
        st.markdown(
            "<div style='text-align: right; font-size: 14px; font-weight: bold;'>Kontrol Sıklığı (Sn):</div>",
            unsafe_allow_html=True,
        )
    with h_col5:
        loop_interval = st.number_input(
            "Kontrol Sıklığı",
            value=float(current_settings.get("LOOP_INTERVAL_SECONDS", 1.0)),
            step=0.1,
            key=f"ag_loop_{account_id}",
            label_visibility="collapsed",
        )

    # 🛡️ GÜVENLİK KİLİDİ: Motor çalışıyorsa ama MT5'e henüz bağlanmadıysa tüm işlem butonlarını kitle!
    disable_action_buttons = is_running and not mt5_connected

    updated_zones = []

    # Bölgeleri Ekrana Çiz
    for idx, zone in enumerate(st.session_state[zones_session_key]):
        zone_id = zone.get("id")
        if not zone_id:
            zone_id = str(uuid.uuid4())
            zone["id"] = zone_id

        current_state = st.session_state[ui_state_key].get(zone_id, "CLEAR")

        start_label = "✅ Başladı" if current_state == "START" else "▶️ Başlat"
        pause_label = "🟡 Beklemede" if current_state == "PAUSE" else "⏸️ Beklet"

        # Orijinal dosyadan veriyi çek (Kıyaslama için)
        orig_zones = current_settings.get("ZONES", [])
        orig_zone = next((z for z in orig_zones if z.get("id") == zone_id), None)

        # 🛠️ Streamlit'in kendi çerçevesini kullanıyoruz
        with st.container(border=True):
            # 🌟 GÜNCELLENDİ: Metrikler başlığın içine alındığı için sütunlar sadeleştirildi
            hdr_col, bc_upd, bc_div1, bc1, bc2, bc3 = st.columns(
                [4.2, 0.8, 0.1, 0.8, 0.8, 0.4],
                vertical_alignment="center",
            )

            with hdr_col:
                # Başlığı daha sonra (değişkenler okunduktan sonra) güncellemek için boş bir alan ayırıyoruz
                title_placeholder = st.empty()

            with bc_upd:
                upd_btn_placeholder = st.empty()

            with bc_div1:
                # Flexbox ile ortalandı ve buton hizasına getirildi
                st.markdown(
                    "<div style='display: flex; justify-content: center; align-items: center; height: 38px; font-size: 24px; color: #888; padding-bottom: 4px;'>|</div>",
                    unsafe_allow_html=True,
                )

            # 🌟 YENİ: Otomatik Temizlik Uyarı Mesajı
            if current_state == "AUTO_CLEAR":
                st.error(
                    "⚠️ **Bilgi:** Fiyat belirlenen sınırların dışına çıktığı için bu bölge otomatik olarak temizlendi ve durduruldu."
                )

            with bc1:
                start_btn_placeholder = st.empty()
            with bc2:
                # 🌟 PAUSE (BEKLET) MANTIĞI: Doğrudan çalışır, motor arka planda mutlak temizlik yapar.
                if st.button(
                    pause_label,
                    key=f"pause_{zone_id}_{account_id}",
                    width="stretch",
                    type="primary" if current_state == "PAUSE" else "secondary",
                    disabled=disable_action_buttons,
                    help="Yeni emir göndermeyi durdurur ve bekleyen emirleri siler. Açık işlemlere dokunmaz.",
                ):
                    # Zaten PAUSE değilse durdur ve anında arayüzü yenile
                    if current_state != "PAUSE":
                        _handle_zone_action(account_id, zone_id, idx, "PAUSE")
                        st.rerun()
            with bc3:
                # 🌟 3 Noktalı Açılır Menü (Kafa karıştıran Temizle butonu silindi!)
                with st.popover("⋮", width="stretch"):
                    if st.button(
                        "➕ Yeni Bölge Ekle",
                        key=f"add_{zone_id}_{account_id}",
                        width="stretch",
                        disabled=disable_action_buttons,
                    ):
                        highest_magic = max(
                            [
                                z.get("magic_idx", -1)
                                for z in st.session_state[zones_session_key]
                            ],
                            default=-1,
                        )
                        new_zone = _default_zone()
                        new_zone["magic_idx"] = (
                            highest_magic + 1 if highest_magic >= 0 else 0
                        )
                        st.session_state[zones_session_key].append(new_zone)
                        st.rerun()
                    if st.button(
                        "🗑️ Bölgeyi Sil",
                        key=f"del_{zone_id}_{account_id}",
                        width="stretch",
                        disabled=disable_action_buttons,
                    ):

                        def remove_zone(target_id=zone_id):
                            st.session_state[zones_session_key] = [
                                z
                                for z in st.session_state[zones_session_key]
                                if z.get("id") != target_id
                            ]

                        confirm_delete_zone_dialog(f"Bölge {idx + 1}", remove_zone)

            st.markdown("<hr style='margin: 0.5em 0 1em 0;'/>", unsafe_allow_html=True)

            zc1, zc2, zc3, zc4 = st.columns(4)
            with zc1:
                sym_key = f"sym_{zone_id}_{account_id}"
                current_sym = str(zone.get("symbol", "USOUSD")).upper()

                # Eğer robot arka planda listeyi indirmişse Selectbox (Arama), yoksa standart Text Input
                if available_symbols:
                    display_symbols = available_symbols.copy()
                    # KORUMA: Arayüz çökmesin diye mevcut sembolü zorla listeye ekle
                    if current_sym not in display_symbols:
                        display_symbols.insert(0, current_sym)

                    z_symbol = st.selectbox(
                        "Sembol (Ara)",
                        options=display_symbols,
                        index=display_symbols.index(current_sym),
                        key=sym_key,
                        help="Broker'ınızın sunduğu semboller. Yazarak arayabilirsiniz.",
                    )
                    z_symbol = str(z_symbol).upper().strip()
                else:
                    z_symbol = st.text_input(
                        "Sembol",
                        key=sym_key,
                        value=current_sym,
                        on_change=_force_upper_symbol,
                        args=(sym_key,),
                        help="Bu bölgenin çalışacağı parite. (Robot MT5'e bağlandığı an akıllı listeye dönüşecektir.)",
                    )
            with zc2:
                opts = ["BUY", "SELL", "BOTH"]
                cur_val = zone.get("order_type", "BUY")
                z_order_type = st.selectbox(
                    "İşlem Yönü",
                    options=opts,
                    index=opts.index(cur_val) if cur_val in opts else 0,
                    key=f"ord_{zone_id}_{account_id}",
                    help="Bu bölge ALIM mı, SATIM mı yoksa HER İKİSİNİ BİRDEN mi yapacak?",
                )
            with zc3:
                z_min = st.number_input(
                    "Alt Sınır ($)",
                    key=f"min_{zone_id}_{account_id}",
                    min_value=0.0,
                    value=max(0.0, float(zone.get("min_price", 0.0))),
                    step=0.1,
                    format="%.2f",
                    help="💵 Robotun çalışacağı EN DÜŞÜK fiyat.",
                )
            with zc4:
                z_max = st.number_input(
                    "Üst Sınır ($)",
                    key=f"max_{zone_id}_{account_id}",
                    min_value=0.0,
                    value=max(0.0, float(zone.get("max_price", 0.0))),
                    step=0.1,
                    format="%.2f",
                    help="💵 Robotun çalışacağı EN YÜKSEK fiyat.",
                )

            # Tıklama anındaki gecikmeyi önlemek için Streamlit State'ini (Hafızasını) anlık okuyoruz
            sync_key = f"sync_{zone_id}_{account_id}"
            z_sync = st.session_state.get(
                sync_key, bool(zone.get("sync_buy_sell", True))
            )

            st.markdown(
                "<div style='margin-top: 10px; margin-bottom: 5px;'></div>",
                unsafe_allow_html=True,
            )

            if z_order_type == "BOTH":
                # 🌟 YENİ: Kutu açık da olsa kapalı da olsa sütun oranı sabit (Kaymayı engeller)
                h_buy_c1, h_buy_c2 = st.columns([0.3, 0.7], vertical_alignment="bottom")

                with h_buy_c1:
                    if not z_sync:
                        st.markdown(
                            "<small style='color: #4CAF50; font-weight: bold;'>🟢 BUY (Alış) Yönü Ağ Ayarları</small>",
                            unsafe_allow_html=True,
                        )
                    else:
                        # Başlık gizlendiğinde boşluk bırakarak Checkbox'ın yerini korur
                        st.empty()

                with h_buy_c2:
                    # 🌟 YENİ: Çift ikon olmaması için emoji metinden çıkarıldı
                    z_sync = st.checkbox(
                        "BUY ve SELL için ortak uygula",
                        value=bool(zone.get("sync_buy_sell", True)),
                        key=sync_key,
                    )
            elif z_order_type == "BUY":
                st.markdown(
                    "<small style='color: #4CAF50; font-weight: bold;'>🟢 BUY (Alış) Yönü Ağ Ayarları</small>",
                    unsafe_allow_html=True,
                )
            elif z_order_type == "SELL":
                st.markdown(
                    "<small style='color: #F44336; font-weight: bold;'>🔴 SELL (Satış) Yönü Ağ Ayarları</small>",
                    unsafe_allow_html=True,
                )

            zc5, zc6, zc7, zc8 = st.columns(4)
            with zc5:
                z_grid = st.number_input(
                    (
                        "Grid Adımı ($)"
                        if (z_order_type != "BOTH" or z_sync)
                        else "BUY Grid ($)"
                    ),
                    key=f"grid_{zone_id}_{account_id}",
                    min_value=0.01,
                    value=max(0.01, float(zone.get("grid_step", 0.05))),
                    step=0.01,
                    format="%.2f",
                    help="📏 Emirlerin kaç aralıkla dizileceği.",
                )

            # 🌟 YENİ: Seçili sembole ait Broker Lot Kurallarını (Akıllı Kalkan) Hazırla
            sym_info = symbols_dict.get(str(z_symbol).upper().strip(), {})
            b_min = float(sym_info.get("vol_min", 0.01))
            b_max_broker = float(sym_info.get("vol_max", 50.0))
            b_step = float(sym_info.get("vol_step", 0.01))
            b_contract = float(sym_info.get("contract_size", 0.0))

            # 🛡️ GÜVENLİ Fat-Finger Koruması: Broker'ın min değerine göre dinamik tavan.
            # Asla min_value > max_value durumuna düşmez!
            b_max_safe = min(b_max_broker, max(b_min * 100, 100.0))

            # 🛡️ GÜVENLİ Dinamik Ondalık Hassasiyeti (Bilimsel gösterim 1e-05 vb. koruması)
            step_str = str(b_step).lower()
            if "e-" in step_str:
                decimal_places = int(step_str.split("e-")[-1])
            elif "." in step_str:
                decimal_places = len(step_str.split(".")[-1].rstrip("0"))
            else:
                decimal_places = 2
            decimal_places = max(1, decimal_places)  # Format hatasını önler
            lot_format = f"%.{decimal_places}f"

            lot_help_text = "📦 İşlem başına lot miktarı."
            if sym_info:
                lot_help_text = (
                    f"🏢 Broker Kuralları ({str(z_symbol).upper().strip()}):\n"
                    f"• Min Lot: {b_min}\n"
                    f"• Max Lot: {b_max_broker} (Güvenlik Sınırı: {b_max_safe})\n"
                    f"• Lot Adımı: {b_step}\n\n"
                    f"ℹ️ Sözleşme Büyüklüğü: 1 Lot = {b_contract:g} Birim"
                )

            with zc6:
                z_lot = st.number_input(
                    (
                        "Lot (📦)"
                        if (z_order_type != "BOTH" or z_sync)
                        else "BUY Lot (📦)"
                    ),
                    key=f"lot_{zone_id}_{account_id}",
                    min_value=b_min,
                    max_value=b_max_safe,
                    value=max(
                        b_min, min(b_max_safe, float(zone.get("lot_size", b_min)))
                    ),
                    step=b_step,
                    format=lot_format,
                    help=lot_help_text,
                )
            with zc7:
                z_tp = st.number_input(
                    (
                        "Kâr Al ($)"
                        if (z_order_type != "BOTH" or z_sync)
                        else "BUY Kâr Al ($)"
                    ),
                    key=f"tp_{zone_id}_{account_id}",
                    min_value=0.01,
                    value=max(0.01, float(zone.get("take_profit", 0.05))),
                    step=0.01,
                    format="%.2f",
                    help="🎯 Pozisyon başına hedeflenen kâr.",
                )
            with zc8:
                z_sl = st.number_input(
                    (
                        "Stop Loss ($)"
                        if (z_order_type != "BOTH" or z_sync)
                        else "BUY Stop Loss ($)"
                    ),
                    key=f"sl_{zone_id}_{account_id}",
                    min_value=0.0,
                    value=max(0.0, float(zone.get("stop_loss", 0.0))),
                    step=0.01,
                    format="%.2f",
                    help="🛡️ Zarar kes mesafesi (0 ise kapalıdır).",
                )

            # Arka planda güvenli kayıt için varsayılanları eşitliyoruz (Senkronize ise BUY değerleri SELL'e kopyalanır)
            z_sell_grid = z_grid
            z_sell_lot = z_lot
            z_sell_tp = z_tp
            z_sell_sl = z_sl

            # Eğer BOTH seçildiyse ve Eşitleme (Sync) KAPALIYSA SELL (Satış) ayarlarını göster
            if z_order_type == "BOTH" and not z_sync:
                st.markdown(
                    "<div style='margin-top: 5px;'><small style='color: #F44336; font-weight: bold;'>🔴 SELL (Satış) Yönü Ağ Ayarları</small></div>",
                    unsafe_allow_html=True,
                )
                zs1, zs2, zs3, zs4 = st.columns(4)
                with zs1:
                    z_sell_grid = st.number_input(
                        "SELL Grid ($)",
                        key=f"s_grid_{zone_id}_{account_id}",
                        min_value=0.01,
                        value=max(
                            0.01,
                            float(
                                zone.get("sell_grid_step", zone.get("grid_step", 0.05))
                            ),
                        ),
                        step=0.01,
                        format="%.2f",
                    )
                with zs2:
                    z_sell_lot = st.number_input(
                        "SELL Lot (📦)",
                        key=f"s_lot_{zone_id}_{account_id}",
                        min_value=b_min,
                        max_value=b_max_safe,
                        value=max(
                            b_min,
                            min(
                                b_max_safe,
                                float(
                                    zone.get(
                                        "sell_lot_size", zone.get("lot_size", b_min)
                                    )
                                ),
                            ),
                        ),
                        step=b_step,
                        format=lot_format,
                        help=lot_help_text,
                    )
                with zs3:
                    z_sell_tp = st.number_input(
                        "SELL Kâr Al ($)",
                        key=f"s_tp_{zone_id}_{account_id}",
                        min_value=0.01,
                        value=max(
                            0.01,
                            float(
                                zone.get(
                                    "sell_take_profit", zone.get("take_profit", 0.05)
                                )
                            ),
                        ),
                        step=0.01,
                        format="%.2f",
                    )
                with zs4:
                    z_sell_sl = st.number_input(
                        "SELL Stop Loss ($)",
                        key=f"s_sl_{zone_id}_{account_id}",
                        min_value=0.0,
                        value=max(
                            0.0,
                            float(
                                zone.get("sell_stop_loss", zone.get("stop_loss", 0.0))
                            ),
                        ),
                        step=0.01,
                        format="%.2f",
                    )

            # 🌟 YENİ: Kırılım Ayarları ve Emir Seviyeleri Tek Bir Çerçeveli Kutuya Alındı
            with st.container(border=True):
                st.markdown(
                    "<small style='color: gray; font-weight: bold;'>🚀 Kırılım (Breakout) & Ağ Seviyeleri</small>",
                    unsafe_allow_html=True,
                )

                if z_order_type == "BOTH" and not z_sync:
                    brk_c1, brk_c2, brk_c3 = st.columns(3)
                else:
                    brk_c1, brk_c2 = st.columns(2)
                    brk_c3 = None

                with brk_c1:
                    z_breakout = st.checkbox(
                        "Sadece Trend Yönüne Ağ Ör",
                        value=bool(zone.get("is_breakout", False)),
                        key=f"brk_{zone_id}_{account_id}",
                    )
                with brk_c2:
                    z_pullback = st.number_input(
                        (
                            "Min. Geri Çekilme ($)"
                            if (z_order_type != "BOTH" or z_sync)
                            else "BUY Geri Çekilme ($)"
                        ),
                        key=f"pb_{zone_id}_{account_id}",
                        min_value=0.01,
                        value=float(zone.get("pullback_distance", 0.50)),
                        step=0.05,
                        format="%.2f",
                        disabled=not z_breakout,
                    )

                z_sell_pullback = z_pullback
                if z_order_type == "BOTH" and not z_sync and brk_c3:
                    with brk_c3:
                        z_sell_pullback = st.number_input(
                            "SELL Geri Çekilme ($)",
                            key=f"s_pb_{zone_id}_{account_id}",
                            min_value=0.01,
                            value=float(
                                zone.get(
                                    "sell_pullback_distance",
                                    zone.get("pullback_distance", 0.50),
                                )
                            ),
                            step=0.05,
                            format="%.2f",
                            disabled=not z_breakout,
                        )

                st.markdown(
                    "<hr style='margin: 0.25em 0 0.75em 0;'/>", unsafe_allow_html=True
                )

                # 🌟 Kayan Ağ (Sliding Grid) Emir Sayısı ve Güvenlik
                # Dinamik Disabled Mantığı: Kırılım açıksa ters yöndeki emir kutusunu soluklaştırır.
                disable_below = z_breakout and z_order_type == "BUY"
                disable_above = z_breakout and z_order_type == "SELL"

                zc9, zc10, zc11 = st.columns(3)
                with zc9:
                    z_levels_below = st.number_input(
                        "Alt Seviye (LEVELS_BELOW)",
                        key=f"lb_{zone_id}_{account_id}",
                        min_value=1,
                        value=int(zone.get("levels_below", 5)),
                        step=1,
                        disabled=disable_below,
                        help="Fiyatın ALTINDA ağda aktif tutulacak bekleyen emir sayısı. (Kırılım modunda BUY için devre dışı kalır)",
                    )
                with zc10:
                    z_levels_above = st.number_input(
                        "Üst Seviye (LEVELS_ABOVE)",
                        key=f"la_{zone_id}_{account_id}",
                        min_value=1,
                        value=int(zone.get("levels_above", 5)),
                        step=1,
                        disabled=disable_above,
                        help="Fiyatın ÜSTÜNDE ağda aktif tutulacak bekleyen emir sayısı. (Kırılım modunda SELL için devre dışı kalır)",
                    )
                with zc11:
                    z_max_pos = st.number_input(
                        "Maks. Pozisyon",
                        key=f"mp_{zone_id}_{account_id}",
                        min_value=0,
                        value=int(zone.get("max_positions", 10)),
                        step=1,
                        help="Bu bölgede aynı anda açık olabilecek maksimum işlem sayısı. Sınırı kaldırmak için 0 girin (Sistem güvenliği için arka planda maks 500 olarak çalışır).",
                    )

            # 🌟 GÜNCELLENDİ: Bölge Çıkış ve Asimetrik Temizlik Ayarları
            with st.container(border=True):
                st.markdown(
                    "<small style='color: gray; font-weight: bold;'>🧹 Bölge Çıkışı ve Temizlik Ayarları</small>",
                    unsafe_allow_html=True,
                )
                z_clear = st.checkbox(
                    "Bölgeden Çıkıldığında Temizlik Yap",
                    key=f"clear_on_exit_{zone_id}_{account_id}",
                    value=bool(zone.get("clear_on_exit", True)),
                    help="İşaretliyken, fiyat bölgeden çıktığında sadece bu bölgeye ait (Magic ID) işlemler temizlenir. Diğer bölgeler etkilenmez.",
                )

                z_clear_side = "Farketmez"
                z_clear_scope = "Sadece Bekleyen Emirler"
                z_clear_target = "Farketmez (Hepsi)"
                z_exit_cond = "Anlık Fiyat"
                z_exit_tf = "M15"

                if z_clear:
                    st.markdown(
                        "<hr style='margin: 0.25em 0 0.75em 0;'/>",
                        unsafe_allow_html=True,
                    )

                    # 1. SATIR: Çıkış Yönü, Kapatılacak Yön, Temizlik Kapsamı
                    cc1, cc2, cc3 = st.columns(3)

                    side_key = f"clear_side_{zone_id}_{account_id}"
                    target_key = f"target_side_{zone_id}_{account_id}"

                    side_opts = ["Farketmez", "BUY (Yukarı)", "SELL (Aşağı)"]
                    target_opts = ["Farketmez (Hepsi)", "Sadece BUY İşlemleri", "Sadece SELL İşlemleri"]

                    # --- ESNEK VE KULLANICIYA ÖZGÜR DOMİNO MANTIĞI ---
                    # Yön değiştiğinde tetiklenecek bayrak kontrolü
                    last_ord_type_key = f"last_ord_type_{zone_id}_{account_id}"
                    ord_changed = st.session_state.get(last_ord_type_key) != z_order_type
                    st.session_state[last_ord_type_key] = z_order_type

                    # İlk yükleme veya Ana İşlem Yönü değiştirildiğinde önerilen varsayılanları ata
                    if side_key not in st.session_state or ord_changed:
                        if z_order_type == "BUY":
                            st.session_state[side_key] = "SELL (Aşağı)"
                        elif z_order_type == "SELL":
                            st.session_state[side_key] = "BUY (Yukarı)"
                        else:
                            st.session_state[side_key] = zone.get("clear_exit_side", "Farketmez")

                    if target_key not in st.session_state or ord_changed:
                        if z_order_type == "BUY":
                            st.session_state[target_key] = "Sadece BUY İşlemleri"
                        elif z_order_type == "SELL":
                            st.session_state[target_key] = "Sadece SELL İşlemleri"
                        else:
                            st.session_state[target_key] = zone.get("clear_target_side", "Farketmez (Hepsi)")

                    # Kullanıcı "Hangi Yönden Çıkış Yaparsa?" kutusunu kendisi değiştirdiğinde bağımsız tepki
                    last_side_key = f"last_side_{zone_id}_{account_id}"
                    side_changed = st.session_state.get(last_side_key) != st.session_state.get(side_key)
                    st.session_state[last_side_key] = st.session_state.get(side_key)

                    if side_changed and not ord_changed:
                        if st.session_state[side_key] == "BUY (Yukarı)":
                            st.session_state[target_key] = "Sadece SELL İşlemleri"
                        elif st.session_state[side_key] == "SELL (Aşağı)":
                            st.session_state[target_key] = "Sadece BUY İşlemleri"
                        elif st.session_state[side_key] == "Farketmez":
                            st.session_state[target_key] = "Farketmez (Hepsi)"

                    with cc1:
                        z_clear_side = st.selectbox(
                            "Hangi yönden çıkış yaparsa?",
                            options=side_opts,
                            key=side_key,
                            help="Fiyat bölgeden çıkarken hangi sınırı kırarsa temizliğin tetikleneceğini belirler."
                        )

                    with cc2:
                        z_clear_target = st.selectbox(
                            "Kapatılacak Yön",
                            options=target_opts,
                            key=target_key,
                            help="ℹ️ Sadece bu bölgeye ait (Magic ID) işlemler etkilenir. Diğer bölgelerdeki işlemleriniz korunur."
                        )

                    with cc3:
                        z_clear_scope = "Sadece Bekleyen Emirler"
                        st.markdown(
                            "<small style='color: gray;'>🧹 Temizlik kapsamı: Sadece Bekleyen Emirler</small>",
                            unsafe_allow_html=True,
                        )
                    # 2. SATIR: Çıkış Tetikleyicisi ve Zaman Dilimi
                    cc4, cc5, cc6 = st.columns(3)
                    with cc4:
                        z_exit_cond = st.selectbox(
                            "Çıkış Tetikleyicisi",
                            options=["Anlık Fiyat", "Mum Kapanışı"],
                            index=(
                                0
                                if zone.get("exit_condition", "Anlık Fiyat")
                                == "Anlık Fiyat"
                                else 1
                            ),
                            key=f"cond_{zone_id}_{account_id}",
                        )

                    with cc5:
                        if z_exit_cond == "Mum Kapanışı":
                            tf_opts = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"]
                            cur_tf = zone.get("exit_timeframe", "M15")
                            z_exit_tf = st.selectbox(
                                "Zaman Dilimi",
                                options=tf_opts,
                                index=tf_opts.index(cur_tf) if cur_tf in tf_opts else 2,
                                key=f"tf_{zone_id}_{account_id}",
                            )
                        else:
                            z_exit_tf = zone.get("exit_timeframe", "M15")

                    with cc6:
                        st.empty()  # Düzeni korumak için boş bıraktık

        # 🌟 YENİ: Anlık Değişiklik (Modifiye) Dedektörü
        is_modified = False
        if not orig_zone:
            is_modified = True  # Yeni eklenmiş, henüz kaydedilmemiş bölge
        else:
            if (
                str(z_symbol).upper().strip()
                != str(orig_zone.get("symbol", "")).upper().strip()
                or str(z_order_type) != str(orig_zone.get("order_type", ""))
                or round(float(z_min), 4)
                != round(float(orig_zone.get("min_price", 0.0)), 4)
                or round(float(z_max), 4)
                != round(float(orig_zone.get("max_price", 0.0)), 4)
                or round(float(z_grid), 4)
                != round(float(orig_zone.get("grid_step", 0.0)), 4)
                or round(float(z_lot), 4)
                != round(float(orig_zone.get("lot_size", 0.0)), 4)
                or round(float(z_tp), 4)
                != round(float(orig_zone.get("take_profit", 0.0)), 4)
                or round(float(z_sl), 4)
                != round(float(orig_zone.get("stop_loss", 0.0)), 4)
                or round(float(z_sell_grid), 4)
                != round(
                    float(
                        orig_zone.get("sell_grid_step", orig_zone.get("grid_step", 0.0))
                    ),
                    4,
                )
                or round(float(z_sell_lot), 4)
                != round(
                    float(
                        orig_zone.get("sell_lot_size", orig_zone.get("lot_size", 0.0))
                    ),
                    4,
                )
                or round(float(z_sell_tp), 4)
                != round(
                    float(
                        orig_zone.get(
                            "sell_take_profit", orig_zone.get("take_profit", 0.0)
                        )
                    ),
                    4,
                )
                or round(float(z_sell_sl), 4)
                != round(
                    float(
                        orig_zone.get("sell_stop_loss", orig_zone.get("stop_loss", 0.0))
                    ),
                    4,
                )
                or bool(z_breakout) != bool(orig_zone.get("is_breakout", False))
                or round(float(z_pullback), 4)
                != round(float(orig_zone.get("pullback_distance", 0.0)), 4)
                or round(float(z_sell_pullback), 4)
                != round(
                    float(
                        orig_zone.get(
                            "sell_pullback_distance",
                            orig_zone.get("pullback_distance", 0.0),
                        )
                    ),
                    4,
                )
                or bool(z_sync) != bool(orig_zone.get("sync_buy_sell", True))
                or int(z_levels_below) != int(orig_zone.get("levels_below", 5))
                or int(z_levels_above) != int(orig_zone.get("levels_above", 5))
                or int(z_max_pos) != int(orig_zone.get("max_positions", 10))
                or bool(z_clear) != bool(orig_zone.get("clear_on_exit", True))
                or str(z_clear_side)
                != str(orig_zone.get("clear_exit_side", ""))  # 🌟 YENİ
                or str(z_clear_scope) != str(orig_zone.get("clear_scope", ""))
                or str(z_clear_target) != str(orig_zone.get("clear_target_side", ""))
                or str(z_exit_cond) != str(orig_zone.get("exit_condition", ""))
                or str(z_exit_tf) != str(orig_zone.get("exit_timeframe", ""))
            ):
                is_modified = True

        # Butonu şimdi placeholder içine basıyoruz (Sadece değişiklik varken renkli olur)
        upd_label = "💾 Güncelle ⚠️" if is_modified else "💾 Güncelle"
        if upd_btn_placeholder.button(
            upd_label,
            key=f"upd_{zone_id}_{account_id}",
            width="stretch",
            type="primary" if is_modified else "secondary",
            # 🚨 KİLİT KALDIRILDI: Bağlantı kopsa veya hazırlansa bile ayarlar her zaman güncellenebilir!
        ):
            st.session_state[f"save_req_{account_id}"] = True

        # 🌟 YENİ: Başlat butonunu placeholder içine basıyoruz (Değişiklik kontrolü ile)
        if start_btn_placeholder.button(
            start_label,
            key=f"start_{zone_id}_{account_id}",
            width="stretch",
            type="primary" if current_state == "START" else "secondary",
            disabled=disable_action_buttons,
            help="Bu bölgedeki ağ örme işlemini başlatır ve güncel fiyatı takip eder.",
        ):
            if is_modified:
                confirm_start_with_changes_dialog(account_id, zone_id, idx)
            else:
                # 🚨 BUG 1 DÜZELTMESİ: Bireysel butona da Sembol Güvenlik Duvarı eklendi
                z_sym_upper = str(z_symbol).upper().strip()
                if available_symbols and z_sym_upper not in available_symbols:
                    st.session_state[f"motor_pause_{account_id}"] = True
                    symbol_error_dialog(z_sym_upper)
                else:
                    _handle_zone_action(account_id, zone_id, idx, "START")
                    st.rerun()

        # 🌟 GÜNCELLENDİ: Tüm metrikler alt satıra sağa dayalı ve sırayla eklendi
        broker_name = (
            active_account.get("server", "Bilinmeyen Broker")
            if active_account
            else "Demo"
        )
        # Piyasa durumunu doğrudan arka plandan gelen güncel veriye (market_open) bağlıyoruz
        m_open = live_data.get("market_open", False) if live_data else False
        status_text = "🟢 Açık" if m_open else "🔴 Kapalı"
        current_price = live_data.get("current_price", 0.0) if live_data else 0.0
        profit_val = live_data.get("profit", 0.0) if live_data else 0.0
        profit_color = "#4ade80" if profit_val >= 0 else "#f87171"

        open_pos = live_data.get("open_positions", 0) if live_data else 0
        pend_ord = live_data.get("pending_orders", 0) if live_data else 0

        title_placeholder.markdown(
            f"**🗺️ Bölge {idx + 1}** — "
            f"*{str(z_symbol).upper().strip()} ({z_order_type})* "
            f"&nbsp;&nbsp;<span style='color: #4CAF50; font-weight: bold;'>[ Anlık Fiyat: ${current_price:.2f} ]</span>\n\n"
            f"<div style='text-align: left; font-size: 14px; font-weight: normal; color: #aaa; margin-top: 4px;'>"
            f"{str(z_symbol).upper().strip()} | {broker_name} | {status_text} &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"Toplam Kâr/Zarar: <span style='color: {profit_color}; font-weight: bold;'>${profit_val:.2f}</span> &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"Açık P: <b style='color: white;'>{open_pos}</b> &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"Bekl. E: <b style='color: white;'>{pend_ord}</b>"
            f"</div>",
            unsafe_allow_html=True,
        )

        # Bölgeyi güncel listeye ekle (Silme işlemi Modal içinden tetikleniyor)
        updated_zones.append(
            {
                "id": zone_id,
                "magic_idx": zone.get("magic_idx", 0),  # 🌟 Kalıcı Kimlik
                "symbol": str(z_symbol).upper().strip() if z_symbol else "USOUSD",
                "order_type": z_order_type,
                "min_price": z_min,
                "max_price": z_max,
                "grid_step": z_grid,
                "lot_size": z_lot,
                "take_profit": z_tp,
                "stop_loss": z_sl,
                "sell_grid_step": z_sell_grid,
                "sell_lot_size": z_sell_lot,
                "sell_take_profit": z_sell_tp,
                "sell_stop_loss": z_sell_sl,
                "is_breakout": z_breakout,
                "pullback_distance": z_pullback,
                "sell_pullback_distance": z_sell_pullback,
                "sync_buy_sell": z_sync,
                "levels_below": z_levels_below,
                "levels_above": z_levels_above,
                "max_positions": z_max_pos,
                "clear_on_exit": z_clear,
                "clear_exit_side": z_clear_side,
                "clear_scope": z_clear_scope,
                "clear_target_side": z_clear_target,
                "exit_condition": z_exit_cond,
                "exit_timeframe": z_exit_tf,
            }
        )

    # Hafıza kaybını önlemek için her renderda listeyi eşitle!
    st.session_state[zones_session_key] = updated_zones

    # ── Güncelleme Tetikleyicisi (Bölge başlığından gelen sinyali yakalar) ───
    if st.session_state.get(f"save_req_{account_id}", False):
        st.session_state[f"save_req_{account_id}"] = False
        global_order_type = updated_zones[0]["order_type"] if updated_zones else "BUY"
        global_symbol = updated_zones[0]["symbol"] if updated_zones else "USOUSD"

        return {
            "ORDER_TYPE": global_order_type,
            "SYMBOL": global_symbol,
            "LOOP_INTERVAL_SECONDS": loop_interval,
            "ZONES": updated_zones,
        }

    return None
