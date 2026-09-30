import { defineArea } from './define';

// Mehrbenutzer-Betrieb: Rolle des verbundenen Schlüssels (Admin/Benutzer) und die Benutzerverwaltung (/users).
// Hinweistexte (Tooltips) stehen wie überall in hints.ts. Worker-Meldungen (`detail`) werden nicht übersetzt.
export default defineArea(
  {
    'auth.checking': 'Erişim kontrol ediliyor…',
    'auth.adminOnly.title': 'Yalnızca yöneticiler',
    'auth.adminOnly.body':
      'Bu sayfa yönetici anahtarıyla bağlanmayı gerektirir. Kişisel anahtarınla yalnızca kendi hesaplarını görür ve yönetirsin.',
    'auth.identity': '{name} olarak bağlısın ({role}).',
    'auth.role.admin': 'Yönetici',
    'auth.role.user': 'Kullanıcı',

    'users.eyebrow': 'Yönetim',
    'users.title': 'Kullanıcılar',
    'users.subtitle': 'Her kullanıcı kişisel bir anahtarla bağlanır ve yalnızca kendi hesaplarını görür.',
    'users.refresh': 'Listeyi yenile',
    'users.add': 'Kullanıcı ekle',
    'users.loading': 'Kullanıcılar yükleniyor…',
    'users.loadFailed': 'Kullanıcılar yüklenemedi',
    'users.empty': 'Henüz kullanıcı yok. Mevcut hesaplar yöneticiye (sana) aittir.',
    'users.col.name': 'Ad',
    'users.col.accounts': 'Hesaplar',
    'users.col.created': 'Oluşturuldu',
    'users.col.actions': 'İşlemler',
    'users.action.newKey': 'Yeni anahtar',
    'users.action.delete': 'Sil',

    'users.create.title': 'Kullanıcı ekle',
    'users.create.name': 'Ad',
    'users.create.name.placeholder': 'ör. Anna',
    'users.create.submit': 'Oluştur',
    'users.create.failed': 'Kullanıcı oluşturulamadı',

    'users.key.title': '{name} için anahtar',
    'users.key.warning':
      'Bu anahtar yalnızca şimdi gösterilir. Kopyala ve kullanıcıya güvenli bir yoldan ilet; kaybolursa yeni anahtar üretmen gerekir.',
    'users.key.field': 'Kişisel anahtar',
    'users.key.copy': 'Anahtarı kopyala',
    'users.link.field': 'Bağlantı linki',
    'users.link.copy': 'Linki kopyala',
    'users.link.local':
      'Bu link localhost’a işaret ediyor ve kullanıcıda çalışmaz. Linkin başındaki adresi frontend’in herkese açık adresiyle (ör. Vercel) değiştir; “#connect=…” kısmı aynı kalır.',
    'users.copied': 'Kopyalandı',
    'users.key.done': 'Tamam',

    'users.rotate.title': 'Anahtarı yenile',
    'users.rotate.message': '{name} için yeni bir anahtar üretilsin mi? Eski anahtar hemen geçersiz olur.',
    'users.rotate.confirm': 'Yenile',
    'users.rotate.failed': 'Anahtar yenilenemedi',
    'users.delete.title': 'Kullanıcıyı sil',
    'users.delete.message': '{name} silinsin mi? Anahtarı hemen geçersiz olur.',
    'users.delete.info': 'Hesapları ve çalışan botları silinmez; sahipsiz kalır ve yöneticiye ait olur.',
    'users.delete.failed': 'Kullanıcı silinemedi',

    'users.owner.label': 'Sahip',
    'users.owner.none': 'Yönetici (sahipsiz)',
  },
  {
    'auth.checking': 'Checking access…',
    'auth.adminOnly.title': 'Administrators only',
    'auth.adminOnly.body':
      'This page needs the administrator key. With your personal key you only see and manage your own accounts.',
    'auth.identity': 'Connected as {name} ({role}).',
    'auth.role.admin': 'Administrator',
    'auth.role.user': 'User',

    'users.eyebrow': 'Administration',
    'users.title': 'Users',
    'users.subtitle': 'Each user connects with a personal key and only sees their own accounts.',
    'users.refresh': 'Refresh list',
    'users.add': 'Add user',
    'users.loading': 'Loading users…',
    'users.loadFailed': 'Could not load users',
    'users.empty': 'No users yet. Existing accounts belong to the administrator (you).',
    'users.col.name': 'Name',
    'users.col.accounts': 'Accounts',
    'users.col.created': 'Created',
    'users.col.actions': 'Actions',
    'users.action.newKey': 'New key',
    'users.action.delete': 'Delete',

    'users.create.title': 'Add user',
    'users.create.name': 'Name',
    'users.create.name.placeholder': 'e.g. Anna',
    'users.create.submit': 'Create',
    'users.create.failed': 'Could not create user',

    'users.key.title': 'Key for {name}',
    'users.key.warning':
      'This key is shown only now. Copy it and pass it to the user in a safe way; if it gets lost you have to generate a new one.',
    'users.key.field': 'Personal key',
    'users.key.copy': 'Copy key',
    'users.link.field': 'Connection link',
    'users.link.copy': 'Copy link',
    'users.link.local':
      'This link points to localhost and will not work for the user. Replace the start of the link with the public address of the frontend (e.g. Vercel); the “#connect=…” part stays the same.',
    'users.copied': 'Copied',
    'users.key.done': 'Done',

    'users.rotate.title': 'Renew key',
    'users.rotate.message': 'Generate a new key for {name}? The old key stops working immediately.',
    'users.rotate.confirm': 'Renew',
    'users.rotate.failed': 'Could not renew the key',
    'users.delete.title': 'Delete user',
    'users.delete.message': 'Delete {name}? Their key stops working immediately.',
    'users.delete.info': 'Their accounts and running bots are kept; they become unassigned and belong to the administrator.',
    'users.delete.failed': 'Could not delete the user',

    'users.owner.label': 'Owner',
    'users.owner.none': 'Administrator (no owner)',
  },
  {
    'auth.checking': 'Zugriff wird geprüft …',
    'auth.adminOnly.title': 'Nur für Administratoren',
    'auth.adminOnly.body':
      'Diese Seite braucht den Administrator-Schlüssel. Mit deinem persönlichen Schlüssel siehst und verwaltest du nur deine eigenen Konten.',
    'auth.identity': 'Verbunden als {name} ({role}).',
    'auth.role.admin': 'Administrator',
    'auth.role.user': 'Benutzer',

    'users.eyebrow': 'Verwaltung',
    'users.title': 'Benutzer',
    'users.subtitle': 'Jeder Benutzer verbindet sich mit einem persönlichen Schlüssel und sieht nur seine eigenen Konten.',
    'users.refresh': 'Liste neu laden',
    'users.add': 'Benutzer anlegen',
    'users.loading': 'Benutzer werden geladen …',
    'users.loadFailed': 'Benutzer konnten nicht geladen werden',
    'users.empty': 'Noch keine Benutzer. Bestehende Konten gehören dem Administrator (dir).',
    'users.col.name': 'Name',
    'users.col.accounts': 'Konten',
    'users.col.created': 'Erstellt',
    'users.col.actions': 'Aktionen',
    'users.action.newKey': 'Neuer Schlüssel',
    'users.action.delete': 'Löschen',

    'users.create.title': 'Benutzer anlegen',
    'users.create.name': 'Name',
    'users.create.name.placeholder': 'z. B. Anna',
    'users.create.submit': 'Anlegen',
    'users.create.failed': 'Benutzer konnte nicht angelegt werden',

    'users.key.title': 'Schlüssel für {name}',
    'users.key.warning':
      'Dieser Schlüssel wird nur jetzt angezeigt. Kopiere ihn und gib ihn auf sicherem Weg an den Benutzer weiter; geht er verloren, muss ein neuer erzeugt werden.',
    'users.key.field': 'Persönlicher Schlüssel',
    'users.key.copy': 'Schlüssel kopieren',
    'users.link.field': 'Verbindungs-Link',
    'users.link.copy': 'Link kopieren',
    'users.link.local':
      'Dieser Link zeigt auf localhost und funktioniert beim Benutzer nicht. Ersetze den Anfang des Links durch die öffentliche Adresse des Frontends (z. B. Vercel); der Teil „#connect=…“ bleibt gleich.',
    'users.copied': 'Kopiert',
    'users.key.done': 'Fertig',

    'users.rotate.title': 'Schlüssel erneuern',
    'users.rotate.message': 'Neuen Schlüssel für {name} erzeugen? Der alte Schlüssel wird sofort ungültig.',
    'users.rotate.confirm': 'Erneuern',
    'users.rotate.failed': 'Schlüssel konnte nicht erneuert werden',
    'users.delete.title': 'Benutzer löschen',
    'users.delete.message': '{name} löschen? Der Schlüssel wird sofort ungültig.',
    'users.delete.info': 'Konten und laufende Bots bleiben erhalten; sie sind danach ohne Besitzer und gehören dem Administrator.',
    'users.delete.failed': 'Benutzer konnte nicht gelöscht werden',

    'users.owner.label': 'Besitzer',
    'users.owner.none': 'Administrator (ohne Besitzer)',
  },
);
