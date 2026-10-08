---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,py,go,rs,java,kt,swift,rb,php,cs,sql}"
---

# Doğruluk

Hatalı durumun sonradan yakalanması yerine baştan oluşamaması. Her projede geçerlidir; projeye özgü uygulama projenin kendi kurallarındadır.

**Durum:** Deneme (2026-10-04'ten beri). Bu kurallar kullanımda gözlenir; davranışı istenen yöne çevirmeyen ya da sürtünme yaratan madde kullanıcıyla konuşularak değiştirilir veya çıkarılır.

## 1. Tip tasarımı

Geçersiz durum tiple kurulamaz; dış veri sınırda bir kez ayrıştırılır.

- Birlikte var olan alanlar tek bir alt nesnede ya da durum etiketli bir tipte tutulur; her biri ayrı ayrı boş olabilen alan dizisiyle temsil edilmez.
- Kapalı küme (durum, tür, rol) birlik ya da enum tipidir; serbest metinle veya birbirini dışlayan iki boolean ile kurulmaz.
- Dış veri (istek, kuyruk, önbellek, dosya, üçüncü taraf yanıtı) sınırda bir kez ayrıştırılır; içeride aynı denetim tekrar yazılmaz. Denetim fonksiyonu daraltılmış değeri döndürür ya da hata fırlatır; yalnız `true`/`false` döndürmez.
- Tip denetimini kapatan kaçış (cast, `any`, non-null) yalnız neden güvenli olduğu yanına yazılarak kullanılır.
- Ad tipi (brand) yalnız kurucusu kadar güvenlidir; geçersiz durumu kaldırmak için önce yapı (alt nesne, etiketli tip) kullanılır.

Gerekçe: Doğrulama bilgiyi bir boolean'da bırakıp atar, ayrıştırma onu tipe kaydeder; kurulamayan durumun denetimi de hiç yazılmaz (King, "Parse, don't validate"; Minsky, "make illegal states unrepresentable").

## 2. Hata yönetimi

- Yakalanan hata üç yoldan birine gider: ele alınır (somut bir kurtarma yapılır), bağlam eklenip yukarı taşınır ya da bilinçli bırakılır. Boş `catch` yazılmaz.
- Bilinçli bırakılan hata loglanır ve yerinde tek satırlık yorumla gerekçelendirilir: neden zararsız, son güvence ne. Sık ve zararsız hata her seferinde değil, sayılarak ya da seyrek loglanır.
- Başka hataya çevrilen hata kök nedeni taşır (`cause`). Logda hata nesnesinin tamamı yazılır, yalnız mesajı değil.
- Beklenen durum (geçersiz girdi, kayıt yok, süre doldu) adlandırılır ve çağırana döner. Programcı hatası yakalanıp gizlenmez; altyapı kesintisi istemci hatası gibi gösterilmez.
- Süreç düzeyindeki son yakalayıcı süreci ayakta tutmaz; loglar ve çıkar. Yeniden başlatma süreç yöneticisinin işidir.
- Süreç dışına giden her çağrının süre sınırı vardır; yarım kalabilecek iş ikinci kez çalışabilecek biçimde yazılır.

Gerekçe: Ele alınamayan hata bağlam eklenerek çağırana iletilir; programcı hatasında en güvenli yol çöküp dış bir denetleyiciyle yeniden başlamaktır (Pacheco, işletim ve programcı hatası; Candea ve Fox, crash-only yazılım).
