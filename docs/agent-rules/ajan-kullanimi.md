# Ajan kullanımı

Alt ajan ve iş akışı (Workflow) kullanımı az, rollere ayrılmış ve kullanıcının önceden gördüğü bir düzenle yapılır. Bu kurallar Ultracode açıkken ve mesajda "ultracode" geçtiğinde de geçerlidir. Ultracode'un "kapsamlı ol" talimatı ajan sayısını değil, her başlıktaki titizliği artırır.

## 1. Önce bütünün listesi

- Geniş bir iş başlamadan önce işin tamamı başlık listesine dökülür ve kullanıcıya gösterilir.
- Başlıklar sırayla ve her biri yalnız kendi küçük bağlamıyla incelenir. Bir başlığın sonucu kalıcı kayda yazılır, ardından sıradakine geçilir.
- Hiçbir ajana malzemenin tamamı tek seferde verilmez. Girdi, konulara bölünmüş dosyalar hâlinde verilir; tek parça büyük JSON prompt'a gömülmez.
- Liste kullanıcıyla birlikte daraltılabilir. Başlık sayısı, ajan sayısını belirlemez.

Gerekçe: Dil modelleri uzun bağlamın ortasındaki bilgiyi baştaki ve sondaki kadar iyi kullanamaz; küçük başlıklar "ortayı" ortadan kaldırır (Liu ve arkadaşları, "Lost in the Middle"). Bölümlenmiş bilgi hem insan hem model için daha az yük taşır (Sweller, bilişsel yük).

## 2. Başlamadan önce maliyet ve süre tahmini

Geniş bir işte, ajan kullanılsın ya da kullanılmasın, iş başlamadan önce şu tablo kullanıcıya sunulur ve onay alınır. Geniş iş: 20'den fazla araç çağrısı, beşten fazla dosya yazımı ya da ajan gerektiren iş. Ajan kullanılmayacaksa `Ajanlar` satırına "yok, ana sohbet" yazılır. Onay olmadan ajan başlatılmaz.

| Alan           | İçerik                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Ajanlar        | Sayı ve rol (araştırmacı, editör, denetçi, işçi)                                                                                |
| Girdi ve çıktı | Her ajanın okuyacağı dosyalar ve yazacağı dosya                                                                                 |
| Effort         | Ajan başına seviye                                                                                                              |
| Bütçe          | Ajan başına araç çağrısı üst sınırı                                                                                             |
| Sıra           | Eşzamanlı mı, sıralı mı                                                                                                         |
| Tahmin         | Süre, araç çağrısı ve token (yazılan çıktı ve her çağrıda yeniden okunan bağlam); bilinmiyorsa "bilinmiyor" yazılır, uydurulmaz |

- İş bitince gerçekleşen süre, araç çağrısı ve token oturum kaydından ölçülür ve tahminin yanına yazılır; sonraki tahmin bu ölçümlerle karşılaştırılarak verilir.
- Bağlamı büyümüş bir oturumda geniş işe başlanacaksa yeni oturum önerilir; her araç çağrısı biriken bağlamın tamamını yeniden okur.

Gerekçe: 3 Ekim 2026'da kullanıcıya gösterilmeden kurulan 46 ve 26 ajanlık iki iş akışı, kullanım limitini doldurdu ve kontrolü zorlaştırdı; maliyet işten önce görünür olmalıdır. Anthropic'in ölçümlerine göre çok ajanlı sistemler sohbete göre katlarca fazla token harcar (Anthropic, çok ajanlı araştırma sistemi). 6 Ekim 2026'da ajansız yapılan inceleme bölme işi tahminsiz başladı ve 28 dakika sürdü: 43 araç çağrısı, 187 bin çıktı tokenı; her çağrı ortalama 395 bin tokenlık bağlamı yeniden okudu (oturum kaydı ölçümü).

## 3. Ekip: en fazla 5 ajan, rollere göre

- Bir iş akışında en fazla 5 ajan çalışır. Daha fazlası gerekiyorsa gerekçesiyle ayrıca onay istenir.
- Roller sabittir:
  - Araştırmacı (1–2): web ve kod tabanından bilgi toplar.
  - Editör (1): bulguları tek belgeye yazar.
  - Denetçi (1): yazılanı kaynağa ve koda karşı sınar; çelişkiyi ve eksiği bulur.
  - İşçi (1): onaylanmış planı uygular; dosya taşıma, sayım, toplu düzenleme ve komut çalıştırma gibi mekanik işleri yapar. Karar vermez; planda olmayan bir durumda durur ve raporlar.
  - Koordinatör: ana sohbetteki Claude'dur. Sonucu ajanlar arasında taşır ve kullanıcıya gösterir.
- Aynı rol konu başına çoğaltılmaz; başlıklar aynı ajana sırayla verilir.
- Denetçinin bulgularını koordinatör uygular; ayrı bir rötuş ya da ikinci eleştiri ajanı açılmaz.
- Çoğu inceleme 1–3 ajanla yapılır. Tek ajanın yettiği işte ekip kurulmaz.

Gerekçe: Ekibe kişi eklemek iletişim ve eşgüdüm yükünü katlayarak artırır (Brooks, "The Mythical Man-Month"). Çok sayıda ajan aynı dosyaları tekrar tekrar okur, sonuçlar dağılır ve denetlenmesi zorlaşır.

## 4. Bağlam, effort ve bütçe

- Ortak bağlam bir kez özetlenir ve dosya olarak verilir; her ajan aynı dosyaları baştan taramaz.
- Ajan başına araç çağrısı bütçesi 20–30'dur. Aşılması gerekiyorsa ajan durur ve neden gerektiğini raporlar.
- Effort, modelin desteklediği seviyeler içinde role göre seçilir:
  - araştırmacı ve denetçi: `xhigh` (bulgunun ve doğrulamanın kalitesi bütün işi taşır);
  - editör: `high`;
  - işçi: `low`, gerekirse `medium`;
  - bunların dışında `xhigh`: yalnızca kullanıcı onayıyla.
- Model effort desteklemiyorsa effort yazılmaz; o rolün kalitesini model seçimi taşır.
- Rol başına model seçimi projenin kuralıdır. Proje model belirtmiyorsa ajan oturumun modelini kullanır.
- Ajan sonuçları kalıcı bir klasöre yazılır. Geçici klasör tek kayıt yeri olmaz.

Gerekçe: Bir ajanın her araç çağrısında o ana kadar biriken bağlamın tamamı yeniden gönderilir; bu yüzden maliyet adım sayısından hızlı büyür. 3 Ekim 2026'da ajan başına 35–60 adım ve devralınan `xhigh` ayarı, maliyetin ana nedeniydi.

## 5. Görünürlük ve dürüstlük

- Her aşamadan sonra sonuç kullanıcıya gösterilir; onay olmadan sonraki aşamaya geçilmez.
- İş durdurulursa son durum yüzdesiyle, kayıtlı sonuçların yeriyle ve neyin boşa gidip neyin korunduğuyla raporlanır.
- Ajan sayısını ve düzenini Claude belirler; bu kararın sahibi açıkça söylenir. Bir sınır ya da rehber aşıldıysa bu, sonradan değil, başlamadan önce söylenir.

Gerekçe: Kullanıcı ancak gördüğü maliyeti ve kararı yönetebilir; aşılan bir sınırın sonradan öğrenilmesi güveni zedeler (3 Ekim 2026'da varsayılan 10 ajan rehberi aşıldı ve bu açıkça söylenmedi).
