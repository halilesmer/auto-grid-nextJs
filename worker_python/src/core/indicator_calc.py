import pandas as pd
import numpy as np

def calculate_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Saf Pandas ile RSI Hesaplama"""
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).fillna(0)
    loss = (-delta.where(delta < 0, 0)).fillna(0)

    avg_gain = gain.ewm(com=(period - 1), min_periods=period).mean()
    avg_loss = loss.ewm(com=(period - 1), min_periods=period).mean()

    rs = avg_gain / avg_loss
    df['RSI_14'] = 100 - (100 / (1 + rs))
    return df

def calculate_macd(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    """Saf Pandas ile MACD Hesaplama"""
    exp1 = df['close'].ewm(span=fast, adjust=False).mean()
    exp2 = df['close'].ewm(span=slow, adjust=False).mean()
    
    df['MACD_12_26_9'] = exp1 - exp2
    df['MACDs_12_26_9'] = df['MACD_12_26_9'].ewm(span=signal, adjust=False).mean()
    df['MACDh_12_26_9'] = df['MACD_12_26_9'] - df['MACDs_12_26_9']
    return df

def get_latest_indicators(df: pd.DataFrame) -> dict:
    """
    MT5'ten gelen OHLC DataFrame'i alır, indikatörleri hesaplar
    ve en son muma ait değerleri döndürür.
    """
    if df is None or df.empty or len(df) < 30:
        return {"rsi": 0.0, "macd": 0.0, "macd_signal": 0.0, "macd_hist": 0.0}
        
    try:
        # pandas-ta varsa kullanmayı dene
        import pandas_ta as ta
        df.ta.rsi(length=14, append=True)
        df.ta.macd(fast=12, slow=26, signal=9, append=True)
    except ImportError:
        # pandas-ta yoksa kendi saf pandas fonksiyonlarımızı kullan
        df = calculate_rsi(df, 14)
        df = calculate_macd(df, 12, 26, 9)

    latest_row = df.iloc[-1]
    
    # Sütun adları pandas-ta veya bizim fallback'e göre değişebilir, güvenli çekim:
    rsi_val = latest_row.get('RSI_14', 0.0)
    macd_val = latest_row.get('MACD_12_26_9', 0.0)
    macd_sig = latest_row.get('MACDs_12_26_9', 0.0)
    macd_hist = latest_row.get('MACDh_12_26_9', 0.0)
    
    # NaN temizliği
    return {
        "rsi": 0.0 if pd.isna(rsi_val) else float(rsi_val),
        "macd": 0.0 if pd.isna(macd_val) else float(macd_val),
        "macd_signal": 0.0 if pd.isna(macd_sig) else float(macd_sig),
        "macd_hist": 0.0 if pd.isna(macd_hist) else float(macd_hist)
    }
