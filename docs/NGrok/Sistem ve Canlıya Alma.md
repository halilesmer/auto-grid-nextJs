C:\ngrok\ngrok.exe http 8000 --domain=tweet-overlying-monotone.ngrok-free.dev



Şu an sistemin 2 kritik bileşeni VPS üzerinde aktif ve hazır:

Ngrok Tüneli (Pencere 1): [https://tweet-overlying-monotone.ngrok-free.dev](https://tweet-overlying-monotone.ngrok-free.dev) adresini 8000 portuna bağlıyor.

FastAPI Sunucusu (Pencere 2): Application startup complete. ibaresiyle arka planda çalışıyor.

https://tweet-overlying-monotone.ngrok-free.dev/docs



# Auto Grid - Sistem ve Canlıya Alma (Deployment) Rehberi

## 1. Sistem Mimarisi ve Canlı Adresler

| Bileşen | Çalıştığı Yer | Görevi / Adres |
| :--- | :--- | :--- |
| **Ön Yüz (Frontend)** | Vercel | `https://auto-grid-next-js.vercel.app` |
| **Tünel (Ngrok)** | VPS ↔ İnternet | `https://tweet-overlying-monotone.ngrok-free.dev` |
| **Arka Yüz (Backend)** | Windows VPS | FastAPI (Uvicorn) - Port: `8000` |
| **Borsa Motoru** | Windows VPS | MetaTrader 5 (MT5) |

---

## 2. Vercel Dashboard Yapılandırması (Project Settings)

Vercel paneli üzerinde yapılması gereken ve sorunsuz derlemeyi sağlayan ayarlar:

* **Framework Preset:** `Next.js`
* **Root Directory (Kök Dizin):** `frontend_nextjs`
* **Include files outside the root directory:** `Enabled` (Açık)
* **Environment Variables (Çevre Değişkenleri):**
  * **Key:** `NEXT_PUBLIC_API_URL`
  * **Value:** `https://tweet-overlying-monotone.ngrok-free.dev`

---

## 3. Kod ve Depo Düzenlemeleri (Repository Updates)

### A. `.vercelignore` Dosyası (Proje Kök Dizininde)
Vercel'in Linux sunucularında Windows'a özel Python paketlerini (`metatrader5` vb.) kurmaya çalışıp derleme hatası vermesini önlemek için eklendi:

```text
requirements.txt
worker_python/

```

### B. Dinamik API Bağlantısı (`frontend_nextjs/src/app/page.tsx`)

Sabit `localhost` adresi yerine ortam değişkeni (env variable) kullanacak şekilde güncellendi:

```typescript
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

```

### C. Yapılandırma Temizliği

Vercel panelinden *Root Directory* `frontend_nextjs` seçildiği için dizin çakışmasına neden olan kök dizindeki `vercel.json` dosyası silindi.

---

## 4. VPS Servis Başlatma Komutları

Windows VPS üzerinde botun çalışması için aşağıdaki iki servisin aktif olması gerekir:

### Terminal 1: FastAPI Sunucusu

```cmd
cd C:\path\to\auto-grid-nextJs\worker_python
python -m uvicorn main:app --host 127.0.0.1 --port 8000

```

### Terminal 2: Ngrok Tüneli

```cmd
ngrok http 8000 --domain=tweet-overlying-monotone.ngrok-free.dev

```

---

## 5. Doğrulama ve API Testleri

Tünelin ve VPS servislerinin çalıştığını doğrulamak için kullanılabilecek uç noktalar:

* **Swagger UI:** `https://tweet-overlying-monotone.ngrok-free.dev/docs`
* **Platform Kontrolü (cURL Testi):**
```bash
curl -X 'GET' \
  '[https://tweet-overlying-monotone.ngrok-free.dev/api/system/platform](https://tweet-overlying-monotone.ngrok-free.dev/api/system/platform)' \
  -H 'accept: application/json'

```


*Beklenen Yanıt:* `{"platform": "win32", "is_windows": true}`

```

```