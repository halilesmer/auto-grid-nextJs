# styles/custom_css.py
import streamlit as st


def apply_custom_css():
    """
    Streamlit arayüzünü son derece kompakt, derli toplu ve modern yapan CSS
    """
    st.markdown(
        """
        <style>
        /* Sayfa genişliğini 1200px'e sabitleme ve ortalama */
        .block-container {
            max-width: 1200px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            padding-top: 0rem !important;
            padding-bottom: 1rem !important;
            padding-left: 1.5rem !important;
            padding-right: 1.5rem !important;
        }

        /* =========================================
           STREAMLIT 3 NOKTA (HEADER) HİZALAMASI
           ========================================= */
        /* Streamlit'in varsayılan üst menüsünün arka planını siler ve başlıkla aynı hizaya oturtur */
        header[data-testid="stHeader"] {
            background-color: transparent !important;
            box-shadow: none !important;
            height: auto !important;
            padding-top: 5px !important;
        }
        
        /* Sağ üstteki butonları sayfa genişliğiyle sınırlar (Çok sağa yapışmasını engeller) */
        .stApp > header {
            max-width: 1200px !important;
            margin: 0 auto !important;
            right: 0 !important;
            left: 0 !important;
        }

        /* 3 Noktalı Menü Hizalaması İçin Ara Boşlukları (Gap) Ayarlama */
        .st-emotion-cache-tn0cau {
            gap: 0.5rem !important;
        }

        /* Dikey eleman aralıklarını (gap) sıkılaştırma */
        div[data-testid="stVerticalBlock"] > div {
            gap: 0.4rem !important;
        }

        /* Divider (Çizgi) boşluklarını azaltma */
        hr {
            margin-top: 0.5rem !important;
            margin-bottom: 0.5rem !important;
        }

        /* Form elemanları ve etiket aralıklarını küçültme */
        div[data-testid="stForm"] {
            padding: 0.8rem 1rem !important;
            border-radius: 8px !important;
        }

        .stNumberInput label, .stSelectbox label {
            font-size: 0.85rem !important;
            font-weight: 600 !important;
            margin-bottom: 2px !important;
        }

        .stNumberInput input {
            padding: 4px 8px !important;
            height: 36px !important;
        }

        /* stMetric kartlarını daha küçük ve derli toplu yapma */
        div[data-testid="stMetric"] {
            padding: 4px 8px !important;
        }

        div[data-testid="stMetricLabel"] {
            font-size: 0.8rem !important;
            font-weight: 500 !important;
        }

        div[data-testid="stMetricValue"] {
            font-size: 1.25rem !important;
            font-weight: 700 !important;
        }

        /* Tooltip (Help Popover) metinlerinin boyutunu düzenleme */
        div[data-baseweb="popover"] p, 
        div[data-baseweb="tooltip"] div,
        .stTooltipContent {
            font-size: 1rem !important;
            line-height: 1.4 !important;
        }
        
        div[data-testid="stTooltipIcon"] svg {
            width: 15px !important;
            height: 15px !important;
        }

        /* =========================================
           HESAP SEÇİCİ (ACCOUNT SELECTOR) BUTONLARI
           ========================================= */
        /* Sayfanın en üstündeki hesap butonlarını hedefler ve Streamlit'in %100 genişlik dayatmasını ezer. */
        div.block-container > div:nth-child(1) div[data-testid="stButton"] button,
        div.block-container > div:nth-child(2) div[data-testid="stButton"] button {
            width: 100% !important;
            max-width: 200px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            display: flex !important;
            justify-content: center !important;
        }

        /* =========================================
           NEU: ACCOUNT SELECTOR ANIMATIONEN
           ========================================= */
        /* Pulsierende Animation für DEMO-Konten (Grün) */
        @keyframes pulse-green {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
        }
        
        /* Pulsierende Animation für LIVE-Konten (Rot) */
        @keyframes pulse-red {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(244, 67, 54, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); }
        }

        .pulsing-green {
            display: inline-block; width: 14px; height: 14px; background-color: #4CAF50; border-radius: 50%; animation: pulse-green 2s infinite; margin-right: 8px;
        }
        
        .pulsing-red {
            display: inline-block; width: 14px; height: 14px; background-color: #F44336; border-radius: 50%; animation: pulse-red 2s infinite; margin-right: 8px;
        }

        .status-container {
            display: flex; align-items: center; font-size: 1.1em; font-weight: bold; margin-bottom: 15px; padding: 10px; background-color: rgba(255,255,255,0.05); border-radius: 8px;
        }
        </style>
    """,
        unsafe_allow_html=True,
    )
