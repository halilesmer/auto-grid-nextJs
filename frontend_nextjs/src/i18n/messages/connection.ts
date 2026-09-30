import { defineArea } from './define';

// Worker-Verbindung (Adresse + API-Key im Browser): Header-Chip, Dialog und Leerzustand.
// Hinweistexte (Tooltips) stehen wie überall in hints.ts. Statustexte, die der Worker/ngrok liefert, werden nicht übersetzt.
export default defineArea(
  {
    'connection.chip.connect': 'VPS bağla',
    'connection.chip.aria': 'VPS bağlantısı: {status}',
    'connection.status.unconfigured': 'Bağlı değil',
    'connection.status.checking': 'Kontrol ediliyor…',
    'connection.status.connected': 'Bağlı',
    'connection.status.unauthorized': 'API anahtarı geçersiz',
    'connection.status.unreachable': 'Ulaşılamıyor',
    'connection.status.insecure': 'Güvensiz adres',

    'connection.dialog.title': 'VPS’e bağlan',
    'connection.dialog.intro':
      'Worker adresini ve API anahtarını gir ya da VPS kurulumunun verdiği bağlantı linkini yapıştır.',
    'connection.dialog.privacy':
      'Adres ve anahtar yalnızca bu tarayıcıda saklanır; Vercel sunucusuna gönderilmez.',
    'connection.field.link': 'Bağlantı linki veya kodu',
    'connection.field.link.placeholder': 'https://…/#connect=…',
    'connection.link.invalid': 'Bu metin geçerli bir bağlantı kodu değil.',
    'connection.field.url': 'Worker adresi',
    'connection.field.url.placeholder': 'https://alanadi.ngrok-free.dev',
    'connection.field.key': 'API anahtarı',
    'connection.field.key.placeholder': 'Yönetici anahtarı veya kişisel anahtar',
    'connection.key.show': 'Anahtarı göster',
    'connection.key.hide': 'Anahtarı gizle',
    'connection.action.test': 'Test et',
    'connection.action.connect': 'Bağlan',
    'connection.action.disconnect': 'Bağlantıyı kes',
    'connection.fromLink.title': 'Bağlantı linkinden geldi',
    'connection.fromLink.body':
      'Bu link seni {host} adresindeki bir worker’a bağlayacak. Hesap bilgilerin bu worker’a gönderilir; yalnızca kendi VPS’inden aldığın linke güven.',

    'connection.test.testing': 'Test ediliyor…',
    'connection.test.ok': 'Bağlantı başarılı: {host} üzerinde worker çalışıyor ({platform}).',
    'connection.test.invalid': 'Adres geçersiz. Örnek: https://alanadi.ngrok-free.dev',
    'connection.test.insecure':
      'Bu sayfa https ile açık; tarayıcı http:// adreslerini engeller. https:// adresi (ngrok) kullan.',
    'connection.test.unauthorized':
      'Worker’a ulaşıldı ama API anahtarı kabul edilmedi. Anahtarı VPS’teki WORKER_API_KEY ile karşılaştır.',
    'connection.test.unreachable':
      'Worker’a ulaşılamadı. Adres doğru mu, VPS’te worker ve ngrok tüneli çalışıyor mu?',
    'connection.test.unreachable.ngrok':
      'ngrok tüneli çevrimdışı ({code}). VPS’te worker ve ngrok çalışıyor mu?',
    'connection.test.notWorker': 'Bu adres bir Grid Robot worker’ı gibi yanıt vermiyor.',

    'connection.disconnect.title': 'Bağlantı kesilsin mi?',
    'connection.disconnect.message':
      'Kayıtlı adres ve API anahtarı bu tarayıcıdan silinir. VPS’teki worker ve botlar çalışmaya devam eder.',
    'connection.error.notConnected': 'Worker’a bağlı değil. Önce “VPS bağla” ile bağlantıyı kur.',

    'connection.gate.title': 'Henüz bir VPS bağlı değil',
    'connection.gate.subtitle':
      'Grid Robot, Windows VPS’inde çalışan worker’a bağlanır. Bağlandıktan sonra hesapların, bölgelerin ve botların burada görünür.',
    'connection.gate.step1': 'VPS’te worker’ı kur ve başlat (docs/windows_start_guide.md).',
    'connection.gate.step2':
      'Worker adresini ve API anahtarını gir ya da kurulumun verdiği bağlantı linkini aç.',
    'connection.gate.step3': 'Bağlandıktan sonra MT5 hesabını ekle.',
    'connection.gate.connect': 'VPS’e bağlan',
    'connection.gate.mt5.title': 'MT5 için unutma',
    'connection.gate.mt5.body':
      'VPS’te MT5’i kur ve giriş yap. Araçlar → Seçenekler’de “Algoritmik ticarete izin ver” ve Topluluk sekmesinde “Python integration” kutuları işaretli olmalı; sonra MT5’i yeniden başlat.',

    'vps.localOnly.title': 'Bu sayfa yalnızca yerel çalışır',
    'vps.localOnly.body':
      'VPS sayfası, Mac’inde çalışan yerel frontend’den SSH ile VPS’i yönetir; herkese açık (Vercel) sürümde kapalıdır. Aşağıda worker’ı yönetici anahtarıyla doğrudan API üzerinden yönetebilirsin (durum, yeniden başlatma, log).',
  },
  {
    'connection.chip.connect': 'Connect VPS',
    'connection.chip.aria': 'VPS connection: {status}',
    'connection.status.unconfigured': 'Not connected',
    'connection.status.checking': 'Checking…',
    'connection.status.connected': 'Connected',
    'connection.status.unauthorized': 'API key rejected',
    'connection.status.unreachable': 'Unreachable',
    'connection.status.insecure': 'Insecure address',

    'connection.dialog.title': 'Connect to VPS',
    'connection.dialog.intro':
      'Enter the worker address and API key, or paste the connection link your VPS setup printed.',
    'connection.dialog.privacy':
      'Address and key are stored in this browser only; they are never sent to the Vercel server.',
    'connection.field.link': 'Connection link or code',
    'connection.field.link.placeholder': 'https://…/#connect=…',
    'connection.link.invalid': 'This text is not a valid connection code.',
    'connection.field.url': 'Worker address',
    'connection.field.url.placeholder': 'https://yourname.ngrok-free.dev',
    'connection.field.key': 'API key',
    'connection.field.key.placeholder': 'Administrator key or personal key',
    'connection.key.show': 'Show key',
    'connection.key.hide': 'Hide key',
    'connection.action.test': 'Test',
    'connection.action.connect': 'Connect',
    'connection.action.disconnect': 'Disconnect',
    'connection.fromLink.title': 'Opened from a connection link',
    'connection.fromLink.body':
      'This link will connect you to a worker at {host}. Your account details are sent to that worker, so only trust a link from your own VPS.',

    'connection.test.testing': 'Testing…',
    'connection.test.ok': 'Connection successful: worker running on {host} ({platform}).',
    'connection.test.invalid': 'The address is not valid. Example: https://yourname.ngrok-free.dev',
    'connection.test.insecure':
      'This page is served over https, so the browser blocks http:// addresses. Use an https:// address (ngrok).',
    'connection.test.unauthorized':
      'The worker answered but rejected the API key. Compare it with WORKER_API_KEY on the VPS.',
    'connection.test.unreachable':
      'The worker could not be reached. Is the address right, and are the worker and the ngrok tunnel running on the VPS?',
    'connection.test.unreachable.ngrok':
      'The ngrok tunnel is offline ({code}). Are the worker and ngrok running on the VPS?',
    'connection.test.notWorker': 'This address does not answer like a Grid Robot worker.',

    'connection.disconnect.title': 'Disconnect?',
    'connection.disconnect.message':
      'The saved address and API key are removed from this browser. The worker and bots keep running on the VPS.',
    'connection.error.notConnected': 'Not connected to a worker. Set up the connection with “Connect VPS” first.',

    'connection.gate.title': 'No VPS connected yet',
    'connection.gate.subtitle':
      'Grid Robot connects to the worker running on your Windows VPS. Once connected, your accounts, zones and bots show up here.',
    'connection.gate.step1': 'Install and start the worker on the VPS (docs/windows_start_guide.md).',
    'connection.gate.step2':
      'Enter the worker address and API key, or open the connection link the setup printed.',
    'connection.gate.step3': 'Add your MT5 account once connected.',
    'connection.gate.connect': 'Connect to VPS',
    'connection.gate.mt5.title': 'Don’t forget for MT5',
    'connection.gate.mt5.body':
      'Install MT5 on the VPS and log in. Under Tools → Options, “Allow algorithmic trading” and, on the Community tab, “Python integration” must be ticked; then restart MT5.',

    'vps.localOnly.title': 'This page only works locally',
    'vps.localOnly.body':
      'The VPS page manages the VPS over SSH from the local frontend on your Mac; it is off in the public (Vercel) version. Below you can manage the worker directly through its API with the admin key (status, restart, log).',
  },
  {
    'connection.chip.connect': 'VPS verbinden',
    'connection.chip.aria': 'VPS-Verbindung: {status}',
    'connection.status.unconfigured': 'Nicht verbunden',
    'connection.status.checking': 'Wird geprüft…',
    'connection.status.connected': 'Verbunden',
    'connection.status.unauthorized': 'API-Key abgelehnt',
    'connection.status.unreachable': 'Nicht erreichbar',
    'connection.status.insecure': 'Unsichere Adresse',

    'connection.dialog.title': 'Mit VPS verbinden',
    'connection.dialog.intro':
      'Gib Worker-Adresse und API-Key ein oder füge den Verbindungs-Link ein, den die VPS-Einrichtung ausgegeben hat.',
    'connection.dialog.privacy':
      'Adresse und Key bleiben nur in diesem Browser gespeichert und gehen nie an den Vercel-Server.',
    'connection.field.link': 'Verbindungs-Link oder -Code',
    'connection.field.link.placeholder': 'https://…/#connect=…',
    'connection.link.invalid': 'Dieser Text ist kein gültiger Verbindungscode.',
    'connection.field.url': 'Worker-Adresse',
    'connection.field.url.placeholder': 'https://deinname.ngrok-free.dev',
    'connection.field.key': 'API-Key',
    'connection.field.key.placeholder': 'Administrator- oder persönlicher Schlüssel',
    'connection.key.show': 'Key anzeigen',
    'connection.key.hide': 'Key verbergen',
    'connection.action.test': 'Testen',
    'connection.action.connect': 'Verbinden',
    'connection.action.disconnect': 'Trennen',
    'connection.fromLink.title': 'Aus einem Verbindungs-Link',
    'connection.fromLink.body':
      'Dieser Link verbindet dich mit einem Worker auf {host}. Deine Kontodaten gehen an diesen Worker; vertraue nur einem Link von deinem eigenen VPS.',

    'connection.test.testing': 'Wird getestet…',
    'connection.test.ok': 'Verbindung erfolgreich: Worker läuft auf {host} ({platform}).',
    'connection.test.invalid': 'Die Adresse ist ungültig. Beispiel: https://deinname.ngrok-free.dev',
    'connection.test.insecure':
      'Diese Seite läuft über https, der Browser blockiert deshalb http://-Adressen. Nimm eine https://-Adresse (ngrok).',
    'connection.test.unauthorized':
      'Der Worker hat geantwortet, aber den API-Key abgelehnt. Vergleiche ihn mit WORKER_API_KEY auf dem VPS.',
    'connection.test.unreachable':
      'Der Worker ist nicht erreichbar. Stimmt die Adresse, laufen Worker und ngrok-Tunnel auf dem VPS?',
    'connection.test.unreachable.ngrok':
      'Der ngrok-Tunnel ist offline ({code}). Laufen Worker und ngrok auf dem VPS?',
    'connection.test.notWorker': 'Diese Adresse antwortet nicht wie ein Grid-Robot-Worker.',

    'connection.disconnect.title': 'Verbindung trennen?',
    'connection.disconnect.message':
      'Die gespeicherte Adresse und der API-Key werden aus diesem Browser gelöscht. Worker und Bots laufen auf dem VPS weiter.',
    'connection.error.notConnected': 'Nicht mit einem Worker verbunden. Richte zuerst die Verbindung mit „VPS verbinden“ ein.',

    'connection.gate.title': 'Noch kein VPS verbunden',
    'connection.gate.subtitle':
      'Grid Robot verbindet sich mit dem Worker auf deinem Windows-VPS. Danach erscheinen hier deine Konten, Zonen und Bots.',
    'connection.gate.step1': 'Worker auf dem VPS einrichten und starten (docs/windows_start_guide.md).',
    'connection.gate.step2':
      'Worker-Adresse und API-Key eingeben oder den Verbindungs-Link aus der Einrichtung öffnen.',
    'connection.gate.step3': 'Nach dem Verbinden dein MT5-Konto hinzufügen.',
    'connection.gate.connect': 'Mit VPS verbinden',
    'connection.gate.mt5.title': 'Für MT5 nicht vergessen',
    'connection.gate.mt5.body':
      'MT5 auf dem VPS installieren und einloggen. Unter Extras → Optionen müssen „Algorithmischen Handel erlauben“ und im Reiter Community „Python-Integration“ angehakt sein; danach MT5 neu starten.',

    'vps.localOnly.title': 'Diese Seite läuft nur lokal',
    'vps.localOnly.body':
      'Die VPS-Seite steuert den VPS per SSH vom lokalen Frontend auf deinem Mac; in der öffentlichen (Vercel-)Version ist sie aus. Darunter steuerst du den Worker direkt über seine API mit dem Admin-Schlüssel (Status, Neustart, Log).',
  },
);
