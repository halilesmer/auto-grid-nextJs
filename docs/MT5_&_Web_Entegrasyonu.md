Aşağıda sistemin baştan sona tüm detaylarını içeren, GitHub'a veya bilgisayarına doğrudan `.md` formatında kaydedebileceğin kapsamlı teknik mimari ve kurulum planı yer almaktadır.

# Auto Grid: MT5 & Web Entegrasyonu Master Planı

## 1. Sistem Mimarisi Özeti

Sistem; geliştirme, sunucu ve arayüz olmak üzere 3 ana ayaktan oluşur. Dünyanın her yerinden güvenle erişilebilir ve yönetilebilir.

| Bileşen | Platform/Araç | Görev |
| --- | --- | --- |
| **Geliştirme** | MacBook | Kod yazımı, yerel testler, GitHub'a push işlemi. |
| **Frontend** | Vercel (Next.js) | Kullanıcı arayüzünü barındırma, GitHub'dan otomatik build. |
| **Backend** | Windows VPS | Python (FastAPI), MetaTrader 5 ve işlem mantığı. |
| **Köprü** | Ngrok | HTTPS üzerinden VPS'e güvenli bağlantı (Domain gerektirmez). |

## 2. Güvenlik Katmanları (Çift Katmanlı Koruma)

Sistemin internete açık olması, herkesin erişebileceği anlamına gelmez.

* **Frontend Koruması (Login):** Next.js tarafında basit bir şifreleme/giriş ekranı bulunur. Şifre girilmeden dashboard yüklenmez.
* **Backend Koruması (API Key):** Vercel üzerinden VPS'e giden tüm HTTPS isteklerinin başlığında (Header) gizli bir `API_KEY` gönderilir. Dışarıdan veya Postman ile Ngrok linkine gelen isimsiz/şifresiz istekler Python tarafından `401 Unauthorized` ile doğrudan reddedilir.

## 3. Geliştirme ve Canlı Test Ortamı (MacBook)

MacBook'ta kod yazarken build almadan doğrudan Windows'taki gerçek MT5 verileriyle test yapılır.

* MacBook'ta projeyi `npm run dev` ile başlatırsın.
* Proje kök dizinindeki `.env.local` dosyasına VPS'te çalışan Ngrok linkini girersin:
```env
NEXT_PUBLIC_API_URL=https://senin-ngrok-linkin.ngrok-free.app
NEXT_PUBLIC_API_KEY=gizli_sifren_123

```


* Butonlara bastığında istekler lokal arayüzden çıkıp doğrudan VPS'teki MT5'e gider ve sonuç döner. Çalıştığından emin olunca `git push` ile kodu GitHub'a gönderirsin.

## 4. Backend Kurulumu ve Bağlantı (Windows VPS)

VPS, sistemi ayakta tutan ana motordur.

* **Gereksinimler:** Python, Git, MetaTrader 5 ve Ngrok kurulur.
* **Sunucu Başlatma:** Proje klonlanıp paketler kurulduktan sonra FastAPI şu komutla başlatılır: `uvicorn main:app --port 8000`
* **Ngrok Köprüsü:** Terminalden `ngrok http 8000` komutu çalıştırılarak dış dünyaya güvenli HTTPS adresi açılır.
* **Otomatik Güncelleme (Webhook):** Python koduna gizli bir uç nokta (örneğin `/api/update`) eklenir. MacBook'tan bu uç noktaya istek atıldığında, VPS içindeki bir bat dosyasını tetikler. Bu dosya `git pull origin main` yapar ve FastAPI sunucusunu yeniden başlatır. Böylece durduk yere bağlantı kopmaz, sadece sen istediğinde güncellenir.

## 5. Frontend CI/CD Yayını (Vercel)

Arayüzün kodlandığı kısmın otomatik güncellenmesi ve dünyaya açılması sağlanır.

* GitHub'daki repository Vercel'e eklenir.
* **Root Directory:** Frontend klasörü (örneğin `frontend_nextjs`) olarak seçilir.
* **Çevre Değişkenleri:** Vercel paneli "Environment Variables" sekmesine VPS'e bağlanan bilgiler girilir:
```env
NEXT_PUBLIC_API_URL=https://senin-ngrok-linkin.ngrok-free.app
NEXT_PUBLIC_API_KEY=gizli_sifren_123

```


* **Sonuç:** MacBook'ta `git push origin main` yaptığın an, Vercel kodu derler (Build) ve arayüz saniyeler içinde yeni versiyonuyla dünya çapında yayına girer.








Mac'te kodu yaz ve kaydet.

Mac'te git push yap.

Windows VPS'te git pull yap ve Uvicorn'u yeniden başlat.