Yapay zekanın ürettigi mimari:
================================================================================
🛠️ MODEL 1 - DİNAMİK KAYAN AĞ (TRAILING GRID) ROBOTU MİMARİ ŞABLONU
================================================================================
Bu belge, MetaTrader 5 (MT5) Python API üzerinde çalışan "Model 1" otonom 
grid robotunun %100 aynısını sıfırdan yazabilmek için gereken tüm kuralları, 
formülleri ve algoritma adımlarını içerir.

1. TEMEL FELSEFE VE 5 ALTIN KURAL
--------------------------------------------------------------------------------
1. DOKUNULMAZLIK İLKESİ: Robot, piyasada anlık olarak açılmış (Canlı/Open) hiçbir 
   pozisyonu KAPATAMAZ. Kapatma işlemleri (close_position) koda kesinlikle eklenemez. 
   Sadece "Pending Order" (Bekleyen Limit/Stop Emir) silebilir veya ekleyebilir.
2. BEKLEME MODU (STANDBY): Sistem ilk açıldığında piyasada hiçbir açık işlem 
   (manuel veya robot) veya bekleyen emir yoksa "Bekleme" modunda kalır. 
   İlk tetikleme olana kadar ağ örmez.
3. KESİNTİSİZ KÖRLÜK (KAYAN AĞ): İlk tetiklemeden sonra robot canlı işlemlere 
   bakarak ağ örmez. Sadece "REFERENCE_PRICE" (Güncel Merkez) üzerinden fiyatı 
   takip eder (Trailing). Merkez kaydıkça arkada kalan emirleri siler, yeni ufka emir dizer.
4. SADECE TP GÜNCELLEMESİ: Kullanıcı manuel bir işlem açarsa, robot bu işlemi görür, 
   eğer TP (Kâr Al) değeri 0 ise, sistemdeki ayara göre TP atar ancak asla müdahale edip kapatmaz.
5. TEMİZ KAPANIŞ: Program kapatıldığında (KeyboardInterrupt) canlı pozisyonlara 
   asla dokunulmaz, yalnızca sahadaki bekleyen (Pending) emirler temizlenir.

2. PARAMETRELER VE JSON KÖPRÜSÜ
--------------------------------------------------------------------------------
Ayarlar, motor çalışırken güncellenebilmesi için her döngüde "settings_model1.json" 
dosyasından (load_dynamic_settings) okunur.
- GRID_STEP: Ağ aralığı (Örn: 0.05)
- TAKE_PROFIT: Kâr al mesafesi
- STOP_LOSS: Zarar kesme mesafesi (Genelde 0)
- LEVELS_BELOW / LEVELS_ABOVE: Merkezin altına/üstüne dizilecek maksimum emir sayısı.
- DEFAULT_LOT: Standart işlem hacmi.
- MAX_OPEN_POSITIONS: Piyasada aynı anda bulunabilecek maksimum açık pozisyon sınırı (Güvenlik Kalkanı).
- MAX_PRICE_LIMIT / MIN_PRICE_LIMIT: Fiyatın bu sınırları aşması durumunda yeni emir dizilmez.
- UP_THRESHOLDS / DOWN_THRESHOLDS: Fiyat belirli seviyelere çıktıkça/düştükçe lotu artıran liste eşikleri.

3. ÇAPRAZ PLATFORM VE MAC MOCK (SAHTE) MOTORU
--------------------------------------------------------------------------------
Sistem platform.system() ile işletim sistemini algılar.
- WINDOWS ise: Gerçek "MetaTrader5" kütüphanesi içe aktarılır.
- MAC/LINUX ise: Gerçek MT5 API çalışmadığı için dosya içinde bir "DummyMT5" sınıfı (Mock) yaratılır. 
  Bu mock motor; order_send, positions_get vb. temel fonksiyonları simüle eder.
  Arayüzden fiyata müdahale edilebilmesi için "SIMULATED_PRICE" adında global bir 
  değişken veya "set_mock_price" köprüsü eklenir ve sahte tick verisi bu değişkenden beslenir.

4. MATEMATİKSEL MODELLER VE HATA (KAYMA) ÇÖZÜMLERİ
--------------------------------------------------------------------------------
Sistemin beynini oluşturan üç temel formül vardır:

A) Mıknatıs Kalkanı (Ping-Pong Koruması) - "calculate_reference_price"
Fiyatın milimetrik dalgalanmasıyla ağın sürekli silinip tekrar açılmasını önler.
- Eğer REFERENCE_PRICE yoksa: round(Current_Price / GRID_STEP) * GRID_STEP
- Eğer REFERENCE_PRICE varsa: Fiyatın mevcut merkezden uzaklığı hesaplanır (abs(Current - Ref)).
  Uzaklık GRID_STEP'ten BÜYÜK VEYA EŞİTSE, merkez yeni fiyata göre yuvarlanıp güncellenir.
  Değilse, eski REFERENCE_PRICE sabit tutulur.

B) Tolerans (Hassas Sapma Payı)
Bekleyen bir emrin, olması gereken noktada olup olmadığını denetlerken geniş 
aralık kullanılmaz. Tolerans formülü KESİNLİKLE şöyledir:
tolerance = (SYMBOL_INFO.point * 2) if SYMBOL_INFO else 0.02

C) Kayma/Spread Yuvarlaması (Çift Emir Koruması) - "get_existing_levels"
Robot, piyasadaki "Dolu" seviyeleri toplarken:
- Bekleyen Emirlerin (Pending) açılış fiyatını DOĞRUDAN alır (Kayma yoktur).
- Canlı Pozisyonların (Open Positions) açılış fiyatında SPREAD/SLIPPAGE olabileceği için 
  (Örn: 85.000 yerine 85.007'de açılmış olabilir), bu canlı işlemlerin fiyatı zorla 
  grid çizgisine mıknatıslanır: round(pos.price_open / GRID_STEP) * GRID_STEP. 
  Böylece sistem, o grid çizgisini "dolu" sayar ve yanına ikinci bir emir dizmez.

5. OTONOM DÖNGÜ (STATE MACHINE) ADIMLARI
--------------------------------------------------------------------------------
"manage_dynamic_grid" fonksiyonu her 1 saniyede bir aşağıdaki sırayla çalışır:

1. API Kontrolü: orders_get ve positions_get verileri çekilir. Herhangi biri None dönerse döngü kırılır.
2. Standby Kilidi: REFERENCE_PRICE None ise ve piyasada hiçbir işlem yoksa return True.
3. Merkez Takibi: calculate_reference_price() ile mıknatıs kalkanlı yeni merkez alınır.
4. Manuel TP Desteği: Manuel işlem var ve TP == 0 ise, Take Profit eklenir.
5. Marjin Kalkanı (Max Positions): Canlı pozisyon sayısı MAX_OPEN_POSITIONS'a eşit/büyükse, 
   mevcut tüm "Bekleyen (Pending)" emirler silinir ve return True ile döngü kesilir (Yeni emir dizilmez).
6. İstenen Seviyelerin Hesabı (calculate_grid_levels): Merkeze göre Below ve Above adım sayısınca 
   seviye hesaplanır.
7. Kusursuz Silici: Sahadaki mevcut BEKLEYEN EMİRLER taranır. Emirin fiyatı, "İstenen Seviyeler" 
   içinde, dar "Tolerance" payı dahilinde yoksa (uzak kalmışsa), o emir silinir (cancel_order).
8. Ufuk Örücü: İstenen seviyeler taranır. Eğer seviye "get_existing_levels" setinin (yukarıdaki yuvarlanmış halinin) 
   içinde boşsa ve MIN/MAX_PRICE_LIMIT sınırları içindeyse; dinamik lot hesaplanır (get_lot_for_price) 
   ve Limit veya Stop emri olarak MT5'e gönderilir (send_pending_order).

6. BAŞLANGIÇ TEMİZLİĞİ (INITIAL CLEANUP)
--------------------------------------------------------------------------------
Sistem main_loop içinde çalışmaya başladığında, "INITIAL_CLEANUP_DONE" değişkeni 
sayesinde yalnızca 1 kez (ilk açılışta) MT5'teki tüm eski bekleyen (Pending) emirleri 
siler. Böylece yeni json ayarlarıyla tamamen temiz, sıfır bir ağ örülür.
================================================================================




Benim verdiğim fikir:
Dinamik Grid Robotu - Güncellenmiş Çalışma Mantığı
1. Tetikleyici (ON/OFF Düğmesi): Robot çalıştırıldığında pasif bir şekilde piyasayı izler. Piyasaya ilk girişi kesinlikle kendisi yapmaz. Siz MT5 üzerinden manuel olarak ilk işleminizi açtığınız an, bu işlemi bir "Başla" komutu olarak kabul eder ve sistem uyanır.

2. Sadece Güncel Fiyata Odaklı Dinamik Ağ: Sistem uyandıktan sonra robotun tek pusulası güncel fiyat (Bid/Ask) olur. Sizin belirlediğiniz ayarlara göre, sadece güncel fiyatın etrafına bekleyen emirler (Buy Limit, Sell Limit, vb.) dizer. Fiyat yukarı veya aşağı hareket ettikçe, uzakta kalan ve gereksizleşen bekleyen emirleri silip, güncel fiyata yakın yeni emirler dizerek dinamik bir şekilde ağı yönetir.

3. TP ve SL Yetkisi: Robot, etrafa dizdiği bu bekleyen emirlere (eğer ayarlarda tanımlanmışsa) önceden belirlenmiş Kar Al (TP) ve Zarar Kes (SL) seviyelerini başarılı bir şekilde yerleştirir. İşlemin ileride kapanma şartlarını baştan sunucuya iletir.

4. Açık İşlemlere Mutlak Dokunulmazlık (Kırmızı Çizgi): Robot, markette aktif hale gelmiş (Açık Pozisyon statüsündeki) hiçbir işlemi, hiçbir koşul altında kod komutuyla kapatamaz. Bu, sizin açtığınız ilk manuel işlem de olabilir, robotun dizip sonradan fiyata değerek aktifleşen bir bekleyen emri de olabilir. Hatta siz robotun çalışmasını tamamen sonlandırsanız dahi, robot sadece henüz işleme dönüşmemiş bekleyen emirleri (Pending Orders) temizler; açık işlemleri piyasada olduğu gibi bırakır.

5. Kapanan İşlemlere Karşı Tamamen "Kör" Olma: Sizin açtığınız veya robotun açtığı bir pozisyon TP/SL ile kapanırsa ya da siz elinizle o işlemi kapatırsanız; robot bu duruma hiçbir şekilde "Eyvah işlem kapandı, sistemi durdurayım/sıfırlayayım" tepkisi vermez. Kesintisiz bir şekilde, sadece o anki güncel fiyata bakarak bekleyen emir ağını örmeye ve silmeye devam eder.