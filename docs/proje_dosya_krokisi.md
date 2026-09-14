# 🤖 Algoritmik Ticaret Botu (Grid Robot) Sistem Dokümantasyonu

Bu sistem, **Next.js 14+ (React/TypeScript)** frontend ve **Python FastAPI** worker (MT5 entegrasyonlu) mimarisinden oluşan bir **Algoritmik Ticaret (Algorithmic Trading) Botu** monorepo'sudur. Çoklu hesap, WebSocket tabanlı real-time iletişim ve dinamik state yönetimi desteklenmektedir.

---

## 📂 Proje Klasör Şablonu (Kroki)

📦 PROJE_KOK_DIZINI
┣ 📜 VERSION                    # Proje sürüm takip dosyası
┣ 📜 .gitignore
┣ 📜 .gitattributes
┣ 📂 .agents                    # Agent kuralları
┃ ┗ 📂 rules
┃   ┗ 📜 token-saver.md         # Token tasarrufu kuralı
┣ 📂 .vscode                    # VS Code ayarları (Root workspace)
┃ ┗ 📜 settings.json            # CSS lint ignore (Tailwind v4 @theme/@utility direktifleri)
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
┃ ┣ 📂 .next                    # Build çıktısı (git-ignore)
┃ ┣ 📂 public                   # Statik varlıklar (ikonlar, PWA)
┃ ┃ ┣ 📜 icon-192.png
┃ ┃ ┣ 📜 icon-512.png
┃ ┃ ┗ 📜 manifest.json          # PWA manifest
┃ ┣ 📂 src
┃ ┃ ┣ 📂 app                    # App Router (Next.js 14+)
┃ ┃ ┃ ┣ 📜 layout.tsx           # Root layout
┃ ┃ ┃ ┣ 📜 page.tsx             # Ana sayfa (Dashboard) — *Güncellendi*
┃ ┃ ┃ ┣ 📜 globals.css          # Global stiller (Tailwind)
┃ ┃ ┃ ┣ 📜 version.ts           # Sürüm bilgisi
┃ ┃ ┃ ┣ 📂 formasyon            # Formasyon sayfası
┃ ┃ ┃ ┃ ┗ 📜 page.tsx
┃ ┃ ┃ ┗ 📂 chart                # **YENİ: Grafik ve İstatistik Sayfası**
┃ ┃ ┃   ┗ 📜 page.tsx
┃ ┃ ┣ 📂 components             # React bileşenleri
┃ ┃ ┃ ┣ 📜 AccountSelector.tsx  # Hesap seçim
┃ ┃ ┃ ┣ 📜 BotControls.tsx      # Başlat/Durdur kontrolleri
┃ ┃ ┃ ┣ 📜 ChartViewer.tsx      # Grafik görselleştirme (Lightweight Charts)
┃ ┃ ┃ ┣ 📜 ConfirmModal.tsx     # Onay modalları
┃ ┃ ┃ ┣ 📜 LogViewer.tsx        # Log görüntüleyici
┃ ┃ ┃ ┣ 📜 SettingsForm.tsx     # **Güncellendi: Sadece Global Ayarlar (ORDER_TYPE, LOOP_INTERVAL)**
┃ ┃ ┃ ┣ 📜 SimulationBar.tsx    # Simülasyon çubuğu
┃ ┃ ┃ ┣ 📜 SymbolAutoComplete.tsx # **YENİ: Sembol otomatik tamamlama**
┃ ┃ ┃ ┗ 📜 ZoneSettingsPanel.tsx # **YENİ: Bölge Ayarları Paneli (Dinamik Zone Yönetimi)**
┃ ┃ ┗ 📂 store                  # Zustand state management
┃ ┃   ┗ 📜 useBotStore.ts       # Bot durumu ve aksiyonlar
┃ ┗ 📂 .vscode                  # Frontend VS Code ayarları
┃   ┣ 📜 settings.json          # Tailwind associations, CSS/SCSS/Less validation kapatma
┃   ┗ 📜 css.customdata.json    # Tailwind v4 IntelliSense (@theme, @utility, @variant, @source, @plugin)
┃
┣ 📂 worker_python              # Python FastAPI Worker (MT5 Entegrasyonu)
┃ ┣ 📜 main.py                  # FastAPI giriş noktası (WebSocket + REST)
┃ ┣ 📜 requirements.txt         # Python bağımlılıkları
┃ ┣ 📂 src
┃ ┃ ┣ 📂 api                    # API katmanı
┃ ┃ ┃ ┣ 📜 ws_server.py         # WebSocket sunucusu (Real-time iletişim)
┃ ┃ ┃ ┗ 📜 routes.py            # REST endpoint'leri
┃ ┃ ┣ 📂 core                   # Çekirdek ticaret mantığı (Modüler Mimarisi - v0.7.25+)
┃ ┃ ┃ ┣ 📜 __init__.py          # Paket başlatma
┃ ┃ ┃ ┣ 📜 auto_grid_engine.py  # **LEGACY** - Eski monolitik motor (geriye uyumluluk için tutuldu)
┃ ┃ ┃ ┣ 📜 bot_runner.py        # Bot çalıştırma döngüsü
┃ ┃ ┃ ┣ 📜 grid_execution.py    # Kayan ağ (Sliding Grid) yönetimi - emir yerleştirme/silme, grid hesaplama, TP/SL
┃ ┃ ┃ ┣ 📜 grid_helpers.py      # Yardımcılar - fiyat/lot normalizasyonu, logging, market açık kontrolü, timeframe map
┃ ┃ ┃ ┣ 📜 grid_metrics.py      # Canlı metrikler - P/L, pozisyon/emir sayısı, MT5 bağlantı/market durumu
┃ ┃ ┃ ┣ 📜 grid_orders.py       # MT5 Emir/Pozisyon CRUD - get/cancel/modify, pending order gönderme (magic no)
┃ ┃ ┃ ┣ 📜 grid_position_sync.py # Zombi temizliği & kısmi dolum - pasif bölge temizliği, TP/SL senkron, kalan lot
┃ ┃ ┃ ┣ 📜 grid_remote.py       # Uzaktan mobil sinyal - MT5 $1/$2 Buy Limit + GRID:START/STOP komutları
┃ ┃ ┃ ┣ 📜 grid_strategy.py     # **Orkestratör** - Aktif bölge tespiti, giriş/çıkış, clear_on_exit, dynamic grid koordinasyonu
┃ ┃ ┃ ┗ 📜 indicator_calc.py    # Teknik indikatörler - RSI/MACD (pandas-ta fallback ile saf pandas)
┃ ┃ ┗ 📂 utils                  # Yardımcı modüller
┃ ┃   ┣ 📜 bot_manager.py       # Süreç yönetimi
┃ ┃   ┣ 📜 config.py            # Konfigürasyon okuma/yazma
┃ ┃   ┣ 📜 mt5_connection.py    # MT5 bağlantı yönetimi (Ana orkestrasyon - hata/helper'lar ayrıldı)
┃ ┃   ┣ 📜 mt5_errors.py        # Hata ayrıştırma (-10003 IPC, -10004 auth, 10002 login), zombi killer, LIVE/DEMO güvenlik
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
- **Frontend**: Zustand (`useBotStore.ts`) - UI state, bağlantı durumu, form verileri
- **Worker**: `state_manager.py` - MT5 "Source of Truth" prensibiyle pozisyon/emir senkronizasyonu, `data/state_*.json` dosyalarına yazım
- **Configs**: `worker_python/configs/` - `accounts.json`, `settings_*.json`

### 4. Worker Süreç Yönetimi
- `bot_runner.py`: Grid motoru döngüsünü çalıştırır
- `bot_manager.py`: Alt süreç (subprocess) başlatma/durdurma, PID takibi (`logs/pid_*.txt`)
- `mt5_connection.py`: MT5 terminal bağlantı havuzu ve yeniden bağlanma mantığı

### 5. Worker Modüler Core Mimarisi (v0.7.25+)
`auto_grid_engine.py` monolitik yapısından **8 odaklı modüle** ayrıldı (Single Responsibility Principle):

| Modül | Sorumluluk | Ana İşlev |
|-------|------------|-----------|
| `grid_strategy.py` | **Orkestratör** | Bölge yaşam döngüsü, aktif bölge tespiti, giriş/çıkış, clear_on_exit, dynamic grid koordinasyonu |
| `grid_execution.py` | **Grid Motoru** | Kayan ağ matematiksi, emir yerleştirme/silme, grid step/anchor hesaplama, TP/SL yönetimi |
| `grid_orders.py` | **MT5 Emir Gateway** | Tüm MT5 emir/pozisyon CRUD (get/cancel/modify), pending order gönderme, magic number yönetimi |
| `grid_position_sync.py` | **Pozisyon Mutabakati** | Zombi temizliği (pasif bölge), kısmi dolum takibi, TP/SL senkronizasyonu, kalan lot emri |
| `grid_remote.py` | **Uzaktan Kontrol** | Mobil MT5 sinyal dinleme ($1/$2 Buy Limit, GRID:START/STOP komutları) |
| `grid_metrics.py` | **Telemetri** | Canlı metrikler (P/L, pozisyon/emir sayısı, MT5 bağlantı/market durumu) → WebSocket broadcast |
| `grid_helpers.py` | **Paylaşılan Yardımcılar** | Fiyat/lot normalizasyonu, logging, market açık kontrolü, timeframe mapping |
| `indicator_calc.py` | **Teknik Analiz** | RSI/MACD hesaplama (pandas-ta fallback ile saf pandas) |

**Veri Akışı (Modüler):**
```
grid_strategy (Orkestratör)
    ├──→ grid_execution → grid_orders → MT5
    ├──→ grid_position_sync → grid_orders → MT5
    ├──→ grid_remote (bağımsız dinleme)
    └──→ grid_metrics → WebSocket → Frontend
```

**Hata Yönetimi Katmanı (Yeni):**
- `mt5_errors.py`: Hata kod ayrıştırma (-10003 IPC, -10004 auth, 10002 login), zombi MT5 process killer, LIVE/DEMO güvenlik doğrulaması
- `mt5_helpers.py`: İç bağlantı yöneticisi (retry/timeout), sembol çekme, MT5 terminal log yedekleme

### 6. Dağıtım (Deployment)
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
| State | Streamlit session_state + JSON dosyaları | Zustand (Client) + WebSocket (Real-time) |
| Backend İletişim | JSON dosya köprüleri (logs/ klasörü) | WebSocket (ws://) + REST API |
| MT5 Erişimi | Subprocess her hesap için izole | Worker süreç içinde bağlantı havuzu |
| Gerçek Zamanlılık | Polling (saniyede bir dosya okuma) | Push tabanlı WebSocket |
| Paket Yönetimi | pip + requirements.txt | npm (frontend) + pip (worker) |
| UI Kütüphanesi | Streamlit native + custom CSS | React + Tailwind CSS + Shadcn/UI |
| PWA Desteği | Özel betiklerle (pwa_installer.py) | Next.js PWA (next-pwa) yerleşik |

---

## 📁 Önemli Veri Akışları

1. **Başlatma**: Frontend → REST `/api/accounts` → Hesap listesi → Seçim → WebSocket `start` komutu → Worker `bot_runner` başlatır
2. **Metrik Akışı**: Worker (MT5) → `grid_strategy` → `grid_metrics` → WebSocket broadcast → Frontend `useBotStore` günceller → UI yeniden render
3. **Ayar Değişikliği**: Frontend `SettingsForm` / `ZoneSettingsPanel` → REST `/api/settings` + WebSocket `update_settings` → Worker `config.py` kaydeder → Motor çalışma anında uygular
4. **Durum Kurtarma**: Worker başlangıçta `state_manager.py` ile MT5'ten açık pozisyon/emirleri çeker → `data/state_*.json` yeniden inşa edilir → Frontend'e `state_restored` eventi gönderilir
5. **Grid İşlem Döngüsü**: `grid_strategy` → `grid_execution` (grid math) → `grid_orders` (MT5 emir CRUD) → `grid_position_sync` (zombi/kısmi dolum) → `grid_metrics` (telemetri)

---

## 🎨 UI/UX Yapısı (Güncellenmiş)

### Sayfa Yapısı
| Rota | Açıklama | Ana Bileşenler |
|------|----------|----------------|
| `/` | **Dashboard (Ana Sayfa)** | AccountSelector, SimulationBar, **ZoneSettingsPanel** (sol 2/3), LogViewer, BotControls, SettingsForm (sağ 1/3), **📈 Grafik Butonu** |
| `/chart` | **Grafik ve İstatistikler** | ChartViewer (sol 2/3), Gelecek Paneller (sağ 1/3: İstatistikler, Backtest, Deneme), **Ana Sayfaya Dön** butonu |
| `/formasyon` | Formasyon Analizi | (Mevcut) |

### Bileşen Sorumlulukları
| Bileşen | Sorumluluk | State Kaynağı |
|---------|------------|---------------|
| `ZoneSettingsPanel.tsx` | **Dinamik Zone Yönetimi**: Bölge ekle/sil/düzenle, tüm zone alanları (Symbol, Order Type, Grid, Lot, TP/SL, Breakout, Pullback, Levels, Clear on Exit), Kaydet/Update | `useBotStore` (settings, liveData) + REST API |
| `SettingsForm.tsx` | **Global Ayarlar**: ORDER_TYPE, LOOP_INTERVAL_SECONDS | `useBotStore` (settings) + REST API |
| `ChartViewer.tsx` | Canlı Mum grafiği + RSI (Lightweight Charts + WebSocket) | `useBotStore` (metrics, updateMetrics) |
| `BotControls.tsx` | Bot Başlat/Durdur, Temizle, Sembol Seçimi, Canlı Metrik Gösterimi | `useBotStore` (isRunning, selectedAccount) |

---

## 📝 Son Değişiklikler (2026-09-03)

### Görev: Proje Dosya Yapısı (Kroki) Güncellemesi
- `docs/proje_dosya_krokisi.md` dosyası mevcut proje yapısıyla senkronize edildi
- Eksik dosyalar eklendi: `SymbolAutoComplete.tsx`, `next-env.d.ts`, `package-lock.json`, `manifest.json`, `src/core/__init__.py`, `.agents/rules/token-saver.md`, `.vscode/settings.json`, `NGrok/`, `architecture_python/`
- Yanlış yollar düzeltildi: `docs/architecture/` → `docs/architecture_python/`
- Olmayan `.github/workflows/release.yml` kaldırıldı

### Görev 1: Yeni Grafik ve İstatistik Sayfası (`/chart`)
- `src/app/chart/page.tsx` oluşturuldu
- `ChartViewer` bileşeni ana sayfadan bu sayfaya taşındı
- Genişletilebilir Grid/Flex yapısı: Sol 2/3 Grafik, Sağ 1/3 gelecek paneller (İstatistikler, Backtest, Deneme)
- "Ana Sayfaya Dön" butonu eklendi

### Görev 2: Ana Sayfa Yönlendirme Butonu
- Dashboard'a belirgin **"📈 Grafik ve İstatistikleri Aç"** butonu eklendi
- Next.js `Link` bileşeni ile `/chart` rotasına yönlendirme

### Görev 3: Bölge Ayarları (Zone Settings) Ana Sayfaya Entegrasyonu
- `SettingsForm.tsx` içindeki Zone Settings kısmı `ZoneSettingsPanel.tsx` olarak ayrıldı
- Ana sayfa sol panelde (2/3 genişlikte) `ZoneSettingsPanel` yerleştirildi
- Kullanıcı artık ana sayfadan doğrudan bölgeleri ekleyip, çıkarıp düzenleyebiliyor
- `SettingsForm.tsx` artık sadece **Global Settings** (ORDER_TYPE, LOOP_INTERVAL) yönetiyor

---

## 📝 Son Değişiklikler (2026-09-14)

### Görev 1: Worker Core Modüler Mimarisi (Refactoring)
**Commit:** `9be6b6f` - `refactor(worker): split auto_grid_engine and mt5_connection into modular components`

- **8 yeni core modülü** oluşturuldu (`worker_python/src/core/`):
  - `grid_execution.py` - Kayan ağ (Sliding Grid) yönetimi
  - `grid_helpers.py` - Yardımcı fonksiyonlar (normalize, logging, market check)
  - `grid_metrics.py` - Canlı metrik hesaplamaları
  - `grid_orders.py` - MT5 Emir/Pozisyon CRUD işlemleri
  - `grid_position_sync.py` - Zombi temizliği & kısmi dolum takibi
  - `grid_remote.py` - Uzaktan mobil sinyal dinleme
  - `grid_strategy.py` - Orkestratör: aktif bölge tespiti & koordinasyon
  - `indicator_calc.py` - Teknik indikatörler (RSI/MACD)
- `auto_grid_engine.py` **LEGACY** olarak işaretlendi (geriye uyumluluk için korundu)
- Single Responsibility Principle uygulandı, testability ve bakım kolaylaştırıldı

### Görev 2: Hata Yönetimi ve Yardımcı Katmanı Ayrıştırma
- `mt5_errors.py` - Hata kod ayrıştırma (-10003 IPC, -10004 auth, 10002 login), zombi MT5 process killer, LIVE/DEMO güvenlik doğrulaması
- `mt5_helpers.py` - İç bağlantı yöneticisi (retry/timeout), sembol çekme, MT5 terminal log yedekleme
- `mt5_connection.py` içinden çıkarılarak ayrı modüller haline getirildi

### Görev 3: Windows Başlangıç ve Deployment Dokümantasyonu
- `docs/windows_start_guide.md` - VPS için 2-terminal hızlı başlatma (FastAPI + Ngrok) - Türkçe/Almanca
- `docs/NGrok/Sistem ve Canlıya Alma.md` - Deployment rehberi: Vercel env vars, `.vercelignore`, VPS servis komutları, API test uç noktaları

### Görev 4: VS Code Tailwind CSS v4 Desteği
- `.vscode/settings.json` - Root workspace: CSS lint ignore (@theme, @utility, @variant, @source, @plugin)
- `frontend_nextjs/.vscode/settings.json` - Tailwind associations, CSS/SCSS/Less validation kapatma
- `frontend_nextjs/.vscode/css.customdata.json` - Tailwind v4 IntelliSense custom data

