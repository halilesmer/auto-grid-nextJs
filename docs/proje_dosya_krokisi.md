# 🤖 Algoritmik Ticaret Botu (Grid Robot) Sistem Dokümantasyonu

Bu sistem, **Next.js 14+ (React/TypeScript)** frontend ve **Python FastAPI** worker (MT5 entegrasyonlu) mimarisinden oluşan bir **Algoritmik Ticaret (Algorithmic Trading) Botu** monorepo'sudur. Çoklu hesap, WebSocket tabanlı real-time iletişim ve dinamik state yönetimi desteklenmektedir.

---

## 📂 Proje Klasör Şablonu (Kroki)

📦 PROJE_KOK_DIZINI
┣ 📜 VERSION                    # Proje sürüm takip dosyası
┣ 📜 .gitignore
┣ 📜 .gitattributes
┃
┣ 📂 frontend_nextjs            # Next.js 14+ Frontend (React, TypeScript, Tailwind)
┃ ┣ 📜 package.json
┃ ┣ 📜 next.config.ts
┃ ┣ 📜 tsconfig.json
┃ ┣ 📜 eslint.config.mjs
┃ ┣ 📜 postcss.config.mjs
┃ ┣ 📜 AGENTS.md
┃ ┣ 📜 CLAUDE.md
┃ ┣ 📜 README.md
┃ ┣ 📂 public                   # Statik varlıklar (ikonlar)
┃ ┃ ┣ 📜 icon-192.png
┃ ┃ ┗ 📜 icon-512.png
┃ ┣ 📂 src
┃ ┃ ┣ 📂 app                    # App Router (Next.js 14+)
┃ ┃ ┃ ┣ 📜 layout.tsx           # Root layout
┃ ┃ ┃ ┣ 📜 page.tsx             # Ana sayfa (Dashboard)
┃ ┃ ┃ ┣ 📜 globals.css          # Global stiller (Tailwind)
┃ ┃ ┃ ┣ 📜 version.ts           # Sürüm bilgisi
┃ ┃ ┃ ┗ 📂 formasyon            # Formasyon sayfası
┃ ┃ ┃   ┗ 📜 page.tsx
┃ ┃ ┣ 📂 components             # React bileşenleri
┃ ┃ ┃ ┣ 📜 AccountSelector.tsx  # Hesap seçim
┃ ┃ ┃ ┣ 📜 BotControls.tsx      # Başlat/Durdur kontrolleri
┃ ┃ ┃ ┣ 📜 ChartViewer.tsx      # Grafik görselleştirme
┃ ┃ ┃ ┣ 📜 ConfirmModal.tsx     # Onay modalları
┃ ┃ ┃ ┣ 📜 LogViewer.tsx        # Log görüntüleyici
┃ ┃ ┃ ┣ 📜 SettingsForm.tsx     # Ayar formu
┃ ┃ ┃ ┗ 📜 SimulationBar.tsx    # Simülasyon çubuğu
┃ ┃ ┗ 📂 store                  # Zustand state management
┃ ┃   ┗ 📜 useBotStore.ts       # Bot durumu ve aksiyonlar
┃ ┗ 📂 .next                    # Build çıktısı (git-ignore)
┃
┣ 📂 worker_python              # Python FastAPI Worker (MT5 Entegrasyonu)
┃ ┣ 📜 main.py                  # FastAPI giriş noktası (WebSocket + REST)
┃ ┣ 📜 requirements.txt         # Python bağımlılıkları
┃ ┣ 📂 src
┃ ┃ ┣ 📂 api                    # API katmanı
┃ ┃ ┃ ┣ 📜 ws_server.py         # WebSocket sunucusu (Real-time iletişim)
┃ ┃ ┃ ┗ 📜 routes.py            # REST endpoint'leri
┃ ┃ ┣ 📂 core                   # Çekirdek ticaret mantığı
┃ ┃ ┃ ┣ 📜 auto_grid_engine.py  # Grid stratejisi motoru
┃ ┃ ┃ ┣ 📜 bot_runner.py        # Bot çalıştırma döngüsü
┃ ┃ ┃ ┗ 📜 indicator_calc.py    # Teknik indikatör hesaplamaları
┃ ┃ ┗ 📂 utils                  # Yardımcı modüller
┃ ┃   ┣ 📜 bot_manager.py       # Süreç yönetimi
┃ ┃   ┣ 📜 config.py            # Konfigürasyon okuma/yazma
┃ ┃   ┣ 📜 mt5_connection.py    # MT5 bağlantı yönetimi
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
┃ ┗ 📂 architecture             # Teknik mimari belgeleri
┃   ┗ 📜 genel_arch.md          # Genel mimari dokümantasyonu
┃
┗ 📂 .github                    # CI/CD
  ┗ 📂 workflows
    ┗ 📜 release.yml            # Release workflow

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

### 5. Dağıtım (Deployment)
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
2. **Metrik Akışı**: Worker (MT5) → `auto_grid_engine` → WebSocket broadcast → Frontend `useBotStore` günceller → UI yeniden render
3. **Ayar Değişikliği**: Frontend `SettingsForm` → REST `/api/settings` + WebSocket `update_settings` → Worker `config.py` kaydeder → Motor çalışma anında uygular
4. **Durum Kurtarma**: Worker başlangıçta `state_manager.py` ile MT5'ten açık pozisyon/emirleri çeker → `data/state_*.json` yeniden inşa edilir → Frontend'e `state_restored` eventi gönderilir