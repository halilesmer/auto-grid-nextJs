# src/components/metrics.py
import streamlit as st


def render_global_metrics(
    profit: float, current_price: float, metrics_data: dict = None
):
    """Fiyat, Kâr/Zarar ve Canlı Hata Alarmlarını gösteren global özet barı"""
    if metrics_data:
        if metrics_data.get("order_rejected_alarm"):
            last_err = metrics_data.get("last_error", "Bilinmeyen Hata")
            st.error(
                f"🚨 **KRİTİK İŞLEM ALARMI:** MT5/Broker emri reddetti! Detay: {last_err}"
            )
        elif metrics_data.get("algo_trading_error"):
            st.warning(
                "⚠️ **ALGO TRADING KAPALI:** MT5 terminalinde 'Algo Trading' (Otomatik Alım Satım) butonunun yeşil olduğundan emin olun."
            )

    c1, c2 = st.columns(2)
    with c1:
        st.metric(label="Anlık Fiyat", value=f"${current_price:.2f}")
    with c2:
        st.metric(
            label="Toplam Kâr/Zarar",
            value=f"${profit:.2f}",
            delta=f"{profit:.2f}$" if profit != 0 else None,
        )
