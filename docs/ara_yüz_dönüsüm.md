Sen Kıdemli bir Full-Stack Yazılım Mimarı (Next.js + Tailwind + TypeScript) ve Python FastAPI uzmanısın. 
Elimizde eski arayüzü Streamlit ile yazılmış olan bir ticaret botu projesi var. Şu an `frontend_nextjs` ve `worker_python` olarak ikiye böldük. Sıradaki görevimiz, eski Streamlit arayüz kodlarını analiz edip, fonksiyonelliği kaybetmeden modern bir Next.js (React) uygulamasına dönüştürmek ve aradaki FastAPI köprüsünü kurmaktır.

Aşağıdaki adımları sırasıyla, eksiksiz kod blokları halinde ve "TODO" bırakmadan tamamlamalısın.

#### AŞAMA 1: FastAPI Uç Noktalarının (Endpoints) Hazırlanması
Eski sistemde Streamlit doğrudan diske yazıp okuyordu. Artık Next.js'in bu verilere HTTP üzerinden ulaşması gerekiyor.
Lütfen `worker_python/src/api/routes.py` dosyasını şu ihtiyaçlara göre güncelle:
1. **Hesap Yönetimi:** Eski `account_selector.py` dosyası `configs/accounts.json` dosyasını okuyup yazıyordu[cite: 11]. Bana `/api/accounts` (GET ve POST) uç noktalarını yaz.
2. **Ayarlar (Settings) Yönetimi:** Eski `settings_panel.py` bölge (zone) ayarlarını JSON'a kaydediyordu[cite: 15]. Bana `/api/settings/{account_id}` (GET ve POST) uç noktalarını yaz.
3. **Log Okuma:** Eski `log_viewer.py` MT5 ve Robot loglarını diskten okuyordu[cite: 14]. Bana `/api/logs/{account_id}` (GET) uç noktasını yaz.

#### AŞAMA 2: Global State (Zustand) ve Tipler
Lütfen `frontend_nextjs/src/store/useBotStore.ts` dosyasını güncelle.
1. TypeScript interface'lerini eski yapıya göre oluştur. `Account` tipi (id, login, password, server, mt5_path vb. içermeli)[cite: 11].
2. `ZoneSettings` tipi (symbol, order_type, min_price, max_price, grid_step, lot_size, is_breakout, clear_on_exit vb. içermeli)[cite: 15].
3. Zustand store'una `accounts`, `activeAccount`, `settings` ve `logs` state'lerini ve bunları güncelleyecek action'ları ekle.

#### AŞAMA 3: Next.js Component'lerinin Çevirisi
Eski Python dosyalarındaki UI mantığını React Component'lerine çevir.
1. **`frontend_nextjs/src/components/AccountSelector.tsx`:** 
   - Referans: Eski `src/components/account_selector.py`[cite: 11].
   - İşlev: Tailwind ile şık bir hesap seçim menüsü yap. Yanında "Yeni Hesap Ekle/Düzenle" için React Modal (veya shadcn/ui Dialog) ekle. Formda Login, Şifre, Sunucu ve MT5 Path alanları olsun[cite: 11].
2. **`frontend_nextjs/src/components/SettingsForm.tsx`:**
   - Referans: Eski `src/components/settings_panel.py`[cite: 15].
   - İşlev: Dinamik "Bölgeler" (Zones) formunu oluştur. Sembol, İşlem Yönü (BUY/SELL/BOTH), Alt/Üst sınır, Grid Adımı, Lot, TP, SL, Kırılım (Breakout) ve Çıkışta Temizlik (Clear on exit) inputlarını React Hook Form veya state ile bağla[cite: 15]. Kaydet butonuna basıldığında FastAPI `/api/settings`'e POST atsın.
3. **YENİ DOSYA `frontend_nextjs/src/components/LogViewer.tsx`:**
   - Referans: Eski `src/components/log_viewer.py`[cite: 14].
   - İşlev: Siyah arka planlı bir terminal ekranı tasarımı yap. Düzenli olarak (veya WebSocket üzerinden) `/api/logs` uç noktasından logları çekip göstersin[cite: 14].

#### AŞAMA 4: Dialogs ve Modalların Aktarımı
Eski `src/components/dialogs.py` dosyasında bulunan onay pencerelerini React dünyasına taşı[cite: 12].
- İşlev: "Bağlantıyı Kes", "Sistemi Kapat", "Bölgeyi Sil" gibi kritik işlemler için Next.js tarafında tekrar kullanılabilir bir `ConfirmModal.tsx` bileşeni yaz[cite: 12]. 

#### AŞAMA 5: Ana Sayfa (Layout ve Dashboard) Entegrasyonu
Eski `app.py`[cite: 16] ve `header.py`[cite: 13] dosyalarındaki dizilimi `frontend_nextjs/src/app/page.tsx` içinde birleştir.
- İşlev: Üstte Header ve Sürüm numarası[cite: 13]. Hemen altında AccountSelector. Sol sütunda ChartViewer ve LogViewer, sağ sütunda SettingsForm (Bölgeler) ve Kontrol (Başlat/Durdur) butonları olacak şekilde modern bir Tailwind Grid Layout'u kur[cite: 16].

#### AŞAMA 6: Eski PWA ve CSS Temizliği
- Eski `custom_css.py`[cite: 17] dosyasındaki Tailwind karşılıklarını (örneğin buton renkleri, padding'ler) React component'lerine Tailwind class'ı olarak göm[cite: 17]. 
- Eski `pwa_installer.py`[cite: 18] dosyasındaki manifest enjeksiyonunu sil, Next.js'in `public/manifest.json` yapısına uygun şekilde `layout.tsx` içine meta etiketlerini ekle[cite: 18].

Çıktı Formatı: Bana önce FastAPI `routes.py` dosyasını, ardından Zustand store'unu ve React Component'lerini sırasıyla tam kod blokları halinde ver.

AŞAMA 7: İleri Düzey (Advanced) Özelliklerin AktarımıEski kodlardaki şu spesifik özellikleri de unutmadan sisteme entegre etmeni istiyorum:MT5 Yol Tarayıcı (FastAPI): worker_python/src/api/routes.py içine /api/system/scan-mt5 uç noktası ekle. Eski account_selector.py içindeki auto_detect_mt5_paths() mantığını kullanarak Windows Program Files dizinlerini tarayıp bulduğu terminal yollarını JSON olarak dönsün. Next.js'teki AccountSelector.tsx formunda bu yollar bir dropdown olarak listelensin.  GitHub Updater (FastAPI + Next.js): Eski app.py'deki check_for_updates ve execute_git_pull mantığını FastAPI'de /api/system/update uç noktasına bağla. Next.js arayüzünün sağ üst köşesine (Header kısmına) bir "Güncellemeleri Denetle" butonu koy.  Log İndirme Uç Noktası: Eski account_selector.py dosyasındaki log indirme mantığına uygun olarak, FastAPI'de /api/logs/download/{account_id} rotası oluştur. Next.js tarafındaki üç noktalı menüye "MT5 Logunu İndir" butonu ekle.  Mac Simülatörü: Eski app.py dosyasında bulunan platform.system() != "Windows" kontrolünü FastAPI içine taşı. Eğer sunucu Windows değilse, Next.js arayüzünde "Simülasyon Fiyatı" belirleyebileceğim bir arayüz (Slider) göster ve bunu /api/bot/simulate-price uç noktasıyla backend'e ilet.  