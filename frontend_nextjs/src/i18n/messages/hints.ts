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
      'Boş bırakırsanız kayıtlı şifre korunur. Yalnızca değiştirmek istiyorsanız yeni şifre girin.',
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
    'chart.page.back.hint': 'Dashboard’a (ana sayfa) döner.',
    'chart.page.stream.hint': 'Fiyat verisi worker’dan canlı akışla gelir.',
    'chart.soon.hint': 'Bu panel henüz hazır değil, sonraki sürümlerde eklenecek.',
    'chart.zone.active.hint': 'Bölge etkin: bot bu bölge için emir yönetir.',
    'chart.zone.inactive.hint': 'Bölge pasif: bot bu bölgeye emir koymaz.',
    'chart.zone.priceRange.hint': 'Bölgenin alt ve üst fiyat sınırı. Emirler yalnızca bu aralığa konur.',
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
    'saveBar.saveAll.hint': 'Tüm bölgelerdeki kaydedilmemiş değişiklikleri kaydeder.',
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
    'nav.language.cycle.hint': 'Dil: {current}. Tıklayınca {next} diline geçer.',
    'nav.language.option.hint': 'Arayüz dilini {language} yapar.',

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
      'ngrok tüneli arayüzü internet üzerinden worker’a bağlar. Çevrimdışıysa arayüz worker’a ulaşamaz.',
    'vps.tile.bots.hint': 'VPS’te çalışan bot süreçleri (hesap başına bir tane) ve açık MT5 terminali sayısı.',
    'vps.tile.version.hint':
      'VPS’teki kurulu sürüm ile git dalı/commit’i. Dal “main” değilse uyarı gösterilir; otomatik güncelleme main’den çeker.',
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
    'vps.log.refresh.hint': 'Logu VPS’ten yeniden çeker (otomatik yenileme de düzenli çalışır).',

    // --- Bölge: başlık ve panel ---
    'zone.panel.count.hint': 'Toplam bölge sayısı.',
    'zone.panel.add.hint': 'Listenin sonuna yeni bir bölge ekler (son bölgenin sembolüyle). Ayarları girip Kaydet’e basın.',
    'zone.panel.add.off.hint': 'Bot çalışıyor ama MT5’e bağlı değil; bağlantı kurulana kadar bölge eklenemez.',
    'zone.delete.confirm.hint': 'Bölgeyi listeden kaldırır. Kalıcı olması için “Tüm Ayarları Kaydet” gerekir.',
    'zone.header.badge.buy.hint': 'Bu bölge yalnızca BUY (alış) emirleri verir.',
    'zone.header.badge.sell.hint': 'Bu bölge yalnızca SELL (satış) emirleri verir.',
    'zone.header.badge.both.hint': 'Bu bölge hem BUY hem SELL emirleri verir.',
    'zone.market.hint': "Bu bölgenin sembolü için piyasa açık mı. Her sembolün işlem saati farklıdır; kapalıyken bu bölgede yeni emir yerleştirilemez.",
    'zone.header.unsaved.hint': 'Bu bölgede henüz kaydedilmemiş değişiklikler var.',
    'zone.header.started.hint':
      'Bölge etkin ve motor emirleri yönetiyor. Tıklayınca bölgeyi devre dışı bırakır (hemen kaydedilir).',
    'zone.header.start.hint':
      'Bölge kapalı. Tıklayınca bölgeyi etkinleştirir (hemen kaydedilir); motor çalışıyorsa emirler konur.',
    'zone.header.ready.hint':
      'Bölge etkin ama motor çalışmıyor; botu başlatınca emirler konur. Tıklayınca bölgeyi kapatır (hemen kaydedilir).',
    'zone.header.off.hint':
      'Bölge kapalı. Tıklayınca bölgeyi etkinleştirir (hemen kaydedilir); emirler botu başlatınca konur.',
    'zone.header.save.hint': 'Sadece bu bölgenin değişikliklerini kaydeder; diğer bölgeler etkilenmez.',
    'zone.header.save.off.hint': 'Bu bölgede kaydedilmemiş değişiklik yok.',
    'zone.header.test.hint': 'Bu bölge için fiyat grafiğini, bölge sınırlarını ve ayar özetini açar.',
    'zone.header.menu.hint': 'Bölge menüsü: ek işlemler (bölgeyi sil).',
    'zone.header.delete.hint': 'Bölgeyi siler (onay ister). Kalıcı olması için Kaydet gerekir.',
    'zone.header.delete.off.hint':
      'Bot çalışıyor ama MT5’e bağlı değil; bağlantı kurulana kadar bölge silinemez.',
    'zone.sync.hint':
      'Açıkken SELL, BUY’ın grid adımı, lot, kâr al ve zarar durdur değerlerini kullanır. Kapatınca SELL için ayrı değerler girebilirsiniz.',

    // --- Bölge: temel alanlar ---
    'zone.field.symbol.hint':
      'İşlem yapılacak enstrüman (broker’ın MT5 sembol adı, ör. USOUSD). Yazarak arayın, listeden seçin. Parantez içi: sembolün fiyat ondalık basamağı.',
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
      'Her grid emrinin hacmi (lot). Sembolün en küçük lot ve adım kuralına göre yuvarlanır; motor 0,01–5 lot ile sınırlar.',
    'zone.field.buyLot.hint': 'BUY emirlerinin hacmi (lot). SELL için ayrı bir alan var.',
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
    'zone.field.sellLot.hint': 'SELL emirlerinin hacmi (lot).',
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
      'Açıkken fiyat bölgenin dışına çıktığında bölge kendini temizler ve durur (“Otomatik temizlendi”); fiyat geri gelse de “Yeniden Başlat” denene kadar emir konmaz. Aşağıdaki seçenekler neyin, ne zaman temizleneceğini belirler. Kapalıyken bölgenin emirlerine dokunulmaz.',
    'zone.exit.side.hint':
      'Hangi yönde çıkışta temizlik yapılacağı: herhangi, yalnızca yukarı (üst sınırın üstü) veya yalnızca aşağı (alt sınırın altı). Diğer yönde çıkışta emirlere dokunulmaz, bölge yine de pasife alınır.',
    'zone.exit.target.hint': 'Temizlikte hangi tarafın işlemleri silinsin/kapatılsın: hepsi, yalnızca BUY veya yalnızca SELL.',
    'zone.exit.scope.hint':
      'Sadece Bekleyen Emirler: yalnızca henüz dolmamış emirler silinir.\nTüm İşlemler: açık pozisyonlar da kapatılır (zarar gerçekleşebilir).',
    'zone.exit.trigger.hint':
      'Anlık Fiyat: fiyat sınırı geçer geçmez tetiklenir.\nMum Kapanışı: yalnızca seçilen periyottaki mum bölgenin dışında kapanırsa tetiklenir (kısa iğne hareketlerine karşı daha güvenli).',
    'zone.exit.timeframe.hint':
      'Mum kapanışının hangi periyotta kontrol edileceği (M1 = 1 dakika … D1 = 1 gün). Son kapanan mum bölgenin dışında kapanırsa çıkış sayılır.',
  },
  {
    // --- Account ---
    'account.label.hint':
      'Selects the MT5 account you are working with. Zones, bot and logs belong to the selected account.',
    'account.action.downloadLog.hint': 'Downloads the bot log file of the selected account to your computer.',
    'account.action.edit.hint': 'Edits account name, server, environment, MT5 path or password. Not available while the bot is running.',
    'account.action.delete.hint': 'Removes the selected account from the list (asks for confirmation). The broker account and positions are not affected.',
    'account.action.add.hint': 'Adds a new MT5 account (name, login, server, MT5 path). The password is stored on the worker only.',
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
      'If left empty the saved password is kept. Only enter a new password if you want to change it.',
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
    'chart.page.back.hint': 'Returns to the dashboard (home page).',
    'chart.page.stream.hint': 'Price data arrives as a live stream from the worker.',
    'chart.soon.hint': 'This panel is not ready yet and will be added in a later version.',
    'chart.zone.active.hint': 'Zone active: the bot manages orders for this zone.',
    'chart.zone.inactive.hint': 'Zone inactive: the bot places no orders for this zone.',
    'chart.zone.priceRange.hint': 'Lower and upper price limit of the zone. Orders are only placed within this range.',
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
    'saveBar.saveAll.hint': 'Saves all unsaved changes in all zones.',
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
    'nav.language.cycle.hint': 'Language: {current}. Click to switch to {next}.',
    'nav.language.option.hint': 'Sets the interface language to {language}.',

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
      'The ngrok tunnel connects the UI to the worker over the internet. If it is offline the UI cannot reach the worker.',
    'vps.tile.bots.hint': 'Bot processes running on the VPS (one per account) and the number of open MT5 terminals.',
    'vps.tile.version.hint':
      'Installed version on the VPS with its git branch/commit. A warning shows if the branch is not “main”; auto-update pulls from main.',
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
    'vps.log.refresh.hint': 'Fetches the log from the VPS again (it also refreshes regularly on its own).',

    // --- Zone: header and panel ---
    'zone.panel.count.hint': 'Total number of zones.',
    'zone.panel.add.hint': 'Appends a new zone to the list (with the symbol of the last zone). Enter the settings and press Save.',
    'zone.panel.add.off.hint': 'The bot is running but not connected to MT5; zones cannot be added until it is connected.',
    'zone.delete.confirm.hint': 'Removes the zone from the list. “Save All Settings” is needed to make it permanent.',
    'zone.header.badge.buy.hint': 'This zone only places BUY orders.',
    'zone.header.badge.sell.hint': 'This zone only places SELL orders.',
    'zone.header.badge.both.hint': 'This zone places both BUY and SELL orders.',
    'zone.market.hint': "Whether the market is open for this zone's symbol. Every symbol has its own trading hours; no new orders can be placed in this zone while it is closed.",
    'zone.header.unsaved.hint': 'This zone has changes that are not saved yet.',
    'zone.header.started.hint':
      'The zone is active and the engine manages its orders. Click to disable the zone (saved immediately).',
    'zone.header.start.hint':
      'The zone is off. Click to activate it (saved immediately); orders are placed if the engine is running.',
    'zone.header.ready.hint':
      'The zone is active but the engine is not running; orders are placed once you start the bot. Click to switch the zone off (saved immediately).',
    'zone.header.off.hint':
      'The zone is off. Click to activate it (saved immediately); orders are placed once you start the bot.',
    'zone.header.save.hint': 'Saves only the changes of this zone; other zones are not affected.',
    'zone.header.save.off.hint': 'There are no unsaved changes in this zone.',
    'zone.header.test.hint': 'Opens the price chart, the zone limits and a summary of the settings for this zone.',
    'zone.header.menu.hint': 'Zone menu: further actions (delete zone).',
    'zone.header.delete.hint': 'Deletes the zone (asks for confirmation). Save is needed to make it permanent.',
    'zone.header.delete.off.hint':
      'The bot is running but not connected to MT5; the zone cannot be deleted until it is connected.',
    'zone.sync.hint':
      'When on, SELL uses the BUY values for grid step, lot, take profit and stop loss. Turn it off to enter separate values for SELL.',

    // --- Zone: basic fields ---
    'zone.field.symbol.hint':
      'Instrument to trade (the broker’s MT5 symbol name, e.g. USOUSD). Type to search, pick from the list. In brackets: the symbol’s price decimals.',
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
      'Volume of every grid order (lots). Rounded to the symbol’s minimum lot and step; the engine limits it to 0.01–5 lots.',
    'zone.field.buyLot.hint': 'Volume of BUY orders (lots). SELL has its own field.',
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
    'zone.field.sellLot.hint': 'Volume of SELL orders (lots).',
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
      'When on and the price leaves the zone, the zone clears itself and stops (“Auto-cleared”); even if the price comes back no orders are placed until you press “Restart”. The options below decide what is cleared and when. When off, the zone’s orders are left alone.',
    'zone.exit.side.hint':
      'In which exit direction to clean up: any, only upwards (above the upper limit) or only downwards (below the lower limit). On an exit in the other direction the orders are left alone, but the zone is still deactivated.',
    'zone.exit.target.hint': 'Which side’s trades are deleted/closed when cleaning up: all, BUY only or SELL only.',
    'zone.exit.scope.hint':
      'Pending Orders Only: only orders that are not filled yet are deleted.\nAll Trades: open positions are closed as well (a loss may be realised).',
    'zone.exit.trigger.hint':
      'Current Price: triggers as soon as the price crosses the limit.\nCandle Close: triggers only if the candle of the chosen timeframe closes outside the zone (safer against short wicks).',
    'zone.exit.timeframe.hint':
      'Timeframe of the candle close check (M1 = 1 minute … D1 = 1 day). If the last closed candle closes outside the zone, that counts as an exit.',
  },
  {
    // --- Konto ---
    'account.label.hint':
      'Wählt das MT5-Konto, mit dem Sie arbeiten. Zonen, Bot und Logs gehören zum gewählten Konto.',
    'account.action.downloadLog.hint': 'Lädt die Bot-Logdatei des gewählten Kontos auf Ihren Computer herunter.',
    'account.action.edit.hint': 'Bearbeitet Kontoname, Server, Umgebung, MT5-Pfad oder Passwort. Nicht möglich, solange der Bot läuft.',
    'account.action.delete.hint': 'Entfernt das gewählte Konto aus der Liste (mit Rückfrage). Das Broker-Konto und Positionen bleiben unberührt.',
    'account.action.add.hint': 'Legt ein neues MT5-Konto an (Name, Login, Server, MT5-Pfad). Das Passwort wird nur auf dem Worker gespeichert.',
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
      'Bleibt das Feld leer, wird das gespeicherte Passwort beibehalten. Nur eingeben, wenn Sie es ändern wollen.',
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
    'chart.page.back.hint': 'Zurück zum Dashboard (Startseite).',
    'chart.page.stream.hint': 'Die Preisdaten kommen als Live-Stream vom Worker.',
    'chart.soon.hint': 'Dieses Panel ist noch nicht fertig und kommt in einer späteren Version.',
    'chart.zone.active.hint': 'Zone aktiv: Der Bot verwaltet Orders für diese Zone.',
    'chart.zone.inactive.hint': 'Zone inaktiv: Der Bot setzt für diese Zone keine Orders.',
    'chart.zone.priceRange.hint': 'Untere und obere Preisgrenze der Zone. Orders werden nur in diesem Bereich gesetzt.',
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
    'saveBar.saveAll.hint': 'Speichert alle ungespeicherten Änderungen in allen Zonen.',
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
    'nav.language.cycle.hint': 'Sprache: {current}. Klick wechselt zu {next}.',
    'nav.language.option.hint': 'Stellt die Oberflächensprache auf {language}.',

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
      'Der ngrok-Tunnel verbindet die Oberfläche über das Internet mit dem Worker. Ist er offline, erreicht die Oberfläche den Worker nicht.',
    'vps.tile.bots.hint': 'Auf dem VPS laufende Bot-Prozesse (einer pro Konto) und Anzahl der offenen MT5-Terminals.',
    'vps.tile.version.hint':
      'Installierte Version auf dem VPS mit Git-Branch/Commit. Ist der Branch nicht „main“, erscheint eine Warnung; das Auto-Update holt von main.',
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
    'vps.log.refresh.hint': 'Holt das Log erneut vom VPS (es aktualisiert sich auch regelmäßig von selbst).',

    // --- Zone: Kopf und Panel ---
    'zone.panel.count.hint': 'Gesamtzahl der Zonen.',
    'zone.panel.add.hint': 'Hängt eine neue Zone ans Ende der Liste an (mit dem Symbol der letzten Zone). Einstellungen eintragen und Speichern drücken.',
    'zone.panel.add.off.hint': 'Der Bot läuft, ist aber nicht mit MT5 verbunden; Zonen lassen sich erst nach der Verbindung hinzufügen.',
    'zone.delete.confirm.hint': 'Entfernt die Zone aus der Liste. Erst „Alle Einstellungen speichern“ macht es dauerhaft.',
    'zone.header.badge.buy.hint': 'Diese Zone setzt nur BUY-Orders (Kauf).',
    'zone.header.badge.sell.hint': 'Diese Zone setzt nur SELL-Orders (Verkauf).',
    'zone.header.badge.both.hint': 'Diese Zone setzt BUY- und SELL-Orders.',
    'zone.market.hint': "Ob der Markt für das Symbol dieser Zone geöffnet ist. Jedes Symbol hat eigene Handelszeiten; bei geschlossenem Markt können in dieser Zone keine neuen Orders gesetzt werden.",
    'zone.header.unsaved.hint': 'Diese Zone hat Änderungen, die noch nicht gespeichert sind.',
    'zone.header.started.hint':
      'Die Zone ist aktiv und die Engine verwaltet ihre Orders. Klick deaktiviert die Zone (wird sofort gespeichert).',
    'zone.header.start.hint':
      'Die Zone ist aus. Klick aktiviert sie (wird sofort gespeichert); läuft die Engine, werden Orders gesetzt.',
    'zone.header.ready.hint':
      'Die Zone ist aktiv, aber die Engine läuft nicht; Orders werden gesetzt, sobald Sie den Bot starten. Klick schaltet die Zone aus (wird sofort gespeichert).',
    'zone.header.off.hint':
      'Die Zone ist aus. Klick aktiviert sie (wird sofort gespeichert); Orders werden gesetzt, sobald Sie den Bot starten.',
    'zone.header.save.hint': 'Speichert nur die Änderungen dieser Zone; andere Zonen bleiben unberührt.',
    'zone.header.save.off.hint': 'In dieser Zone gibt es keine ungespeicherten Änderungen.',
    'zone.header.test.hint': 'Öffnet den Preischart, die Zonengrenzen und eine Übersicht der Einstellungen dieser Zone.',
    'zone.header.menu.hint': 'Zonenmenü: weitere Aktionen (Zone löschen).',
    'zone.header.delete.hint': 'Löscht die Zone (mit Rückfrage). Erst Speichern macht es dauerhaft.',
    'zone.header.delete.off.hint':
      'Der Bot läuft, ist aber nicht mit MT5 verbunden; die Zone lässt sich erst nach der Verbindung löschen.',
    'zone.sync.hint':
      'Eingeschaltet nutzt SELL die BUY-Werte für Grid-Schritt, Lot, Take Profit und Stop Loss. Ausschalten, um für SELL eigene Werte einzugeben.',

    // --- Zone: Basisfelder ---
    'zone.field.symbol.hint':
      'Zu handelndes Instrument (MT5-Symbolname des Brokers, z. B. USOUSD). Zum Suchen tippen, aus der Liste wählen. In Klammern: Preis-Nachkommastellen des Symbols.',
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
      'Volumen jeder Grid-Order (Lots). Wird nach kleinstem Lot und Schritt des Symbols gerundet; die Engine begrenzt auf 0,01–5 Lots.',
    'zone.field.buyLot.hint': 'Volumen der BUY-Orders (Lots). SELL hat ein eigenes Feld.',
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
    'zone.field.sellLot.hint': 'Volumen der SELL-Orders (Lots).',
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
      'Eingeschaltet räumt die Zone auf und stoppt (Status „Automatisch bereinigt“), sobald der Preis sie verlässt; auch wenn der Preis zurückkehrt, werden erst nach „Neu starten“ wieder Orders gesetzt. Die Optionen darunter legen fest, was wann aufgeräumt wird. Ausgeschaltet bleiben die Orders der Zone unberührt.',
    'zone.exit.side.hint':
      'Bei welcher Ausbruchsrichtung aufgeräumt wird: beliebig, nur nach oben (über der Obergrenze) oder nur nach unten (unter der Untergrenze). Bei Ausbruch in die andere Richtung bleiben die Orders unberührt, die Zone wird trotzdem deaktiviert.',
    'zone.exit.target.hint': 'Welche Seite beim Aufräumen gelöscht/geschlossen wird: alle, nur BUY oder nur SELL.',
    'zone.exit.scope.hint':
      'Nur Pending Orders: nur noch nicht ausgeführte Orders werden gelöscht.\nAlle Trades: auch offene Positionen werden geschlossen (ein Verlust kann realisiert werden).',
    'zone.exit.trigger.hint':
      'Aktueller Preis: löst aus, sobald der Preis die Grenze überschreitet.\nKerzenschluss: löst nur aus, wenn die Kerze des gewählten Zeitrahmens außerhalb der Zone schließt (sicherer gegen kurze Dochte).',
    'zone.exit.timeframe.hint':
      'Zeitrahmen der Kerzenschluss-Prüfung (M1 = 1 Minute … D1 = 1 Tag). Schließt die letzte abgeschlossene Kerze außerhalb der Zone, gilt das als Ausbruch.',
  },
);
