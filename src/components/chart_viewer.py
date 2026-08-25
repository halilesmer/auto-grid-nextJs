# src/components/chart_viewer.py
import streamlit as st
import plotly.graph_objects as go
import random


def render_chart(
    current_price: float, current_settings: dict, engine_name: str = "Auto Grid"
):
    """
    Çizgi grafik ve grid bölgelerini doğrudan JSON ayarlarından (current_settings) okuyarak çizer.
    TradingView Dark Theme stili ve HAFIZALI (iz bırakan) gerçek zaman serisi mantığı uygulanmıştır.
    Auto Grid için BUY (Yeşil) ve SELL (Kırmızı) asimetrik grid çizgileri entegre edilmiştir.
    """

    st.markdown("### 📈 Canlı Fiyat ve Grid Bölgeleri")

    fig = go.Figure()

    # ==========================================
    # 1. HAFIZALI GEÇMİŞ VERİ YÖNETİMİ (Gerçekçi Chart Hareketi)
    # ==========================================
    if "chart_price_history" not in st.session_state:
        history_len = 100
        random.seed(42)
        prices = []
        sim = current_price - 2.0
        for _ in range(history_len - 1):
            sim += random.uniform(-0.05, 0.05)
            prices.append(sim)

        offset = current_price - prices[-1]
        st.session_state["chart_price_history"] = [p + offset for p in prices]

    st.session_state["chart_price_history"].append(current_price)

    if len(st.session_state["chart_price_history"]) > 150:
        st.session_state["chart_price_history"].pop(0)

    y_data = st.session_state["chart_price_history"]
    x_data = list(range(len(y_data)))

    # ==========================================
    # 2. FİYAT ÇİZGİSİ
    # ==========================================
    fig.add_trace(
        go.Scatter(
            x=x_data,
            y=y_data,
            mode="lines",
            name="Anlık Fiyat",
            line=dict(color="#d1d4dc", width=1.5),
            hoverinfo="y",
        )
    )

    # 3. ANLIK FİYAT YATAY ÇİZGİSİ
    fig.add_hline(
        y=current_price,
        line_dash="dash",
        line_color="#a3a3a3",
        line_width=1,
        annotation_text=f"{current_price:.2f}",
        annotation_position="right",
        annotation_font=dict(color="white", size=12),
        annotation_bgcolor="#363a45",
    )

    # ==========================================
    # AUTO GRID ÇİZİMLERİ (Dinamik Bölgeler ve Asimetrik Gridler)
    # ==========================================
    if engine_name == "Auto Grid":
        zones = current_settings.get("ZONES", [])
        for idx, zone in enumerate(zones):
            min_p = float(zone.get("min_price", 0.0))
            max_p = float(zone.get("max_price", 0.0))
            order_type = zone.get("order_type", "BUY")
            is_sync = bool(zone.get("sync_buy_sell", True))

            # 🟢 BUY Yönü Ayarları
            buy_grid_step = float(zone.get("grid_step", 0.05))
            levels_below = int(zone.get("levels_below", 5))
            levels_above = int(zone.get("levels_above", 5))

            # 🔴 SELL Yönü Ayarları (Asimetrik Kontrolü)
            if is_sync:
                sell_grid_step = buy_grid_step
            else:
                sell_grid_step = float(zone.get("sell_grid_step", buy_grid_step))

            # 🗺️ Bölge Çerçevesi Çizimi
            if min_p > 0 and max_p > 0:
                fig.add_hrect(
                    y0=min_p,
                    y1=max_p,
                    fillcolor="rgba(251, 146, 60, 0.08)",
                    layer="below",
                    line_width=1,
                    line_color="rgba(251, 146, 60, 0.4)",
                    annotation_text=f"Bölge {idx+1} ({order_type})",
                    annotation_position="top left",
                    annotation_font_color="rgba(251, 146, 60, 0.8)",
                )

                # Eğer anlık fiyat bölgenin içindeyse 📐 Asimetrik Grid Çizgilerini de çiz
                if min_p <= current_price <= max_p:
                    # BUY Grid Çizgileri (Yeşil Noktalı Çizgiler)
                    if order_type in ["BUY", "BOTH"]:
                        buy_anchor = (
                            round(current_price / buy_grid_step) * buy_grid_step
                        )
                        for i in range(-levels_below, levels_above + 1):
                            if i == 0:
                                continue
                            lvl = buy_anchor + (i * buy_grid_step)
                            if min_p <= lvl <= max_p:
                                fig.add_hline(
                                    y=lvl,
                                    line_dash="dot",
                                    line_color="#4ade80",
                                    opacity=0.35,
                                    line_width=1,
                                )

                    # SELL Grid Çizgileri (Kırmızı Noktalı Çizgiler - Asimetrik Adımla)
                    if order_type in ["SELL", "BOTH"]:
                        sell_anchor = (
                            round(current_price / sell_grid_step) * sell_grid_step
                        )
                        for i in range(-levels_below, levels_above + 1):
                            if i == 0:
                                continue
                            lvl = sell_anchor + (i * sell_grid_step)
                            if min_p <= lvl <= max_p:
                                fig.add_hline(
                                    y=lvl,
                                    line_dash="dot",
                                    line_color="#f87171",
                                    opacity=0.35,
                                    line_width=1,
                                )

    # ==========================================
    # TRADINGVIEW STİLİ GRAFİK AYARLARI
    # ==========================================
    display_symbol = "USOUSD"
    if current_settings.get("ZONES") and len(current_settings["ZONES"]) > 0:
        display_symbol = str(
            current_settings["ZONES"][0].get("symbol", "USOUSD")
        ).upper()

    fig.add_annotation(
        text=f"{display_symbol} 30",
        xref="paper",
        yref="paper",
        x=0.5,
        y=0.55,
        showarrow=False,
        font=dict(size=60, color="rgba(255, 255, 255, 0.04)", family="Arial"),
        align="center",
    )
    fig.add_annotation(
        text="Auto Grid Market",
        xref="paper",
        yref="paper",
        x=0.5,
        y=0.45,
        showarrow=False,
        font=dict(size=30, color="rgba(255, 255, 255, 0.04)", family="Arial"),
        align="center",
    )

    fig.update_layout(
        height=450,
        margin=dict(l=10, r=60, t=10, b=10),
        showlegend=False,
        template="plotly_dark",
        paper_bgcolor="#131722",
        plot_bgcolor="#131722",
        hovermode="x unified",
        xaxis=dict(
            showgrid=True,
            gridcolor="#2B2B43",
            zeroline=False,
            showticklabels=False,
            spikemode="across",
            spikesnap="cursor",
            showline=False,
            spikedash="dash",
            spikecolor="#787B86",
            spikethickness=1,
        ),
        yaxis=dict(
            showgrid=True,
            gridcolor="#2B2B43",
            zeroline=False,
            side="right",
            tickfont=dict(color="#787B86"),
            spikemode="across",
            spikesnap="cursor",
            showline=False,
            spikedash="dash",
            spikecolor="#787B86",
            spikethickness=1,
            tickformat=".2f",
        ),
    )

    st.plotly_chart(fig, width="stretch")
