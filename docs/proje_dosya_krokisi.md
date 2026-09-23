# 🤖 Algoritmik Ticaret Botu (Grid Robot) Sistem Dokümantasyonu

Bu sistem, **Next.js 14+ (React/TypeScript)** frontend ve **Python FastAPI** worker (MT5 entegrasyonlu) mimarisinden oluşan bir **Algoritmik Ticaret (Algorithmic Trading) Botu** monorepo'sudur. Çoklu hesap, WebSocket tabanlı real-time iletişim ve dinamik state yönetimi desteklenmektedir.

---

## 📂 Proje Klasör Şablonu (Kroki)

📦 PROJE_KOK_DIZINI
┣ 📜 VERSION                    # Proje sürüm takip dosyası (v0.7.39)
┣ 📜 .gitignore
┣ 📜 .gitattributes
┣ 📂 .agents                    # Agent kuralları
┃ ┗ 📂 rules
┃   ┗ 📜 token-saver.md         # Token tasarrufu kuralı
┣ 📂 .vscode                    # VS Code ayarları (Root workspace)
┃ ┣ 📜 settings.json            # CSS lint ignore (Tailwind v4 @theme/@utility direktifleri)
┃ ┗ 📜 tasks.json               # VS Code görevleri
┃
┣ 📂 frontend_nextjs            # Next.js 14+ Frontend (React, TypeScript, Tailwind)
┃ ┣ 📜 package.json
┃ ┣ 📜 package-lock.json        # Bağımlılık kilit dosyası
┃ ┣ 📜 next.config.ts
┃ ┣ 📜 tsconfig.json
┃ ┣ 📜 eslint.config.mjs
┃ ┣ 📜 postcss.config.mjs
┃ ┣ 📜 AGENTS.md
┃ ┣ 📜 CLAUDE.md
┃ ┣ 📜 README.md
┃ ┣ 📜 next-env.d.ts            # Next.js TypeScript declarations
┃ ┣ 📜 .env.local               # Yerel ortam değişkenleri
┃ ┣ 📂 .next                    # Build çıktısı (git-ignore)
┃ ┣ 📂 public                   # Statik varlıklar (ikonlar, PWA)
┃ ┃ ┣ 📜 icon-192.png
┃ ┃ ┣ 📜 icon-512.png
┃ ┃ ┗ 📜 manifest.json          # PWA manifest
┃ ┣ 📂 src
┃ ┃ ┣ 📂 app                    # App Router (Next.js 14+)
┃ ┃ ┃ ┣ 📜 layout.tsx           # Root layout
┃ ┃ ┃ ┣ 📜 page.tsx             # Ana sayfa (Dashboard)
┃ ┃ ┃ ┣ 📜 globals.css          # Global stiller (Tailwind), açık (:root) / koyu (.dark) tema token'ları
┃ ┃ ┃ ┣ 📜 version.ts           # Sürüm bilgisi
┃ ┃ ┃ ┣ 📂 formasyon            # Formasyon sayfası
┃ ┃ ┃ ┃ ┗ 📜 page.tsx
┃ ┃ ┃ ┗ 📂 chart                # Grafik ve İstatistik Sayfası
┃ ┃ ┃   ┗ 📜 page.tsx
┃ ┃ ┣ 📂 components             # React bileşenleri
┃ ┃ ┃ ┣ 📜 BotControls.tsx      # Başlat/Durdur kontrolleri
┃ ┃ ┃ ┣ 📜 ChartViewer.tsx      # Grafik görselleştirme (Lightweight Charts)
┃ ┃ ┃ ┣ 📜 ConfirmModal.tsx     # Onay modalları
┃ ┃ ┃ ┣ 📜 LogViewer.tsx        # Log görüntüleyici
┃ ┃ ┃ ┣ 📜 SettingsForm.tsx     # Global Ayarlar (ORDER_TYPE, LOOP_INTERVAL)
┃ ┃ ┃ ┣ 📜 SimulationBar.tsx    # Simülasyon çubuğu
┃ ┃ ┃ ┣ 📜 SymbolAutoComplete.tsx # Sembol otomatik tamamlama
┃ ┃ ┃ ┣ 📜 ZoneSettingsPanel.tsx # Bölge Ayarları Paneli (Dinamik Zone Yönetimi)
┃ ┃ ┃ ┣ 📂 account              # Hesap yönetimi bileşenleri
┃ ┃ ┃ ┃ ┣ 📜 AccountSelector.tsx
┃ ┃ ┃ ┃ ┣ 📜 index.ts
┃ ┃ ┃ ┃ ┣ 📜 types.ts
┃ ┃ ┃ ┃ ┣ 📂 components
┃ ┃ ┃ ┃ ┃ ┣ 📜 AccountActions.tsx
┃ ┃ ┃ ┃ ┃ ┣ 📜 AccountDropdown.tsx
┃ ┃ ┃ ┃ ┃ ┣ 📜 AccountForm.tsx
┃ ┃ ┃ ┃ ┃ ┣ 📜 AccountFormDialog.tsx
┃ ┃ ┃ ┃ ┃ ┣ 📜 EnvTypeBadge.tsx
┃ ┃ ┃ ┃ ┃ ┣ 📜 MT5PathSelector.tsx
┃ ┃ ┃ ┃ ┃ ┣ 📜 PasswordField.tsx
┃ ┃ ┃ ┃ ┃ ┗ 📜 index.ts
┃ ┃ ┃ ┃ ┗ 📂 hooks
┃ ┃ ┃ ┃   ┣ 📜 useAccountForm.ts
┃ ┃ ┃ ┃   ┣ 📜 useAccounts.ts
┃ ┃ ┃ ┃   ┣ 📜 useMT5Scanner.ts
┃ ┃ ┃ ┃   ┗ 📜 index.ts
┃ ┃ ┃ ┣ 📂 dashboard            # Dashboard özel bileşenleri
┃ ┃ ┃ ┃ ┣ 📜 SaveSettingsBar.tsx
┃ ┃ ┃ ┃ ┣ 📜 UpdateModal.tsx
┃ ┃ ┃ ┃ ┗ 📜 index.ts
┃ ┃ ┃ ┣ 📂 ui                   # Temel UI bileşenleri
┃ ┃ ┃ ┃ ┣ 📜 ErrorToast.tsx
┃ ┃ ┃ ┃ ┣ 📜 InputField.tsx
┃ ┃ ┃ ┃ ┗ 📜 index.ts
┃ ┃ ┃ ┗ 📂 zone                 # Zone (Bölge) ayar bileşenleri
┃ ┃ ┃   ┣ 📜 ZoneCard.tsx
┃ ┃ ┃   ┣ 📜 ZoneHeader.tsx
┃ ┃ ┃   ┣ 📜 ZoneBasicFields.tsx
┃ ┃ ┃   ┣ 📜 ZoneGridFields.tsx
┃ ┃ ┃   ┣ 📜 ZoneSellFields.tsx
┃ ┃ ┃   ┣ 📜 ZoneBreakoutFields.tsx
┃ ┃ ┃   ┣ 📜 ZoneExitFields.tsx
┃ ┃ ┃   ┣ 📜 index.ts
┃ ┃ ┃   ┗ 📜 types.ts
┃ ┃ ┣ 📂 hooks                  # Custom React hooks
┃ ┃ ┃ ┣ 📜 useSymbolDetails.ts
┃ ┃ ┃ ┣ 📜 useZoneActions.ts
┃ ┃ ┃ ┣ 📜 useZoneDirtyTracking.ts
┃ ┃ ┃ ┣ 📜 useZoneFieldHandlers.ts
┃ ┃ ┃ ┗ 📜 index.ts
┃ ┃ ┣ 📂 services               # API servis katmanı
┃ ┃ ┃ ┣ 📜 api.ts               # Genel API istemcisi
┃ ┃ ┃ ┗ 📜 zoneApi.ts           # Zone API işlemleri
┃ ┃ ┣ 📂 lib                    # Kütüphane yardımcıları
┃ ┃ ┃ ┗ 📜 api.ts               # API yardımcı fonksiyonları
┃ ┃ ┣ 📂 store                  # Zustand state management (Modüler)
┃ ┃ ┃ ┣ 📜 index.ts             # Barrel export
┃ ┃ ┃ ┣ 📜 types.ts             # Store type tanımları
┃ ┃ ┃ ┣ 📜 useAccountStore.ts   # Hesap yönetimi state
┃ ┃ ┃ ┣ 📜 useBotRuntimeStore.ts # Bot çalışma durumu state
┃ ┃ ┃ ┣ 📜 useLogsStore.ts      # Log yönetimi state
┃ ┃ ┃ ┣ 📜 useSettingsStore.ts  # Ayarlar state
┃ ┃ ┃ ┣ 📜 useSystemStore.ts    # Sistem durumu state
┃ ┃ ┃ ┣ 📜 useThemeStore.ts     # Tema tercihi (Açık/Koyu/Sistem), localStorage'a persist
┃ ┃ ┃ ┣ 📜 useWebSocketManager.ts # WebSocket bağlantı yönetimi
┃ ┃ ┃ ┗ 📂 utils
┃ ┃ ┃   ┗ 📜 resetStores.ts     # Store sıfırlama yardımcıları
┃ ┃ ┗ 📂 utils                  # Genel yardımcı fonksiyonlar
┃ ┃   ┗ 📜 zoneHelpers.ts
┃ ┗ 📂 .vscode                  # Frontend VS Code ayarları
┃   ┣ 📜 settings.json          # Tailwind associations, CSS/SCSS/Less validation kapatma
┃   ┗ 📜 css.customdata.json    # Tailwind v4 IntelliSense (@theme, @utility, @variant, @source, @plugin)
┃
┣ 📂 worker_python              # Python FastAPI Worker (MT5 Entegrasyonu)
┃ ┣ 📜 main.py                  # FastAPI giriş noktası (WebSocket + REST)
┃ ┣ 📜 requirements.txt         # Python bağımlılıkları
┃ ┣ 📂 src
┃ ┃ ┣ 📂 api                    # API katmanı (Modüler Router Yapısı)
┃ ┃ ┃ ┣ 📜 __init__.py
┃ ┃ ┃ ┣ 📜 accounts.py          # Hesap CRUD endpoint'leri (şifre asla dönmez → has_password)
┃ ┃ ┃ ┣ 📜 auth.py              # WORKER_API_KEY kontrolü (X-API-Key başlığı / WS ?api_key=)
┃ ┃ ┃ ┣ 📜 bot_control.py       # Bot başlat/durdur/temizle endpoint'leri
┃ ┃ ┃ ┣ 📜 errors.py            # Merkezi hata yönetimi
┃ ┃ ┃ ┣ 📜 helpers.py           # API yardımcı fonksiyonları
┃ ┃ ┃ ┣ 📜 logs.py              # Log endpoint'leri
┃ ┃ ┃ ┣ 📜 models.py            # Pydantic modelleri
┃ ┃ ┃ ┣ 📜 settings.py          # Ayarlar endpoint'leri
┃ ┃ ┃ ┣ 📜 symbols.py           # Sembol endpoint'leri
┃ ┃ ┃ ┣ 📜 system.py            # Sistem durumu endpoint'leri
┃ ┃ ┃ ┣ 📜 ui_state.py          # UI state endpoint'leri
┃ ┃ ┃ ┗ 📜 ws_server.py         # WebSocket sunucusu (Real-time iletişim)
┃ ┃ ┣ 📂 core                   # Çekirdek ticaret mantığı (Modüler Mimarisi - v0.7.33+)
┃ ┃ ┃ ┣ 📜 __init__.py          # Paket başlatma
┃ ┃ ┃ ┣ 📜 auto_grid_engine.py  # **LEGACY** - Eski monolitik motor (geriye uyumluluk için tutuldu)
┃ ┃ ┃ ┣ 📜 bot_runner.py        # Bot çalıştırma döngüsü
┃ ┃ ┃ ┣ 📜 grid_helpers.py      # Yardımcılar - fiyat/lot normalizasyonu, logging, market açık kontrolü, timeframe map
┃ ┃ ┃ ┣ 📜 grid_metrics.py      # Canlı metrikler - P/L, pozisyon/emir sayısı, MT5 bağlantı/market durumu
┃ ┃ ┃ ┣ 📜 grid_orders.py       # MT5 Emir/Pozisyon CRUD - get/cancel/modify, pending order gönderme (magic no)
┃ ┃ ┃ ┣ 📜 grid_position_sync.py # Zombi temizliği & kısmi dolum - pasif bölge temizliği, TP/SL senkron, kalan lot
┃ ┃ ┃ ┣ 📜 grid_remote.py       # Uzaktan mobil sinyal - MT5 $1/$2 Buy Limit + GRID:START/STOP komutları
┃ ┃ ┃ ┣ 📜 indicator_calc.py    # Teknik indikatörler - RSI/MACD (pandas-ta fallback ile saf pandas)
┃ ┃ ┃ ┣ 📜 grid_orchestrator.py # Orkestratör - aktif bölge tespiti, giriş/çıkış, clear_on_exit, dynamic grid koordinasyonu
┃ ┃ ┃ ┣ 📜 grid_order_manager.py # Emir yönetimi - emir yaşam döngüsü, batch işlemler
┃ ┃ ┃ ┣ 📜 grid_zone_selector.py # Bölge seçimi - en uygun bölge tespiti, filtreleme
┃ ┃ ┃ ┣ 📜 grid_zone_state.py   # Bölge state yönetimi - bölge durumu, geçişler, veri tutımı
┃ ┃ ┃ ┣ 📂 grid_execution       # Grid Execution Paketi (v0.7.36+)
┃ ┃ ┃ ┃ ┣ 📜 __init__.py
┃ ┃ ┃ ┃ ┣ 📜 config.py          # Grid konfigürasyonu
┃ ┃ ┃ ┃ ┣ 📜 exceptions.py      # Grid özel istisnaları
┃ ┃ ┃ ┃ ┣ 📜 handler.py         # Grid işlem ana handler
┃ ┃ ┃ ┃ ┣ 📜 levels.py          # Grid seviye hesaplamaları
┃ ┃ ┃ ┃ ┣ 📜 placement.py       # Emir yerleştirme mantığı
┃ ┃ ┃ ┃ ┗ 📜 validation.py      # Grid doğrulama kuralları
┃ ┃ ┃ ┣ 📜 loop.py              # Ana çalışma döngüsü
┃ ┃ ┃ ┣ 📜 reconnection.py      # Yeniden bağlanma mantığı
┃ ┃ ┃ ┣ 📜 startup.py           # Başlangıç инициализация
┃ ┃ ┃ ┣ 📜 state.py             # Core state yönetimi
┃ ┃ ┃ ┗ 📜 wrappers.py          # Wrapper fonksiyonları
┃ ┃ ┗ 📂 utils                  # Yardımcı modüller
┃ ┃   ┣ 📜 bot_manager.py       # Süreç yönetimi
┃ ┃   ┣ 📜 bot_watchdog.py      # Çöken/asılı botu otomatik yeniden başlatan bekçi
┃ ┃   ┣ 📜 config.py            # Konfigürasyon okuma/yazma
┃ ┃   ┣ 📜 mt5_connection.py    # MT5 bağlantı yönetimi (Ana orkestrasyon)
┃ ┃   ┣ 📜 mt5_errors.py        # Hata kod ayrıştırma (-10003 IPC, -10004 auth, 10002 login), zombi killer, LIVE/DEMO güvenlik
┃ ┃   ┣ 📜 mt5_helpers.py       # İç bağlantı yöneticisi (retry/timeout), sembol çekme, MT5 terminal log yedekleme
┃ ┃   ┣ 📜 paths.py             # Yol yönetimi
┃ ┃   ┣ 📜 profiler.py          # Performans ölçümü
┃ ┃   ┣ 📜 self_updater.py      # Otomatik güncelleme
┃ ┃   ┣ 📜 state_manager.py     # Pozisyon/emir state senkronizasyonu
┃ ┃   ┗ 📜 trade_utils.py       # Ticaret yardımcıları
┃ ┣ 📂 data                     # State dosyaları (state_*.json)
┃ ┣ 📂 logs                     # Log dosyaları
┃ ┗ 📂 .venv                    # Python sanal ortam (git-ignore)
┃
┣ 📂 docs                       # Dokümantasyon
┃ ┣ 📜 proje_dosya_krokisi.md   # Proje genel yapısı (Bu dosya)
┃ ┣ 📜 my_notes.md              # Geliştirici notları
┃ ┣ 📜 ara_yüz_dönüşüm.md       # Streamlit → Next.js dönüşüm notları
┃ ┣ 📜 MT5_&_Web_Entegrasyonu.md # MT5 ve Web entegrasyon detayları
┃ ┣ 📜 opencode-rules.md        # OpenCode kuralları
┃ ┣ 📂 architecture_python      # Python mimari belgeleri
┃ ┃ ┗ 📜 genel_arch.md          # Genel mimari dokümantasyonu
┃ ┣ 📜 windows_start_guide.md   # Windows hızlı başlatma rehberi (2 Terminal: FastAPI + Ngrok) - Türkçe/Almanca
┃ ┗ 📂 NGrok                    # Ngrok tünel dokümantasyonu
┃   ┗ 📜 Sistem ve Canlıya Alma.md # Deployment - Vercel ayarları, VPS servis komutları, API test uç noktaları

---

## ⚙️ Mimarî Bileşenler ve Etkileşim Yapısı

### 1. Monorepo Yapısı
Proje **frontend_nextjs** (Next.js) ve **worker_python** (FastAPI) iki ana paketten oluşur. Her biri bağımsız geliştirilebilir, test edilebilir ve deploy edilebilir.

### 2. Frontend ↔ Worker İletişimi (WebSocket + REST)
Eski mimarideki JSON dosya köprüleri (logs/met_*, logs/ui_*) **WebSocket** ile değiştirildi:

| Yön | Protokol | Amaç |
|-----|----------|------|
| Worker → Frontend | WebSocket (Push) | Canlı metrikler (P/L, pozisyonlar), log akışı, durum değişiklikleri |
| Frontend → Worker | WebSocket + REST | Komutlar (Başlat/Durdur/Temizle), ayar güncellemeleri, hesap seçimi |
| Frontend → Worker | REST (HTTP) | Hesap listesi, ayar yükleme/kaydetme, durum sorgulama |

**WebSocket Mesaj Formatı (Örnek):**
```json
{ "type": "metrics", "account": "12345", "data": { "pl": 125.50, "positions": [...] } }
{ "type": "command", "action": "start", "account": "12345", "settings": {...} }
```

### 3. State Management
- **Frontend**: Zustand (6 Domain Store + WebSocket Manager)
  - `useAccountStore.ts` - Hesap listesi, seçili hesap, hesap CRUD
  - `useBotRuntimeStore.ts` - Bot çalışma durumu, başlat/durdur, sembol seçimi
  - `useSettingsStore.ts` - Global ayarlar, zone ayarları
  - `useLogsStore.ts` - Log mesajları, filtreleme
  - `useSystemStore.ts` - Sistem durumu, bağlantı durumu, versiyon
  - `useThemeStore.ts` - Tema tercihi ve çözülmüş tema (`resolvedTheme`); tek `persist` kullanan store. İlk paint'teki `.dark` class'ını `layout.tsx`'teki inline script (`lib/theme.ts`) koyar, sonrasını `components/layout/ThemeSync.tsx` yönetir
  - `useWebSocketManager.ts` - WebSocket bağlantı yaşam döngüsü, reconnect, mesaj routing
- **Worker**: `state_manager.py` - MT5 "Source of Truth" prensibiyle pozisyon/emir senkronizasyonu, `data/state_*.json` dosyalarına yazım
- **Configs**: `worker_python/configs/` - `accounts.json`, `settings_*.json`

### 4. Worker Süreç Yönetimi
- `bot_runner.py`: Grid motoru döngüsünü çalıştırır
- `bot_manager.py`: Alt süreç (subprocess) başlatma/durdurma, PID takibi (`logs/pid_*.txt`)
- `bot_watchdog.py`: Start ile başlatılan bot çökerse veya 10 dk metrik yazmazsa (asılı) worker onu yeniden başlatır; Stop ile izleme biter. İzleme listesi yalnızca bellekte (worker yeniden başlarsa ölmüş botlar başlatılmaz, çalışanlar devralınır). 30 dk içinde 5 denemeden sonra vazgeçer. Loglar `[WATCHDOG]` önekiyle hesap loguna yazılır.
- `mt5_connection.py`: MT5 terminal bağlantı havuzu ve yeniden bağlanma mantığı

### 5. Worker Modüler Core Mimarisi (v0.7.33+)
`auto_grid_engine.py` monolitik yapısından **20+ odaklı modüle** ayrıldı (Single Responsibility Principle):

| Modül | Kategori | Sorumluluk | Ana İşlev |
|-------|----------|------------|-----------|
| `grid_orchestrator.py` | **Orkestrasyon** | **Ana Orkestratör** | Aktif bölge tespiti, giriş/çıkış koordinasyonu, clear_on_exit, dynamic grid yönetimi |
| `grid_order_manager.py` | **Orkestrasyon** | Emir Yönetimi | Emir yaşam döngüsü, batch emir işlemleri, emir durum takibi |
| `grid_zone_selector.py` | **Orkestrasyon** | Bölge Seçimi | En uygun bölge tespiti, sembol/fiyat filtreleme, öncelik sıralama |
| `grid_zone_state.py` | **Orkestrasyon** | Bölge State | Bölge durumu (ACTIVE/PENDING/COMPLETED), geçişler, veri tutımı |
| `grid_execution/` (paket) | **Grid Motoru** | Kayan Ağ (Sliding Grid) | Grid step/anchor hesaplama, emir yerleştirme/silme, TP/SL yönetimi |
| &nbsp;&nbsp;`├── config.py` | | Grid Konfig | Grid parametreleri, validation |
| &nbsp;&nbsp;`├── exceptions.py` | | İstisnalar | Grid özel hata sınıfları |
| &nbsp;&nbsp;`├── handler.py` | | Ana Handler | Grid işlem koordinasyonu |
| &nbsp;&nbsp;`├── levels.py` | | Seviyeler | Grid seviye/fiyat hesaplamaları |
| &nbsp;&nbsp;`├── placement.py` | | Yerleştirme | Emir gönderme, modifikasyon, iptal |
| &nbsp;&nbsp;`└── validation.py` | | Doğrulama | Sembol, lot, fiyat doğrulama kuralları |
| `grid_orders.py` | **MT5 Gateway** | MT5 Emir CRUD | Tüm MT5 emir/pozisyon CRUD, pending order, magic number yönetimi |
| `grid_position_sync.py` | **Senkonizasyon** | Pozisyon Mutabakati | Zombi temizliği, kısmi dolum takibi, TP/SL senkron, kalan lot emri |
| `grid_remote.py` | **Uzaktan Kontrol** | Mobil Sinyal | MT5 $1/$2 Buy Limit, GRID:START/STOP komut dinleme |
| `grid_metrics.py` | **Telemetri** | Canlı Metrikler | P/L, pozisyon/emir sayısı, MT5 bağlantı/market durumu → WebSocket broadcast |
| `grid_helpers.py` | **Yardımcılar** | Paylaşılan Util | Fiyat/lot normalizasyonu, logging, market açık kontrolü, timeframe mapping |
| `indicator_calc.py` | **Teknik Analiz** | İndikatörler | RSI/MACD hesaplama (pandas-ta fallback ile saf pandas) |
| `bot_runner.py` | **Çalıştırma** | Bot Döngüsü | Ana çalışma döngüsü, modül koordinasyonu |
| `loop.py` | **Çalıştırma** | Döngü Mantığı | Periyodik işlem döngüsü, timing kontrolü |
| `reconnection.py` | **Çalıştırma** | Yeniden Bağlanma | MT5/WebSocket yeniden bağlanma stratejileri |
| `startup.py` | **Çalıştırma** | Başlatma | İlk başlangıç inizializasyonu, state restore |
| `state.py` | **Çalıştırma** | Core State | Çalışma anı state yönetimi |
| `wrappers.py` | **Çalıştırma** | Wrapper'lar | Yardımcı wrapper fonksiyonları |
| `auto_grid_engine.py` | **LEGACY** | Eski Motor | **DEPRECATED** - Geriye uyumluluk için korundu |

**Veri Akışı (Modüler):**
```
grid_orchestrator (Ana Orkestratör)
    ├──→ grid_zone_selector → grid_zone_state
    ├──→ grid_order_manager → grid_orders → MT5
    ├──→ grid_execution (paket) → grid_orders → MT5
    ├──→ grid_position_sync → grid_orders → MT5
    ├──→ grid_remote (bağımsız dinleme)
    ├──→ grid_metrics → WebSocket → Frontend
    └──→ loop/reconnection/startup/state/wrappers (çalışma altyapısı)
```

**Hata Yönetimi Katmanı:**
- `mt5_errors.py`: Hata kod ayrıştırma (-10003 IPC, -10004 auth, 10002 login), zombi MT5 process killer, LIVE/DEMO güvenlik doğrulaması
- `mt5_helpers.py`: İç bağlantı yöneticisi (retry/timeout), sembol çekme, MT5 terminal log yedekleme
- `api/errors.py`: Merkezi API hata yönetimi, standart hata response formatı

### 6. API Katmanı (Modüler Router Yapısı - v0.7.34+)
`routes.py` monolitik yapısından **11 modüler router'a** ayrıldı:

| Router | Endpoint Önek | Sorumluluk |
|--------|---------------|------------|
| `accounts.py` | `/api/accounts` | Hesap listeleme, oluşturma, güncelleme, silme, test bağlantısı |
| `bot_control.py` | `/api/bot` | Başlat, durdur, temizle, durum sorgulama |
| `settings.py` | `/api/settings` | Global/Zone ayarları yükleme, kaydetme |
| `symbols.py` | `/api/symbols` | Sembol arama, detay, tick bilgisi |
| `logs.py` | `/api/logs` | Log sorgulama, filtreleme, indirme |
| `system.py` | `/api/system` | Sistem durumu, versiyon, sağlık kontrolü |
| `ui_state.py` | `/api/ui-state` | UI state kaydetme/yükleme (panel genişlikleri, vb.) |
| `models.py` | - | Paylaşılan Pydantic modelleri (Request/Response) |
| `helpers.py` | - | API ortak yardımcı fonksiyonları (`_public_account`: yanıtlardan şifreyi çıkarır) |
| `auth.py` | - | `WORKER_API_KEY` ayarlıysa `/api/*` için `X-API-Key`, `/ws/stream` için `?api_key=` zorunlu (middleware: `main.py`) |
| `errors.py` | - | Merkezi exception handler, hata response formatı |
| `ws_server.py` | `/ws` | WebSocket bağlantı yönetimi, mesaj routing, broadcast |

### 7. Dağıtım (Deployment)

| Ortam | Frontend | Worker |
|-------|----------|--------|
| Geliştirme | `npm run dev` (Turbopack) | `python main.py` (uvicorn reload) |
| Üretim | `npm run build && npm start` (Vercel/Docker) | `gunicorn -k uvicorn.workers.UvicornWorker main:app` (Systemd/Docker) |
| Tünel | Vercel/Cloudflare Pages | Ngrok/Cloudflare Tunnel (WebSocket için) |

---

## 🔄 Eski Mimari vs Yeni Mimari Karşılaştırması

| Özellik | Eski (Streamlit + Python) | Yeni (Next.js + FastAPI) |
|---------|---------------------------|--------------------------|
| Arayüz | Streamlit (Sunucu taraflı render) | Next.js 14 App Router (Client/Server Components) |
| State | Streamlit session_state + JSON dosyaları | Zustand (6 Domain Store) + WebSocket (Real-time) |
| Backend İletişim | JSON dosya köprüleri (logs/ klasörü) | WebSocket (ws://) + REST API (Modüler Router) |
| MT5 Erişimi | Subprocess her hesap için izole | Worker süreç içinde bağlantı havuzu |
| Gerçek Zamanlılık | Polling (saniyede bir dosya okuma) | Push tabanlı WebSocket |
| Paket Yönetimi | pip + requirements.txt | npm (frontend) + pip (worker) |
| UI Kütüphanesi | Streamlit native + custom CSS | React + Tailwind CSS + Shadcn/UI |
| PWA Desteği | Özel betiklerle (pwa_installer.py) | Next.js PWA (next-pwa) yerleşik |
| Worker Core | Monolitik `auto_grid_engine.py` | 20+ Modül (SRP, Test Edilebilir) |
| API | Tek `routes.py` | 11 Modüler Router |

---

## 📁 Önemli Veri Akışları

1. **Başlatma**: Frontend → REST `/api/accounts` → Hesap listesi → Seçim → WebSocket `start` komutu → Worker `bot_runner` başlatır
2. **Metrik Akışı**: Worker (MT5) → `grid_orchestrator` → `grid_metrics` → WebSocket broadcast → Frontend `useBotRuntimeStore`/`useSystemStore` günceller → UI yeniden render
3. **Ayar Değişikliği**: Frontend `SettingsForm` / `ZoneSettingsPanel` → REST `/api/settings` + WebSocket `update_settings` → Worker `config.py` kaydeder → Motor çalışma anında uygular
4. **Durum Kurtarma**: Worker başlangıçta `state_manager.py` ile MT5'ten açık pozisyon/emirleri çeker → `data/state_*.json` yeniden inşa edilir → Frontend'e `state_restored` eventi gönderilir
5. **Grid İşlem Döngüsü**: `grid_orchestrator` → `grid_zone_selector` → `grid_execution` (grid math) → `grid_orders` (MT5 emir CRUD) → `grid_position_sync` (zombi/kısmi dolum) → `grid_metrics` (telemetri)

---

## 🎨 UI/UX Yapısı

### Sayfa Yapısı

| Rota | Açıklama | Ana Bileşenler |
|------|----------|----------------|
| `/` | **Dashboard (Ana Sayfa)** | AccountSelector, SimulationBar, ZoneSettingsPanel (sol 2/3), LogViewer, BotControls, SettingsForm (sağ 1/3), 📈 Grafik Butonu |
| `/chart` | **Grafik ve İstatistikler** | ChartViewer (sol 2/3), Gelecek Paneller (sağ 1/3: İstatistikler, Backtest, Deneme), Ana Sayfaya Dön butonu |
| `/formasyon` | Formasyon Analizi | (Mevcut) |

### Bileşen Sorumlulukları

| Bileşen | Sorumluluk | State Kaynağı |
|---------|------------|---------------|
| `ZoneSettingsPanel.tsx` | **Dinamik Zone Yönetimi**: Bölge ekle/sil/düzenle, tüm zone alanları (Symbol, Order Type, Grid, Lot, TP/SL, Breakout, Pullback, Levels, Clear on Exit), Kaydet/Update | `useSettingsStore` + REST API |
| `SettingsForm.tsx` | **Global Ayarlar**: ORDER_TYPE, LOOP_INTERVAL_SECONDS | `useSettingsStore` + REST API |
| `ChartViewer.tsx` | Canlı Mum grafiği + RSI (Lightweight Charts + WebSocket) | `useSystemStore` (metrics) |
| `BotControls.tsx` | Bot Başlat/Durdur, Temizle, Sembol Seçimi, Canlı Metrik Gösterimi | `useBotRuntimeStore`, `useAccountStore` |
| `AccountSelector.tsx` | Hesap seçimi, yeni hesap ekleme, bağlantı testi | `useAccountStore` |
| `SymbolAutoComplete.tsx` | Sembol arama, otomatik tamamlama, klavye navigasyonu | `useSymbolDetails` hook |
| `LogViewer.tsx` | Real-time log akışı, filtreleme, seviye renklendirme | `useLogsStore` |
| `SimulationBar.tsx` | Simülasyon modu geçişi, simülasyon ayarları | `useSettingsStore` |
| `SaveSettingsBar.tsx` | Değişiklik takibi, kaydet/iptal barı | `useSettingsStore` (dirty tracking) |
| `UpdateModal.tsx` | Versiyon güncelleme bildirimi, changelog | `useSystemStore` |

### Hesap Bileşenleri (`components/account/`)

| Bileşen | Sorumluluk |
|---------|------------|
| `AccountSelector.tsx` | Ana hesap seçim dropdown, yeni hesap butonu |
| `AccountForm.tsx` | Hesap oluşturma/düzenleme formu |
| `AccountFormDialog.tsx` | Form modal wrapper |
| `AccountActions.tsx` | Hesap silme, test bağlantısı, kopyalama aksiyonları |
| `AccountDropdown.tsx` | Hesap liste dropdown içeriği |
| `EnvTypeBadge.tsx` | LIVE/DEMO ortam etiketi |
| `MT5PathSelector.tsx` | MT5 terminal yol seçici |
| `PasswordField.tsx` | Güvenli şifre girişi (göster/gizle) |

### Zone Bileşenleri (`components/zone/`)

| Bileşen | Sorumluluk |
|---------|------------|
| `ZoneCard.tsx` | Tek bölgenin container kartı (genişletilebilir/daraltılabilir) |
| `ZoneHeader.tsx` | Bölge başlığı, aktif/pasif toggle, silme butonu, sıra değiştirme |
| `ZoneBasicFields.tsx` | Sembol, Order Type, Magic Number, Açıklama |
| `ZoneGridFields.tsx` | Grid Step, Grid Count, Lot Size, Dynamic Grid ayarları |
| `ZoneSellFields.tsx` | Satış yönü ayarları (ayrı grid, lot, step) |
| `ZoneBreakoutFields.tsx` | Breakout giriş stratejisi, konfirmasyon, filtreler |
| `ZoneExitFields.tsx` | TP/SL, Clear on Exit, Trailing Stop, Time-based exit |

### Hook'lar (`hooks/`)

| Hook | Sorumluluk |
|------|------------|
| `useSymbolDetails.ts` | Sembol detayları (digits, point, min/max lot, swap), cache'leme |
| `useZoneActions.ts` | Zone CRUD aksiyonları (add, remove, update, reorder, duplicate) |
| `useZoneDirtyTracking.ts` | Form değişiklik takibi, kaydet/iptal durumu |
| `useZoneFieldHandlers.ts` | Alan seviyesi event handler'lar, validasyon |

---

## 📝 Proje Sürümü

**Mevcut Sürüm: v0.7.39**

Bu dokümantasyon projenin **tam dosya yapısını** ve **mimari bileşenlerini** yansıtmaktadır. Tüm dosya yolları mevcut repo yapısıyla senkronize edilmiştir.