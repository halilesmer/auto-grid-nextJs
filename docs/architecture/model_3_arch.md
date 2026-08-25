# Model 3
Model 3, "Çoklu-Bölge (Multi-Zone), Çift Yönlü (Hedge) ve Akıllı Güvenlik (Smart SL)" prensipleri üzerine inşa edilmiş gelişmiş bir algoritmik ticaret motorudur. Mimari yapı 4 temel katmandan oluşur:

1. Kullanıcı Arayüzü Katmanı (UI Katmanı)
Kullanıcının bot ile etkileşime girdiği ve stratejisini belirlediği yerdir. Artık settings_panel.py dosyasının şişmesini engellemek için components/model3_settings.py adında bağımsız bir modül olarak çalışır.

Dinamik ve Genişleyebilir Kartlar: Her bir işlem bölgesi, ekranı boğmamak için açılır-kapanır (expander) kartlar şeklinde tasarlanmıştır.

Bağımsız Yön Seçimi: Kullanıcı bir bölgeyi sadece BUY, sadece SELL veya BOTH (İki Yönlü) olarak ayarlayabilir.

Asimetrik Strateji: BUY ve SELL için tamamen birbirinden bağımsız risk ayarları (farklı grid adımı, farklı lot, farklı kâr al ve farklı klasik SL) girilebilir.

Akıllı Güvenlik Paneli: Zaman dilimi (Timeframe) seçimi ve "SL Olunca Bölgeyi Yak" (Burn on SL) özellikleri doğrudan buradan yönetilir.

2. Veri ve Hafıza Katmanı (JSON Katmanı)
Arayüzde belirlenen tüm bu stratejiler settings_model3.json dosyasına kaydedilir. Bu dosya sadece bir ayar dosyası değil, aynı zamanda botun kalıcı hafızasıdır.

Eğer bir bölgede Stop Loss tetiklenir ve bölge "yanarsa", motor bu dosyadaki o bölgenin is_burned (yandı) değerini True olarak günceller.

Böylece elektrik gitse, bilgisayar kapansa veya bot yeniden başlatılsa bile, bot o bölgenin "yandığını" hatırlar ve oradan tekrar işlem açmaz.

3. Çekirdek Karar Motoru (Core Logic)
Botun piyasa verilerini okuduğu, kararlar aldığı ve MT5 terminaline emir gönderdiği ana beyindir (core/model_3.py). Motor her döngüde (örneğin saniyede bir) şu adımları izler:

Bölge Tarama: Fiyatın hangi dinamik bölgede olduğunu bulur. Eğer bölge yanmışsa (is_burned: True) orayı tamamen görmezden gelir.

Akıllı SL (Mum Kapanışı) Kontrolü: Belirtilen zaman diliminin (örn. H4) son kapanmış mumunu MT5'ten çeker. Mum kapanışı bölgenin dışındaysa ve işlemlerde zarar varsa, zarardaki işlemleri piyasa fiyatından anında kapatır.

Klasik SL Kontrolü: Fiyat, kullanıcının belirlediği manuel SL seviyesine değmiş mi diye bakar.

Bölge Yakma (Burn Zone) İnfazı: Herhangi bir SL durumu gerçekleştiyse; o bölgenin bekleyen tüm robot emirlerini siler, bölgeyi deaktif eder ve JSON dosyasına "Bu bölge yandı" bilgisini yazar.

Çift Yönlü Ağ (Dual-Grid) Örümü: Eğer SL durumu yoksa, fiyatın bulunduğu bölge sınırları içerisinde hem yukarıdan aşağı (BUY) hem de aşağıdan yukarı (SELL) kullanıcının girdiği farklı grid adımlarına göre eksik emirleri tamamlar.

4. Orkestratör ve Entegrasyon Katmanı
Tüm bu parçaları bir araya getiren ana gövdedir (app.py).

Motor Seçici: Kullanıcı arayüzden "Model 3"ü seçtiğinde, diğer motorları (Model 1 ve 2) uykuya alır ve model_3.py motorunu aktif eder.

Çoklu İş Parçacığı (Threading): Arayüzün donmaması için Model 3'ün ana döngüsünü arka planda ayrı bir thread (iş parçacığı) olarak çalıştırır.

Canlı Monitör: Motorun MT5'ten çektiği açık pozisyon, anlık kâr/zarar ve bekleyen emir sayılarını saniyede bir arayüze basarak canlı bir dashboard deneyimi sunar.

Özetle Model 3; arayüzü modüler, hafızası kalıcı ve çekirdeği tamamen esnek, çok yönlü bir savaş makinesi olarak tasarlanmıştır.



