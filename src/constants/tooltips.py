# src/constants/tooltips.py

SETTINGS_TOOLTIPS = {
    "GRID_STEP": "Ağın delik genişliği. Emirlerin birbirinden kaç dolar/cent uzaklıkta olacağını belirler (Örn: 0.05 = her 5 centte bir emir açar).",
    "TAKE_PROFIT": "Kâr al mesafesi. Açılan işlemin kaç dolarlık kâr gördüğünde otomatik kapanacağını belirler.",
    "LEVELS_BELOW": "Canlı piyasa fiyatının ALTINA kaç tane hazır nöbetçi limit emir dizileceğini belirler.",
    "LEVELS_ABOVE": "Canlı piyasa fiyatının ÜSTÜNE kaç tane hazır nöbetçi stop emir dizileceğini belirler.",
    "DEFAULT_LOT": "Ekstrem fiyat eşiklerine ulaşılmadığı sürece kullanılacak standart güvenli lot miktarıdır.",
    "MAX_OPEN_POSITIONS": "Güvenlik Kalkanı: Robotun aynı anda açabileceği maksimum işlem sayısı.",
    "MAX_PRICE_LIMIT": "Tavan Fiyat: Enstrüman bu fiyatın üstüne çıkarsa robot yeni emir açmayı durdurur.",
    "MIN_PRICE_LIMIT": "Taban Fiyat: Enstrüman bu fiyatın altına düşerse robot yeni emir açmayı durdurur.",
    "LOOP_INTERVAL_SECONDS": "Kontrol Sıklığı (Saniye): Robotun piyasayı ve MT5'i kaç saniyede bir kontrol edip emirleri güncelleyeceğini belirler (Örn: 0.5 veya 1.0).",
    # KONTROL PANELİ TOOLTİPLERİ
    "ROBOT_ACTIVE": "ROBOT AKTİF (Auto Grid) - Robot piyasayı izliyor, şartlar uyduğunda işleme girecek.",
    "ROBOT_PASSIVE": "ROBOT PASİF (Auto Grid) - Robot durduruldu. Yeni işlem açılmaz.",
    "ZONE_START": "Bölgeyi aktif hale getirir, robot belirlenen ayarlarla emir göndermeye başlar.",
    "ZONE_PAUSE": "Bölgeyi duraklatır. Bekleyen emirleri iptal eder ama açık pozisyonlara dokunmaz.",
    "ZONE_CLEAR": "Bölgeyi sıfırlar. Bekleyen emirleri siler. AÇIK POZİSYONLARA ASLA DOKUNULMAZ.",
    # 📡 Mobil MT5 UZAKTAN DURDURMA (Comment'siz Sinyal)
    "REMOTE_STOP_SIGNAL": "📡 MOBİL'DEN UZAKTAN DURDURMA: Mobil MT5'te yorum yazılamadığı için fiyatı TAM 1$ ve hacmi 0.01 lot olan bir BUY LIMIT emri sinyal olarak kullanılır. Emir işlenince motor durur, bekleyen emirler silinir (açık pozisyonlar korunur) ve sinyal emri otomatik silinir. Sinyal fiyatı uçta olduğundan asla tetiklenmez.",
}
