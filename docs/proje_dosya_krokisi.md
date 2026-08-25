# 🤖 Algoritmik Ticaret Botu (Grid Robot) Sistem Dokümantasyonu

Bu sistem, MetaTrader 5 (MT5) entegrasyonuna sahip bir **Algoritmik Ticaret (Algorithmic Trading) Botu** ve bu botun yönetimini sağlayan bir **Streamlit** web arayüzünden oluşmaktadır. Çoklu hesap, izole edilmiş süreçler (subprocess) ve dinamik state yönetimi desteklenmektedir.

---

## 📂 Proje Klasör Şablonu (Kroki)

📦 PROJE_KOK_DIZINI
┣ 📜 app.py                     # Uygulamanın (Streamlit) ana giriş noktası
┣ 📜 requirements.txt           # Python bağımlılıkları
┣ 📜 VERSION                    # Proje sürüm takip dosyası
┃
┣ 📂 src                        # Kaynak kodların bulunduğu ana dizin
┃ ┣ 📂 components               # Arayüz (UI) bileşenleri
┃ ┃ ┣ 📜 account_selector.py    # Hesap seçim ekranı
┃ ┃ ┣ 📜 chart_viewer.py        # Grafik ve veri görselleştirme
┃ ┃ ┣ 📜 controls.py            # Başlat/Durdur gibi kontrol butonları
┃ ┃ ┣ 📜 dialogs.py             # Uyarı ve pop-up pencereleri
┃ ┃ ┣ 📜 header.py              # Üst bilgi alanı
┃ ┃ ┣ 📜 log_viewer.py          # Arayüzde logların gösterimi
┃ ┃ ┣ 📜 metrics.py             # Kâr/Zarar gibi canlı metriklerin gösterimi
┃ ┃ ┗ 📜 settings_panel.py      # Genel ayar paneli (Auto Grid arayüzü)
┃ ┃
┃ ┣ 📂 core                     # Çekirdek algoritma ve ticaret mantığı
┃ ┃ ┣ 📜 bot_runner.py          # Alt süreci (Subprocess) çalıştıran ana motor
┃ ┃ ┗ 📜 auto_grid_engine.py    # Ticaret stratejisi / Nihai Auto Grid Motoru
┃ ┃
┃ ┣ 📂 utils                    # Yardımcı araçlar ve bağlantılar
┃ ┃ ┣ 📜 bot_manager.py         # Subprocess (Alt süreç) başlatma ve durdurma yöneticisi
┃ ┃ ┣ 📜 config.py              # Ayar dosyalarını (JSON) okuma ve veri göçü (migration) işlemleri
┃ ┃ ┣ 📜 mt5_connection.py      # MetaTrader 5 (MT5) borsa/broker bağlantısı
┃ ┃ ┣ 📜 paths.py               # Merkezi yol (path) yöneticisi (Log ve Config yolları)
┃ ┃ ┣ 📜 state_manager.py       # MT5 "Source of Truth" bazlı durum eşitleme
┃ ┃ ┣ 📜 profiler.py            # Performans ve thread metrik ölçümleyici
┃ ┃ ┣ 📜 self_updater.py        # GitHub üzerinden kendi kendini güncelleme aracı
┃ ┃ ┗ 📜 trade_utils.py         # Alım-satım, hata loglama ve hesaplama yardımcı fonksiyonları
┃ ┃
┃ ┣ 📂 constants                # Sabit değerler
┃ ┃ ┗ 📜 tooltips.py            # Arayüzdeki bilgilendirme/ipucu metinleri
┃ ┃
┃ ┣ 📂 ui                       # Arayüz araçları
┃ ┃ ┗ 📜 pwa_installer.py       # Uygulamanın web app (PWA) kurulum altyapısı
┃ ┃
┃ ┗ 📂 styles                   # Arayüz tasarımları
┃   ┗ 📜 custom_css.py          # Streamlit arayüzünü özelleştiren CSS kodları
┃
┣ 📂 configs                    # Konfigürasyon dosyaları (JSON)
┃ ┣ 📜 accounts.json            # Borsa hesap bilgileri/kimlik bilgileri
┃ ┗ 📜 settings_*.json          # Parametre ve ayar kayıtları (Örn: settings_123_Auto_Grid.json)
┃
┣ 📂 data                       # Geçici durum ve hafıza dosyaları
┃ ┗ 📜 state_*.json             # İlgili hesabın açık pozisyon ve bekleyen emir hafızası
┃
┣ 📂 logs                       # Sistem kayıtları ve UI-Backend Köprüleri
┃ ┣ 📜 err_*.log                # Hesaba özel genel bot hata logları
┃ ┣ 📜 met_*.json               # Bot üzerinden arayüze akan canlı metrikler (P/L, pozisyonlar)
┃ ┣ 📜 pid_*.txt                # İşletim sistemi süreç (Subprocess PID) kimlikleri
┃ ┣ 📜 ui_*.json                # Arayüzden bota gönderilen "Temizle", "Başlat" sinyalleri
┃ ┗ 📜 run_profiler.log         # Sistem ve okuma hızı (thread) performans logu
┃
┣ 📂 scripts                    # Bağımsız scriptler
┃ ┣ 📜 audit_account.py         # Hesap denetleme aracı
┃ ┣ 📜 launcher.py              # Python ortam yöneticisi ve uygulama başlatıcı
┃ ┣ 📜 run_all_services.bat     # Windows hızlı başlatma betiği
┃ ┗ 📜 start_invisible_app.vbs  # Uygulamayı CMD penceresi olmadan (gizli) başlatma betiği
┃
┗ 📂 docs                       # Dokümantasyon
  ┣ 📜 proje_dosya_krokisi.md   # Proje genel yapısı (Güncellenmeli)
  ┣ 📜 my_notes.md              # Geliştirici notları
  ┗ 📂 architecture             # Teknik mimari belgeleri


---

## ⚙️ Dosyaların İşlevleri ve Etkileşim Yapısı

### 1. İzole Edilmiş Alt Süreçler (Subprocess Mimari)
Uygulama, her MT5 hesabı için arayüzden (`app.py`) tamamen **bağımsız (detached)** çalışır. Kullanıcı `controls.py` üzerinden motoru başlattığında, `bot_manager.py` bunu yakalar ve `bot_runner.py`'ı tetikleyerek bağımsız bir süreç (PID) oluşturur. Bu PID `logs/pid_*.txt` dosyasına yazılır. Streamlit arayüzü çökse veya yeniden başlasa bile arka plandaki robot yaşamaya devam eder.

### 2. Arayüz ve Backend Haberleşmesi (JSON Köprüleri)
Bot arka planda çalışırken Streamlit ile doğrudan haberleşemez. Bunun için `logs/` klasöründeki dosyalar kullanılır:
- **Metrik İletimi:** Bot, anlık kâr/zarar ve pozisyon verilerini `met_*.json` dosyasına yazar. Streamlit arayüzü (`metrics.py`) bu dosyayı saniyede bir okuyarak ekranda gösterir.
- **Komut İletimi:** Arayüz üzerinden "Bölgeyi Temizle" dendiğinde, `ui_*.json` dosyasına durum kaydedilir. Bot döngü sırasında bu dosyayı okur ve MT5 tarafındaki emirleri kapatır.

### 3. State Management (Durum Yönetimi)
Bot ilk çalıştığında veya çöktüğünde kendi hafızasına körü körüne güvenmez. `state_manager.py` devreye girerek MetaTrader 5 sunucusundan anlık olarak açık pozisyon ve bekleyen emirleri (`Source of Truth`) okur, eski ayarlar ile birleştirir ve `data/state_*.json` dosyasını en güncel ve güvenli haliyle yeniden inşa eder.