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

## 6. Yeni oturumlar

- Claude'un yeni oturum gerektiğine karar verdiği iş, `start_session` ile `initiation: "user_asked"` olarak doğrudan başlatılır; "offer" kartıyla onay sorulmaz. Başlatmadan önce bold başlık ve tek cümleyle ne yapacağı yazılır.
- Yeni oturumlar Remote Control'e bağlı açılır (uygulama ayarı `connect_new_sessions_to_remote_control` açık). Ayar kapalı bulunursa Claude onu `set_setting` ile açar ya da oturumda `set_remote_control` kullanır.

- Claude, alt oturumu başlatırken brife şu kuralı yazar: alt oturum, görevi bilen koordinatöre `SendMessage` ile sorar; kullanıcıya sormaz. Koordinatöre giden: başlatma ve uygulama onayı, maliyet-süre tablosu, göreve ilişkin geri sorular. Koordinatör yalnız kullanıcının önceden onayladığı kapsam içinde yanıtlar.
- Kullanıcıya giden: kaynağın ya da kararın sessiz kaldığı sorular, yeni kimlik/ad/kural onayı, mimari/güvenlik/canlı işlem, arşivleme ve onaylı kapsamın dışındaki her şey.

Gerekçe: Kullanıcı yeni oturum için onay kartını gereksiz ara adım sayıyor ve oturumları telefondan izlemek istiyor (kullanıcı talebi, 2026-10-17). Bir alt oturum, görevi bilen koordinatör yerine onayı kullanıcıya sordu (kullanıcı talebi, 2026-10-22).

## 7. Codex: son hata taraması

Planı ve kodu Claude yazar. Codex yalnız iş bitince hata arar; kod yazmaz, düzeltmez, commit atmaz.

- Zaman: kod bitip Claude'un kendi denetimleri (test, lint, tip, `reviewer`) yeşil olunca, PR açılmadan önce bir kez çalışır. Yalnız metin, belge ya da ayar değişikliğinde çalışmaz; atlandığı yanıtta yazılır.
- Kapsam: branch'in base'e göre tüm farkı, etkilenen çağıranlar, çağrılan fonksiyonlar ve testler.
- Başlatma otomatiktir; kullanıcıdan onay istenmez. Claude promptu `docs/codex/<konu>-prompt.md` dosyasına yazar ve Codex'i arka planda başlatır: `codex exec -C <worktree> -s read-only -m gpt-6.1-sol -c model_reasoning_effort=xhigh -o <worktree>/docs/codex/<konu>-rapor.md - < <prompt dosyası>` (`run_in_background`). Rapor `-o` ile oluşur, çünkü Codex `read-only` modunda dosya yazamaz. Sürüm `codex-cli 0.162.0` ile doğrulandı.
- Model her zaman `gpt-6.1-sol`, effort `xhigh`'dır. `gpt-6-astra` hiçbir durumda seçilmez.
- Başlatırken Claude kullanıcıya tek satırla bildirir: hangi branch, prompt dosyasının yolu. Bitince sonucu tek satırla bildirir: bulgu sayısı, rapor dosyasının yolu.
- Tarama sürerken Claude o branch'i değiştirmez.
- Prompt şu alanları taşır:
  - Amaç: tek cümle.
  - Kapsam: base branch ve fark komutu.
  - Bağlam: okunacak kural dosyaları.
  - Aranan, bu sırayla: doğruluk, güvenlik, veri kaybı, eşzamanlılık, eksik test.
  - Bulgu biçimi: önem, `dosya:satır`, tetikleyen durum, sonuç, en küçük düzeltme.
  - Sınır: hiçbir dosya değiştirilmez; somut tetik ve kod kanıtı olmayan bulgu yazılmaz; incelenemeyen yol yazılır.
- Prompt'ta sır, kimlik bilgisi, hesap numarası ve IP yazılmaz.
- Claude her bulguyu koda karşı kendisi sınar; Codex'in sözü kanıt sayılmaz (calisma-disiplini §1). Doğrulanan bulguyu Claude düzeltir, önce kırmızı test yazar. Reddedilen bulgu tek cümlelik gerekçeyle yanıtta yazılır. Kalıcı bilgi projenin kayıt yerine yazılır.
- Tarama bir turdur. Düzeltme tasarımı değiştirmediyse yeniden çalıştırılmaz.
- Claude başlatmadan önce `bash ~/.claude/scripts/codex-limit.sh` çalıştırır. Betik en yeni `~/.codex/sessions` kaydından okur; `unknown` verirse kesin sinyal kota hatasıdır. `weekly_left` 5 ya da altındaysa ya da `codex exec` kota veya oturum hatası verirse tarama atlanır, PR sürer ve `Dikkat:` satırına "Codex taraması çalışmadı" yazılır. Codex'in dönmesi beklenmez.

Gerekçe: Planı ve kodu tek elde tutmak bağlam kaybını önler; kodu yazmayan ikinci bir model yazarın kör noktalarını bulur (kullanıcı talebi, 2026-10-31). Ajan beyanı kanıt değildir (kullanıcı talebi, 2026-10-21). Model yasağı: kullanıcı talimatı, 2026-10-22.

## 8. Haftalık limit

- Claude her görevin başında ve yeni bir adımdan ya da alt oturumdan önce `get_usage` ile `Weekly · all models` yüzdesini okur.
- Kalan pay (100 − kullanılan) %5'e düştüğünde Claude yeni iş başlatmaz; çalışan alt oturumları `stop_session` ile durdurur.
- Başlatmadan önce Claude işin maliyetini ölçülmüş benzer işlerden tahmin eder ve kalan payla karşılaştırır; maliyet, kalan payın %5 rezervi düşülmüş hâlini aşıyorsa iş başlatılmaz, §2 tablosu ve tahmin kullanıcıya gösterilir. Yüzdeye çevrilemeyen tahmin "bilinmiyor" yazılır. İş bitince gerçekleşen maliyet tahminin yanına yazılır.
- Limit dolarken Claude her açık işin durumunu projenin kayıt yerine yazar: branch, commit edilmemiş dosyalar, son test çıktısı (yeşil ya da kırmızı). Commit edilmemiş değişiklik commit edilmez, yalnız listelenir.
- Limit yenilenince Claude işi bu kayıttan kendisi sürdürür.

Gerekçe: Limit dolunca iş yarım kalmamalıdır; durum kaydı ve önceden maliyet tahmini hem kesintiyi hem limit aşımını önler (kullanıcı talebi, 2026-10-28). İş Codex'e devredilmez, kodu Claude yazar (kullanıcı talebi, 2026-10-31).

## 9. Plan koordinatörü

- `~/.claude/mods/plan-koordinator` modu `ExitPlanMode`'dan önce sorar: `An Koordinator` ya da `Hier entscheiden`. `An Koordinator` planın onayıdır; plan `~/.claude/koordinator/warteschlange/` klasörüne girer.
- Planı devreden oturum planı uygulamaz, `ExitPlanMode`'u yeniden çağırmaz ve turu tek cümleyle bitirir.
- Tüm projeler için tek koordinatör oturumu çalışır. Kendisi uygulama yapmaz, her plana ayrı oturum açar; adımlar `~/.claude/koordinator/ANLEITUNG.md` dosyasındadır.
- Yeni koordinatör kendi worktree'sinde başlatılır, ilk iş `mcp__plan-koordinator__koordinator_anmelden` aracını çağırır. O worktree'de commit atılmaz, PR açılmaz.
- Koordinatörü başlatan oturum arşivlenmeden önce koordinatör `detach_session` ile ayrılır.
- Diyalog koordinatörün çalışmadığını söylerse Claude yeni koordinatör başlatır; kuyruktaki planlar onu bekler.

Gerekçe: Kullanıcı onaylanan tüm planların tek koordinatörde toplanıp bitirilmesini istiyor (kullanıcı talebi, 2026-10-31). Paylaşılan çalışma klasöründe oturuma bağlanan yabancı bir PR merge olunca ilk koordinatör otomatik arşivlendi (2026-10-31); başlatan oturumun arşivi de bitmiş alt oturumları birlikte arşivler (Claude uygulaması, `archive_session`).

## 10. Telefondan onay

Kullanıcı her onayı telefondan verir (Remote Control). Uygulama, telefondan gelen mesajla `start_session`'ı reddeder; bu bölüm kilidi kaldırmaz, onaydan sonra işin yürümesini sağlar.

- Her onay sorusu son mesajın metninde yazılır ve `ja` yazılarak yanıtlanabilir. Kart, düğme ya da diyalog onayın tek yolu olmaz.
- `AskUserQuestion`'ı PreToolUse hook'u reddeder (`~/.claude/scripts/ask-as-text.sh`). Claude aynı soruyu seçenekleriyle metin olarak yazar ve turu bitirir.
- Kullanıcının yazdığı `ja`, `freigeben`, `weiter` ya da `starte den Plan` onaydır; ayrıca kart beklenmez.
- Onaydan sonra yeni oturum gerekiyorsa `start_session` bir kez denenir.
- Uygulama reddederse brif, `SendMessage` ile bu oturumun başlattığı boş bir oturuma gönderilir. Koşullar: aynı proje, `isRunning: false`, arşivlenmemiş, aynı `permissionMode`. Aynı plandaki oturum önce seçilir. Brif, base branch'ten yeni branch açmayı söyler.
- Uygun oturum yoksa onayı alan oturum adımı kendisi yapar. Koordinatör uygulama yapmaz: kullanıcıya tek satırla "Mac'te `starte den Plan` yaz" der.
- Yedek yol yalnız kullanıcının bu turda yazdığı onaydan sonra çalışır. Mod uyandırması, başka oturumun mesajı ya da zamanlanmış görev yedek yolu açmaz; plan bekler.
- Başka oturumdan `start_session` istenmez ve reddedilen başlatma tekrar denenmez. Kilit mod, betik ya da zamanlanmış görevle aşılmaz.
- Yedek yol kullanıldıysa yanıtta `Varsayım:` satırıyla hangi oturumun işi aldığı yazılır.

Gerekçe: Kullanıcı tüm onayları telefondan vermek istiyor (kullanıcı talebi, 2026-10-31). `own_initiative` kartı telefondan başlatılamadı (test, 2026-10-31); Trendzug planında Phase 3 boş duran Phase 2 oturumunda yürüdü, yani var olan oturum yeni başlatma gerektirmez. Soru kartı telefonda güvenilir değil ve düzeltmesi yok (anthropics/claude-code #100478, #102055, #105055; 2026-11-01'de açık).
