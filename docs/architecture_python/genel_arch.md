# 3. Mimari Kurallar ve Standartlar (Model 2 Detaylı Kod Analizi)

## 3.1. Açık İşlem Koruması ve Emir Tipleri (Altın Kurallar)
*   **Pozisyon Kapatma Yasağı:** Robot KESİNLİKLE MT5 üzerindeki açık pozisyonları kapatamaz; kodda `close_position` komutu veya piyasa emrini iptal edecek/kapatacak hiçbir fonksiyon bulunmamaktadır[cite: 3].
*   **TP/SL Modifikasyonu:** Açık işlemlerin yalnızca Kâr Al (TP) ve Zarar Kes (SL) seviyeleri, arayüzden gelen güncel ayarlara göre (`modify_position_tp_sl` fonksiyonu ile) dinamik olarak güncellenir[cite: 3].
*   **İzin Verilen Emirler:** Robot yalnızca Bekleyen Emirler (Buy Limit, Buy Stop, Sell Limit, Sell Stop) dizebilir ve uzaklaşan eski bekleyen emirleri silebilir[cite: 3].
*   **FOK (Fill Or Kill) Koruması:** Bekleyen emirlerin MT5 sunucusu tarafından reddedilmesini veya silinmesini önlemek için, emir dolum tipi kesinlikle `ORDER_FILLING_RETURN` (2) olarak zorunlu tutulmuştur[cite: 3].
*   **Başlangıç Temizliği (Initial Cleanup) İptali:** Robot başlatıldığında, eski ve halihazırda var olan bekleyen emirleri korumak amacıyla açılışta emir silme işlemi pasif hale getirilmiştir (`INITIAL_CLEANUP_DONE = True`)[cite: 3].

## 3.2. Mobil ve Uzaktan Kumanda (Remote Control) Sinyal Sistemi
*   **Uç Fiyatlarla Mobil Sinyal:** Mobil cihazlardaki MT5 uygulamasında yorum satırı girilemediği için, uzaktan kumanda komutları uç fiyatlardaki manuel (magic = 0) "Buy Limit" emirleriyle tetiklenir[cite: 3].
*   **Sabit Sinyal Hacmi:** Bu sinyal emirleri her zaman `0.01` lot hacminde olmalıdır[cite: 3].
*   **Durdur (STOP) Sinyali:** Fiyat `$1.0` seviyesine `0.01` lot Buy Limit girildiğinde robot "STOP" moduna geçer, tüm bekleyen robot emirlerini siler ancak açık pozisyonlara dokunmaz[cite: 3].
*   **Başlat (START) Sinyali:** Fiyat `$2.0` seviyesine `0.01` lot Buy Limit girildiğinde robot "START" moduna geçerek durdurulan bölgelerde tekrar ağ örmeye başlar[cite: 3].
*   **Masaüstü Yorum Sinyalleri:** Masaüstü MT5 kullanıcıları, emir yorumuna (comment) `GRID:STOP` veya `GRID:START` yazarak da aynı uzaktan kumanda işlevlerini çalıştırabilir[cite: 3].
*   **Self-Destruct (Kendini İmha):** Robot sinyal emrini algılayıp işledikten sonra, tek seferlik bir tuş gibi çalışması için ilgili sinyal emrini otomatik olarak iptal eder/siler[cite: 3].

## 3.3. Çoklu Bölge (Multi-Zone) Giriş/Çıkış ve Temizlik Mantığı
*   **Giriş/Çıkış Şartları:** Bir bölgeye giriş ve çıkışlar iki farklı şarta göre yapılabilir: "Anlık Fiyat" (anlık tick) veya "Mum Kapanışı" (Örn: M15 gibi seçilen bir timeframe'in kapanış fiyatı)[cite: 3].
*   **Bölge Çıkışı Temizliği (Clear on Exit):** Fiyat bir bölgenin dışına çıktığında, hedef yön (Sadece BUY işlemleri, Sadece SELL işlemleri veya Hepsi) baz alınarak bekleyen emirler temizlenebilir veya bırakılabilir[cite: 3].
*   **Çıkış Yönü Kısıtlaması:** Çıkış temizlik kuralı; fiyatın yalnızca belirli bir yönden (Yukarı veya Aşağı) çıkması durumunda çalışacak şekilde kısıtlanabilir (`clear_exit_side` kontrolü)[cite: 3].
*   **Arayüz Hafıza Temizliği:** Olası çakışmaları önlemek adına, geçmiş oturumdan kalan arayüz UI durum dosyaları (`ui_states`) robot başlatılırken otomatik olarak yok edilir[cite: 3].

## 3.4. Gelişmiş Grid (Ağ) Örme ve Hacim Yönetimi
*   **Motor Döngü Hızı:** İşlemci (CPU) yükünü ve log kirliliğini hafifletmek amacıyla ana döngü hızı 3.0 saniyede bir çalışacak şekilde ayarlanmıştır[cite: 3].
*   **Asimetrik Bölge Ayarları:** Alış (BUY) ve Satış (SELL) yönleri için ızgara adımı (grid step), lot büyüklüğü, TP ve SL miktarları eşzamanlı kullanılabileceği gibi birbirinden tamamen bağımsız (asimetrik) değerlerle de çalıştırılabilir[cite: 3].
*   **Kısmi Dolum (Partial Fill) Koruması:** Aynı fiyatta halihazırda işleme girmiş (fakat lotu eksik) pozisyonlar varsa robot toplam hacmi hesaplar; yalnızca hedeflenen lotta kalan eksik miktar kadar (aracı kurum minimum lot sınırını gözeterek) yeni bekleyen emir ekler[cite: 3].
*   **Kırılım (Breakout) Stratejisi Modu:** Eğer bölgede "Kırılım" modu aktifse Limit emirler dizilmez; Stop emirler için ise fiyatın emirden belirli bir mesafe geri çekilmesi (`pullback_distance` / `sell_pullback_distance`) zorunlu kılınarak yalancı kırılımlara karşı önlem alınır[cite: 3].
*   **Hysteresis (Tampon Bölge) ve Titreme Önleyici:** Fiyatın milimetrik oynamalarında emirlerin sürekli silinip yeniden yazılmasını önlemek adına, ağ hesaplamalarında 2 kademelik ek esneklik (`buffer_steps`) ve yön başına `Grid Adımı * %40` oranında tolerans uygulanır[cite: 3].

## 3.5. Güvenlik Duvarları, Hata Yönetimi ve Cross-Platform Desteği
*   **Art Arda Hata Koruması (Back-off):** Bir bölgedeki işlemler üst üste 3 kez MT5 sunucusu tarafından reddedilirse (Örn: Piyasa kapalı, geçersiz lot vb.), robot ilgili bölgeyi kilitler ve arayüzde otomatik olarak "PAUSE" (Bekleme) durumuna çeker[cite: 3].
*   **Maksimum Pozisyon Sınırı (Hesap Koruması):** Bir bölge için izin verilen maksimum açık pozisyon sınırına (varsayılan 10, `0` girildiyse güvenlik gereği 500) ulaşıldığında yeni ağ örülmez ve tehlikeyi sınırlandırmak için uzaktaki bekleyen emirler silinir[cite: 3].
*   **Bağlantı İzleyicisi:** Robot, terminalin kapandığını veya internetin kesildiğini algıladığında metrikler üzerinden arayüze `CONNECTION_LOST` bilgisi gönderir ve bağlantı gelene kadar güvenli bekleme döngüsüne geçer[cite: 3].
*   **Mac / Linux Mock (Simülasyon) Modu:** `MetaTrader5` kütüphanesi Windows dışı bir sistemde yüklenemezse program çökmez; otomatik olarak `DummyMT5` sınıfı devreye girer ve UI testi/geliştirme yapılabilmesi için sahte fiyatlarla simülasyon (Mock) modu çalışır[cite: 3].
*   **Hesap Bazlı İzolasyon ve Loglama:** Terminalde hangi hesabın açık olduğuna bakılarak (`ACTIVE_ACCOUNT_ID`), ui state dosyaları, metrikler ve hata logları o hesaba özel ayrılmış dosya ve dizinlere kaydedilir[cite: 3].