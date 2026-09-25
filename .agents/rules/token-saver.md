---
trigger: always_on
---

# Token-Sparkonfiguration & AI Rules

- Antworte so kurz und präzise wie möglich.
- Generiere NIEMALS den gesamten Code einer Datei neu, wenn sich nur wenige Zeilen ändern. Gib nur die geänderten Abschnitte an.
- Lade oder durchsuche keine Dateien im Projekt, die nicht explizit mit @ markiert wurden.
- Verzichte auf lange Einleitungen und Höflichkeitsfloskeln.

### 🚨 ZORUNLU KURAL: BAĞLAM (CONTEXT) VE DOSYA OKUMA
- Bir sorunu incelemeye veya kod yazmaya başlamadan önce projeyi körü körüne tarama. Daima İLK ADIM olarak `docs/proje_dosya_krokisi.md` dosyasını oku.
- Mimariyi anladıktan sonra, SADECE doğrudan ilgili olan spesifik dosyaları analiz et. Alakasız klasörleri (logs, data) tarayarak token israfı yapma.

### 🚨 ZORUNLU KURAL: UI-BACKEND SENKRONİZASYONU
Backend, ana motor veya konfigürasyon (config/json vb.) dosyalarında yeni bir değişken, kural veya parametre (ör. Yön, Stop Loss) eklendiğinde/değiştirildiğinde; bu değişikliğin kullanıcı arayüzüne (UI / Frontend) yansımasını KESİNLİKLE kontrol et. Yeni eklenen veya güncellenen bir özelliğin arayüzde (buton, input, dropdown olarak) eksiksiz yer aldığından ve veriyi doğru okuyup/yazdığından emin ol. Arayüzü güncellemeden backend değişikliğini tamamlanmış sayma. UI ve Backend daima %100 entegre olmalıdır.

### 🚨 ZORUNLU KURAL: TOOLTIP (BİLGİ İPUCU)
Arayüze eklenen veya değiştirilen HER ayar, alan, anahtar, buton, sekme ve menü öğesi, ne işe yaradığını açıklayan bir tooltip / (i) ipucu taşımak zorundadır (`hooks/RULES.md` §5). `hint` prop'u `InputField`, `Switch`, `Button`, sekmeler ve `ConfirmModal` için zorunludur; ham `<button>`/`<input>` yerine bunları veya `components/ui/tooltip.tsx` içindeki `Tooltip`/`FieldLabel` bileşenlerini kullan. Metin i18n anahtarıdır (`<etiket-anahtarı>.hint`, `src/i18n/messages/hints.ts`, tr/en/de): ne işe yaradığını, birim/etkisini ve kontrol devre dışıysa nedenini yaz; worker koduyla doğrula. Ipucu olmadan yeni ayarı tamamlanmış sayma.
