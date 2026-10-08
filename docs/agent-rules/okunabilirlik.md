---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,py,go,rs,java,kt,swift,rb,php,cs,sql}"
---

# Okunabilirlik

Ölçüt, başka birinin kodu anlama süresidir; daha az satır bu ölçütün altında kalır. Her projede geçerlidir.

**Durum:** Deneme (2026-10-04'ten beri). Bu kurallar kullanımda gözlenir; davranışı istenen yöne çevirmeyen ya da sürtünme yaratan madde kullanıcıyla konuşularak değiştirilir veya çıkarılır.

## 1. Çağrı yeri

- Rolü çağrı yerinde okunmayan parametre adlı alanla verilir: isteğe bağlı mod, hariç tutma, aynı tipte ardışık değer. Proje alanları snake_case istiyorsa adlı alan da öyle yazılır.
- Veriden olduğu gibi aktarılan boolean değer adlı alanla verilir: `book(customer, { premium })`.

Gerekçe: Çağrıda çıplak `true` ya da rolü belirsiz bir değer gören okuyucu anlamı bulmak için tanıma gitmek zorunda kalır; API çağıranın okumasına göre tasarlanır (Fowler, bayrak argüman; Boswell ve Foucher, okunabilirliğin temel teoremi).

## 2. Yorum

- Yorum, koddan hızla çıkarılamayanı yazar: neden, kısıt, tuzak, bilinçli sapma. Kodu tekrar eden yorum yazılmaz.
- Kötü ad yorumla örtülmez; ad düzeltilir.
- Bilinçli sapma tek satırla gerekçelendirilir: yutulan hata, kasıtlı aynı cevap, sıra bağımlılığı.
- Kod, ad veya yol değişince ona değinen yorum aynı değişiklikte güncellenir. Var olmayan dosyaya işaret eden yorum bırakılmaz.
- Yoruma alınmış kod bırakılmaz.

Gerekçe: Koddan çıkarılabilen bilgiyi tekrar eden yorum okuma süresini uzatır, kodla güncellenmeyen yorum yanlış bilgiye döner; nedeni ve tuzağı ise yalnız yorum taşıyabilir (Boswell ve Foucher, ne yorumlanmalı; Ousterhout, yorumlar).

## 3. Ara değişken ve ad

- İş kuralı taşıyan ya da `&&` ile `||` karıştıran koşul, kuralı söyleyen bir değişkene alınır.
- Boolean ad doğru/yanlış sorusu olarak okunur: `found`, `isExpired`, `userOwnsDocument`. Emir kipi (`activate`), içi boş ad (`ok`, `flag`, `status`) ve olumsuz ad (`notFound`) yazılmaz. Ayar bayrağı durumu söyler: `cacheEnabled`.
- Değerin türünü yanlış söyleyen ad yazılmaz: ayar nesnesine liste adı, sayıya kayıt adı verilmez.

Gerekçe: Çalışma belleği üç ile beş anlamlı parçayla sınırlıdır; adlandırılmış ara değişken okuyucunun taşıdığı terimleri tek kavrama indirir, doğru/yanlış okunan ad da koşulu yeniden çözmeyi gereksiz kılar (Cowan, çalışma belleği sınırı; Boswell ve Foucher, özet değişken; Hilton ve Hermans, boolean ad).

## 4. Akış

- Ön koşul ve istisnai durum fonksiyonun başında erken dönüşle elenir. Ana yol en sonda ve girintisiz okunur.
- Eşit ağırlıktaki iki yol koruma sayılmaz; ikisi aynı düzeyde, tek koşulla yazılır.
- `return` ya da `throw` ile biten dalın ardından `else` yazılmaz.

Gerekçe: Koruma cümlesi istisnai durumu ana yoldan ayırır; iç içe her yapı anlama maliyetine ek puan eklerken erken dönüş eklemez (Fowler, koruma cümlesi; Campbell, bilişsel karmaşıklık).
