---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,py,go,rs,java,kt,swift,rb,php,cs,sql}"
---

# Tasarım ve sadelik

Kodu az, doğru ve okunur tutan ilkeler. Her projede geçerlidir.

**Durum:** Deneme (2026-10-03'ten beri). Bu kurallar kullanımda gözlenir; davranışı istenen yöne çevirmeyen ya da sürtünme yaratan madde değiştirilir veya çıkarılır. Değişiklik kullanıcıyla konuşularak yapılır.

## 1. Spekülatif kod

- Bugün çağıranı olmayan fonksiyon, parametre, seçenek, export ve dosya yazılmaz; ilk gerçek çağıranla aynı adımda gelir.
- Gelecekteki ihtiyaç kod olarak değil kayıt olarak yazılır: karar dosyası ya da bekleyen liste.
- Yeniden düzenleme, ad ve test bu kuralın dışındadır; kodu değiştirmeyi kolaylaştıran iş ertelenmez.
- Değişiklikle kullanılmaz hâle gelen kod aynı adımda silinir; yorum satırına alınmaz.
- Bir kararla bilerek tutulan kullanılmayan kod bu kuralın istisnasıdır; kararına bağlantı verilir.

Gerekçe: Varsayılan bir ihtiyaç için bugün yazılan kod, kullanılmadan önce bile taşıma bedeli üretir; YAGNI kodu değiştirmeyi kolaylaştıran çabaya uygulanmaz (Fowler, YAGNI).

## 2. Yanlış soyutlama

- Ortak koda yeni bir çağıran için bayrak, seçenek veya `if` dalı eklenmez. Ortak kod buna ihtiyaç duyuyorsa çağıranlara geri açılır; her çağıran yalnız kendi ihtiyacını taşır, ortak desen sonra yeniden aranır.
- Davranış seçen boolean parametre yazılmaz; iki ayrı ad yazılır. Veri olarak taşınan boolean (formdan gelen alan) bu kuralın dışındadır.
- Benzer görünen kod aynı kavramı anlatmıyorsa birleştirilmez; şüphede ayrı kalır.
- Birkaç satırlık bir kontrol veya yardımcı için yeni dosya, helper veya barrel açılmaz; kod kullanıldığı yerde yazılır.
- Üçlü kural: aynı desen üçüncü kez tekrarlandığında ayrıştırma önerilir ve onay istenir; yanlış çıkan ayrıştırma geri açılır.

Gerekçe: Yanlış soyutlama her yeni çağıranda parametre ve koşul biriktirir; tekrar, yanlış soyutlamadan çok daha ucuzdur (Metz, "The Wrong Abstraction"; Fowler, bayrak argümanı).

## 3. Derin modül

- Modülün arayüzü (export, parametre, seçenek) uygulamasından çok daha basittir; çağıran içini okumadan kullanır.
- Yalnız argümanını benzer imzalı başka bir fonksiyona geçiren fonksiyon yazılmaz. Paketin giriş kapısı (barrel) dışında yalnız yeniden export eden dosya açılmaz; aynı şeye iki yoldan girilmez.
- Değişmesi muhtemel bir karar (biçim, dönüşüm, dış servis ayrıntısı) tek fonksiyonda durur; ikinci yer onu adla çağırır, ifadeyi kopyalamaz.

Gerekçe: İyi modül basit arayüzün arkasında güçlü işlevi ve değişmesi muhtemel bir kararı saklar; aynı karar iki yerde durursa bilgi sızar (Ousterhout, derin modül; Parnas, bilgi gizleme).

## 4. Önce yapı, sonra davranış

- Yapı değişikliği (ad, taşıma, bölme, inline) ile davranış değişikliği aynı adımda yapılmaz. Önce yapı değişir ve doğrulama (tip, lint, test) yeşil biter; davranış sonraki adımda değişir.
- Yapı adımında test beklentisi değişmez; yalnız import yolu ve yeniden adlandırılan ad değişebilir. Beklenti değişiyorsa adım davranış adımıdır.
- Değişiklik zorsa önce kod değişikliği kolaylaştıracak biçime getirilir; ardından kolay değişiklik yapılır.
- Kırmızı biten adımın üstüne yeni değişiklik yığılmaz; önce o adım düzeltilir ya da geri alınır.
- Davranış adımında görülen düzenleme bekleyen listesine yazılır; o adıma karıştırılmaz.

Gerekçe: Düzenleme ile davranış değişikliği karışınca ikisi de zor gözden geçirilir ve geri alınır; önce değişikliği kolaylaştırmak, sonra kolay değişikliği yapmak bu yükü ayırır (Beck, "Tidy First?" ve iki şapka; Fowler, hazırlayıcı yeniden düzenleme).

## 5. Çit

- Amacı bilinmeyen kod, koşul, alan veya ayar silinmeden, sadeleştirilmeden ya da taşıma sırasında dışarıda bırakılmadan önce amacı aranır: kodun yanındaki not, karar kaydı, doc, çağıranlar.
- Amaç bulunursa korunur ya da gerekçesiyle değiştirilir. Bulunamazsa davranış korunur ve açık soru olarak kayda yazılır; sessizce atılmaz.
- "Eski kodda böyleydi" ne koruma ne silme gerekçesidir.
- Çağıranı olmadığı araçla gösterilen kod için ayrıca amaç aranmaz; çağıranın olmaması da bir nedendir.

Gerekçe: Bir çitin neden konduğu bilinmeden kaldırılmaz; ilke değişimi engellemez, değişimden önce anlamayı ister (Chesterton, çit ilkesi). Spekülatif kod kuralı yeni kodu, bu kural var olanın silinmesini sınırlar.

## 6. Sadelik ölçüsü

- Kod bu sırayla tartılır: testler geçer, niyet okunur, tekrar yok, en az parça. Okunurluk ile tekrar çatışınca okunurluk kazanır.
- İç içe üçlü ifade, yan etkili ifade ve tip düzeyinde bulmaca yazılmaz; açık adımlara bölünür. Tip hüneri gerekiyorsa tek dosyada kalır, yanında tek satırlık neden yorumu durur.

Gerekçe: Basit tasarımın kuralları sırayla uygulanır ve çatışmada okuyana duyulan empati kazanır; hata ayıklamak yazmaktan zor olduğundan en zekice yazılan kod ayıklanamaz (Beck, basit tasarımın dört kuralı; Kernighan ve Plauger, "The Elements of Programming Style").

## 7. Konum bağı

- Aynı tipte üç ya da daha fazla parametre konumla alınmaz; nesne parametresi alınır. Farklı tipli parametreler konumla kalabilir.

Gerekçe: Konum bağı ad bağından güçlüdür; yeri değişen aynı tipteki iki argümanı derleyici yakalamaz (Page-Jones, connascence).

## 8. Bir ad, tek kavram

- Bir ad tek kavrama aittir; aynı pakette iki ayrı işe aynı ad verilmez. Aynı kavramın her yerde aynı adla anılması kuralının karşı yönüdür.

Gerekçe: Ortak ad başka bir amaç için kullanılınca okuyan hangisinin kastedildiğini çıkaramaz; bu belirsizlik karmaşıklığın iki kaynağından biridir (Ousterhout, tutarlı adlandırma).

## 9. Ölçüm

Performans gerekçesiyle kod karmaşıklaştırılmadan önce ölçülür. Ölçüm yoksa en sade doğru çözüm yazılır.

- Ölçüm komutu ve sonucu karar kaydına ya da değişikliğin açıklamasına yazılır.
- Performans sayısı (havuz boyutu, eşzamanlılık, önbellek süresi, zaman aşımı) yanında ölçüm ya da kaynakla yazılır.
- Maliyeti baştan belli olan hata (N+1 sorgu, sınırsız liste, istek yolunda ağır hesap) tasarımda önlenir; "erken optimizasyon" bunu ertelemenin gerekçesi değildir.

Gerekçe: Darboğazın yeri tahmin edilemez, ölçülmeden hız için kod değiştirilmez; küçük verimlilikler çoğu zaman göz ardı edilir ama kritik yüzde 3'teki fırsat kaçırılmaz (Pike, "Notes on Programming in C", kural 1–2; Knuth, 1974, erken optimizasyon).
