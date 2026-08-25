🎯 PROMPT BAŞLANGICI (KOPYALANACAK KISIM)
Görev Tanımı:
Streamlit ve MetaTrader 5 (MT5) Python API kullanılarak geliştirilen mevcut bir "Grid Ticaret Robotu" projesine, "Model 2" adında gelişmiş, yarı-otomatik ve çoklu bölge (multi-zone) destekli yeni bir ticaret motoru entegre edilecektir. Model 1 kodları ve yapısı halihazırda sorunsuz çalışmaktadır ve kesinlikle bozulmamalıdır. Model 2, Model 1'den tamamen izole edilmiş bir dosya (core/model_2.py) olarak yazılacak ve UI (Arayüz) üzerinden dinamik olarak seçilebilecektir.

Aşağıda Model 2'nin UI, Backend ve Algoritma kuralları en ince ayrıntısına kadar listelenmiştir. Lütfen kodlamayı bu kuralların dışına kesinlikle çıkmadan gerçekleştirin.

📌 BÖLÜM 1: ALTIN KURALLAR (KESİNLİKLE İHLAL EDİLEMEZ)
Kural 1 (Açık İşlem Koruması): Model 2, tıpkı Model 1 gibi, MT5 üzerindeki açık pozisyonları (aktif işlemleri) KESİNLİKLE KAPATAMAZ. Kodun içinde close_position veya piyasa emrini kapatacak herhangi bir fonksiyon/komut bulunmayacaktır.

Kural 2 (Sadece Bekleyen Emirler): Robot sadece "Bekleyen Emir" (Pending Order -> Buy Stop, Sell Stop, Buy Limit, Sell Limit) dizebilir, uzakta kalan/gereksiz bekleyen emirleri silebilir ve açılan işlemlere Kar Al (TP) / Zarar Kes (SL) atayabilir.

Kural 3 (Dosya İzolasyonu): Model 1 ve Model 2 kodları asla aynı dosyanın içinde olmayacaktır. Model 1 (core/model_1.py) olduğu gibi kalacak, Model 2 için core/model_2.py oluşturulacaktır.

📌 BÖLÜM 2: ARAYÜZ (UI) VE VERİ YÖNETİMİ
Streamlit arayüzü (app.py, controls.py, settings_panel.py), kullanıcının seçtiği modele göre şekil değiştirecektir.

Dinamik Motor Seçimi: Arayüzde robot başlatılmadan önce seçilebilecek bir "Motor Seçimi" (Model 1 / Model 2) Dropdown/Selectbox menüsü olacaktır. Robot çalışırken bu menü inaktif (disabled) olacaktır.

Ayarların Ayrıştırılması: Model 1 ve Model 2'nin ayarları birbirine karışmamalıdır. Arka planda settings_model1.json ve settings_model2.json adında iki ayrı dosya tutulmalıdır.

Model 1 Arayüzü: Model 1 seçildiğinde sadece temel ayarlar (Global Grid Step, Global Lot, Global TP vs.) gösterilecektir.

Model 2 Arayüzü (Dinamik Bölgeler): Model 2 seçildiğinde UI tamamen değişecek ve şu yapıya bürünecektir:

Varsayılan (Bölge Dışı/Boşluk) Ayarlar Kutusu: Kullanıcının Model 1'deki standart ayarları (Grid Adımı, Lot, TP) buraya girmesini sağlayan sabit bir kutu.

Bölge Ekleme Butonu: "➕ Yeni Bölge Ekle" butonu. Buna basıldıkça ekranda yeni "Bölge Kartları" (Bölge 1, Bölge 2 vb.) oluşacaktır.

Bölge Kartı İçeriği: Her dinamik bölge kartının içinde şu özel girdiler (input) bulunmalıdır:

Taban Fiyat (Alt Sınır)

Tavan Fiyat (Üst Sınır)

Bu Bölgeye Özel Grid Adımı

Bu Bölgeye Özel Lot Miktarı

Bu Bölgeye Özel Kâr Al (TP) Mesafesi

Bölge Silme: Eklenen her kartın yanında bir "🗑️ Sil" butonu olmalıdır.

Bölge Çıkış Temizliği (Toggle Switch): Arayüzde "Bölge Dışına Çıkışta Emirleri Temizle" adında bir Aç/Kapat (True/False) ayarı bulunmalıdır.

📌 BÖLÜM 3: MODEL 2 ANA MOTOR MANTIĞI VE ALGORİTMASI (model_2.py)
Model 2, fiyatın bulunduğu konuma göre farklı karakterlere bürünen "Hibrit-Otonom" bir yapıya sahiptir.

Senaryo A: Fiyatın Tanımlı Bir "Bölge" İçinde Olması (Tam Otonom Başlangıç)

Robot başlatıldığında MT5'ten güncel fiyatı okur.

Eğer güncel fiyat, UI üzerinden oluşturulan "Bölge Kartları"ndan (Örn: 90$- 100$) herhangi birinin içindeyse, robot kullanıcıdan ilk işlemi (manuel müdahaleyi) BEKLEMEZ.

Anında uyanır ve fiyatın içinde bulunduğu o spesifik bölgenin özel ayarlarına (O bölgenin Lotu, TP'si, Grid Adımı) göre hesaplama yaparak bekleyen emirlerini (ağını) otonom şekilde dizer.

Fiyat o bölgenin içinde hareket ettikçe, sadece o bölgenin kurallarına sadık kalarak ağı kaydırır.

Senaryo B: Fiyatın "Boşlukta / Ölü Alanda" Olması (Manuel Tetiklemeli Başlangıç)

Eğer robot başlatıldığında güncel fiyat hiçbir tanımlı bölgenin içinde değilse (bölgelerin arası veya dışı), robot işlem açmaz, ağ örmez. Sessizce Standby (Bekleme) moduna geçer.

Kullanıcı manuel olarak bir işlem (Buy/Sell) açtığı anda robot uyanır.

Boşluktayken ağ örmek için, UI'da girilen "Varsayılan (Bölge Dışı/Boşluk) Ayarlar" verilerini (Global Grid Step, Global Lot, Global TP) kullanarak ağını oluşturur.

Senaryo C: Bölge Değişimi ve "Bölge Dışına Çıkışta Emirleri Temizle" Kuralı

Fiyat bir bölgenin içindeyken (Örn: Bölge 1), oranın sınırlarından çıkıp "Boşluğa" (hiçbir bölgenin olmadığı alana) geçerse robot UI'daki Toggle Switch ayarına bakar:

Eğer Switch AÇIK (True) ise: Robot, terk edilen Bölge 1'de dizmiş olduğu tüm bekleyen emirleri anında iptal eder/siler ve boşlukta uyku moduna (Senaryo B) geçer.

Eğer Switch KAPALI (False) ise: Robot, terk edilen Bölge 1'deki bekleyen emirlere dokunmaz (fiyatın geri dönme ihtimaline karşı onları tuzak olarak bırakır) ancak boşluk alanında yeni işlem dizmez (manuel tetikleme gelene kadar durur).

Fiyat Bölge 1'den çıkıp doğrudan Bölge 2'ye girerse, ağ örme mantığı anında Bölge 2'nin özel Lot, TP ve Grid ayarlarına adapte olur.

Geliştiriciden Beklentiler:
Yukarıdaki kuralları kusursuz bir şekilde uygulayan;

Güncellenmiş app.py ve controls.py

Bölge mantığını yöneten dinamik settings_panel.py

Tamamen yeni ve kurallara uyan core/model_2.py
kodlarını oluşturun. Kodlarda MT5 Mock (Sahte) test modunun Mac işletim sistemleri için korunmasına dikkat edin.