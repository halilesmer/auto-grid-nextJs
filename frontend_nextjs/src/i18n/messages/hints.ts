import { defineArea } from './define';

// Erklärende Hinweise (Tooltips / (i)-Icons) zu jeder Einstellung, jedem Feld und jedem Button.
// Regel (hooks/RULES.md §5): Schlüssel `<label-key>.hint`; Text sagt wozu, Einheit/Wirkung und bei
// deaktivierten Elementen warum. `\n` bricht die Zeile um. Die Fakten stammen aus dem Worker
// (grid_execution/levels.py, config.py, placement.py, grid_order_manager.py).
export default defineArea(
  {
    // --- Hesap ---
    'account.label.hint':
      'Üzerinde çalışılan MT5 hesabını seçer. Bölgeler, bot ve loglar seçili hesaba aittir.',
    'account.action.downloadLog.hint': 'Seçili hesabın bot log dosyasını bilgisayarınıza indirir.',
    'account.action.edit.hint': 'Hesap adını, sunucuyu, ortamı, MT5 yolunu veya şifreyi düzenler. Bot çalışırken kullanılamaz.',
    'account.action.delete.hint': 'Seçili hesabı listeden siler (onay ister). Broker’daki hesap ve pozisyonlar etkilenmez.',
    'account.action.add.hint': 'Yeni bir MT5 hesabı ekler (ad, login, sunucu, MT5 yolu). Şifre yalnızca worker’da saklanır.',
    'account.action.menu.hint': 'Hesap menüsü: bot logunu indir, hesabı düzenle veya sil, yeni hesap ekle.',
    'account.delete.confirm.hint': 'Hesabı kalıcı olarak siler; geri alınamaz.',
    'account.dialog.close.hint': 'Pencereyi kapatır; kaydedilmemiş girişler atılır.',
    'account.duplicate.confirm.hint': 'Zaten kayıtlı olan hesabı düzenleme formunda açar.',
    'account.env.demo.hint': 'DEMO/TEST hesabı: sanal para, gerçek risk yok.',
    'account.env.live.hint': 'LIVE hesabı: gerçek para! Emirler gerçek piyasada işlem görür.',
    'account.form.editExisting.hint': 'Aynı login ile kayıtlı hesabı düzenlemek için açar.',
    'account.form.name.hint': 'Hesabı listede tanıyacağınız serbest bir ad (ör. “Canlı Hesap 1”).',
    'account.form.login.hint': 'MT5 hesap numaranız (sayısal Login/ID).',
    'account.form.password.hint': 'MT5 hesap şifreniz. Yalnızca worker’da saklanır, arayüze geri gönderilmez.',
    'account.form.password.keep.hint':
      'Alan bilerek boş: şifre güvenlik için yalnızca worker’da saklanır ve arayüze geri gönderilmez. Boş bırakırsanız kayıtlı şifre korunur. Değiştirmek için MT5 ana (master) şifresinin tamamını girin, yatırımcı (investor) şifresini değil.',
    'account.form.password.show.hint': 'Şifreyi düz metin olarak gösterir; yanınızda kimse yokken kullanın.',
    'account.form.password.hide.hint': 'Şifreyi tekrar gizler.',
    'account.form.server.hint': 'Broker’ın MT5 sunucu adı, MT5’te göründüğü gibi (ör. Eightcap-Demo).',
    'account.form.env.hint':
      'DEMO = deneme hesabı, LIVE = gerçek para hesabı. Broker’daki hesabın türüyle eşleşmelidir (worker bağlanırken denetler).',
    'account.form.notes.hint': 'İsteğe bağlı özel notlar (en fazla 1000 karakter). Botu etkilemez.',
    'account.form.save.hint': 'Hesabı worker’a kaydeder ve seçer.',
    'account.path.label.hint':
      'Bu hesabın kullanacağı MetaTrader 5 terminalinin (terminal64.exe) yolu. Birden fazla MT5 kuruluysa doğru olanı seçin.',
    'account.path.rescan.hint': 'VPS’teki kurulu MT5 terminallerini yeniden tarar.',
    'account.path.scanning.hint': 'MT5 yolları taranıyor…',
    'account.path.custom.hint': 'Bulunan listeyi kullanmak yerine terminal64.exe yolunu elle yazmanızı sağlar.',

    // --- Bot ---
    'bot.status.connecting.hint': 'Bot süreci başlatıldı, MT5’e bağlanılıyor…',
    'bot.status.running.hint': 'Bot MT5’e bağlı ve etkin bölgeler için grid emirlerini yönetiyor.',
    'bot.status.processNoMt5.hint':
      'Bot süreci var ama MT5 bağlantısı yok (kopmuş veya asılı). “Botu Yeniden Başlat” veya “Botu Durdur” kullanın.',
    'bot.status.stopped.hint':
      'Bot çalışmıyor, yeni emir konmaz. Mevcut pozisyonlar ve bekleyen emirler broker’da kalır.',
    'bot.start.hint':
      'Bu hesap için bot sürecini başlatır ve MT5’e bağlanır. Etkin bölgeler için grid emirleri yerleştirilir.',
    'bot.connecting.hint': 'MT5 bağlantısı kuruluyor (3 dakikaya kadar sürebilir). Bitene kadar bekleyin.',
    'bot.stop.hint':
      'Botu durdurur (onay ister). Açık pozisyonlar ve bekleyen emirler broker tarafında korunur.',
    'bot.disconnect.confirm.hint':
      'Botu durdurur ve MT5 bağlantısını keser. Açık pozisyonlar ve bekleyen emirler broker’da kalır.',

    // --- Grafik ---
    'chart.zone.active.hint': 'Setup etkin: bot bu setup için emir yönetir.',
    'chart.zone.inactive.hint': 'Setup pasif: bot bu setup’a emir koymaz.',
    'chart.zone.priceRange.hint': 'Setup’ın alt ve üst fiyat sınırı. Emirler yalnızca bu aralığa konur.',
    'chart.zone.levels.hint': 'Fiyatın altına / üstüne kurulan grid seviyesi sayısı (Alt / Üst Seviyeler).',
    'chart.stat.price.hint': 'Grafikteki sembolün son fiyatı (canlı akış).',
    'chart.stat.rsi.hint':
      'RSI (Relative Strength Index): 0–100 arası momentum göstergesi. 70 üstü genelde aşırı alım, 30 altı aşırı satım sayılır. Grafikte ayrı bir çizgi olarak gösterilir.',
    'chart.stat.pl.hint': 'Açık pozisyonların toplam kâr/zararı (yüzen K/Z, henüz gerçekleşmemiş).',
    'chart.stat.positions.hint': 'Şu anda açık olan pozisyonların sayısı.',

    // --- Ortak ---
    'common.cancel.hint': 'İşlemi iptal eder, hiçbir şey değişmez.',
    'common.close.hint': 'Pencereyi kapatır.',
    'common.noChanges.hint': 'Kaydedilecek değişiklik yok.',
    'common.theme.light.hint': 'Açık temayı kullanır.',
    'common.theme.dark.hint': 'Koyu temayı kullanır.',
    'common.theme.system.hint': 'Cihazın açık/koyu ayarını takip eder.',
    'common.theme.cycle.hint': 'Tema: {current}. Tıklayınca “{next}” temasına geçer.',

    // --- Dashboard ---
    'dashboard.sysinfo.hint': 'Sistem menüsü: adres ve port bilgisi, güncelleme denetimi ve sistemi kapatma.',
    'dashboard.sysinfo.checkUpdates.hint': 'GitHub’daki (origin/main) sürümle karşılaştırır, yeni sürüm varsa sunar.',
    'dashboard.shutdown.hint': 'Sistemi kapatma penceresini açar. Tüm botlar durdurulur; onay ister.',
    'dashboard.shutdown.confirm.hint':
      'Tüm botları durdurur ve arayüzü kapatır. Açık pozisyonlar broker’da kalır.',
    'saveBar.saveAll.hint': 'Tüm bölgelerdeki kaydedilmemiş değişiklikleri kaydeder. Kısayol: Cmd+Enter (Mac) / Ctrl+Enter (Windows).',
    'saveBar.discard.hint': 'Kaydedilmemiş tüm değişiklikleri atar ve son kaydedilen duruma döner.',
    'saveBar.saved.hint': 'Tüm değişiklikler kayıtlı.',
    'saveBar.saving.hint': 'Kaydediliyor…',
    'metrics.price.hint': 'Bölge sembolünün anlık fiyatı.',
    'metrics.profit.hint': 'Açık pozisyonların toplam kâr/zararı (yüzen K/Z, henüz gerçekleşmemiş).',
    'metrics.positions.hint': 'Şu anda açık olan pozisyonların sayısı.',
    'metrics.pending.hint': 'Broker’da bekleyen, henüz dolmamış grid emirlerinin sayısı.',
    'update.apply.hint':
      'Yeni sürümü GitHub’dan çeker (git pull) ve worker’ı yeniden başlatır; çalışan botlar sonra kendiliğinden devam eder.',
    'update.vpsLink.hint':
      'Worker’a ulaşılamasa bile VPS sayfasından SSH ile güncelleme veya yeniden başlatma yapabilirsiniz (yalnızca yerel).',

    // --- Loglar ---
    'logs.tab.activity.hint': 'Bu oturumda arayüzde yaptıklarınız ve bot olayları (başlat, durdur, hata).',
    'logs.tab.robot.hint': 'Botun (grid motoru) log dosyası: yerleştirilen/silinen emirler, uyarılar, hatalar.',
    'logs.tab.mt5.hint': 'MT5 terminalinin kendi log çıktısı (bağlantı, emir hataları).',
    'logs.refresh.hint': 'Logu hemen yeniden yükler (otomatik yenileme zaten düzenli aralıklarla çalışır).',
    'zone.logs.toggle.hint': 'Bu sembolün tüm setup’larının robot loglarını açar/kapatır (açıkken 10 sn’de bir yenilenir). Birden fazla setup varsa her satır setup numarasıyla başlar. Etiketsiz eski satırlar burada görünmez.',
    'logs.download.hint': 'Seçili hesabın log dosyasını bilgisayarınıza indirir.',
    'logs.clear.activity.hint': 'Yalnızca Activity listesini (bu oturumdaki arayüz olayları) temizler.',
    'logs.clear.all.hint': 'Bu hesaba ait tüm logları worker’da temizler (onay ister). Geri alınamaz.',
    'logs.clearConfirm.confirm.hint': 'Bu hesabın tüm loglarını kalıcı olarak siler.',
    'logs.status.hint': 'Worker’a erişim durumu ve son güncelleme zamanı.',

    // --- Gezinme ---
    'nav.home.hint': 'Grid Robot {version}. Ana sayfaya gider.',
    'nav.dashboard.hint': 'Ana sayfa: hesap, bölgeler, bot kontrolü ve loglar.',
    'nav.formation.hint': 'Fiyat grafiği ve formasyonlar.',
    'nav.vps.hint': 'VPS yönetimi: worker durumu, güncelleme, yeniden başlatma ve loglar.',
    'nav.users.hint': 'Kullanıcı yönetimi (yalnızca yönetici): kullanıcı ekle, anahtarlarını yenile, sil.',
    'nav.language.cycle.hint': 'Dil: {current}. Tıklayınca {next} diline geçer.',
    'nav.language.option.hint': 'Arayüz dilini {language} yapar.',

    // --- Kullanıcılar ---
    'users.refresh.hint': 'Kullanıcı listesini worker’dan yeniden yükler.',
    'users.add.hint': 'Yeni bir kullanıcı oluşturur ve ona kişisel bir anahtar üretir. Kullanıcı bu anahtarla bağlanınca yalnızca kendi hesaplarını görür.',
    'users.action.newKey.hint': 'Bu kullanıcı için yeni bir anahtar üretir (onay ister). Eski anahtar hemen geçersiz olur.',
    'users.action.delete.hint': 'Kullanıcıyı siler (onay ister). Hesapları ve botları kalır, yöneticiye ait olur.',
    'users.create.name.hint': 'Kullanıcının görünen adı (1–40 karakter, benzersiz). Yalnızca listede ve sahip seçiminde gösterilir.',
    'users.create.submit.hint': 'Kullanıcıyı oluşturur ve kişisel anahtarını bir kez gösterir.',
    'users.key.field.hint': 'Kullanıcının kişisel anahtarı. “VPS’e bağlan” penceresindeki API anahtarı alanına girilir. Yalnızca şimdi görünür; kimseyle paylaşma.',
    'users.key.copy.hint': 'Anahtarı panoya kopyalar.',
    'users.link.field.hint': 'Adresi ve anahtarı içeren hazır bağlantı linki. Kullanıcı bunu tarayıcısında açınca bağlantı penceresi dolu gelir; link anahtarı içerir, güvenli ilet.',
    'users.link.copy.hint': 'Bağlantı linkini panoya kopyalar.',
    'users.key.done.hint': 'Pencereyi kapatır. Anahtar bundan sonra tekrar gösterilmez.',
    'users.rotate.confirm.hint': 'Yeni anahtarı üretir ve eskisini hemen geçersiz kılar.',
    'users.delete.confirm.hint': 'Kullanıcıyı ve anahtarını kalıcı olarak siler; hesapları sahipsiz kalır.',
    'users.owner.label.hint': 'Hesabın sahibi. Kullanıcı yalnızca kendi hesaplarını görür ve yönetir; “Yönetici” seçiliyse hesabı yalnızca yönetici anahtarı görür.',

    // --- VPS-Verbindung ---
    'connection.chip.hint': 'Worker (VPS) bağlantısı: {status}. Tıklayınca bağlantı penceresini açar.',
    'connection.field.link.hint':
      'VPS kurulumunun verdiği bağlantı linkini veya kodunu buraya yapıştır; adres ve anahtar kendiliğinden dolar.',
    'connection.field.url.hint':
      'Worker’ın https adresi (ngrok alan adın), ör. https://alanadi.ngrok-free.dev. Sonuna “/api” eklemene gerek yok.',
    'connection.field.key.hint':
      'VPS’teki WORKER_API_KEY (yönetici) ya da yöneticinin sana verdiği kişisel anahtar. Kişisel anahtarla yalnızca kendi hesaplarını görürsün. Yalnızca bu tarayıcıda saklanır; anahtarı veya linki kimseyle paylaşma.',
    'connection.key.show.hint': 'API anahtarını okunabilir gösterir.',
    'connection.key.hide.hint': 'API anahtarını noktalarla gizler.',
    'connection.action.test.hint':
      'Girilen adres ve anahtarla worker’a bir deneme isteği gönderir. Hiçbir şey kaydedilmez.',
    'connection.action.connect.hint':
      'Adresi ve anahtarı bu tarayıcıya kaydeder ve sayfayı yeniden yükler. Önce başarılı bir test gerekir.',
    'connection.action.disconnect.hint':
      'Kayıtlı adresi ve anahtarı bu tarayıcıdan siler (onay ister). VPS’teki worker etkilenmez.',
    'connection.disconnect.confirm.hint': 'Bu tarayıcıdaki bağlantıyı siler; botlar VPS’te çalışmaya devam eder.',
    'connection.gate.connect.hint':
      'Bağlantı penceresini açar: adres ve anahtarı gir ya da bağlantı linkini yapıştır.',

    // --- Genel ayarlar ---
    'settings.interval.hint':
      'Motor döngüsünün piyasayı ve emirleri kaç saniyede bir kontrol ettiği (1–60 sn). Küçük değer: hızlı tepki ama daha fazla yük; büyük değer: hafif ama yavaş tepki. Değişiklik Kaydet ile worker’a yazılır.',
    'settings.decrease.hint': 'Kontrol sıklığını 0,1 sn azaltır (daha hızlı tepki, daha fazla yük).',
    'settings.decrease.min.hint': 'En düşük değer (1 sn); daha fazla azaltılamaz.',
    'settings.increase.hint': 'Kontrol sıklığını 0,1 sn artırır (daha az yük, daha yavaş tepki).',
    'settings.increase.max.hint': 'En yüksek değer (60 sn); daha fazla artırılamaz.',
    'settings.save.hint': 'Kontrol sıklığını kaydeder.',

    // --- Ortak arayüz ---
    'ui.hint': 'Bilgi',
    'ui.close.hint': 'Pencereyi kapatır.',
    'ui.dismiss.hint': 'Bu bildirimi kapatır.',

    // --- VPS ---
    'vps.busy.hint': 'Başka bir VPS işlemi sürüyor, bitmesini bekleyin.',
    'vps.refresh.hint': 'VPS durumunu şimdi yeniden sorgular.',
    'vps.tile.worker.hint':
      'FastAPI worker’ının (uvicorn) durumu; botları o yönetir. “Yanıt vermiyor” = port açık ama cevap gelmiyor.',
    'vps.tile.ngrok.hint':
      'ngrok tüneli arayüzü internet üzerinden worker’a bağlar. Çevrimdışıysa arayüz worker’a ulaşamaz. Kendini onarma (AutoGrid-Tunnel görevi): URL 5 dakikada bir kontrol edilir, cevap yoksa ngrok yeniden başlatılır, 3 kez üst üste başarısız olursa VPS yeniden başlatılır (en fazla saatte bir, günde 3 kez).',
    'vps.tile.bots.hint': 'VPS’te çalışan bot süreçleri (hesap başına bir tane) ve açık MT5 terminali sayısı.',
    'vps.tile.version.hint':
      'VPS’teki kurulu sürüm ile git dalı/commit’i ve son güncelleme zamanı. Dal “main” değilse uyarı gösterilir; otomatik güncelleme main’den çeker.',
    'vps.tile.autostart.hint':
      'VPS açılışta kendiliğinden çalışıyor mu: otomatik oturum açma + AutoGrid-Start görevi. “Eksik” ise yeniden başlatma sonrası worker gelmez.',
    'vps.tile.system.hint': 'VPS’in bilgisayar adı ve ne zamandır açık olduğu.',
    'vps.ctrl.check.hint': 'origin/main’deki sürümü VPS’tekiyle karşılaştırır (worker üzerinden).',
    'vps.ctrl.check.noWorker.hint':
      'Denetim için worker’ın çalışması gerekir. Güncellemeyi yine de aşağıdaki düğmeyle başlatabilirsiniz.',
    'vps.action.update.hint':
      'origin/main’den son sürümü çeker ve worker’ı yeniden başlatır (AutoGrid-Update görevi). Onay ister.',
    'vps.action.restart.hint': 'Worker’ı yeniden başlatır; çalışan botlar sonra kendiliğinden devam eder. Onay ister.',
    'vps.action.restartNgrok.hint': 'ngrok tünelini yeniden başlatır (arayüz–worker bağlantısı koptuysa işe yarar). Onay ister.',
    'vps.action.reboot.hint':
      'VPS’i (Windows) tamamen yeniden başlatır. Tüm süreçler kapanır; oturum açılınca otomatik başlatma devreye girer. Onay ister.',
    'vps.elevated.fix.hint':
      'Yönetici haklarıyla çalışan eski AutoGrid süreçlerini sonlandırır; worker sonra normal haklarla yeniden başlar. Onay ister.',
    'vps.log.tab.worker.hint': 'Worker konsol logu (uvicorn, worker_console.log).',
    'vps.log.tab.ngrok.hint': 'ngrok tünelinin logu (ngrok.log).',
    'vps.log.tab.update.hint': 'Otomatik güncelleme görevinin logu.',
    'vps.log.tab.tunnel.hint': 'Tünel watchdog’unun logu (tunnel_watchdog.log): herkese açık ngrok URL’si 5 dakikada bir kontrol edilir; hatalar, ngrok yeniden başlatmaları ve otomatik VPS yeniden başlatmaları burada görünür.',
    'vps.log.refresh.hint': 'Logu VPS’ten yeniden çeker (otomatik yenileme de düzenli çalışır).',

    // --- Bölge: başlık ve panel ---
    'zone.panel.count.hint': 'Sembol sayısı. Her sembolün bir veya daha fazla setup’ı vardır.',
    'zone.panel.add.hint': 'Yeni bir sembol ekler: önce sembolü seçersiniz, ilk setup otomatik oluşur. Ayarları girip Kaydet’e basın.',
    'zone.panel.add.off.hint': 'Bot çalışıyor ama MT5’e bağlı değil; bağlantı kurulana kadar sembol eklenemez.',
    'zone.delete.confirm.hint': 'Setup’ı listeden kaldırır. Kalıcı olması için “Tüm Ayarları Kaydet” gerekir.',
    'zone.delete.last.confirm.hint': 'Son setup’ı ve onunla sembolü listeden kaldırır. Kalıcı olması için “Tüm Ayarları Kaydet” gerekir.',
    'zone.header.badge.buy.hint': 'Bu setup yalnızca BUY (alış) emirleri verir.',
    'zone.header.badge.sell.hint': 'Bu setup yalnızca SELL (satış) emirleri verir.',
    'zone.header.badge.both.hint': 'Bu setup hem BUY hem SELL emirleri verir.',
    'zone.market.hint.open': "Piyasa açık. Genelde {hours} arası (broker sunucu saati).",
    'zone.market.hint.closed': 'Piyasa kapalı. Genelde {hours} arası açık (broker sunucu saati). Kapalıyken bu sembolde yeni emir yerleştirilemez.',
    'zone.market.hint': 'Bu sembol için piyasa açık mı. Her sembolün işlem saati farklıdır; kapalıyken yeni emir yerleştirilemez.',
    'zone.header.unsaved.hint': 'Bu setup’ta henüz kaydedilmemiş değişiklikler var.',
    'zone.header.price.hint': 'Sembolün anlık fiyatı (Bid), sembol basamak sayısıyla. Motor çalışmıyorsa "--".',
    'zone.header.started.hint':
      'Setup etkin ve motor emirleri yönetiyor. Tıklayınca setup’ı devre dışı bırakır (hemen kaydedilir).',
    'zone.header.start.hint':
      'Setup kapalı. Tıklayınca setup’ı etkinleştirir (hemen kaydedilir); motor çalışıyorsa emirler konur.',
    'zone.header.ready.hint':
      'Setup etkin ama motor çalışmıyor; botu başlatınca emirler konur. Tıklayınca setup’ı kapatır (hemen kaydedilir).',
    'zone.header.off.hint':
      'Setup kapalı. Tıklayınca setup’ı etkinleştirir (hemen kaydedilir); emirler botu başlatınca konur.',
    'zone.header.save.hint': 'Sadece bu setup’ın değişikliklerini kaydeder; diğer setup’lar etkilenmez.',
    'zone.header.save.off.hint': 'Bu setup’ta kaydedilmemiş değişiklik yok.',
    'zone.header.test.hint': 'Bu setup’ın kopyasını (kaydedilmemiş değişiklikler dahil) Backtest sayfasında geçmiş fiyatlarla test eder. Setup değişmez.',
    'zone.header.menu.hint': 'Setup menüsü: ek işlemler (setup’ı sil).',
    'zone.header.delete.hint': 'Setup’ı siler (onay ister). Son setup ise sembol de kalkar. Kalıcı olması için Kaydet gerekir.',
    'zone.header.delete.off.hint':
      'Bot çalışıyor ama MT5’e bağlı değil; bağlantı kurulana kadar setup silinemez.',
    'zone.symbol.setupCount.hint': 'Bu sembolün setup sayısı. Her setup motorda kendi magic numarasıyla ayrı çalışır.',
    'zone.symbol.addSetup.hint': 'Bu sembole yeni bir setup ekler; sembol sorulmaz, lot sembolün en küçük lotudur. Ayarları girip Kaydet’e basın.',
    'zone.symbol.addSetup.off.hint': 'Bot çalışıyor ama MT5’e bağlı değil; bağlantı kurulana kadar setup eklenemez.',
    'zone.addSymbol.symbol.hint': 'Eklenecek sembol (broker’ın MT5 sembol adı). Yazarak arayın, listeden seçin.',
    'zone.addSymbol.confirm.hint': 'Sembolü ilk setup’ıyla listeye ekler. Kalıcı olması için Kaydet gerekir.',
    'zone.addSymbol.confirm.off.hint': 'Önce geçerli bir sembol girin veya listeden seçin.',
    'zone.sync.hint':
      'Açıkken SELL, BUY’ın grid adımı, lot, kâr al ve zarar durdur değerlerini kullanır. Kapatınca SELL için ayrı değerler girebilirsiniz.',

    // --- Bölge: temel alanlar ---
    'zone.field.symbol.hint':
      'İşlem yapılacak enstrüman (broker’ın MT5 sembol adı, ör. USOUSD). Yazarak arayın, listeden seçin. Değişiklik bu sembolün tüm setup’larına uygulanır. Parantez içi: sembolün fiyat ondalık basamağı.',
    'zone.field.orderType.hint':
      'BUY: yalnızca alış emirleri.\nSELL: yalnızca satış emirleri.\nBOTH: her iki yön; BUY ve SELL ayrı ayarlanabilir.',
    'zone.field.minPrice.hint':
      'Bölgenin alt sınırı. Emirler yalnızca Min–Max aralığına konur; fiyat bunun altına inerse bölge çıkışı sayılır.',
    'zone.field.maxPrice.hint':
      'Bölgenin üst sınırı. Emirler yalnızca Min–Max aralığına konur; fiyat bunun üstüne çıkarsa bölge çıkışı sayılır.',

    // --- Bölge: grid alanları ---
    'zone.field.gridStep.hint':
      'Ardışık iki grid seviyesi (emir) arasındaki fiyat mesafesi, sembolün fiyat biriminde ($). Küçük adım: sık emirler, büyük adım: seyrek emirler.',
    'zone.field.buyGrid.hint':
      'BUY tarafı için iki grid seviyesi arasındaki fiyat mesafesi ($). SELL için ayrı bir alan var.',
    'zone.field.lot.hint':
      'Her grid emrinin hacmi (lot). En az sembolün brokerdaki en küçük lotu olabilir: 0 veya daha küçük değer bu minimuma yükseltilir, adım kuralına göre yuvarlanır; motor üstten 5 lot ile sınırlar.',
    'zone.field.buyLot.hint': 'BUY emirlerinin hacmi (lot). En az sembolün brokerdaki en küçük lotu; 0 veya daha küçük değer bu minimuma yükseltilir. SELL için ayrı bir alan var.',
    'zone.field.takeProfit.hint':
      'Kâr al mesafesi ($): BUY için giriş fiyatının bu kadar üstüne, SELL için altına konur. Fiyat oraya ulaşınca pozisyon kârla kapanır.',
    'zone.field.gridStep.guide': 'Referans ({symbol}): {range}. Spread’e yakın çok dar adım, emirlerin sürekli dolup silinip yeniden kurulmasına yol açar.',
    'zone.field.takeProfit.guide': 'Referans ({symbol}): {range}. Spread’den küçük kâr al pratikte kazanç getirmez.',
    'zone.field.buyTakeProfit.hint': 'BUY pozisyonları için kâr al mesafesi ($): giriş fiyatının bu kadar üstü.',
    'zone.field.stopLoss.hint':
      'Zarar durdur mesafesi ($): BUY için giriş fiyatının bu kadar altına, SELL için üstüne konur. 0 = zarar durdur yok.',
    'zone.field.buyStopLoss.hint':
      'BUY pozisyonları için zarar durdur mesafesi ($): giriş fiyatının bu kadar altı. 0 = zarar durdur yok.',
    'zone.field.sellGrid.hint': 'SELL tarafı için iki grid seviyesi arasındaki fiyat mesafesi ($).',
    'zone.field.sellLot.hint':
      'SELL emirlerinin hacmi (lot). En az sembolün brokerdaki en küçük lotu; 0 veya daha küçük değer bu minimuma yükseltilir.',
    'zone.field.sellTakeProfit.hint': 'SELL pozisyonları için kâr al mesafesi ($): giriş fiyatının bu kadar altı.',
    'zone.field.sellStopLoss.hint':
      'SELL pozisyonları için zarar durdur mesafesi ($): giriş fiyatının bu kadar üstü. 0 = zarar durdur yok.',

    // --- Bölge: breakout ---
    'zone.breakout.trendOnly.hint':
      'Breakout modu: yalnızca trend yönünde emir konur (BUY güncel fiyatın üstüne, SELL altına). Ters yönde grid kurulmaz. Pullback mesafesi yalnızca bu modda geçerlidir.',
    'zone.breakout.minPullback.hint':
      'Breakout modunda ilk seviyenin güncel fiyattan en az bu kadar ($) uzakta olması gerekir; daha yakın seviyeler atlanır.',
    'zone.breakout.buyPullback.hint':
      'Breakout modunda BUY emirleri, güncel fiyatın en az bu kadar ($) üstündeki seviyelerden başlar; daha yakın seviyeler atlanır.',
    'zone.breakout.sellPullback.hint':
      'Breakout modunda SELL emirleri, güncel fiyatın en az bu kadar ($) altındaki seviyelerden başlar; daha yakın seviyeler atlanır.',
    'zone.stepByLoss.hint':
      'Açıkken Grid, Pullback, Kar Al ve Zarar Durdur mesafeleri fiyat değil tutar ($) olarak girilir: son açılan pozisyon bu kadar zarara ulaşınca bir sonraki pozisyon açılır. Mesafe lot büyüklüğüne göre hesaplanır (2 kat lot = yarı mesafe). Açık pozisyonların hepsi aynı anda zararda olduğundan toplam zarar daha hızlı büyür (10 $, 30 $, 60 $ …). Spread ve komisyon dahil değildir.',
    'zone.field.gridStepLoss.hint':
      'Son açılan pozisyon bu kadar zarara (hesap para birimi, $) ulaşınca bir sonraki pozisyon açılır. Bot, tutarı lot büyüklüğüyle fiyat mesafesine çevirir.',
    'zone.field.buyGridLoss.hint':
      'Son BUY pozisyonu bu kadar zarara ($) ulaşınca bir sonraki BUY açılır; BUY lotu ile fiyat mesafesine çevrilir.',
    'zone.field.sellGridLoss.hint':
      'Son SELL pozisyonu bu kadar zarara ($) ulaşınca bir sonraki SELL açılır; SELL lotu ile fiyat mesafesine çevrilir.',
    'zone.breakout.minPullbackLoss.hint':
      'Breakout modunda ilk emir, güncel fiyattan en az bu tutar ($) kadar uzakta olmalı (lot büyüklüğüyle fiyat mesafesine çevrilir); daha yakın seviyeler atlanır. 0 = sınır yok.',
    'zone.breakout.buyPullbackLoss.hint':
      'Breakout modunda BUY emirleri, BUY lotu ile bu tutara ($) karşılık gelen mesafeden daha uzak seviyelerden başlar. 0 = sınır yok.',
    'zone.breakout.sellPullbackLoss.hint':
      'Breakout modunda SELL emirleri, SELL lotu ile bu tutara ($) karşılık gelen mesafeden daha uzak seviyelerden başlar. 0 = sınır yok.',
    'zone.field.takeProfitLoss.hint':
      'Pozisyon bu kadar kâra ($) ulaşınca kapanır. Bot, tutarı lot büyüklüğüyle fiyat mesafesine çevirir.',
    'zone.field.buyTakeProfitLoss.hint':
      'BUY pozisyonu bu kadar kâra ($) ulaşınca kapanır; BUY lotu ile fiyat mesafesine çevrilir.',
    'zone.field.sellTakeProfitLoss.hint':
      'SELL pozisyonu bu kadar kâra ($) ulaşınca kapanır; SELL lotu ile fiyat mesafesine çevrilir.',
    'zone.field.stopLossLoss.hint':
      'Pozisyon bu kadar zarara ($) ulaşınca kapanır; lot büyüklüğüyle fiyat mesafesine çevrilir. 0 = zarar durdur yok.',
    'zone.field.buyStopLossLoss.hint':
      'BUY pozisyonu bu kadar zarara ($) ulaşınca kapanır; BUY lotu ile çevrilir. 0 = zarar durdur yok.',
    'zone.field.sellStopLossLoss.hint':
      'SELL pozisyonu bu kadar zarara ($) ulaşınca kapanır; SELL lotu ile çevrilir. 0 = zarar durdur yok.',
    'zone.instantEntry.hint':
      'Açıkken bot, bir yönde (BUY/SELL) açık pozisyon yoksa beklemeden güncel fiyattan piyasa emriyle bir pozisyon açar: başlatınca ve o yönün tüm pozisyonları kapandıktan sonra (ör. kâr al). BUY ve SELL bölgesinde ikisi de açılır. Sonraki seviyeler bu pozisyondan itibaren grid adımı kadar uzağa konur. Yalnızca fiyat bölge aralığındayken.',
    'zone.breakout.pullback.off.hint': 'Yalnızca “Sadece trend yönünde” (breakout) açıkken kullanılır.',
    'zone.breakout.levelsBelow.hint':
      'Referans fiyatın altında kaç grid seviyesi (emir) kurulacağı; her seviye Grid Adımı kadar uzaktadır.',
    'zone.breakout.levelsBelow.off.hint': 'Breakout + BUY modunda kullanılmaz: BUY yalnızca fiyatın üstüne kurulur.',
    'zone.breakout.levelsAbove.hint':
      'Referans fiyatın üstünde kaç grid seviyesi (emir) kurulacağı; her seviye Grid Adımı kadar uzaktadır.',
    'zone.breakout.levelsAbove.off.hint': 'Breakout + SELL modunda kullanılmaz: SELL yalnızca fiyatın altına kurulur.',
    'zone.breakout.maxPositions.hint':
      'Bu bölgede aynı anda açık olabilecek en fazla pozisyon. Sınıra ulaşınca yeni emir konmaz. 0 = sınırsız (motor en çok 500 ile sınırlar).',

    // --- Bölge: çıkışta temizleme ---
    'zone.exit.clearOnExit.tip':
      'Açıkken fiyat bölgenin dışına çıktığında bölge kendini temizler ve durur (“Otomatik temizlendi”); fiyat geri gelse de “Yeniden Başlat” denene kadar emir konmaz. Yanındaki seçenekler neyin, ne zaman temizleneceğini belirler. Kapalıyken bölgenin emirlerine dokunulmaz.',
    'zone.exit.side.hint':
      'Hangi yönde çıkışta temizlik yapılacağı: herhangi, yalnızca yukarı (üst sınırın üstü) veya yalnızca aşağı (alt sınırın altı). Diğer yönde çıkışta emirlere dokunulmaz, bölge yine de pasife alınır.',
    'zone.exit.target.hint': 'Temizlikte hangi tarafın işlemleri silinsin/kapatılsın: hepsi, yalnızca BUY veya yalnızca SELL.',
    'zone.exit.scope.hint':
      'Sadece Bekleyen Emirler: yalnızca henüz dolmamış emirler silinir.\nTüm İşlemler: açık pozisyonlar da kapatılır (zarar gerçekleşebilir).',
    'zone.exit.trigger.hint':
      'Anlık Fiyat: fiyat sınırı geçer geçmez tetiklenir.\nMum Kapanışı: yalnızca seçilen periyottaki mum bölgenin dışında kapanırsa tetiklenir (kısa iğne hareketlerine karşı daha güvenli).',
    'zone.exit.timeframe.hint':
      'Mum kapanışının hangi periyotta kontrol edileceği (M1 = 1 dakika … D1 = 1 gün). Son kapanan mum bölgenin dışında kapanırsa çıkış sayılır.',
    'zone.entryMode.hint':
      'Grid: fiyat aralığında kayan ızgara emirleri.\nFraktal: yalnızca seçilen zaman dilimindeki en yeni fraktalların seviyesinde bekleyen emir (yön başına „Emir Sayısı“ kadar, varsayılan 1). Yeni fraktal oluşunca emirler kayar; fiyat seviyeyi geçtiyse emir konmaz. MT5\'te elle silinen emir veya kapatılan pozisyon için aynı fraktala tekrar emir konmaz.',
    'zone.fractal.timeframe.hint':
      'Fraktalların arandığı mum periyodu (M1 = 1 dakika … D1 = 1 gün). Fraktal 5 mumdan oluşur ve ancak sağdaki iki mum kapandıktan sonra geçerlidir; ATR ve SAR da bu periyotta hesaplanır.',
    'zone.fractal.orderMode.hint':
      'Kırılım: üst fraktal → Buy Stop, alt fraktal → Sell Stop (seviyenin kırılmasına oynar).\nDönüş: üst fraktal → Sell Limit, alt fraktal → Buy Limit (seviyeden geri dönüşe oynar).\nYön (BUY/SELL/Her İkisi) hangi tarafların açılacağını sınırlar; fraktal bölgenin fiyat aralığı içinde olmalı.',
    'zone.fractal.slMode.hint':
      'ATR: fraktal mumunun ucu ± çarpan × ATR (tipik mum dalgalanması).\nParabolic SAR: SAR noktası; açık pozisyonda her yeni mumda yalnızca kâr yönünde çekilir.\nKarşı fraktal: BUY için son alt fraktalın, SELL için son üst fraktalın ötesi + tampon.\nFraktal mumu: BUY için fraktal mumunun dibi − tampon, SELL için tepesi + tampon.\nHesaplanamazsa veya yanlış taraftaysa fraktal mumu + tampon kullanılır.',
    'zone.fractal.useSl.hint':
      'Açık: her fraktal emrine SL konur (yanındaki yönteme göre).\nKapalı: emirler SL olmadan açılır; Risk/Ödül TP\'si ve SAR takibi kullanılamaz, TP yalnızca tutar olarak ayarlanabilir. Zarar sınırsız kalabilir.',
    'zone.fractal.slBuffer.hint':
      'SL\'nin fraktal mumunun / karşı fraktalın ne kadar ötesine konacağı (fiyat birimi, ör. 0,05). ATR veya SAR hesaplanamadığında yedek olarak da kullanılır.',
    'zone.fractal.atrPeriod.hint':
      'ATR\'nin kaç mumun gerçek aralık ortalaması olduğu (MT5 ATR göstergesiyle aynı, varsayılan 14).',
    'zone.fractal.atrMultiplier.hint':
      'SL mesafesi = çarpan × ATR, fraktal mumunun ucundan itibaren. Büyük değer = daha geniş SL (varsayılan 1,5).',
    'zone.fractal.sarStep.hint':
      'Parabolic SAR ivme adımı (MT5 varsayılanı 0,02). Büyük değer SAR\'ı fiyata daha hızlı yaklaştırır.',
    'zone.fractal.sarMax.hint': 'Parabolic SAR ivmesinin üst sınırı (MT5 varsayılanı 0,2).',
    'zone.fractal.orderCount.hint':
      'Yön başına (BUY ve SELL ayrı ayrı) en yeni kaç fraktala bekleyen emir konacağı (1–20). Fiyatın ulaştığı, dolan veya elle silinen fraktalın yeri boş kalır; daha eski fraktalla doldurulmaz. Açık pozisyonları „Maks Pozisyon“ sınırlar.',
    'zone.fractal.buyOrderCount.hint':
      'En yeni kaç fraktala BUY bekleyen emri konacağı (1–20). Fiyatın ulaştığı, dolan veya elle silinen fraktalın yeri boş kalır; daha eski fraktalla doldurulmaz. Açık pozisyonları „Maks Pozisyon“ sınırlar.',
    'zone.fractal.sellOrderCount.hint':
      'En yeni kaç fraktala SELL bekleyen emri konacağı (1–20). Fiyatın ulaştığı, dolan veya elle silinen fraktalın yeri boş kalır; daha eski fraktalla doldurulmaz. Açık pozisyonları „Maks Pozisyon“ sınırlar.',
    'zone.fractal.rr.hint':
      'TP = giriş ± bu değer × SL mesafesi. Örn. 2: TP, SL\'nin iki katı uzakta. 0 = TP yok.',
    'zone.fractal.tpByMoney.hint':
      'Açık: TP, Risk/Ödül çarpanı yerine sabit bir tutardır (hesap para birimi). Kapalı: TP = SL mesafesi × çarpan.',
    'zone.fractal.tpMoney.hint':
      'Pozisyon başına hedef kâr (hesap para birimi). TP, bu tutarın o yönün lot büyüklüğünde karşılık geldiği fiyat mesafesine konur. 0 = TP yok.',
    'zone.fractal.nextLossMoney.hint':
      'Sonraki fraktal emri, bu yönde en son açılan pozisyon en az bu tutar zarardayken konur. Örn. 1 $: BUY 2650\'de açık → yeni BUY emri ancak −1 $\'da (0.01 lot altında ≈ 2649). Pozisyon yoksa emir hemen konur. 0 = sınır yok.',
    'zone.fractal.nextLossPips.hint':
      'Sonraki fraktal emri, bu yönde en son açılan pozisyonun fiyatı girişe karşı en az bu kadar gittiğinde konur. Örn. 2.00: BUY 2650\'de → yeni BUY emri ancak Bid ≤ 2648.00; SELL 2700\'de → ancak Ask ≥ 2702.00. 0 = sınır yok.',
    'zone.fractal.nextLossByPips.hint':
      'Açık: sınır fiyat mesafesidir (pip, örn. 2.00 girişe karşı). Kapalı: sınır pozisyonun zararıdır (hesap para birimi, örn. 1 $). BUY ve SELL ayrı değerlendirilir.',
    'zone.fractal.maxPositions.hint':
      'Bu bölgede aynı anda açık olabilecek en fazla pozisyon. Sınıra ulaşınca bölge yeni emir koymaz ve bekleyen emirlerini siler. 0 = sınırsız (motor en çok 500 ile sınırlar).',
    'zone.legacyOrders.delete.hint':
      'Kararı kaydeder; bot bir sonraki turda bu emirleri MT5\'te siler. Açık pozisyonlar kalır.',
    'zone.legacyOrders.keep.hint':
      'Kararı kaydeder; emirler MT5\'te kalır, bot onlara dokunmaz ve bu pencere bir daha açılmaz.',
    'vps.online.restart.hint': 'Worker’ı worker API’si üzerinden yeniden başlatır (run_uvicorn_watchdog.bat açar). Botlar çalışmaya devam eder; yalnızca yönetici anahtarıyla, watchdog altında kullanılabilir.',
    // --- Analiz ---
    'nav.analysis.hint': 'Analiz sayfası: seçili hesap ve setup için grafik ve istatistik.',
    'analysis.tab.chart.hint': 'MT5 fiyat grafiği; setup sınırları ve setup ayarlarıyla.',
    'analysis.tab.stats.hint': 'Gerçek işlemlerden metrikler, eğriler ve sembol/setup dağılımı.',
    'analysis.zone.hint': 'Analiz edilen setup (yalnızca seçili hesabın setup’ları), sembol kartlarındaki gibi „Sembol · Setup n“ adıyla. Kaydedilmemiş değişiklikler de dikkate alınır.',
    'analysis.range.hint': 'Analiz edilen zaman aralığı, broker günü (MT5 saati) olarak. Hazır seçimler veya GG.AA.YY ile serbest aralık.',
    'analysis.range.preset.hint': 'Aralığı „{label}“ yapar (broker günleri).',
    'analysis.range.from.hint': 'İlk gün, GG.AA.YY (ör. 01.09.26). Bu günün başından itibaren sayılır.',
    'analysis.range.to.hint': 'Son gün, GG.AA.YY. Bu günün sonuna kadar sayılır.',
    'analysis.range.apply.hint': 'Girilen başlangıç ve bitişi kullanır.',
    'analysis.range.apply.off.hint': 'Önce iki geçerli tarih girin (GG.AA.YY); başlangıç bitişten sonra olamaz.',
    'analysis.range.calendar.hint': 'Takvimde ilk tıklama başlangıç, ikinci tıklama bitiş gününü seçer.',
    'analysis.settings.hint': 'Grafikte ve sayfada neyin gösterileceğini seçer. Uyarılar ve model sınırları her zaman görünür.',
    'analysis.settings.zoneLines.hint': 'Setup’ın alt ve üst fiyat sınırını grafikte kesik çizgi ve hafif renkli bant olarak gösterir.',
    'analysis.settings.levels.hint': 'Botun şu anki fiyattan hesapladığı grid kademeleri (alış yeşil, satış kırmızı, noktalı). Yalnızca gösterim; bot kendisi hesaplar.',
    'analysis.settings.trades.hint': 'Çalışan botun bu setup’taki açık pozisyonları (düz çizgi, TP/SL noktalı) ve bekleyen emirleri (kesik çizgi). 5 saniyede bir yenilenir.',
    'analysis.settings.pauses.hint': 'Piyasa araları (hafta sonu, tatil, günlük ara) iki mum arasında ince kesik dikey çizgi olarak gösterilir.',
    'analysis.settings.rsi.hint': 'Gösterilen mumlardan tarayıcıda hesaplanan RSI (14, Wilder), grafiğin altında ayrı bölmede.',
    'analysis.chart.timeframe.option.hint': 'Mumları {tf} olarak gösterir. Uzun aralıklarda büyük zaman dilimi daha hızlı yüklenir.',
    'analysis.chart.hours.hint': 'Mum verisinden tahmin edilen olağan işlem saati (broker saati). Kesin değildir; broker tatilleri dahil değil.',
    'analysis.chart.brokerTime.hint': 'Grafikteki tüm zamanlar MT5’in verdiği broker saatidir, tarayıcının saat dilimine çevrilmez.',
    'analysis.chart.key.hint': 'Gri taralı alan: MT5’ten veri yok (mum uydurulmaz). Kesik dikey çizgi: piyasa arası. Diğerleri görünüm ayarlarından (dişli) açılıp kapatılır; eksik veri işareti kapatılamaz.',
    'analysis.settings.zoneCard.hint': 'Seçili setup’ın ayarlarını grafiğin üstünde kart olarak gösterir.',
    'analysis.license.hint': 'Grafik kütüphanesinin lisans bilgisini gösterir (TradingView).',
    'analysis.license.link.hint': 'TradingView web sitesini yeni sekmede açar.',
    'analysis.clock.badge.hint': 'Broker saatinin UTC’ye farkı (worker MT5’ten ölçer). „Bugün“ ve gün sınırları buna göre hesaplanır.',
    'analysis.settings.history.hint': 'Arşivdeki kapanan işlemler grafikte: girişte ok (alış yeşil yukarı, satış kırmızı aşağı), çıkışta nokta (kâr yeşil, zarar kırmızı), aralarında noktalı çizgi. Setup’ı bilinmeyen işlemler gri ve „?“ ile.',
    'analysis.settings.fractals.hint': 'Yalnızca fraktal setup’larda: kapanmış mumlardan 5 mumluk Bill-Williams fraktalları (botla aynı kural), yüksek üstünde/düşük altında üçgen. Botun işlem açtığı fraktallar turuncu.',
    'analysis.chart.fractals.switch.hint': 'Grafiği setup’ın fraktal zaman dilimine ({tf}) geçirir; botun işlem açtığı fraktallar ancak orada işaretlenir.',
    'analysis.trades.unknownZone.hint': 'Bu işlem robotun magic aralığında ama setup kaydında güvenle eşleşmiyor (örneğin kayıt başlamadan önce açılmış). Tahmin edilmez.',
    'analysis.trades.partial.hint': 'Pozisyonun bir kısmı kapatıldı; her kısmi kapanış ayrı bir işlemdir. Giriş maliyeti hacme göre paylaştırılır.',
    'analysis.trades.reversal.hint': 'Netting hesabında ters çevirme (INOUT): pozisyon kapandı ve kalan hacim aynı pozisyon numarasıyla ters yönde açıldı.',
    'analysis.trades.closeBy.hint': 'Karşı pozisyonla kapatıldı (Close By).',
    'analysis.trades.noEntry.hint': 'Bu pozisyonun giriş deal’i arşivde ve MT5’te bulunamadı: giriş fiyatı ve setup belirlenemez.',
    'analysis.trades.openedBefore.hint': 'Seçili aralıktan önce açıldı ({at}); kapanış zamanına göre bu aralıkta sayılır.',
    'analysis.trades.reason.sl.hint': 'Stop Loss ile kapandı.',
    'analysis.trades.reason.tp.hint': 'Take Profit ile kapandı.',
    'analysis.trades.reason.so.hint': 'Teminat yetersizliğinden broker tarafından kapatıldı (Stop Out).',
    'analysis.trades.focus.hint': 'Grafiği bu işlemin girişine (yoksa çıkışına) kaydırır.',
    'analysis.trades.col.mfe.hint': 'MFE: işlemin ara sıra ulaştığı en büyük kâr, MAE: en büyük zarar; puan ve hesap para birimi. Tahmindir (alt sınır): yalnızca giriş ve çıkış mumu arasındaki M1 mumları ile giriş/çıkış fiyatı sayılır. SELL için Ask = Bid + mumun spread’i. Para, işlemin kendi kârından türetilir (giriş = çıkışta yok).',
    'analysis.trades.mfe.compute.hint': 'Tablodaki henüz hesaplanmamış işlemler için M1 mumlarını yükler (sembol başına bir kez, en yeniler önce) ve MFE/MAE hesaplar. Parantezde: açık işlem sayısı. Hepsi hesaplanınca devre dışı.',
    'analysis.trades.mfe.reason.noEntry.hint': 'Giriş deal’i arşivde yok: giriş fiyatı ve zamanı bilinmiyor.',
    'analysis.trades.mfe.reason.tooLong.hint': 'İşlem 100.000 M1 mumundan (yaklaşık 69 gün) uzun açık kaldı: bu sınırın üstünde mum yüklenmez.',
    'analysis.trades.mfe.reason.busy.hint': 'M1 mumları şu an alınamadı (hesap meşgul veya MT5 hatası). Tekrar basın.',
    'analysis.trades.mfe.reason.missing.hint': 'Giriş ile çıkış arasında M1 mumları eksik (MT5’ten alınamadı). 0 gösterilmez.',
    'analysis.trades.mfe.reason.noSpread.hint': 'SELL için mum spread’i gerekli, ama bir mumda yok.',
    'analysis.trades.mfe.reason.noPoint.hint': 'Sembolün point değeri bilinmiyor: puan hesaplanamaz.',
    'analysis.stats.scope.hint': 'Hangi işlemler sayılır: tüm hesap, bir sembolün tüm setup’ları (setup’ları karşılaştırmak için) veya tek bir setup.',
    'analysis.stats.kpi.net.hint': 'Kâr + komisyon + swap + ücret, dönemde kapanan işlemler.',
    'analysis.stats.kpi.trades.hint': 'Her kapanış (kısmi dahil) bir işlemdir; pozisyon = farklı pozisyon numarası.',
    'analysis.stats.kpi.winRate.hint': 'Net kârı > 0 olan işlemlerin oranı.',
    'analysis.stats.kpi.profitFactor.hint': 'Brüt kâr ÷ brüt zarar. Zarar yoksa “—”. Değerlendirme değildir.',
    'analysis.stats.kpi.avg.hint': 'Net kâr ÷ işlem sayısı.',
    'analysis.stats.kpi.best.hint': 'Tek bir işlemin en yüksek ve en düşük net sonucu.',
    'analysis.stats.kpi.gross.hint': 'Kârlı işlemlerin toplamı / zararlı işlemlerin toplamı.',
    'analysis.stats.kpi.cycles.hint': 'Take profit ile kapanan işlemler.',
    'analysis.stats.kpi.maxDrawdown.hint': 'Gerçekleşen kâr eğrisinin en yüksek noktasından en büyük düşüş.',
    'analysis.stats.curve.realized.hint': 'Seçili kapsamın kümülatif net kârı (kapanış zamanına göre).',
    'analysis.stats.curve.balance.hint': 'Bugünkü bakiyeden geriye hesaplanan hesap bakiyesi; arşivde boşluk varsa gizli.',
    'analysis.stats.curve.drawdown.hint': 'Gerçekleşen kâr eğrisinin önceki zirveye uzaklığı.',
    'analysis.stats.by.zone.hint': 'Kayıtlı setup’a (magic numarası) göre, aynı metriklerle yan yana; bilinmeyen, manuel ve diğer işlemler ayrı.',
    'analysis.stats.by.symbol.hint': 'İşlem gören sembole göre, yalnızca kayıtlı setup’ların işlemleri; bilinmeyen, manuel ve diğer işlemler ayrı.',
    'analysis.stats.by.weekday.hint': 'Kapanış gününe göre (MT5 saati).',
    'analysis.stats.by.hour.hint': 'Kapanış saatine göre (MT5 saati).',
    // --- CSV-İçe aktarma ---
    'csv.import.hint': 'Bir CSV dosyasından mumları bu hesabın veri kaynağı olarak yükler. MT5 verisi değişmez.',
    'csv.file.hint': 'Mum verisi içeren CSV dosyası (en çok 150 MB). Zaman, open, high, low, close sütunları gerekir.',
    'csv.symbol.hint': 'Dosyadaki mumların sembolü (ör. XAUUSD). Backtest bu sembol için bu kaynağı kullanır.',
    'csv.timeframe.hint': 'Dosyadaki mumların zaman dilimi. Zamanlar bu dilimin ızgarasına oturmalı, aksi halde dosya reddedilir.',
    'csv.offset.hint': 'CSV saatine eklenen saat; sonuç MT5 sunucu saati olmalı. Dosya UTC ise broker farkını girin (ör. UTC+3 için 3). −14 ile 14 arası.',
    'csv.cancel.hint': 'Pencereyi kapatır; yükleme sürüyorsa durdurur ve yarım içe aktarmayı siler.',
    'csv.submit.hint': 'Dosyayı yükler, kontrol eder ve kaydeder. Hata varsa hiçbir şey kaydedilmez. Dosya seçilmeden kullanılamaz.',
    'csv.replace.hint': 'Çakışan eski içe aktarmayı siler ve bunu kaydeder. Geri alınamaz.',
    'csv.item.unfinished.hint': 'Yükleme veya kontrol tamamlanmadı. Bu içe aktarma veri kaynağı olarak seçilemez; silinebilir.',
    'csv.delete.hint': 'Bu içe aktarmayı ve mumlarını siler. MT5 verisi etkilenmez.',
    'nav.backtest.hint': 'Backtest sayfası: bir setup’ın kopyasını geçmiş fiyatlarla tarayıcıda test eder.',
    'backtest.field.timeframe.hint': 'Test için kullanılan mum çözünürlüğü. M1 en doğru sonucu verir ama en çok veri yükler; daha kaba çözünürlükte mumun içindeki fiyat yolu tahmin edilir.',
    'backtest.field.spread.hint': 'Spread kaynağı: “Mumdan” her mumun kayıtlı spread’ini kullanır, “Sabit” hep aynı değeri, “En çok” mumdaki ve verilen değerin büyüğünü.',
    'backtest.field.spreadPoints.hint': 'Spread, puan cinsinden. “Sabit” ve “En çok” seçeneklerinde kullanılır.',
    'backtest.field.commission.hint': 'Bir lot için hesap para biriminde komisyon, giriş ve çıkış toplamı. Test bunu yarı yarıya giriş ve çıkışta düşer. Arşivden öneri gelir.',
    'backtest.field.swap.hint': 'Açıkken gece taşıma (swap) maliyeti bugünkü sembol değerleriyle hesaplanır. Kapalıyken swap sıfır sayılır.',
    'backtest.field.capital.hint': 'Equity eğrisinin başladığı hesap para birimindeki tutar. Yalnızca hesap değeridir; gerçek bakiyeye dokunmaz ve marjin denetimi yoktur.',
    'backtest.field.fill.hint': '“Fiyat boşluğu”: fiyat bir emri atlarsa emir atlanan fiyattan dolar. “Eşitlik”: emir her zaman kendi fiyatından dolar.',
    'backtest.field.slFirst.hint': 'Aynı fiyatta hem TP hem SL tetiklenirse SL önce sayılır (temkinli sonuç). Kapalıyken TP önce sayılır.',
    'backtest.field.path.hint': 'Bir mumun içinde fiyatın önce düşüğe mi yükseğe mi gittiği bilinmez. “İkisi de” iki test çalıştırıp aralığı gösterir.',
    'backtest.field.closeAtEnd.hint': 'Açıkken test sonunda açık pozisyonlar son fiyattan kapatılır. Kapalıyken açık kalır ve açık K/Z olarak gösterilir.',
    'backtest.field.approximate.hint': 'Desteklenmeyen hesap türündeki sembolleri yine de yaklaşık hesaplar. Sonuç bir tahmindir.',
    'backtest.run.hint': 'Seçilen setup kopyasını bu ayarlarla çalıştırır. Gerçek setup, emirler ve hesap değişmez.',
    'backtest.run.off.noZone.hint': 'Önce bir setup seçin.',
    'backtest.run.off.symbol.hint': 'Sembol bilgisi yok: yüklenmesini bekleyin ya da sembolün hesapta bulunduğunu denetleyin.',
    'backtest.run.off.netting.hint': 'Bu hesap netting; backtest yalnızca hedging hesaplarını simüle eder.',
    'backtest.run.off.loading.hint': 'Broker saati ve hesap verileri yükleniyor; birkaç saniye bekleyin.',
    'backtest.cancel.hint': 'Çalışan testi durdurur. Sonuç atılır.',
    'backtest.commission.use.hint': 'Arşivdeki ortalama komisyonu alana yazar.',
    'backtest.log.onlyWarn.hint': 'Bilgi satırlarını gizler; yalnızca uyarı ve hataları gösterir.',
    'backtest.curve.equity.hint': 'Equity: başlangıç sermayesi + gerçekleşen + açık K/Z, her mumun sonunda.',
    'backtest.curve.drawdown.hint': 'Düşüş: equity’nin önceki zirveden uzaklığı.',
    'backtest.summary.realized.hint': 'Kapanan işlemlerin net toplamı (kâr + komisyon + swap).',
    'backtest.summary.open.hint': 'Açık pozisyonların test sonundaki kâr/zararı; giriş komisyonu ve yazılan swap dahil.',
    'backtest.summary.endEquity.hint': 'Başlangıç sermayesi + gerçekleşen + açık K/Z.',
    'backtest.summary.openPositions.hint': 'Test sonunda hâlâ açık olan pozisyon sayısı.',
    'backtest.summary.maxDrawdown.hint': 'Equity’nin önceki zirveden en büyük düşüşü, hesap para biriminde.',
    'backtest.summary.commission.hint': 'Kapanan işlemlerin toplam komisyonu (negatif = maliyet).',
    'backtest.summary.swap.hint': 'Kapanan işlemlerin toplam swap’ı (negatif = maliyet).',
    'backtest.summary.spread.hint': 'Açılan pozisyonların spread maliyeti. Dolum fiyatlarında zaten vardır; yalnızca bilgi içindir.',
    'backtest.result.path.auto.hint': 'Mum yolu, mumun yönüne göre otomatik seçildi.',
    'backtest.result.path.lowFirst.hint': 'Her mumda fiyat önce düşüğe, sonra yükseğe gitti.',
    'backtest.result.path.highFirst.hint': 'Her mumda fiyat önce yükseğe, sonra düşüğe gitti.',
  },
  {
    // --- Account ---
    'account.label.hint':
      'Selects the MT5 account you are working with. Zones, bot and logs belong to the selected account.',
    'account.action.downloadLog.hint': 'Downloads the bot log file of the selected account to your computer.',
    'account.action.edit.hint': 'Edits account name, server, environment, MT5 path or password. Not available while the bot is running.',
    'account.action.delete.hint': 'Removes the selected account from the list (asks for confirmation). The broker account and positions are not affected.',
    'account.action.add.hint': 'Adds a new MT5 account (name, login, server, MT5 path). The password is stored on the worker only.',
    'account.action.menu.hint': 'Account menu: download the bot log, edit or delete the account, add a new account.',
    'account.delete.confirm.hint': 'Deletes the account permanently; this cannot be undone.',
    'account.dialog.close.hint': 'Closes the window; unsaved input is discarded.',
    'account.duplicate.confirm.hint': 'Opens the already saved account in the edit form.',
    'account.env.demo.hint': 'DEMO/TEST account: virtual money, no real risk.',
    'account.env.live.hint': 'LIVE account: real money! Orders are traded on the real market.',
    'account.form.editExisting.hint': 'Opens the account already saved with the same login for editing.',
    'account.form.name.hint': 'A free name to recognise the account in the list (e.g. “Live Account 1”).',
    'account.form.login.hint': 'Your MT5 account number (numeric login/ID).',
    'account.form.password.hint': 'Your MT5 account password. It is stored on the worker only and never sent back to the UI.',
    'account.form.password.keep.hint':
      'This field is empty on purpose: for security the password is stored on the worker only and never sent back to the UI. Leave it empty to keep the saved password. To change it, enter the full MT5 master password, not the investor password.',
    'account.form.password.show.hint': 'Shows the password as plain text; use it only when nobody is looking.',
    'account.form.password.hide.hint': 'Hides the password again.',
    'account.form.server.hint': 'The broker’s MT5 server name, exactly as shown in MT5 (e.g. Eightcap-Demo).',
    'account.form.env.hint':
      'DEMO = practice account, LIVE = real-money account. Must match the account type at the broker (the worker checks this on connect).',
    'account.form.notes.hint': 'Optional private notes (up to 1000 characters). Does not affect the bot.',
    'account.form.save.hint': 'Saves the account on the worker and selects it.',
    'account.path.label.hint':
      'Path of the MetaTrader 5 terminal (terminal64.exe) this account uses. If several MT5 installations exist, pick the right one.',
    'account.path.rescan.hint': 'Scans the VPS for installed MT5 terminals again.',
    'account.path.scanning.hint': 'Scanning MT5 paths…',
    'account.path.custom.hint': 'Lets you type the terminal64.exe path by hand instead of using the detected list.',

    // --- Bot ---
    'bot.status.connecting.hint': 'The bot process was started and is connecting to MT5…',
    'bot.status.running.hint': 'The bot is connected to MT5 and manages the grid orders of all active zones.',
    'bot.status.processNoMt5.hint':
      'A bot process exists but has no MT5 connection (dropped or hanging). Use “Restart Bot” or “Stop Bot”.',
    'bot.status.stopped.hint':
      'The bot is not running, no new orders are placed. Existing positions and pending orders stay at the broker.',
    'bot.start.hint':
      'Starts the bot process for this account and connects to MT5. Grid orders are placed for active zones.',
    'bot.connecting.hint': 'The MT5 connection is being established (can take up to 3 minutes). Please wait.',
    'bot.stop.hint':
      'Stops the bot (asks for confirmation). Open positions and pending orders are preserved at the broker.',
    'bot.disconnect.confirm.hint':
      'Stops the bot and disconnects from MT5. Open positions and pending orders stay at the broker.',

    // --- Chart ---
    'chart.zone.active.hint': 'Setup active: the bot manages orders for this setup.',
    'chart.zone.inactive.hint': 'Setup inactive: the bot places no orders for this setup.',
    'chart.zone.priceRange.hint': 'Lower and upper price limit of the setup. Orders are only placed within this range.',
    'chart.zone.levels.hint': 'Number of grid levels below / above the price (Levels Below / Above).',
    'chart.stat.price.hint': 'Latest price of the symbol in the chart (live stream).',
    'chart.stat.rsi.hint':
      'RSI (Relative Strength Index): a 0–100 momentum indicator. Above 70 is usually considered overbought, below 30 oversold. Drawn as a separate line in the chart.',
    'chart.stat.pl.hint': 'Total profit/loss of the open positions (floating P/L, not yet realised).',
    'chart.stat.positions.hint': 'Number of currently open positions.',

    // --- Common ---
    'common.cancel.hint': 'Cancels the action; nothing changes.',
    'common.close.hint': 'Closes the window.',
    'common.noChanges.hint': 'There are no changes to save.',
    'common.theme.light.hint': 'Uses the light theme.',
    'common.theme.dark.hint': 'Uses the dark theme.',
    'common.theme.system.hint': 'Follows the light/dark setting of your device.',
    'common.theme.cycle.hint': 'Theme: {current}. Click to switch to “{next}”.',

    // --- Dashboard ---
    'dashboard.sysinfo.hint': 'System menu: address and port info, update check and system shutdown.',
    'dashboard.sysinfo.checkUpdates.hint': 'Compares with the version on GitHub (origin/main) and offers a new version if there is one.',
    'dashboard.shutdown.hint': 'Opens the shutdown dialog. All bots are stopped; asks for confirmation.',
    'dashboard.shutdown.confirm.hint':
      'Stops all bots and closes the interface. Open positions stay at the broker.',
    'saveBar.saveAll.hint': 'Saves all unsaved changes in all zones. Shortcut: Cmd+Enter (Mac) / Ctrl+Enter (Windows).',
    'saveBar.discard.hint': 'Discards all unsaved changes and restores the last saved state.',
    'saveBar.saved.hint': 'All changes are saved.',
    'saveBar.saving.hint': 'Saving…',
    'metrics.price.hint': 'Current price of the zone symbol.',
    'metrics.profit.hint': 'Total profit/loss of the open positions (floating P/L, not yet realised).',
    'metrics.positions.hint': 'Number of currently open positions.',
    'metrics.pending.hint': 'Number of grid orders waiting at the broker that are not filled yet.',
    'update.apply.hint':
      'Pulls the new version from GitHub (git pull) and restarts the worker; running bots resume on their own afterwards.',
    'update.vpsLink.hint':
      'Even if the worker is unreachable you can update or restart it via SSH on the VPS page (local only).',

    // --- Logs ---
    'logs.tab.activity.hint': 'What you did in the UI during this session and bot events (start, stop, errors).',
    'logs.tab.robot.hint': 'Log file of the bot (grid engine): placed/deleted orders, warnings, errors.',
    'logs.tab.mt5.hint': 'The MT5 terminal’s own log output (connection, order errors).',
    'logs.refresh.hint': 'Reloads the log right now (it also refreshes automatically at regular intervals).',
    'zone.logs.toggle.hint': 'Shows/hides the robot log lines of all setups of this symbol (refreshes every 10 s while open). With more than one setup, each line starts with its setup number. Older untagged lines don’t appear here.',
    'logs.download.hint': 'Downloads the log file of the selected account to your computer.',
    'logs.clear.activity.hint': 'Clears only the Activity list (UI events of this session).',
    'logs.clear.all.hint': 'Clears all logs of this account on the worker (asks for confirmation). Cannot be undone.',
    'logs.clearConfirm.confirm.hint': 'Permanently deletes all logs of this account.',
    'logs.status.hint': 'Reachability of the worker and time of the last update.',

    // --- Navigation ---
    'nav.home.hint': 'Grid Robot {version}. Goes to the home page.',
    'nav.dashboard.hint': 'Home page: account, zones, bot control and logs.',
    'nav.formation.hint': 'Price chart and formations.',
    'nav.vps.hint': 'VPS management: worker status, update, restart and logs.',
    'nav.users.hint': 'User management (administrator only): add users, renew their keys, delete them.',
    'nav.language.cycle.hint': 'Language: {current}. Click to switch to {next}.',
    'nav.language.option.hint': 'Sets the interface language to {language}.',

    // --- Users ---
    'users.refresh.hint': 'Reloads the user list from the worker.',
    'users.add.hint': 'Creates a new user and generates a personal key for them. Connected with that key, the user only sees their own accounts.',
    'users.action.newKey.hint': 'Generates a new key for this user (asks first). The old key stops working immediately.',
    'users.action.delete.hint': 'Deletes the user (asks first). Their accounts and bots are kept and belong to the administrator.',
    'users.create.name.hint': 'Display name of the user (1–40 characters, unique). Only shown in the list and in the owner picker.',
    'users.create.submit.hint': 'Creates the user and shows their personal key once.',
    'users.key.field.hint': 'The user’s personal key. Goes into the API key field of the “Connect to VPS” dialog. Visible only now; never share it.',
    'users.key.copy.hint': 'Copies the key to the clipboard.',
    'users.link.field.hint': 'Ready-made connection link with address and key. Opening it in a browser prefills the connect dialog; the link contains the key, so pass it on safely.',
    'users.link.copy.hint': 'Copies the connection link to the clipboard.',
    'users.key.done.hint': 'Closes the window. The key will not be shown again.',
    'users.rotate.confirm.hint': 'Generates the new key and invalidates the old one immediately.',
    'users.delete.confirm.hint': 'Permanently deletes the user and their key; their accounts become unassigned.',
    'users.owner.label.hint': 'Owner of the account. A user only sees and manages their own accounts; with “Administrator” selected only the administrator key sees the account.',

    // --- VPS connection ---
    'connection.chip.hint': 'Worker (VPS) connection: {status}. Click to open the connection dialog.',
    'connection.field.link.hint':
      'Paste the connection link or code your VPS setup printed; address and key fill in by themselves.',
    'connection.field.url.hint':
      'The worker’s https address (your ngrok domain), e.g. https://yourname.ngrok-free.dev. No need to add “/api”.',
    'connection.field.key.hint':
      'WORKER_API_KEY on the VPS (administrator) or the personal key the administrator gave you. With a personal key you only see your own accounts. Stored in this browser only; never share the key or the link.',
    'connection.key.show.hint': 'Shows the API key as readable text.',
    'connection.key.hide.hint': 'Hides the API key behind dots.',
    'connection.action.test.hint':
      'Sends a trial request to the worker with the entered address and key. Nothing is saved.',
    'connection.action.connect.hint':
      'Saves the address and key in this browser and reloads the page. A successful test is required first.',
    'connection.action.disconnect.hint':
      'Removes the saved address and key from this browser (asks to confirm). The worker on the VPS is not affected.',
    'connection.disconnect.confirm.hint': 'Removes the connection from this browser; bots keep running on the VPS.',
    'connection.gate.connect.hint':
      'Opens the connection dialog: enter address and key, or paste the connection link.',

    // --- General settings ---
    'settings.interval.hint':
      'How often the engine loop checks the market and orders, in seconds (1–60 s). Small value: fast reaction but more load; large value: light but slow reaction. The change is written to the worker with Save.',
    'settings.decrease.hint': 'Lowers the check interval by 0.1 s (faster reaction, more load).',
    'settings.decrease.min.hint': 'Lowest value (1 s); it cannot be lowered further.',
    'settings.increase.hint': 'Raises the check interval by 0.1 s (less load, slower reaction).',
    'settings.increase.max.hint': 'Highest value (60 s); it cannot be raised further.',
    'settings.save.hint': 'Saves the check interval.',

    // --- Shared UI ---
    'ui.hint': 'Info',
    'ui.close.hint': 'Closes the window.',
    'ui.dismiss.hint': 'Dismisses this notification.',

    // --- VPS ---
    'vps.busy.hint': 'Another VPS action is running; wait until it has finished.',
    'vps.refresh.hint': 'Queries the VPS status again right now.',
    'vps.tile.worker.hint':
      'State of the FastAPI worker (uvicorn), which manages the bots. “Not responding” = port is open but no answer.',
    'vps.tile.ngrok.hint':
      'The ngrok tunnel connects the UI to the worker over the internet. If it is offline the UI cannot reach the worker. Self-healing (task AutoGrid-Tunnel): the URL is checked every 5 minutes; without an answer ngrok is restarted, and after 3 failures in a row the VPS reboots itself (at most once an hour, 3 times a day).',
    'vps.tile.bots.hint': 'Bot processes running on the VPS (one per account) and the number of open MT5 terminals.',
    'vps.tile.version.hint':
      'Installed version on the VPS with its git branch/commit and when it was last updated. A warning shows if the branch is not “main”; auto-update pulls from main.',
    'vps.tile.autostart.hint':
      'Whether the VPS starts everything on boot: automatic logon + the AutoGrid-Start task. If “Incomplete” the worker will not come back after a reboot.',
    'vps.tile.system.hint': 'Computer name of the VPS and how long it has been up.',
    'vps.ctrl.check.hint': 'Compares the version on origin/main with the one on the VPS (via the worker).',
    'vps.ctrl.check.noWorker.hint':
      'The worker must be running for the check. You can still start the update with the button below.',
    'vps.action.update.hint':
      'Pulls the latest version from origin/main and restarts the worker (AutoGrid-Update task). Asks for confirmation.',
    'vps.action.restart.hint': 'Restarts the worker; running bots resume on their own afterwards. Asks for confirmation.',
    'vps.action.restartNgrok.hint': 'Restarts the ngrok tunnel (helps if the UI–worker connection dropped). Asks for confirmation.',
    'vps.action.reboot.hint':
      'Fully reboots the VPS (Windows). All processes close; autostart takes over after logon. Asks for confirmation.',
    'vps.elevated.fix.hint':
      'Terminates old AutoGrid processes running with administrator rights; the worker then restarts with normal rights. Asks for confirmation.',
    'vps.log.tab.worker.hint': 'Worker console log (uvicorn, worker_console.log).',
    'vps.log.tab.ngrok.hint': 'Log of the ngrok tunnel (ngrok.log).',
    'vps.log.tab.update.hint': 'Log of the automatic update task.',
    'vps.log.tab.tunnel.hint': 'Log of the tunnel watchdog (tunnel_watchdog.log): the public ngrok URL is checked every 5 minutes; failures, ngrok restarts and automatic VPS reboots show up here.',
    'vps.log.refresh.hint': 'Fetches the log from the VPS again (it also refreshes regularly on its own).',

    // --- Zone: header and panel ---
    'zone.panel.count.hint': 'Number of symbols. Each symbol has one or more setups.',
    'zone.panel.add.hint': 'Adds a new symbol: you choose the symbol first, then the first setup is created automatically. Enter the settings and press Save.',
    'zone.panel.add.off.hint': 'The bot is running but not connected to MT5; symbols cannot be added until it is connected.',
    'zone.delete.confirm.hint': 'Removes the setup from the list. “Save All Settings” is needed to make it permanent.',
    'zone.delete.last.confirm.hint': 'Removes the last setup and with it the symbol from the list. “Save All Settings” is needed to make it permanent.',
    'zone.header.badge.buy.hint': 'This setup only places BUY orders.',
    'zone.header.badge.sell.hint': 'This setup only places SELL orders.',
    'zone.header.badge.both.hint': 'This setup places both BUY and SELL orders.',
    'zone.market.hint.open': "Market open. Usually {hours} (broker server time).",
    'zone.market.hint.closed': 'Market closed. Usually open {hours} (broker server time). No new orders can be placed for this symbol while it is closed.',
    'zone.market.hint': 'Whether the market is open for this symbol. Every symbol has its own trading hours; no new orders can be placed while it is closed.',
    'zone.header.unsaved.hint': 'This setup has changes that are not saved yet.',
    'zone.header.price.hint': 'Live price (bid) of the symbol, shown with the symbol’s digits. "--" while the engine is not running.',
    'zone.header.started.hint':
      'The setup is active and the engine manages its orders. Click to disable the setup (saved immediately).',
    'zone.header.start.hint':
      'The setup is off. Click to activate it (saved immediately); orders are placed if the engine is running.',
    'zone.header.ready.hint':
      'The setup is active but the engine is not running; orders are placed once you start the bot. Click to switch the setup off (saved immediately).',
    'zone.header.off.hint':
      'The setup is off. Click to activate it (saved immediately); orders are placed once you start the bot.',
    'zone.header.save.hint': 'Saves only the changes of this setup; other setups are not affected.',
    'zone.header.save.off.hint': 'There are no unsaved changes in this setup.',
    'zone.header.test.hint': 'Tests a copy of this setup (including unsaved changes) against past prices on the Backtest page. The setup does not change.',
    'zone.header.menu.hint': 'Setup menu: further actions (delete setup).',
    'zone.header.delete.hint': 'Deletes the setup (asks for confirmation). If it is the last setup, the symbol goes too. Save is needed to make it permanent.',
    'zone.header.delete.off.hint':
      'The bot is running but not connected to MT5; the setup cannot be deleted until it is connected.',
    'zone.symbol.setupCount.hint': 'Number of setups of this symbol. Each setup runs separately in the engine, with its own magic number.',
    'zone.symbol.addSetup.hint': 'Adds a new setup to this symbol; the symbol is not asked, the lot is the smallest lot of the symbol. Enter the settings and press Save.',
    'zone.symbol.addSetup.off.hint': 'The bot is running but not connected to MT5; setups cannot be added until it is connected.',
    'zone.addSymbol.symbol.hint': 'Symbol to add (the broker’s MT5 symbol name). Type to search, pick from the list.',
    'zone.addSymbol.confirm.hint': 'Adds the symbol with its first setup to the list. Save is needed to make it permanent.',
    'zone.addSymbol.confirm.off.hint': 'Enter a valid symbol or pick one from the list first.',
    'zone.sync.hint':
      'When on, SELL uses the BUY values for grid step, lot, take profit and stop loss. Turn it off to enter separate values for SELL.',

    // --- Zone: basic fields ---
    'zone.field.symbol.hint':
      'Instrument to trade (the broker’s MT5 symbol name, e.g. USOUSD). Type to search, pick from the list. The change applies to all setups of this symbol. In brackets: the symbol’s price decimals.',
    'zone.field.orderType.hint':
      'BUY: buy orders only.\nSELL: sell orders only.\nBOTH: both directions; BUY and SELL can be set separately.',
    'zone.field.minPrice.hint':
      'Lower limit of the zone. Orders are only placed within Min–Max; if the price falls below it, that counts as leaving the zone.',
    'zone.field.maxPrice.hint':
      'Upper limit of the zone. Orders are only placed within Min–Max; if the price rises above it, that counts as leaving the zone.',

    // --- Zone: grid fields ---
    'zone.field.gridStep.hint':
      'Price distance between two consecutive grid levels (orders), in the symbol’s price unit ($). Small step: dense orders, large step: sparse orders.',
    'zone.field.buyGrid.hint':
      'Price distance between two grid levels for the BUY side ($). SELL has its own field.',
    'zone.field.lot.hint':
      'Volume of every grid order (lots). Never below the symbol’s minimum lot at your broker: 0 or a smaller value is raised to that minimum and rounded to the lot step; the engine caps it at 5 lots.',
    'zone.field.buyLot.hint': 'Volume of BUY orders (lots). Never below the symbol’s minimum lot at your broker; 0 or a smaller value is raised to it. SELL has its own field.',
    'zone.field.takeProfit.hint':
      'Take-profit distance ($): placed this far above the entry price for BUY, below it for SELL. The position closes in profit when the price gets there.',
    'zone.field.gridStep.guide': 'Guideline for {symbol}: {range}. A very tight step (close to the spread) makes orders fill, get deleted and be re-placed constantly.',
    'zone.field.takeProfit.guide': 'Guideline for {symbol}: {range}. A take profit smaller than the spread brings practically no gain.',
    'zone.field.buyTakeProfit.hint': 'Take-profit distance ($) for BUY positions: this far above the entry price.',
    'zone.field.stopLoss.hint':
      'Stop-loss distance ($): placed this far below the entry price for BUY, above it for SELL. 0 = no stop loss.',
    'zone.field.buyStopLoss.hint':
      'Stop-loss distance ($) for BUY positions: this far below the entry price. 0 = no stop loss.',
    'zone.field.sellGrid.hint': 'Price distance between two grid levels for the SELL side ($).',
    'zone.field.sellLot.hint':
      'Volume of SELL orders (lots). Never below the symbol’s minimum lot at your broker; 0 or a smaller value is raised to it.',
    'zone.field.sellTakeProfit.hint': 'Take-profit distance ($) for SELL positions: this far below the entry price.',
    'zone.field.sellStopLoss.hint':
      'Stop-loss distance ($) for SELL positions: this far above the entry price. 0 = no stop loss.',

    // --- Zone: breakout ---
    'zone.breakout.trendOnly.hint':
      'Breakout mode: orders are only placed in the trend direction (BUY above the current price, SELL below). No grid is built the other way. The pullback distance only applies in this mode.',
    'zone.breakout.minPullback.hint':
      'In breakout mode the first level must be at least this far ($) from the current price; closer levels are skipped.',
    'zone.breakout.buyPullback.hint':
      'In breakout mode BUY orders start at levels at least this far ($) above the current price; closer levels are skipped.',
    'zone.breakout.sellPullback.hint':
      'In breakout mode SELL orders start at levels at least this far ($) below the current price; closer levels are skipped.',
    'zone.stepByLoss.hint':
      'When on, grid, pullback, take profit and stop loss distances are entered as an amount ($) instead of a price: once the most recently opened position reaches this loss, the next position is opened. The distance depends on the lot size (double lot = half the distance). Because all open positions are in loss at the same time, the total loss grows faster (10 $, 30 $, 60 $ …). Spread and commission are not included.',
    'zone.field.gridStepLoss.hint':
      'Once the most recently opened position has lost this amount (account currency, $), the next position is opened. The bot converts the amount to a price distance using the lot size.',
    'zone.field.buyGridLoss.hint':
      'Once the last BUY position has lost this amount ($), the next BUY is opened; converted to a price distance with the BUY lot.',
    'zone.field.sellGridLoss.hint':
      'Once the last SELL position has lost this amount ($), the next SELL is opened; converted to a price distance with the SELL lot.',
    'zone.breakout.minPullbackLoss.hint':
      'In breakout mode the first level must be at least this amount ($) away from the current price (converted to a price distance with the lot size); closer levels are skipped. 0 = no limit.',
    'zone.breakout.buyPullbackLoss.hint':
      'In breakout mode BUY orders start at levels further away than the distance this amount ($) equals with the BUY lot. 0 = no limit.',
    'zone.breakout.sellPullbackLoss.hint':
      'In breakout mode SELL orders start at levels further away than the distance this amount ($) equals with the SELL lot. 0 = no limit.',
    'zone.field.takeProfitLoss.hint':
      'The position closes once it is this much ($) in profit. The bot converts the amount into a price distance using the lot size.',
    'zone.field.buyTakeProfitLoss.hint':
      'A BUY position closes once it is this much ($) in profit; converted with the BUY lot.',
    'zone.field.sellTakeProfitLoss.hint':
      'A SELL position closes once it is this much ($) in profit; converted with the SELL lot.',
    'zone.field.stopLossLoss.hint':
      'The position closes once it is this much ($) in loss; converted into a price distance using the lot size. 0 = no stop loss.',
    'zone.field.buyStopLossLoss.hint':
      'A BUY position closes once it is this much ($) in loss; converted with the BUY lot. 0 = no stop loss.',
    'zone.field.sellStopLossLoss.hint':
      'A SELL position closes once it is this much ($) in loss; converted with the SELL lot. 0 = no stop loss.',
    'zone.instantEntry.hint':
      'When on, the bot opens a market position at the current price right away whenever a side (BUY/SELL) has no open position: on start and after all positions of that side have closed (e.g. take profit). A BUY and SELL zone opens both. The next levels are placed one grid step away from this position. Only while the price is inside the zone range.',
    'zone.breakout.pullback.off.hint': 'Only used while “Trend direction only” (breakout) is on.',
    'zone.breakout.levelsBelow.hint':
      'How many grid levels (orders) are built below the reference price; each level is one grid step apart.',
    'zone.breakout.levelsBelow.off.hint': 'Not used in breakout + BUY mode: BUY is only built above the price.',
    'zone.breakout.levelsAbove.hint':
      'How many grid levels (orders) are built above the reference price; each level is one grid step apart.',
    'zone.breakout.levelsAbove.off.hint': 'Not used in breakout + SELL mode: SELL is only built below the price.',
    'zone.breakout.maxPositions.hint':
      'Maximum number of positions open at the same time in this zone. Once reached, no new orders are placed. 0 = unlimited (the engine caps it at 500).',

    // --- Zone: clear on exit ---
    'zone.exit.clearOnExit.tip':
      'When on and the price leaves the zone, the zone clears itself and stops (“Auto-cleared”); even if the price comes back no orders are placed until you press “Restart”. The options next to it decide what is cleared and when. When off, the zone’s orders are left alone.',
    'zone.exit.side.hint':
      'In which exit direction to clean up: any, only upwards (above the upper limit) or only downwards (below the lower limit). On an exit in the other direction the orders are left alone, but the zone is still deactivated.',
    'zone.exit.target.hint': 'Which side’s trades are deleted/closed when cleaning up: all, BUY only or SELL only.',
    'zone.exit.scope.hint':
      'Pending Orders Only: only orders that are not filled yet are deleted.\nAll Trades: open positions are closed as well (a loss may be realised).',
    'zone.exit.trigger.hint':
      'Current Price: triggers as soon as the price crosses the limit.\nCandle Close: triggers only if the candle of the chosen timeframe closes outside the zone (safer against short wicks).',
    'zone.exit.timeframe.hint':
      'Timeframe of the candle close check (M1 = 1 minute … D1 = 1 day). If the last closed candle closes outside the zone, that counts as an exit.',
    'zone.entryMode.hint':
      'Grid: sliding grid orders across the price range.\nFractal: pending orders only at the levels of the latest fractals on the chosen timeframe (as many per direction as “order count”, default 1). A new fractal shifts the orders; if price has already passed the level, no order is placed. If you delete the order or close the position in MT5, the same fractal is not traded again.',
    'zone.fractal.timeframe.hint':
      'Candle period in which fractals are detected (M1 = 1 minute … D1 = 1 day). A fractal spans 5 candles and is only valid once the two candles to its right have closed; ATR and SAR use this period too.',
    'zone.fractal.orderMode.hint':
      'Breakout: upper fractal → Buy Stop, lower fractal → Sell Stop (trades a break of the level).\nRebound: upper fractal → Sell Limit, lower fractal → Buy Limit (trades a bounce off the level).\nDirection (BUY/SELL/Both) limits which sides are traded; the fractal must lie within the zone\'s price range.',
    'zone.fractal.slMode.hint':
      'ATR: tip of the fractal candle ± multiplier × ATR (typical candle range).\nParabolic SAR: the SAR dot; on open positions it is moved on each new candle, only in the profit direction.\nOpposite fractal: beyond the last lower fractal (BUY) or upper fractal (SELL) + buffer.\nFractal candle: low of the fractal candle − buffer (BUY), high + buffer (SELL).\nIf it cannot be calculated or lands on the wrong side, fractal candle + buffer is used.',
    'zone.fractal.useSl.hint':
      'On: every fractal order gets an SL (by the method next to it).\nOff: orders are placed without an SL; risk/reward TP and SAR trailing are unavailable, TP can only be set as an amount. Losses may be unlimited.',
    'zone.fractal.slBuffer.hint':
      'How far beyond the fractal candle / opposite fractal the SL is placed (price units, e.g. 0.05). Also the fallback when ATR or SAR cannot be calculated.',
    'zone.fractal.atrPeriod.hint':
      'Number of candles averaged for the ATR true range (same as the MT5 ATR indicator, default 14).',
    'zone.fractal.atrMultiplier.hint':
      'SL distance = multiplier × ATR, measured from the tip of the fractal candle. Higher = wider SL (default 1.5).',
    'zone.fractal.sarStep.hint':
      'Parabolic SAR acceleration step (MT5 default 0.02). Higher values move the SAR toward price faster.',
    'zone.fractal.sarMax.hint': 'Upper limit of the Parabolic SAR acceleration (MT5 default 0.2).',
    'zone.fractal.orderCount.hint':
      'How many of the latest fractals get a pending order, per direction (BUY and SELL each; 1–20). A fractal that price has reached, that was filled or deleted by hand leaves its slot empty; older fractals do not move up. Open positions are limited by “Max Positions”.',
    'zone.fractal.buyOrderCount.hint':
      'How many of the latest fractals get a BUY pending order (1–20). A fractal that price has reached, that was filled or deleted by hand leaves its slot empty; older fractals do not move up. Open positions are limited by “Max Positions”.',
    'zone.fractal.sellOrderCount.hint':
      'How many of the latest fractals get a SELL pending order (1–20). A fractal that price has reached, that was filled or deleted by hand leaves its slot empty; older fractals do not move up. Open positions are limited by “Max Positions”.',
    'zone.fractal.rr.hint':
      'TP = entry ± this value × SL distance. E.g. 2: TP twice as far as the SL. 0 = no TP.',
    'zone.fractal.tpByMoney.hint':
      'On: the TP is a fixed amount (account currency) instead of the reward/risk factor. Off: TP = SL distance × factor.',
    'zone.fractal.tpMoney.hint':
      'Target profit per position (account currency). The TP is placed at the price distance this amount equals at that side\'s lot size. 0 = no TP.',
    'zone.fractal.nextLossMoney.hint':
      'The next fractal order is placed only when the most recently opened position of that direction is at least this amount in loss. Example 1 $: BUY open at 2650 → new BUY order only at −1 $ (≈ 2649 at 0.01 lot gold). No position: order at once. 0 = no limit.',
    'zone.fractal.nextLossPips.hint':
      'The next fractal order is placed only when price moved at least this distance against the most recently opened position of that direction. Example 2.00: BUY at 2650 → new BUY order only at Bid ≤ 2648.00; SELL at 2700 → only at Ask ≥ 2702.00. 0 = no limit.',
    'zone.fractal.nextLossByPips.hint':
      'On: the limit is a price distance (pips, e.g. 2.00 against the entry). Off: the limit is the position loss (account currency, e.g. 1 $). BUY and SELL are checked separately.',
    'zone.fractal.maxPositions.hint':
      'Maximum number of positions of this zone open at the same time. Once reached, the zone places no new orders and deletes its pending ones. 0 = unlimited (the engine caps it at 500).',
    'zone.legacyOrders.delete.hint':
      'Saves the decision; on its next round the bot deletes these orders in MT5. Open positions stay.',
    'zone.legacyOrders.keep.hint':
      'Saves the decision; the orders stay in MT5, the bot leaves them alone and this window does not open again.',
    'vps.online.restart.hint': 'Restarts the worker through the worker API (run_uvicorn_watchdog.bat brings it back). Bots keep running; admin key only, and only under the restart loop.',
    // --- Analysis ---
    'nav.analysis.hint': 'Analysis page: chart and statistics for the selected account and setup.',
    'analysis.tab.chart.hint': 'MT5 price chart with the setup limits and the setup settings.',
    'analysis.tab.stats.hint': 'Metrics, curves and a breakdown per symbol and setup from real trades.',
    'analysis.zone.hint': 'Setup being analysed (only setups of the selected account), named “Symbol · Setup n” as on the symbol cards. Unsaved changes are included.',
    'analysis.range.hint': 'Period being analysed, in broker days (MT5 time). Presets or a custom range as DD.MM.YY.',
    'analysis.range.preset.hint': 'Sets the period to “{label}” (broker days).',
    'analysis.range.from.hint': 'First day, DD.MM.YY (e.g. 01.09.26). Counts from the start of this day.',
    'analysis.range.to.hint': 'Last day, DD.MM.YY. Counts up to the end of this day.',
    'analysis.range.apply.hint': 'Uses the entered start and end.',
    'analysis.range.apply.off.hint': 'Enter two valid dates first (DD.MM.YY); the start must not be after the end.',
    'analysis.range.calendar.hint': 'In the calendar the first click picks the start day, the second the end day.',
    'analysis.settings.hint': 'Chooses what the chart and page show. Warnings and model limits are always shown.',
    'analysis.settings.zoneLines.hint': 'Shows the setup’s lower and upper price limit as dashed lines and a light band in the chart.',
    'analysis.settings.levels.hint': 'The grid levels the bot computes from the current price (buy green, sell red, dotted). Display only; the bot computes its own.',
    'analysis.settings.trades.hint': 'Open positions (solid line, TP/SL dotted) and pending orders (dashed) of the running bot in this setup. Refreshed every 5 seconds.',
    'analysis.settings.pauses.hint': 'Market pauses (weekend, holiday, daily break) as a thin dashed vertical line between two candles.',
    'analysis.settings.rsi.hint': 'RSI (14, Wilder) computed in the browser from the candles shown, in its own pane below the chart.',
    'analysis.chart.timeframe.option.hint': 'Shows {tf} candles. A larger timeframe loads faster for long ranges.',
    'analysis.chart.hours.hint': 'Usual trading hours estimated from candle data (broker time). Not exact; broker holidays are not included.',
    'analysis.chart.brokerTime.hint': 'All times in the chart are broker time as delivered by MT5, not converted to your browser’s time zone.',
    'analysis.chart.key.hint': 'Grey hatched area: no data from MT5 (no candle is made up). Dashed vertical line: market pause. The rest can be switched in the view settings (gear); the missing-data mark can’t be switched off.',
    'analysis.settings.zoneCard.hint': 'Shows the selected setup’s settings as a card above the chart.',
    'analysis.license.hint': 'Shows the licence notice of the chart library (TradingView).',
    'analysis.license.link.hint': 'Opens the TradingView website in a new tab.',
    'analysis.clock.badge.hint': 'Offset of the broker clock from UTC (measured by the worker from MT5). “Today” and day boundaries use it.',
    'analysis.settings.history.hint': 'Closed trades from the archive in the chart: arrow at the entry (buy green up, sell red down), dot at the exit (profit green, loss red), dotted line in between. Trades whose setup is unknown are grey with “?”.',
    'analysis.settings.fractals.hint': 'Fractal setups only: 5-candle Bill Williams fractals from closed candles (same rule as the bot), triangle above the high / below the low. Fractals the bot traded are orange.',
    'analysis.chart.fractals.switch.hint': 'Switches the chart to the setup’s fractal timeframe ({tf}); fractals the bot traded are only marked there.',
    'analysis.trades.unknownZone.hint': 'This trade is in the robot’s magic range but can’t be matched safely via the setup registry (e.g. opened before the registry started). It is not guessed.',
    'analysis.trades.partial.hint': 'Part of the position was closed; each partial close is its own trade. Entry costs are split by volume.',
    'analysis.trades.reversal.hint': 'Reversal on a netting account (INOUT): the position was closed and the remaining volume opened in the opposite direction under the same position number.',
    'analysis.trades.closeBy.hint': 'Closed by an opposite position (Close By).',
    'analysis.trades.noEntry.hint': 'The entry deal of this position is neither in the archive nor in MT5: entry price and setup can’t be determined.',
    'analysis.trades.openedBefore.hint': 'Opened before the selected range ({at}); it counts in this range by its close time.',
    'analysis.trades.reason.sl.hint': 'Closed by stop loss.',
    'analysis.trades.reason.tp.hint': 'Closed by take profit.',
    'analysis.trades.reason.so.hint': 'Closed by the broker for lack of margin (stop out).',
    'analysis.trades.focus.hint': 'Scrolls the chart to this trade’s entry (or its exit if the entry is unknown).',
    'analysis.trades.col.mfe.hint': 'MFE: largest interim profit of the trade, MAE: largest interim loss; in points and account currency. Estimated (lower limit): only the M1 candles between the entry and exit candle plus the entry/exit price count. For SELL, Ask = Bid + the candle’s spread. Money is derived from the trade’s own profit (not shown if exit = entry).',
    'analysis.trades.mfe.compute.hint': 'Loads the M1 candles for the trades in the table not computed yet (once per symbol, newest first) and computes MFE/MAE. In brackets: number of open trades. Disabled when all are computed.',
    'analysis.trades.mfe.reason.noEntry.hint': 'The entry deal is not in the archive: entry price and time are unknown.',
    'analysis.trades.mfe.reason.tooLong.hint': 'The trade was open longer than 100,000 M1 candles (about 69 days): no candles are loaded beyond this limit.',
    'analysis.trades.mfe.reason.busy.hint': 'The M1 candles could not be read just now (account busy or MT5 error). Press again.',
    'analysis.trades.mfe.reason.missing.hint': 'M1 candles between entry and exit are missing (could not be read from MT5). 0 is never shown.',
    'analysis.trades.mfe.reason.noSpread.hint': 'SELL needs the candle spread, but one candle has none.',
    'analysis.trades.mfe.reason.noPoint.hint': 'The symbol’s point value is unknown: points cannot be calculated.',
    'analysis.stats.scope.hint': 'Which trades count: the whole account, all setups of one symbol (to compare the setups) or one setup.',
    'analysis.stats.kpi.net.hint': 'Profit + commission + swap + fee of trades closed in the period.',
    'analysis.stats.kpi.trades.hint': 'Every exit (partials included) is a trade; positions = distinct position numbers.',
    'analysis.stats.kpi.winRate.hint': 'Share of trades with net > 0.',
    'analysis.stats.kpi.profitFactor.hint': 'Gross profit ÷ gross loss. “—” without losses. Not a rating.',
    'analysis.stats.kpi.avg.hint': 'Net profit ÷ number of trades.',
    'analysis.stats.kpi.best.hint': 'Highest and lowest net result of a single trade.',
    'analysis.stats.kpi.gross.hint': 'Sum of winning trades / sum of losing trades.',
    'analysis.stats.kpi.cycles.hint': 'Trades closed by take profit.',
    'analysis.stats.kpi.maxDrawdown.hint': 'Largest fall of the realized profit curve from its previous high.',
    'analysis.stats.curve.realized.hint': 'Cumulative net profit of the selected scope (by close time).',
    'analysis.stats.curve.balance.hint': 'Account balance counted back from today; hidden if the archive has gaps.',
    'analysis.stats.curve.drawdown.hint': 'Distance of the realized profit curve from its previous high.',
    'analysis.stats.by.zone.hint': 'Per registered setup (magic number), with the same metrics side by side; unknown, manual and other trades separately.',
    'analysis.stats.by.symbol.hint': 'By traded symbol, only trades of registered setups; unknown, manual and other trades separately.',
    'analysis.stats.by.weekday.hint': 'By day of the close (MT5 time).',
    'analysis.stats.by.hour.hint': 'By hour of the close (MT5 time).',
    // --- CSV-Import ---
    'csv.import.hint': 'Loads candles from a CSV file as a data source for this account. MT5 data does not change.',
    'csv.file.hint': 'CSV file with candles (max. 150 MB). It needs time, open, high, low and close columns.',
    'csv.symbol.hint': 'Symbol of the candles in the file (e.g. XAUUSD). The backtest uses this source for this symbol.',
    'csv.timeframe.hint': 'Timeframe of the candles in the file. Times must sit on its grid, or the file is rejected.',
    'csv.offset.hint': 'Hours added to the CSV time; the result must be MT5 server time. For a UTC file enter the broker offset (e.g. 3 for UTC+3). −14 to 14.',
    'csv.cancel.hint': 'Closes the dialog; if an upload is running it stops and deletes the unfinished import.',
    'csv.submit.hint': 'Uploads, checks and saves the file. With any error nothing is saved. Disabled until a file is chosen.',
    'csv.replace.hint': 'Deletes the overlapping old import and saves this one. Cannot be undone.',
    'csv.item.unfinished.hint': 'Upload or check did not finish. This import cannot be chosen as a data source; it can be deleted.',
    'csv.delete.hint': 'Deletes this import and its candles. MT5 data is not affected.',
    'nav.backtest.hint': 'Backtest page: tests a copy of a setup against past prices in the browser.',
    'backtest.field.timeframe.hint': 'Candle resolution used for the test. M1 gives the most exact result but loads the most data; with a coarser resolution the price path inside a candle is guessed.',
    'backtest.field.spread.hint': 'Spread source: “From candle” uses the stored spread of each candle, “Fixed” always the same value, “Maximum” the larger of the candle value and the given value.',
    'backtest.field.spreadPoints.hint': 'Spread in points. Used by “Fixed” and “Maximum”.',
    'backtest.field.commission.hint': 'Commission for one lot in the account currency, entry and exit together. The test books half at the entry and half at the exit. A suggestion comes from the archive.',
    'backtest.field.swap.hint': 'On: the overnight cost (swap) is calculated with today’s symbol values. Off: swap counts as zero.',
    'backtest.field.capital.hint': 'Amount in the account currency where the equity curve starts. It is a calculation value only; it does not touch the real balance and there is no margin check.',
    'backtest.field.fill.hint': '“Price gap”: if the price jumps over an order, it fills at the jumped-to price. “Parity”: an order always fills at its own price.',
    'backtest.field.slFirst.hint': 'If TP and SL trigger at the same price, the SL counts first (careful result). Off: the TP counts first.',
    'backtest.field.path.hint': 'Inside one candle it is unknown whether the price went to the low or the high first. “Both” runs two tests and shows the range.',
    'backtest.field.closeAtEnd.hint': 'On: open positions are closed at the last price at the end of the test. Off: they stay open and show as open P/L.',
    'backtest.field.approximate.hint': 'Also calculates symbols with an unsupported calculation mode, approximately. The result is an estimate.',
    'backtest.run.hint': 'Runs the selected copy of the setup with these settings. The real setup, orders and account do not change.',
    'backtest.run.off.noZone.hint': 'Select a setup first.',
    'backtest.run.off.symbol.hint': 'The symbol data is missing: wait for it to load, or check that the symbol exists on the account.',
    'backtest.run.off.netting.hint': 'This account is a netting account; the backtest only simulates hedging accounts.',
    'backtest.run.off.loading.hint': 'The broker clock and the account data are loading; wait a few seconds.',
    'backtest.cancel.hint': 'Stops the running test. The result is discarded.',
    'backtest.commission.use.hint': 'Writes the average commission from the archive into the field.',
    'backtest.log.onlyWarn.hint': 'Hides the info lines and shows only warnings and errors.',
    'backtest.curve.equity.hint': 'Equity: start capital + realized + open P/L at the end of each candle.',
    'backtest.curve.drawdown.hint': 'Drawdown: how far the equity is below its previous peak.',
    'backtest.summary.realized.hint': 'Net total of the closed trades (profit + commission + swap).',
    'backtest.summary.open.hint': 'Profit/loss of the open positions at the end of the test, with the entry commission and booked swap.',
    'backtest.summary.endEquity.hint': 'Start capital + realized + open P/L.',
    'backtest.summary.openPositions.hint': 'Number of positions still open at the end of the test.',
    'backtest.summary.maxDrawdown.hint': 'Largest fall of the equity from a previous peak, in the account currency.',
    'backtest.summary.commission.hint': 'Total commission of the closed trades (negative = cost).',
    'backtest.summary.swap.hint': 'Total swap of the closed trades (negative = cost).',
    'backtest.summary.spread.hint': 'Spread cost of the opened positions. It is already in the fill prices; shown for information only.',
    'backtest.result.path.auto.hint': 'The candle path was chosen automatically from the direction of the candle.',
    'backtest.result.path.lowFirst.hint': 'In every candle the price went to the low first, then to the high.',
    'backtest.result.path.highFirst.hint': 'In every candle the price went to the high first, then to the low.',
  },
  {
    // --- Konto ---
    'account.label.hint':
      'Wählt das MT5-Konto, mit dem Sie arbeiten. Zonen, Bot und Logs gehören zum gewählten Konto.',
    'account.action.downloadLog.hint': 'Lädt die Bot-Logdatei des gewählten Kontos auf Ihren Computer herunter.',
    'account.action.edit.hint': 'Bearbeitet Kontoname, Server, Umgebung, MT5-Pfad oder Passwort. Nicht möglich, solange der Bot läuft.',
    'account.action.delete.hint': 'Entfernt das gewählte Konto aus der Liste (mit Rückfrage). Das Broker-Konto und Positionen bleiben unberührt.',
    'account.action.add.hint': 'Legt ein neues MT5-Konto an (Name, Login, Server, MT5-Pfad). Das Passwort wird nur auf dem Worker gespeichert.',
    'account.action.menu.hint': 'Kontomenü: Bot-Log herunterladen, Konto bearbeiten oder löschen, neues Konto hinzufügen.',
    'account.delete.confirm.hint': 'Löscht das Konto endgültig; das lässt sich nicht rückgängig machen.',
    'account.dialog.close.hint': 'Schließt das Fenster; nicht gespeicherte Eingaben gehen verloren.',
    'account.duplicate.confirm.hint': 'Öffnet das bereits gespeicherte Konto im Bearbeitungsformular.',
    'account.env.demo.hint': 'DEMO-/TEST-Konto: virtuelles Geld, kein echtes Risiko.',
    'account.env.live.hint': 'LIVE-Konto: echtes Geld! Orders werden am echten Markt gehandelt.',
    'account.form.editExisting.hint': 'Öffnet das mit demselben Login bereits gespeicherte Konto zum Bearbeiten.',
    'account.form.name.hint': 'Ein freier Name, an dem Sie das Konto in der Liste erkennen (z. B. „Live-Konto 1“).',
    'account.form.login.hint': 'Ihre MT5-Kontonummer (numerischer Login/ID).',
    'account.form.password.hint': 'Ihr MT5-Kontopasswort. Es wird nur auf dem Worker gespeichert und nie an die Oberfläche zurückgeschickt.',
    'account.form.password.keep.hint':
      'Das Feld ist absichtlich leer: Das Passwort wird aus Sicherheitsgründen nur auf dem Worker gespeichert und nie an die Oberfläche zurückgeschickt. Leer lassen, um das gespeicherte Passwort zu behalten. Zum Ändern das vollständige MT5-Master-Passwort eingeben, nicht das Investor-Passwort.',
    'account.form.password.show.hint': 'Zeigt das Passwort als Klartext; nur nutzen, wenn niemand mitsieht.',
    'account.form.password.hide.hint': 'Blendet das Passwort wieder aus.',
    'account.form.server.hint': 'Name des MT5-Servers Ihres Brokers, genau wie in MT5 angezeigt (z. B. Eightcap-Demo).',
    'account.form.env.hint':
      'DEMO = Übungskonto, LIVE = Konto mit echtem Geld. Muss zur Kontoart beim Broker passen (der Worker prüft das beim Verbinden).',
    'account.form.notes.hint': 'Optionale private Notizen (bis 1000 Zeichen). Hat keinen Einfluss auf den Bot.',
    'account.form.save.hint': 'Speichert das Konto auf dem Worker und wählt es aus.',
    'account.path.label.hint':
      'Pfad des MetaTrader-5-Terminals (terminal64.exe), das dieses Konto nutzt. Bei mehreren MT5-Installationen das richtige wählen.',
    'account.path.rescan.hint': 'Sucht auf dem VPS erneut nach installierten MT5-Terminals.',
    'account.path.scanning.hint': 'MT5-Pfade werden gesucht…',
    'account.path.custom.hint': 'Erlaubt es, den Pfad zur terminal64.exe von Hand einzutippen, statt die gefundene Liste zu nutzen.',

    // --- Bot ---
    'bot.status.connecting.hint': 'Der Bot-Prozess wurde gestartet und verbindet sich mit MT5…',
    'bot.status.running.hint': 'Der Bot ist mit MT5 verbunden und verwaltet die Grid-Orders aller aktiven Zonen.',
    'bot.status.processNoMt5.hint':
      'Ein Bot-Prozess existiert, hat aber keine MT5-Verbindung (abgebrochen oder hängt). „Bot neu starten“ oder „Bot stoppen“ nutzen.',
    'bot.status.stopped.hint':
      'Der Bot läuft nicht, es werden keine neuen Orders gesetzt. Vorhandene Positionen und Pending Orders bleiben beim Broker.',
    'bot.start.hint':
      'Startet den Bot-Prozess für dieses Konto und verbindet sich mit MT5. Für aktive Zonen werden Grid-Orders gesetzt.',
    'bot.connecting.hint': 'Die MT5-Verbindung wird aufgebaut (kann bis zu 3 Minuten dauern). Bitte warten.',
    'bot.stop.hint':
      'Stoppt den Bot (mit Rückfrage). Offene Positionen und Pending Orders bleiben beim Broker erhalten.',
    'bot.disconnect.confirm.hint':
      'Stoppt den Bot und trennt die MT5-Verbindung. Offene Positionen und Pending Orders bleiben beim Broker.',

    // --- Chart ---
    'chart.zone.active.hint': 'Setup aktiv: Der Bot verwaltet Orders für dieses Setup.',
    'chart.zone.inactive.hint': 'Setup inaktiv: Der Bot setzt für dieses Setup keine Orders.',
    'chart.zone.priceRange.hint': 'Untere und obere Preisgrenze des Setups. Orders werden nur in diesem Bereich gesetzt.',
    'chart.zone.levels.hint': 'Anzahl der Grid-Level unter / über dem Preis (Level darunter / darüber).',
    'chart.stat.price.hint': 'Letzter Preis des Symbols im Chart (Live-Stream).',
    'chart.stat.rsi.hint':
      'RSI (Relative Strength Index): Momentum-Indikator von 0 bis 100. Über 70 gilt meist als überkauft, unter 30 als überverkauft. Wird im Chart als eigene Linie gezeichnet.',
    'chart.stat.pl.hint': 'Gesamtgewinn/-verlust der offenen Positionen (schwebender G/V, noch nicht realisiert).',
    'chart.stat.positions.hint': 'Anzahl der aktuell offenen Positionen.',

    // --- Allgemein ---
    'common.cancel.hint': 'Bricht die Aktion ab; nichts ändert sich.',
    'common.close.hint': 'Schließt das Fenster.',
    'common.noChanges.hint': 'Es gibt keine Änderungen zu speichern.',
    'common.theme.light.hint': 'Nutzt das helle Design.',
    'common.theme.dark.hint': 'Nutzt das dunkle Design.',
    'common.theme.system.hint': 'Folgt der Hell/Dunkel-Einstellung Ihres Geräts.',
    'common.theme.cycle.hint': 'Design: {current}. Klick wechselt zu „{next}“.',

    // --- Dashboard ---
    'dashboard.sysinfo.hint': 'Systemmenü: Adress- und Port-Info, Update-Prüfung und System herunterfahren.',
    'dashboard.sysinfo.checkUpdates.hint': 'Vergleicht mit der Version auf GitHub (origin/main) und bietet eine neue Version an.',
    'dashboard.shutdown.hint': 'Öffnet den Dialog zum Herunterfahren. Alle Bots werden gestoppt; mit Rückfrage.',
    'dashboard.shutdown.confirm.hint':
      'Stoppt alle Bots und schließt die Oberfläche. Offene Positionen bleiben beim Broker.',
    'saveBar.saveAll.hint': 'Speichert alle ungespeicherten Änderungen in allen Zonen. Tastenkürzel: Cmd+Enter (Mac) / Strg+Enter (Windows).',
    'saveBar.discard.hint': 'Verwirft alle ungespeicherten Änderungen und stellt den zuletzt gespeicherten Stand wieder her.',
    'saveBar.saved.hint': 'Alle Änderungen sind gespeichert.',
    'saveBar.saving.hint': 'Wird gespeichert…',
    'metrics.price.hint': 'Aktueller Preis des Zonen-Symbols.',
    'metrics.profit.hint': 'Gesamtgewinn/-verlust der offenen Positionen (schwebender G/V, noch nicht realisiert).',
    'metrics.positions.hint': 'Anzahl der aktuell offenen Positionen.',
    'metrics.pending.hint': 'Anzahl der beim Broker wartenden, noch nicht ausgeführten Grid-Orders.',
    'update.apply.hint':
      'Holt die neue Version von GitHub (git pull) und startet den Worker neu; laufende Bots setzen danach von selbst fort.',
    'update.vpsLink.hint':
      'Auch wenn der Worker nicht erreichbar ist, können Sie ihn über die VPS-Seite per SSH aktualisieren oder neu starten (nur lokal).',

    // --- Logs ---
    'logs.tab.activity.hint': 'Was Sie in dieser Sitzung in der Oberfläche getan haben, und Bot-Ereignisse (Start, Stopp, Fehler).',
    'logs.tab.robot.hint': 'Logdatei des Bots (Grid-Engine): gesetzte/gelöschte Orders, Warnungen, Fehler.',
    'logs.tab.mt5.hint': 'Eigene Log-Ausgabe des MT5-Terminals (Verbindung, Order-Fehler).',
    'logs.refresh.hint': 'Lädt das Log sofort neu (es aktualisiert sich auch automatisch in regelmäßigen Abständen).',
    'zone.logs.toggle.hint': 'Zeigt/verbirgt die Robot-Log-Zeilen aller Setups dieses Symbols (aktualisiert alle 10 s, solange offen). Bei mehreren Setups beginnt jede Zeile mit der Setup-Nummer. Ältere Zeilen ohne Setup-Tag erscheinen hier nicht.',
    'logs.download.hint': 'Lädt die Logdatei des gewählten Kontos auf Ihren Computer herunter.',
    'logs.clear.activity.hint': 'Leert nur die Activity-Liste (UI-Ereignisse dieser Sitzung).',
    'logs.clear.all.hint': 'Leert alle Logs dieses Kontos auf dem Worker (mit Rückfrage). Nicht rückgängig zu machen.',
    'logs.clearConfirm.confirm.hint': 'Löscht alle Logs dieses Kontos endgültig.',
    'logs.status.hint': 'Erreichbarkeit des Workers und Zeitpunkt der letzten Aktualisierung.',

    // --- Navigation ---
    'nav.home.hint': 'Grid Robot {version}. Geht zur Startseite.',
    'nav.dashboard.hint': 'Startseite: Konto, Zonen, Bot-Steuerung und Logs.',
    'nav.formation.hint': 'Preischart und Formationen.',
    'nav.vps.hint': 'VPS-Verwaltung: Worker-Status, Update, Neustart und Logs.',
    'nav.users.hint': 'Benutzerverwaltung (nur Administrator): Benutzer anlegen, Schlüssel erneuern, löschen.',
    'nav.language.cycle.hint': 'Sprache: {current}. Klick wechselt zu {next}.',
    'nav.language.option.hint': 'Stellt die Oberflächensprache auf {language}.',

    // --- Benutzer ---
    'users.refresh.hint': 'Lädt die Benutzerliste neu vom Worker.',
    'users.add.hint': 'Legt einen neuen Benutzer an und erzeugt seinen persönlichen Schlüssel. Verbunden mit diesem Schlüssel sieht der Benutzer nur seine eigenen Konten.',
    'users.action.newKey.hint': 'Erzeugt einen neuen Schlüssel für diesen Benutzer (fragt nach). Der alte Schlüssel wird sofort ungültig.',
    'users.action.delete.hint': 'Löscht den Benutzer (fragt nach). Seine Konten und Bots bleiben erhalten und gehören danach dem Administrator.',
    'users.create.name.hint': 'Anzeigename des Benutzers (1–40 Zeichen, eindeutig). Erscheint nur in der Liste und in der Besitzer-Auswahl.',
    'users.create.submit.hint': 'Legt den Benutzer an und zeigt seinen persönlichen Schlüssel einmalig an.',
    'users.key.field.hint': 'Persönlicher Schlüssel des Benutzers. Kommt in das Feld „API-Key“ im Dialog „Mit VPS verbinden“. Nur jetzt sichtbar; nie weitergeben.',
    'users.key.copy.hint': 'Kopiert den Schlüssel in die Zwischenablage.',
    'users.link.field.hint': 'Fertiger Verbindungs-Link mit Adresse und Schlüssel. Im Browser geöffnet füllt er den Verbindungsdialog vor; der Link enthält den Schlüssel, also sicher weitergeben.',
    'users.link.copy.hint': 'Kopiert den Verbindungs-Link in die Zwischenablage.',
    'users.key.done.hint': 'Schließt das Fenster. Der Schlüssel wird danach nicht mehr angezeigt.',
    'users.rotate.confirm.hint': 'Erzeugt den neuen Schlüssel und macht den alten sofort ungültig.',
    'users.delete.confirm.hint': 'Löscht den Benutzer samt Schlüssel endgültig; seine Konten sind danach ohne Besitzer.',
    'users.owner.label.hint': 'Besitzer des Kontos. Ein Benutzer sieht und verwaltet nur seine eigenen Konten; bei „Administrator“ sieht das Konto nur der Administrator-Schlüssel.',

    // --- VPS-Verbindung ---
    'connection.chip.hint': 'Worker-(VPS-)Verbindung: {status}. Klick öffnet den Verbindungsdialog.',
    'connection.field.link.hint':
      'Füge den Verbindungs-Link oder -Code aus der VPS-Einrichtung ein; Adresse und Key füllen sich von selbst.',
    'connection.field.url.hint':
      'Die https-Adresse des Workers (deine ngrok-Domain), z. B. https://deinname.ngrok-free.dev. „/api“ musst du nicht anhängen.',
    'connection.field.key.hint':
      'WORKER_API_KEY auf dem VPS (Administrator) oder der persönliche Schlüssel, den dir der Administrator gegeben hat. Mit einem persönlichen Schlüssel siehst du nur deine eigenen Konten. Wird nur in diesem Browser gespeichert; Key und Link nie weitergeben.',
    'connection.key.show.hint': 'Zeigt den API-Key als lesbaren Text.',
    'connection.key.hide.hint': 'Verbirgt den API-Key hinter Punkten.',
    'connection.action.test.hint':
      'Schickt mit der eingegebenen Adresse und dem Key eine Testanfrage an den Worker. Es wird nichts gespeichert.',
    'connection.action.connect.hint':
      'Speichert Adresse und Key in diesem Browser und lädt die Seite neu. Vorher ist ein erfolgreicher Test nötig.',
    'connection.action.disconnect.hint':
      'Löscht die gespeicherte Adresse und den Key aus diesem Browser (mit Bestätigung). Der Worker auf dem VPS bleibt unberührt.',
    'connection.disconnect.confirm.hint': 'Löscht die Verbindung in diesem Browser; die Bots laufen auf dem VPS weiter.',
    'connection.gate.connect.hint':
      'Öffnet den Verbindungsdialog: Adresse und Key eingeben oder den Verbindungs-Link einfügen.',

    // --- Allgemeine Einstellungen ---
    'settings.interval.hint':
      'Wie oft die Engine-Schleife Markt und Orders prüft, in Sekunden (1–60 s). Kleiner Wert: schnelle Reaktion, aber mehr Last; großer Wert: schonend, aber träge. Die Änderung wird mit Speichern an den Worker geschrieben.',
    'settings.decrease.hint': 'Verringert das Prüfintervall um 0,1 s (schnellere Reaktion, mehr Last).',
    'settings.decrease.min.hint': 'Kleinster Wert (1 s); weiter verringern geht nicht.',
    'settings.increase.hint': 'Erhöht das Prüfintervall um 0,1 s (weniger Last, trägere Reaktion).',
    'settings.increase.max.hint': 'Größter Wert (60 s); weiter erhöhen geht nicht.',
    'settings.save.hint': 'Speichert das Prüfintervall.',

    // --- Gemeinsame UI ---
    'ui.hint': 'Info',
    'ui.close.hint': 'Schließt das Fenster.',
    'ui.dismiss.hint': 'Blendet diese Meldung aus.',

    // --- VPS ---
    'vps.busy.hint': 'Es läuft gerade eine andere VPS-Aktion; warten Sie, bis sie fertig ist.',
    'vps.refresh.hint': 'Fragt den VPS-Status jetzt erneut ab.',
    'vps.tile.worker.hint':
      'Zustand des FastAPI-Workers (uvicorn), der die Bots verwaltet. „Antwortet nicht“ = Port offen, aber keine Antwort.',
    'vps.tile.ngrok.hint':
      'Der ngrok-Tunnel verbindet die Oberfläche über das Internet mit dem Worker. Ist er offline, erreicht die Oberfläche den Worker nicht. Selbstheilung (Aufgabe AutoGrid-Tunnel): Die URL wird alle 5 Minuten geprüft; ohne Antwort wird ngrok neu gestartet, nach 3 Fehlschlägen in Folge startet der VPS selbst neu (höchstens einmal pro Stunde, 3-mal am Tag).',
    'vps.tile.bots.hint': 'Auf dem VPS laufende Bot-Prozesse (einer pro Konto) und Anzahl der offenen MT5-Terminals.',
    'vps.tile.version.hint':
      'Installierte Version auf dem VPS mit Git-Branch/Commit und dem Zeitpunkt der letzten Aktualisierung. Ist der Branch nicht „main“, erscheint eine Warnung; das Auto-Update holt von main.',
    'vps.tile.autostart.hint':
      'Ob der VPS beim Hochfahren alles selbst startet: automatische Anmeldung + Aufgabe AutoGrid-Start. Bei „Unvollständig“ kommt der Worker nach einem Neustart nicht zurück.',
    'vps.tile.system.hint': 'Rechnername des VPS und wie lange er schon läuft.',
    'vps.ctrl.check.hint': 'Vergleicht die Version auf origin/main mit der auf dem VPS (über den Worker).',
    'vps.ctrl.check.noWorker.hint':
      'Für die Prüfung muss der Worker laufen. Das Update können Sie trotzdem mit dem Knopf darunter starten.',
    'vps.action.update.hint':
      'Holt die neueste Version von origin/main und startet den Worker neu (Aufgabe AutoGrid-Update). Mit Rückfrage.',
    'vps.action.restart.hint': 'Startet den Worker neu; laufende Bots setzen danach von selbst fort. Mit Rückfrage.',
    'vps.action.restartNgrok.hint': 'Startet den ngrok-Tunnel neu (hilft, wenn die Verbindung Oberfläche–Worker abgerissen ist). Mit Rückfrage.',
    'vps.action.reboot.hint':
      'Startet den VPS (Windows) komplett neu. Alle Prozesse werden beendet; nach der Anmeldung übernimmt der Autostart. Mit Rückfrage.',
    'vps.elevated.fix.hint':
      'Beendet alte AutoGrid-Prozesse, die mit Administratorrechten laufen; der Worker startet danach mit normalen Rechten neu. Mit Rückfrage.',
    'vps.log.tab.worker.hint': 'Worker-Konsolenlog (uvicorn, worker_console.log).',
    'vps.log.tab.ngrok.hint': 'Log des ngrok-Tunnels (ngrok.log).',
    'vps.log.tab.update.hint': 'Log der automatischen Update-Aufgabe.',
    'vps.log.tab.tunnel.hint': 'Log des Tunnel-Watchdogs (tunnel_watchdog.log): Die öffentliche ngrok-URL wird alle 5 Minuten geprüft; Fehlschläge, ngrok-Neustarts und automatische VPS-Neustarts stehen hier.',
    'vps.log.refresh.hint': 'Holt das Log erneut vom VPS (es aktualisiert sich auch regelmäßig von selbst).',

    // --- Zone: Kopf und Panel ---
    'zone.panel.count.hint': 'Anzahl der Symbole. Jedes Symbol hat ein oder mehrere Setups.',
    'zone.panel.add.hint': 'Fügt ein neues Symbol hinzu: erst das Symbol wählen, dann entsteht das erste Setup automatisch. Einstellungen eintragen und Speichern drücken.',
    'zone.panel.add.off.hint': 'Der Bot läuft, ist aber nicht mit MT5 verbunden; Symbole lassen sich erst nach der Verbindung hinzufügen.',
    'zone.delete.confirm.hint': 'Entfernt das Setup aus der Liste. Erst „Alle Einstellungen speichern“ macht es dauerhaft.',
    'zone.delete.last.confirm.hint': 'Entfernt das letzte Setup und damit das Symbol aus der Liste. Erst „Alle Einstellungen speichern“ macht es dauerhaft.',
    'zone.header.badge.buy.hint': 'Dieses Setup setzt nur BUY-Orders (Kauf).',
    'zone.header.badge.sell.hint': 'Dieses Setup setzt nur SELL-Orders (Verkauf).',
    'zone.header.badge.both.hint': 'Dieses Setup setzt BUY- und SELL-Orders.',
    'zone.market.hint.open': "Markt offen. Zw. {hours} (Serverzeit des Brokers).",
    'zone.market.hint.closed': 'Markt geschlossen. Üblich: Zw. {hours} (Serverzeit des Brokers). Bei geschlossenem Markt können für dieses Symbol keine neuen Orders gesetzt werden.',
    'zone.market.hint': 'Ob der Markt für dieses Symbol geöffnet ist. Jedes Symbol hat eigene Handelszeiten; bei geschlossenem Markt können keine neuen Orders gesetzt werden.',
    'zone.header.unsaved.hint': 'Dieses Setup hat Änderungen, die noch nicht gespeichert sind.',
    'zone.header.price.hint': 'Aktueller Preis (Bid) des Symbols, mit den Nachkommastellen des Symbols. "--", solange die Engine nicht läuft.',
    'zone.header.started.hint':
      'Das Setup ist aktiv und die Engine verwaltet seine Orders. Klick deaktiviert das Setup (wird sofort gespeichert).',
    'zone.header.start.hint':
      'Das Setup ist aus. Klick aktiviert es (wird sofort gespeichert); läuft die Engine, werden Orders gesetzt.',
    'zone.header.ready.hint':
      'Das Setup ist aktiv, aber die Engine läuft nicht; Orders werden gesetzt, sobald Sie den Bot starten. Klick schaltet das Setup aus (wird sofort gespeichert).',
    'zone.header.off.hint':
      'Das Setup ist aus. Klick aktiviert es (wird sofort gespeichert); Orders werden gesetzt, sobald Sie den Bot starten.',
    'zone.header.save.hint': 'Speichert nur die Änderungen dieses Setups; andere Setups bleiben unberührt.',
    'zone.header.save.off.hint': 'In diesem Setup gibt es keine ungespeicherten Änderungen.',
    'zone.header.test.hint': 'Testet eine Kopie dieses Setups (mit ungespeicherten Änderungen) auf der Backtest-Seite mit alten Kursen. Das Setup ändert sich nicht.',
    'zone.header.menu.hint': 'Setup-Menü: weitere Aktionen (Setup löschen).',
    'zone.header.delete.hint': 'Löscht das Setup (mit Rückfrage). Ist es das letzte, verschwindet auch das Symbol. Erst Speichern macht es dauerhaft.',
    'zone.header.delete.off.hint':
      'Der Bot läuft, ist aber nicht mit MT5 verbunden; das Setup lässt sich erst nach der Verbindung löschen.',
    'zone.symbol.setupCount.hint': 'Anzahl der Setups dieses Symbols. Jedes Setup läuft in der Engine getrennt, mit eigener Magic-Nummer.',
    'zone.symbol.addSetup.hint': 'Fügt diesem Symbol ein neues Setup hinzu; das Symbol wird nicht abgefragt, der Lot ist der kleinste Lot des Symbols. Einstellungen eintragen und Speichern drücken.',
    'zone.symbol.addSetup.off.hint': 'Der Bot läuft, ist aber nicht mit MT5 verbunden; Setups lassen sich erst nach der Verbindung hinzufügen.',
    'zone.addSymbol.symbol.hint': 'Hinzuzufügendes Symbol (MT5-Symbolname des Brokers). Zum Suchen tippen, aus der Liste wählen.',
    'zone.addSymbol.confirm.hint': 'Fügt das Symbol mit seinem ersten Setup der Liste hinzu. Erst Speichern macht es dauerhaft.',
    'zone.addSymbol.confirm.off.hint': 'Zuerst ein gültiges Symbol eingeben oder aus der Liste wählen.',
    'zone.sync.hint':
      'Eingeschaltet nutzt SELL die BUY-Werte für Grid-Schritt, Lot, Take Profit und Stop Loss. Ausschalten, um für SELL eigene Werte einzugeben.',

    // --- Zone: Basisfelder ---
    'zone.field.symbol.hint':
      'Zu handelndes Instrument (MT5-Symbolname des Brokers, z. B. USOUSD). Zum Suchen tippen, aus der Liste wählen. Die Änderung gilt für alle Setups dieses Symbols. In Klammern: Preis-Nachkommastellen des Symbols.',
    'zone.field.orderType.hint':
      'BUY: nur Kauf-Orders.\nSELL: nur Verkaufs-Orders.\nBOTH: beide Richtungen; BUY und SELL lassen sich getrennt einstellen.',
    'zone.field.minPrice.hint':
      'Untergrenze der Zone. Orders werden nur zwischen Min und Max gesetzt; fällt der Preis darunter, gilt das als Verlassen der Zone.',
    'zone.field.maxPrice.hint':
      'Obergrenze der Zone. Orders werden nur zwischen Min und Max gesetzt; steigt der Preis darüber, gilt das als Verlassen der Zone.',

    // --- Zone: Grid-Felder ---
    'zone.field.gridStep.hint':
      'Preisabstand zwischen zwei aufeinanderfolgenden Grid-Leveln (Orders) in der Preiseinheit des Symbols ($). Kleiner Schritt: dichte Orders, großer Schritt: weite Abstände.',
    'zone.field.buyGrid.hint':
      'Preisabstand zwischen zwei Grid-Leveln für die BUY-Seite ($). SELL hat ein eigenes Feld.',
    'zone.field.lot.hint':
      'Volumen jeder Grid-Order (Lots). Mindestens der kleinste Lot des Symbols bei deinem Broker: 0 oder ein kleinerer Wert wird auf dieses Minimum angehoben und auf den Lot-Schritt gerundet; die Engine begrenzt nach oben auf 5 Lots.',
    'zone.field.buyLot.hint': 'Volumen der BUY-Orders (Lots). Mindestens der kleinste Lot des Symbols bei deinem Broker; 0 oder ein kleinerer Wert wird darauf angehoben. SELL hat ein eigenes Feld.',
    'zone.field.takeProfit.hint':
      'Take-Profit-Abstand ($): bei BUY so weit über dem Einstiegspreis, bei SELL darunter. Erreicht der Preis ihn, schließt die Position im Gewinn.',
    'zone.field.gridStep.guide': 'Richtwert für {symbol}: {range}. Sehr enge Abstände (nahe am Spread) führen dazu, dass Orders ständig gefüllt, gelöscht und neu gesetzt werden.',
    'zone.field.takeProfit.guide': 'Richtwert für {symbol}: {range}. Ein Take Profit unterhalb des Spreads bringt praktisch keinen Gewinn.',
    'zone.field.buyTakeProfit.hint': 'Take-Profit-Abstand ($) für BUY-Positionen: so weit über dem Einstiegspreis.',
    'zone.field.stopLoss.hint':
      'Stop-Loss-Abstand ($): bei BUY so weit unter dem Einstiegspreis, bei SELL darüber. 0 = kein Stop Loss.',
    'zone.field.buyStopLoss.hint':
      'Stop-Loss-Abstand ($) für BUY-Positionen: so weit unter dem Einstiegspreis. 0 = kein Stop Loss.',
    'zone.field.sellGrid.hint': 'Preisabstand zwischen zwei Grid-Leveln für die SELL-Seite ($).',
    'zone.field.sellLot.hint':
      'Volumen der SELL-Orders (Lots). Mindestens der kleinste Lot des Symbols bei deinem Broker; 0 oder ein kleinerer Wert wird darauf angehoben.',
    'zone.field.sellTakeProfit.hint': 'Take-Profit-Abstand ($) für SELL-Positionen: so weit unter dem Einstiegspreis.',
    'zone.field.sellStopLoss.hint':
      'Stop-Loss-Abstand ($) für SELL-Positionen: so weit über dem Einstiegspreis. 0 = kein Stop Loss.',

    // --- Zone: Breakout ---
    'zone.breakout.trendOnly.hint':
      'Breakout-Modus: Orders nur in Trendrichtung (BUY über dem aktuellen Preis, SELL darunter). In Gegenrichtung wird kein Grid aufgebaut. Der Pullback-Abstand gilt nur in diesem Modus.',
    'zone.breakout.minPullback.hint':
      'Im Breakout-Modus muss das erste Level mindestens so weit ($) vom aktuellen Preis entfernt sein; nähere Level werden übersprungen.',
    'zone.breakout.buyPullback.hint':
      'Im Breakout-Modus beginnen BUY-Orders bei Leveln, die mindestens so weit ($) über dem aktuellen Preis liegen; nähere Level werden übersprungen.',
    'zone.breakout.sellPullback.hint':
      'Im Breakout-Modus beginnen SELL-Orders bei Leveln, die mindestens so weit ($) unter dem aktuellen Preis liegen; nähere Level werden übersprungen.',
    'zone.stepByLoss.hint':
      'Wenn an, werden Grid-, Pullback-, Take-Profit- und Stop-Loss-Abstände als Betrag ($) statt als Preis eingegeben: Sobald die zuletzt eröffnete Position diesen Verlust erreicht, wird die nächste Position eröffnet. Der Abstand hängt von der Lotgröße ab (doppelte Lotgröße = halber Abstand). Da alle offenen Positionen gleichzeitig im Minus sind, wächst der Gesamtverlust schneller (10 $, 30 $, 60 $ …). Spread und Kommission sind nicht enthalten.',
    'zone.field.gridStepLoss.hint':
      'Sobald die zuletzt eröffnete Position diesen Betrag (Kontowährung, $) im Minus ist, wird die nächste Position eröffnet. Der Bot rechnet den Betrag mit der Lotgröße in einen Preisabstand um.',
    'zone.field.buyGridLoss.hint':
      'Sobald die letzte BUY-Position diesen Betrag ($) im Minus ist, wird die nächste BUY eröffnet; umgerechnet mit dem BUY-Lot.',
    'zone.field.sellGridLoss.hint':
      'Sobald die letzte SELL-Position diesen Betrag ($) im Minus ist, wird die nächste SELL eröffnet; umgerechnet mit dem SELL-Lot.',
    'zone.breakout.minPullbackLoss.hint':
      'Im Breakout-Modus muss das erste Level mindestens diesen Betrag ($) vom aktuellen Preis entfernt sein (mit der Lotgröße in einen Preisabstand umgerechnet); nähere Level werden übersprungen. 0 = keine Grenze.',
    'zone.breakout.buyPullbackLoss.hint':
      'Im Breakout-Modus beginnen BUY-Orders erst jenseits des Abstands, der mit dem BUY-Lot diesem Betrag ($) entspricht. 0 = keine Grenze.',
    'zone.breakout.sellPullbackLoss.hint':
      'Im Breakout-Modus beginnen SELL-Orders erst jenseits des Abstands, der mit dem SELL-Lot diesem Betrag ($) entspricht. 0 = keine Grenze.',
    'zone.field.takeProfitLoss.hint':
      'Die Position wird geschlossen, sobald sie diesen Betrag ($) im Plus ist. Der Bot rechnet den Betrag mit der Lotgröße in einen Preisabstand um.',
    'zone.field.buyTakeProfitLoss.hint':
      'Eine BUY-Position wird geschlossen, sobald sie diesen Betrag ($) im Plus ist; umgerechnet mit dem BUY-Lot.',
    'zone.field.sellTakeProfitLoss.hint':
      'Eine SELL-Position wird geschlossen, sobald sie diesen Betrag ($) im Plus ist; umgerechnet mit dem SELL-Lot.',
    'zone.field.stopLossLoss.hint':
      'Die Position wird geschlossen, sobald sie diesen Betrag ($) im Minus ist; mit der Lotgröße in einen Preisabstand umgerechnet. 0 = kein Stop Loss.',
    'zone.field.buyStopLossLoss.hint':
      'Eine BUY-Position wird geschlossen, sobald sie diesen Betrag ($) im Minus ist; umgerechnet mit dem BUY-Lot. 0 = kein Stop Loss.',
    'zone.field.sellStopLossLoss.hint':
      'Eine SELL-Position wird geschlossen, sobald sie diesen Betrag ($) im Minus ist; umgerechnet mit dem SELL-Lot. 0 = kein Stop Loss.',
    'zone.instantEntry.hint':
      'Wenn an, eröffnet der Bot sofort eine Position zum aktuellen Preis, sobald auf einer Seite (BUY/SELL) keine Position offen ist: beim Start und nachdem alle Positionen dieser Seite geschlossen wurden (z. B. Take Profit). Bei einer BUY-und-SELL-Zone werden beide eröffnet. Die nächsten Level liegen einen Grid-Abstand von dieser Position entfernt. Nur solange der Preis im Zonenbereich liegt.',
    'zone.breakout.pullback.off.hint': 'Wird nur genutzt, solange „Nur in Trendrichtung“ (Breakout) eingeschaltet ist.',
    'zone.breakout.levelsBelow.hint':
      'Wie viele Grid-Level (Orders) unter dem Referenzpreis aufgebaut werden; jedes Level liegt einen Grid-Schritt entfernt.',
    'zone.breakout.levelsBelow.off.hint': 'Im Breakout-Modus mit BUY ohne Wirkung: BUY wird nur über dem Preis aufgebaut.',
    'zone.breakout.levelsAbove.hint':
      'Wie viele Grid-Level (Orders) über dem Referenzpreis aufgebaut werden; jedes Level liegt einen Grid-Schritt entfernt.',
    'zone.breakout.levelsAbove.off.hint': 'Im Breakout-Modus mit SELL ohne Wirkung: SELL wird nur unter dem Preis aufgebaut.',
    'zone.breakout.maxPositions.hint':
      'Höchstzahl gleichzeitig offener Positionen in dieser Zone. Ist sie erreicht, werden keine neuen Orders gesetzt. 0 = unbegrenzt (die Engine deckelt bei 500).',

    // --- Zone: Aufräumen beim Verlassen ---
    'zone.exit.clearOnExit.tip':
      'Eingeschaltet räumt die Zone auf und stoppt (Status „Automatisch bereinigt“), sobald der Preis sie verlässt; auch wenn der Preis zurückkehrt, werden erst nach „Neu starten“ wieder Orders gesetzt. Die Optionen daneben legen fest, was wann aufgeräumt wird. Ausgeschaltet bleiben die Orders der Zone unberührt.',
    'zone.exit.side.hint':
      'Bei welcher Ausbruchsrichtung aufgeräumt wird: beliebig, nur nach oben (über der Obergrenze) oder nur nach unten (unter der Untergrenze). Bei Ausbruch in die andere Richtung bleiben die Orders unberührt, die Zone wird trotzdem deaktiviert.',
    'zone.exit.target.hint': 'Welche Seite beim Aufräumen gelöscht/geschlossen wird: alle, nur BUY oder nur SELL.',
    'zone.exit.scope.hint':
      'Nur Pending Orders: nur noch nicht ausgeführte Orders werden gelöscht.\nAlle Trades: auch offene Positionen werden geschlossen (ein Verlust kann realisiert werden).',
    'zone.exit.trigger.hint':
      'Aktueller Preis: löst aus, sobald der Preis die Grenze überschreitet.\nKerzenschluss: löst nur aus, wenn die Kerze des gewählten Zeitrahmens außerhalb der Zone schließt (sicherer gegen kurze Dochte).',
    'zone.exit.timeframe.hint':
      'Zeitrahmen der Kerzenschluss-Prüfung (M1 = 1 Minute … D1 = 1 Tag). Schließt die letzte abgeschlossene Kerze außerhalb der Zone, gilt das als Ausbruch.',
    'zone.entryMode.hint':
      'Grid: gleitende Raster-Orders im Preisbereich.\nFraktal: Pending-Orders nur auf Höhe der jüngsten Fraktale im gewählten Zeitrahmen (je Richtung so viele wie „Anzahl Orders“, Standard 1). Ein neues Fraktal verschiebt die Orders; hat der Kurs das Niveau schon erreicht, wird keine gesetzt. Löschst du die Order oder schließt die Position in MT5, wird dasselbe Fraktal nicht erneut gehandelt.',
    'zone.fractal.timeframe.hint':
      'Kerzenperiode, in der Fraktale gesucht werden (M1 = 1 Minute … D1 = 1 Tag). Ein Fraktal besteht aus 5 Kerzen und gilt erst, wenn die zwei Kerzen rechts davon geschlossen sind; ATR und SAR nutzen dieselbe Periode.',
    'zone.fractal.orderMode.hint':
      'Ausbruch: oberes Fraktal → Buy Stop, unteres Fraktal → Sell Stop (setzt auf den Bruch des Niveaus).\nAbpraller: oberes Fraktal → Sell Limit, unteres Fraktal → Buy Limit (setzt auf die Umkehr am Niveau).\nDie Richtung (BUY/SELL/Beide) begrenzt die Seiten; das Fraktal muss im Preisbereich der Zone liegen.',
    'zone.fractal.slMode.hint':
      'ATR: Spitze der Fraktal-Kerze ± Faktor × ATR (typische Kerzenschwankung).\nParabolic SAR: SAR-Punkt; bei offenen Positionen mit jeder neuen Kerze nachgezogen, nur in Gewinnrichtung.\nGegenfraktal: jenseits des letzten unteren (BUY) bzw. oberen Fraktals (SELL) + Puffer.\nFraktal-Kerze: Tief der Fraktal-Kerze − Puffer (BUY), Hoch + Puffer (SELL).\nLässt er sich nicht berechnen oder liegt er auf der falschen Seite, gilt Fraktal-Kerze + Puffer.',
    'zone.fractal.useSl.hint':
      'An: jede Fraktal-Order bekommt einen SL (nach der Methode daneben).\nAus: Orders werden ohne SL gesetzt; Chance/Risiko-TP und SAR-Nachziehen entfallen, TP nur als Betrag. Verluste können unbegrenzt sein.',
    'zone.fractal.slBuffer.hint':
      'Wie weit jenseits der Fraktal-Kerze / des Gegenfraktals der SL liegt (Preiseinheiten, z. B. 0,05). Auch Rückfallwert, wenn ATR oder SAR nicht berechenbar sind.',
    'zone.fractal.atrPeriod.hint':
      'Über wie viele Kerzen die True Range für den ATR gemittelt wird (wie der MT5-ATR-Indikator, Standard 14).',
    'zone.fractal.atrMultiplier.hint':
      'SL-Abstand = Faktor × ATR, gemessen ab der Spitze der Fraktal-Kerze. Größer = weiterer SL (Standard 1,5).',
    'zone.fractal.sarStep.hint':
      'Beschleunigungsschritt des Parabolic SAR (MT5-Standard 0,02). Größer = SAR nähert sich dem Kurs schneller.',
    'zone.fractal.sarMax.hint': 'Obergrenze der Parabolic-SAR-Beschleunigung (MT5-Standard 0,2).',
    'zone.fractal.orderCount.hint':
      'Auf wie vielen der jüngsten Fraktale je Richtung (BUY und SELL jeweils) eine Pending-Order steht (1–20). Ein erreichtes, ausgelöstes oder von Hand gelöschtes Fraktal lässt seinen Platz leer; ältere rücken nicht nach. Offene Positionen begrenzt „Max. Positionen“.',
    'zone.fractal.buyOrderCount.hint':
      'Auf wie vielen der jüngsten Fraktale eine BUY-Pending-Order steht (1–20). Ein erreichtes, ausgelöstes oder von Hand gelöschtes Fraktal lässt seinen Platz leer; ältere rücken nicht nach. Offene Positionen begrenzt „Max. Positionen“.',
    'zone.fractal.sellOrderCount.hint':
      'Auf wie vielen der jüngsten Fraktale eine SELL-Pending-Order steht (1–20). Ein erreichtes, ausgelöstes oder von Hand gelöschtes Fraktal lässt seinen Platz leer; ältere rücken nicht nach. Offene Positionen begrenzt „Max. Positionen“.',
    'zone.fractal.rr.hint':
      'TP = Einstieg ± dieser Wert × SL-Abstand. Z. B. 2: TP doppelt so weit wie der SL. 0 = kein TP.',
    'zone.fractal.tpByMoney.hint':
      'An: Der TP ist ein fester Betrag (Kontowährung) statt des Chance/Risiko-Faktors. Aus: TP = SL-Abstand × Faktor.',
    'zone.fractal.tpMoney.hint':
      'Ziel-Gewinn pro Position (Kontowährung). Der TP liegt im Preisabstand, der diesem Betrag beim Lot der jeweiligen Seite entspricht. 0 = kein TP.',
    'zone.fractal.nextLossMoney.hint':
      'Die nächste Fraktal-Order wird erst gesetzt, wenn die zuletzt eröffnete Position dieser Richtung mindestens diesen Betrag im Minus ist. Beispiel 1 $: BUY bei 2650 offen → neue BUY-Order erst bei −1 $ (≈ 2649 bei 0,01 Lot Gold). Ohne Position: Order sofort. 0 = keine Grenze.',
    'zone.fractal.nextLossPips.hint':
      'Die nächste Fraktal-Order wird erst gesetzt, wenn der Preis mindestens diesen Abstand gegen die zuletzt eröffnete Position dieser Richtung gelaufen ist. Beispiel 2.00: BUY bei 2650 → neue BUY-Order erst bei Bid ≤ 2648.00; SELL bei 2700 → erst bei Ask ≥ 2702.00. 0 = keine Grenze.',
    'zone.fractal.nextLossByPips.hint':
      'An: Grenze ist ein Preisabstand (Pip, z. B. 2.00 gegen den Einstieg). Aus: Grenze ist der Verlust der Position (Kontowährung, z. B. 1 $). BUY und SELL werden getrennt geprüft.',
    'zone.fractal.maxPositions.hint':
      'Höchstzahl gleichzeitig offener Positionen dieser Zone. Ist sie erreicht, setzt die Zone keine neuen Orders und löscht ihre Pending Orders. 0 = unbegrenzt (die Engine deckelt bei 500).',
    'zone.legacyOrders.delete.hint':
      'Speichert die Entscheidung; der Bot löscht diese Orders in seiner nächsten Runde in MT5. Offene Positionen bleiben.',
    'zone.legacyOrders.keep.hint':
      'Speichert die Entscheidung; die Orders bleiben in MT5, der Bot fasst sie nicht an und dieses Fenster erscheint nicht wieder.',
    'vps.online.restart.hint': 'Startet den Worker über die Worker-API neu (run_uvicorn_watchdog.bat startet ihn wieder). Bots laufen weiter; nur mit Admin-Schlüssel und nur unter der Neustart-Schleife.',
    // --- Analyse ---
    'nav.analysis.hint': 'Analyse-Seite: Chart und Statistik für das gewählte Konto und Setup.',
    'analysis.tab.chart.hint': 'MT5-Kurschart mit den Setup-Grenzen und den Setup-Einstellungen.',
    'analysis.tab.stats.hint': 'Kennzahlen, Kurven und Aufteilung je Symbol und Setup aus echten Trades.',
    'analysis.zone.hint': 'Das analysierte Setup (nur Setups des gewählten Kontos), benannt „Symbol · Setup n“ wie auf den Symbolkarten. Ungespeicherte Änderungen zählen mit.',
    'analysis.range.hint': 'Der analysierte Zeitraum in Brokertagen (MT5-Zeit). Vorauswahl oder eigener Zeitraum als TT.MM.JJ.',
    'analysis.range.preset.hint': 'Setzt den Zeitraum auf „{label}“ (Brokertage).',
    'analysis.range.from.hint': 'Erster Tag, TT.MM.JJ (z. B. 01.09.26). Zählt ab Beginn dieses Tages.',
    'analysis.range.to.hint': 'Letzter Tag, TT.MM.JJ. Zählt bis zum Ende dieses Tages.',
    'analysis.range.apply.hint': 'Übernimmt den eingegebenen Beginn und das Ende.',
    'analysis.range.apply.off.hint': 'Zuerst zwei gültige Daten eingeben (TT.MM.JJ); der Beginn darf nicht nach dem Ende liegen.',
    'analysis.range.calendar.hint': 'Im Kalender wählt der erste Klick den ersten Tag, der zweite den letzten.',
    'analysis.settings.hint': 'Legt fest, was Chart und Seite zeigen. Warnungen und Modellgrenzen sind immer sichtbar.',
    'analysis.settings.zoneLines.hint': 'Zeigt die untere und obere Preisgrenze des Setups als gestrichelte Linien und als helles Band im Chart.',
    'analysis.settings.levels.hint': 'Die Grid-Stufen, die der Bot vom aktuellen Preis aus rechnet (Kauf grün, Verkauf rot, gepunktet). Nur Anzeige; der Bot rechnet selbst.',
    'analysis.settings.trades.hint': 'Offene Positionen (durchgezogen, TP/SL gepunktet) und Pending-Orders (gestrichelt) des laufenden Bots in diesem Setup. Alle 5 Sekunden neu.',
    'analysis.settings.pauses.hint': 'Marktpausen (Wochenende, Feiertag, Tagespause) als dünne gestrichelte senkrechte Linie zwischen zwei Kerzen.',
    'analysis.settings.rsi.hint': 'RSI (14, Wilder), im Browser aus den gezeigten Kerzen gerechnet, im eigenen Bereich unter dem Chart.',
    'analysis.chart.timeframe.option.hint': 'Zeigt {tf}-Kerzen. Bei langen Zeiträumen lädt ein größerer Zeitrahmen schneller.',
    'analysis.chart.hours.hint': 'Übliche Handelszeit, geschätzt aus den Kerzen (Brokerzeit). Nicht exakt; Feiertage des Brokers sind nicht enthalten.',
    'analysis.chart.brokerTime.hint': 'Alle Zeiten im Chart sind Brokerzeit, so wie MT5 sie liefert; nicht in die Zeitzone des Browsers umgerechnet.',
    'analysis.chart.key.hint': 'Grau schraffiert: keine Daten von MT5 (es wird keine Kerze erfunden). Gestrichelte senkrechte Linie: Marktpause. Der Rest lässt sich im Zahnrad schalten; die Markierung fehlender Daten nicht.',
    'analysis.settings.zoneCard.hint': 'Zeigt die Einstellungen des gewählten Setups als Karte über dem Chart.',
    'analysis.license.hint': 'Zeigt den Lizenzhinweis der Chart-Bibliothek (TradingView).',
    'analysis.license.link.hint': 'Öffnet die Website von TradingView in einem neuen Tab.',
    'analysis.clock.badge.hint': 'Abstand der Brokeruhr zu UTC (vom Worker in MT5 gemessen). „Heute“ und die Tagesgrenzen richten sich danach.',
    'analysis.settings.history.hint': 'Geschlossene Trades aus dem Archiv im Chart: Pfeil am Einstieg (Kauf grün nach oben, Verkauf rot nach unten), Punkt am Ausstieg (Gewinn grün, Verlust rot), gepunktete Linie dazwischen. Trades mit unbekanntem Setup grau mit „?“.',
    'analysis.settings.fractals.hint': 'Nur Fraktal-Setups: Bill-Williams-Fraktale aus 5 geschlossenen Kerzen (gleiche Regel wie der Bot), Dreieck über dem Hoch bzw. unter dem Tief. Fraktale, auf die der Bot gehandelt hat, sind orange.',
    'analysis.chart.fractals.switch.hint': 'Stellt den Chart auf den Fraktal-Zeitrahmen des Setups ({tf}); nur dort sind die gehandelten Fraktale markiert.',
    'analysis.trades.unknownZone.hint': 'Der Trade hat eine Magic-Nummer des Robots, lässt sich über das Setup-Register aber nicht sicher zuordnen (z. B. vor Beginn des Registers eröffnet). Es wird nicht geraten.',
    'analysis.trades.partial.hint': 'Ein Teil der Position wurde geschlossen; jede Teilschließung ist ein eigener Trade. Einstiegskosten werden nach Volumen verteilt.',
    'analysis.trades.reversal.hint': 'Umkehr auf einem Netting-Konto (INOUT): Die Position wurde geschlossen und das restliche Volumen unter derselben Positionsnummer in der Gegenrichtung eröffnet.',
    'analysis.trades.closeBy.hint': 'Durch eine Gegenposition geschlossen (Close By).',
    'analysis.trades.noEntry.hint': 'Der Einstieg dieser Position ist weder im Archiv noch in MT5: Einstiegspreis und Setup lassen sich nicht bestimmen.',
    'analysis.trades.openedBefore.hint': 'Vor dem gewählten Zeitraum eröffnet ({at}); zählt nach der Schließzeit in diesem Zeitraum.',
    'analysis.trades.reason.sl.hint': 'Durch Stop Loss geschlossen.',
    'analysis.trades.reason.tp.hint': 'Durch Take Profit geschlossen.',
    'analysis.trades.reason.so.hint': 'Vom Broker wegen fehlender Margin geschlossen (Stop-out).',
    'analysis.trades.focus.hint': 'Verschiebt den Chart zum Einstieg dieses Trades (ohne Einstieg zum Ausstieg).',
    'analysis.trades.col.mfe.hint': 'MFE: größter Zwischengewinn des Trades, MAE: größter Zwischenverlust; in Punkten und Kontowährung. Geschätzt (Untergrenze): Es zählen nur die M1-Kerzen zwischen Einstiegs- und Ausstiegskerze plus Ein-/Ausstiegspreis. Bei SELL gilt Ask = Bid + Spread der Kerze. Geld wird aus dem Gewinn des Trades selbst abgeleitet (fehlt bei Ausstieg = Einstieg).',
    'analysis.trades.mfe.compute.hint': 'Lädt die M1-Kerzen für die noch nicht berechneten Trades der Tabelle (einmal je Symbol, neueste zuerst) und berechnet MFE/MAE. In Klammern: Anzahl offener Trades. Deaktiviert, wenn alle berechnet sind.',
    'analysis.trades.mfe.reason.noEntry.hint': 'Der Einstiegs-Deal fehlt im Archiv: Einstiegspreis und -zeit sind unbekannt.',
    'analysis.trades.mfe.reason.tooLong.hint': 'Der Trade war länger als 100.000 M1-Kerzen (etwa 69 Tage) offen: Über dieser Grenze werden keine Kerzen geladen.',
    'analysis.trades.mfe.reason.busy.hint': 'Die M1-Kerzen waren gerade nicht lesbar (Konto beschäftigt oder MT5-Fehler). Erneut drücken.',
    'analysis.trades.mfe.reason.missing.hint': 'Zwischen Ein- und Ausstieg fehlen M1-Kerzen (aus MT5 nicht lesbar). Es wird nie 0 gezeigt.',
    'analysis.trades.mfe.reason.noSpread.hint': 'SELL braucht den Spread der Kerze, eine Kerze hat keinen.',
    'analysis.trades.mfe.reason.noPoint.hint': 'Der point-Wert des Symbols ist unbekannt: Punkte nicht berechenbar.',
    'analysis.stats.scope.hint': 'Welche Trades zählen: ganzes Konto, alle Setups eines Symbols (zum Vergleich der Setups) oder ein Setup.',
    'analysis.stats.kpi.net.hint': 'Gewinn + Kommission + Swap + Gebühr der im Zeitraum geschlossenen Trades.',
    'analysis.stats.kpi.trades.hint': 'Jeder Ausstieg (auch Teilschließung) ist ein Trade; Positionen = verschiedene Positionsnummern.',
    'analysis.stats.kpi.winRate.hint': 'Anteil der Trades mit Netto > 0.',
    'analysis.stats.kpi.profitFactor.hint': 'Bruttogewinn ÷ Bruttoverlust. Ohne Verlust „—“. Keine Bewertung.',
    'analysis.stats.kpi.avg.hint': 'Netto ÷ Anzahl Trades.',
    'analysis.stats.kpi.best.hint': 'Höchstes und niedrigstes Netto eines einzelnen Trades.',
    'analysis.stats.kpi.gross.hint': 'Summe der Gewinn-Trades / Summe der Verlust-Trades.',
    'analysis.stats.kpi.cycles.hint': 'Durch Take Profit geschlossene Trades.',
    'analysis.stats.kpi.maxDrawdown.hint': 'Größter Rückgang der realisierten Gewinnkurve vom bisherigen Höchststand.',
    'analysis.stats.curve.realized.hint': 'Aufsummiertes Netto des gewählten Umfangs (nach Schließzeit).',
    'analysis.stats.curve.balance.hint': 'Kontostand, vom heutigen Stand zurückgerechnet; bei Lücken im Archiv ausgeblendet.',
    'analysis.stats.curve.drawdown.hint': 'Abstand der realisierten Gewinnkurve zum bisherigen Höchststand.',
    'analysis.stats.by.zone.hint': 'Je registriertem Setup (Magic-Nummer), mit denselben Kennzahlen nebeneinander; unbekannte, manuelle und andere Trades getrennt.',
    'analysis.stats.by.symbol.hint': 'Je gehandeltem Symbol, nur Trades registrierter Setups; unbekannte, manuelle und andere Trades getrennt.',
    'analysis.stats.by.weekday.hint': 'Nach Tag der Schließung (MT5-Zeit).',
    'analysis.stats.by.hour.hint': 'Nach Stunde der Schließung (MT5-Zeit).',
    // --- CSV-Import ---
    'csv.import.hint': 'Lädt Kerzen aus einer CSV-Datei als Datenquelle für dieses Konto. MT5-Daten ändern sich nicht.',
    'csv.file.hint': 'CSV-Datei mit Kerzen (höchstens 150 MB). Gebraucht werden Spalten für Zeit, Open, High, Low und Close.',
    'csv.symbol.hint': 'Symbol der Kerzen in der Datei (z. B. XAUUSD). Der Backtest nutzt diese Quelle für dieses Symbol.',
    'csv.timeframe.hint': 'Zeitrahmen der Kerzen in der Datei. Die Zeiten müssen auf dessen Raster liegen, sonst wird die Datei abgelehnt.',
    'csv.offset.hint': 'Stunden, die zur CSV-Zeit addiert werden; das Ergebnis muss MT5-Serverzeit sein. Bei einer UTC-Datei den Broker-Abstand eintragen (z. B. 3 bei UTC+3). −14 bis 14.',
    'csv.cancel.hint': 'Schließt den Dialog; läuft ein Upload, wird er gestoppt und der unfertige Import gelöscht.',
    'csv.submit.hint': 'Lädt die Datei hoch, prüft und speichert sie. Bei einem Fehler wird nichts gespeichert. Ohne gewählte Datei gesperrt.',
    'csv.replace.hint': 'Löscht den überlappenden alten Import und speichert diesen. Nicht rückgängig zu machen.',
    'csv.item.unfinished.hint': 'Upload oder Prüfung wurde nicht abgeschlossen. Dieser Import ist als Datenquelle nicht wählbar und kann gelöscht werden.',
    'csv.delete.hint': 'Löscht diesen Import samt Kerzen. MT5-Daten bleiben unberührt.',
    'nav.backtest.hint': 'Backtest-Seite: testet eine Kopie eines Setups im Browser mit alten Kursen.',
    'backtest.field.timeframe.hint': 'Kerzenauflösung des Tests. M1 ist am genauesten, lädt aber die meisten Daten; bei gröberer Auflösung wird der Kursweg innerhalb einer Kerze geraten.',
    'backtest.field.spread.hint': 'Quelle des Spreads: „Aus der Kerze“ nimmt den gespeicherten Spread jeder Kerze, „Fest“ immer denselben Wert, „Maximum“ den größeren aus Kerzenwert und eingegebenem Wert.',
    'backtest.field.spreadPoints.hint': 'Spread in Punkten. Gilt für „Fest“ und „Maximum“.',
    'backtest.field.commission.hint': 'Kommission für ein Lot in Kontowährung, Einstieg und Ausstieg zusammen. Der Test bucht je die Hälfte beim Einstieg und beim Ausstieg. Ein Vorschlag kommt aus dem Archiv.',
    'backtest.field.swap.hint': 'An: Die Übernachtkosten (Swap) werden mit den heutigen Symbolwerten gerechnet. Aus: Swap zählt als null.',
    'backtest.field.capital.hint': 'Betrag in Kontowährung, bei dem die Equity-Kurve beginnt. Nur ein Rechenwert; er berührt den echten Kontostand nicht, und es gibt keine Margin-Prüfung.',
    'backtest.field.fill.hint': '„Kurslücke“: Springt der Kurs über eine Order, füllt sie zum Preis nach dem Sprung. „Parität“: Eine Order füllt immer zu ihrem eigenen Preis.',
    'backtest.field.slFirst.hint': 'Lösen TP und SL beim selben Preis aus, zählt der SL zuerst (vorsichtiges Ergebnis). Aus: Der TP zählt zuerst.',
    'backtest.field.path.hint': 'Innerhalb einer Kerze ist unbekannt, ob der Kurs zuerst zum Tief oder zum Hoch lief. „Beide“ rechnet zwei Tests und zeigt die Spanne.',
    'backtest.field.closeAtEnd.hint': 'An: Offene Positionen werden am Ende des Tests zum letzten Kurs geschlossen. Aus: Sie bleiben offen und erscheinen als offener G/V.',
    'backtest.field.approximate.hint': 'Rechnet auch Symbole mit nicht unterstützter Berechnungsart, näherungsweise. Das Ergebnis ist eine Schätzung.',
    'backtest.run.hint': 'Führt die gewählte Kopie des Setups mit diesen Einstellungen aus. Das echte Setup, die Orders und das Konto ändern sich nicht.',
    'backtest.run.off.noZone.hint': 'Wähle zuerst ein Setup.',
    'backtest.run.off.symbol.hint': 'Die Symboldaten fehlen: warte auf das Laden oder prüfe, ob das Symbol im Konto existiert.',
    'backtest.run.off.netting.hint': 'Dieses Konto ist ein Netting-Konto; der Backtest rechnet nur Hedging-Konten.',
    'backtest.run.off.loading.hint': 'Brokeruhr und Kontodaten werden geladen; warte ein paar Sekunden.',
    'backtest.cancel.hint': 'Stoppt den laufenden Test. Das Ergebnis wird verworfen.',
    'backtest.commission.use.hint': 'Schreibt die mittlere Kommission aus dem Archiv in das Feld.',
    'backtest.log.onlyWarn.hint': 'Blendet die Info-Zeilen aus und zeigt nur Warnungen und Fehler.',
    'backtest.curve.equity.hint': 'Equity: Startkapital + realisiert + offener G/V am Ende jeder Kerze.',
    'backtest.curve.drawdown.hint': 'Drawdown: wie weit die Equity unter ihrem bisherigen Höchststand liegt.',
    'backtest.summary.realized.hint': 'Netto-Summe der geschlossenen Trades (Gewinn + Kommission + Swap).',
    'backtest.summary.open.hint': 'Gewinn/Verlust der offenen Positionen am Testende, mit Eingangskommission und gebuchtem Swap.',
    'backtest.summary.endEquity.hint': 'Startkapital + realisiert + offener G/V.',
    'backtest.summary.openPositions.hint': 'Zahl der Positionen, die am Testende noch offen sind.',
    'backtest.summary.maxDrawdown.hint': 'Größter Rückgang der Equity von einem früheren Höchststand, in Kontowährung.',
    'backtest.summary.commission.hint': 'Summe der Kommission der geschlossenen Trades (negativ = Kosten).',
    'backtest.summary.swap.hint': 'Summe des Swaps der geschlossenen Trades (negativ = Kosten).',
    'backtest.summary.spread.hint': 'Spread-Kosten der eröffneten Positionen. Sie stecken schon in den Füllpreisen; nur zur Information.',
    'backtest.result.path.auto.hint': 'Der Kerzenweg wurde automatisch nach der Richtung der Kerze gewählt.',
    'backtest.result.path.lowFirst.hint': 'In jeder Kerze lief der Kurs zuerst zum Tief, dann zum Hoch.',
    'backtest.result.path.highFirst.hint': 'In jeder Kerze lief der Kurs zuerst zum Hoch, dann zum Tief.',
  },
);
