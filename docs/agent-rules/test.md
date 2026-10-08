---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,py,go,rs,java,kt,swift,rb,php,cs,sql}"
---

# Test

Bir testin "geçiyor" demesinin gerçekten bir şey kanıtlaması. Her projede geçerlidir.

**Durum:** Deneme (2026-10-04'ten beri). Bu kurallar kullanımda gözlenir; davranışı istenen yöne çevirmeyen ya da sürtünme yaratan madde kullanıcıyla konuşularak değiştirilir veya çıkarılır.

## 1. Kırmızıyı görmek

- Yeni test bir kez kırmızı görülür: hata düzeltmesinde düzeltmeden önce, yeni davranışta kod yazılmadan önce. Kırmızı görülemiyorsa kod geçici olarak bozulur; test yine yeşil kalıyorsa hiçbir şeyi doğrulamıyordur.
- Beklenen değer test edilen kodun kendi çıktısından kopyalanmaz; şartnameden, kayıtlı karardan, eski sistemin davranışından veya elle hesaptan yazılır. Eski sistemin gözlenen çıktısını bilerek kaydeden karakterizasyon testi bu kuralın istisnasıdır.
- Kırmızı test kestirme yolla yeşile çevrilmez; önce yanlış olan taraf adlandırılır (test, kod ya da kural).

Gerekçe: Hesaplanan değeri beklenene kopyalamak testin çift kontrol değerini yok eder; kod bozulduğunda kırılmayan test eksik testtir (Beck, Canon TDD; Stryker, mutasyon testi).

## 2. Gözlenen sonuç

- Test, kodu kullanıcısının çağırdığı kapıdan çağırır ve dışarıdan görülen sonucu doğrular: dönüş değeri, kalıcı durum, dışarı giden mesaj. Özel fonksiyon ve iç çağrı sırası doğrulanmaz.
- Uygulamanın tek başına eriştiği veritabanı ve önbellek testte gerçek çalışır. Mock, başka sistemlerin de gördüğü dış sınırda (e-posta, ödeme, push) kullanılır ve orada giden mesaj doğrulanır.

Gerekçe: Etkileşimi doğrulayan test sonuca değil yola bağlanır ve davranış değişmeden yapılan düzenlemede de kırılır (Khorikov, "When to Mock"; Software Engineering at Google, bölüm 12–13).

## 3. Okunur ve kararlı test

- Beklenen değer literal yazılır. Beklentiyi hesaplayan döngü, koşul veya üretim kodu çağrısı testte olmaz; döngü yalnız gerçek değeri toplar.
- Test adı davranışı ve sonucu söyler ("süresi geçmiş bağlantı reddedilir"); fonksiyon adı test adı olmaz.
- Test gövdesindeki tekrar okunurluk için kabul edilir; üçlü kural testte gevşer. Yalnız iddiaya girmeyen kurulum yardımcıya taşınır.
- Saat sabitlenir, rastgele girdi tohumla tekrarlanır, bekleme bir koşula bağlanır. Test başka testin verisine ve sırasına dayanmaz.

Gerekçe: Mantık içeren test kendi testine ihtiyaç duyar ve kararsız testler güveni hızla yitirir (Kuefler, Software Engineering at Google bölüm 12, "DAMP, Not DRY"; Fowler, "Eradicating Non-Determinism in Tests").
