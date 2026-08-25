# src/components/controls.py
import streamlit as st


def render_controls(is_running: bool, is_connected: bool, is_connecting: bool = False, account_id: str = "default"):
    """
    MT5 Bağlantısı ve Robot Başlatma/Bekletme Kontrol Paneli
    """
    st.markdown("### 🎮 Robot Kontrol Paneli")

    col_icon, col_btn_connect, col_btn_start, col_btn_pause = st.columns(
        [0.10, 0.30, 0.30, 0.30], vertical_alignment="center"
    )

    with col_icon:
        if is_connecting:
            status_text = "Bağlanıyor..."
            icon = "⏳"
        elif is_running:
            status_text = "Robot İşlemde"
            icon = "🟢"
        elif is_connected:
            status_text = "Bağlı - Bekliyor"
            icon = "🟡"
        else:
            status_text = "Bağlantı Yok"
            icon = "🔴"

        st.markdown(
            f"""
            <style>
            .instant-tooltip-container {{
                position: relative;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 38px;
                cursor: pointer;
            }}

            .instant-tooltip-container .tooltip-text {{
                visibility: hidden;
                opacity: 0;
                width: max-content;
                background-color: #1e293b;
                color: #f8fafc;
                text-align: center;
                border: 1px solid #475569;
                border-radius: 6px;
                padding: 5px 10px;
                font-size: 12px;
                font-weight: 500;
                position: absolute;
                z-index: 999;
                bottom: 125%;
                left: 50%;
                transform: translateX(-50%);
                box-shadow: 0px 4px 12px rgba(0,0,0,0.3);
                transition: opacity 0s; 
            }}

            .instant-tooltip-container:hover .tooltip-text {{
                visibility: visible;
                opacity: 1;
            }}
            </style>

            <div class="instant-tooltip-container">
                <span style="font-size: 20px; line-height: 1;">{icon}</span>
                <span class="tooltip-text">{status_text}</span>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # --- 1. Bağlan / Kes Butonu ---
    with col_btn_connect:
        if is_connecting:
            connect_label = "⏳ Bağlanıyor..."
            connect_type = "secondary"
            btn_disabled = True
        else:
            connect_label = "🛑 Bağlantıyı Kes" if is_connected else "🔌 MT5'e Bağlan"
            connect_type = "primary" if is_connected else "secondary"
            btn_disabled = False

        if st.button(
            connect_label,
            type=connect_type,
            width="stretch",
            disabled=btn_disabled,
            key=f"btn_conn_{account_id}",
        ):
            st.session_state[f"motor_toggle_{account_id}"] = True
            st.rerun()

    # --- 2. Başlat Butonu ---
    with col_btn_start:
        # 🚨 HATA DÜZELTİLDİ: Sadece bağlantı yoksa inaktif olmalı.
        # Robot arka planda PAUSE olarak uyanacağı için Başlat'a basılabilmeli.
        start_disabled = not is_connected

        if st.button(
            "▶️ Başlat",
            type="primary",
            disabled=start_disabled,
            width="stretch",
            key=f"btn_start_{account_id}",
        ):
            st.session_state[f"motor_start_{account_id}"] = True
            st.rerun()

    # --- 3. Beklet Butonu ---
    with col_btn_pause:
        pause_disabled = not is_connected

        if st.button(
            "⏸️ Beklet",
            disabled=pause_disabled,
            width="stretch",
            key=f"btn_pause_{account_id}",
        ):
            st.session_state[f"motor_pause_{account_id}"] = True
            st.rerun()

    if is_running:
        st.caption(
            "📡 Unutma: Mobil MT5'te fiyatı **1$**, hacmi **0.01 lot** olan "
            "**Buy Limit** emri koyun → sistem uzaktan durur."
        )

    # action return etmeye artık gerek yok
    return None
