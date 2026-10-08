---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,py,go,rs,java,kt,swift,rb,php,cs,sql}"
---

# Mimari

Kodun parçaları arasındaki düzen. Her projede geçerlidir; projeye özgü katman kuralları projenin kendi kurallarındadır.

**Durum:** Deneme (2026-10-04'ten beri). Bu kurallar kullanımda gözlenir; davranışı istenen yöne çevirmeyen ya da sürtünme yaratan madde kullanıcıyla konuşularak değiştirilir veya çıkarılır.

## 1. Yön, çekirdek ve kabuk

- Bağımlılık tek yöne akar: ürün kodu genel araca bakar, araç ürünü bilmez. Döngü kurulmaz.
- Karar veren kod G/Ç (veritabanı, ağ, dosya) yapmaz; G/Ç yapan kod karar vermez. Sıra: oku → karar ver → yaz → yan etki. Karar ek okuma gerektiriyorsa okuma ve karar ilk yazıma kadar iç içe geçebilir.
- Arayüz, port ve adaptör iki durumda açılır: alt katman üst katmanı çağıracaksa ya da ikinci gerçek uygulama varsa. Yalnız test kolaylığı için soyutlama açılmaz; testte çalıştırılamayan dış servis (ödeme, SMS) bu yasağın dışındadır.

Gerekçe: Bağımlılık daha kararlı olana doğru akar ve döngü kurmaz; ters yöndeki çağrı arayüzle çevrilir, yalnız test için açılan katman ise tasarımı bozar (Martin, döngüsüz ve kararlı bağımlılık ilkeleri; Bernhardt, functional core, imperative shell; DHH, test-induced design damage).

## 2. Sınır denetimi

- Yazılan her mimari sınır aynı turda otomatik bir denetime bağlanır: lint kuralı, bağımlılık grafiği kuralı ya da test.
- İhlali sıfır olan sınır hemen kilitlenir. İhlali olan sınırda mevcut ihlaller listelenir, yenisi engellenir.
- Import denetimi yalnız import satırını kanıtlar; işlem sırası ve veri kapsamı gibi davranış sınırı testle denetlenir.
- Denetim mesajı kuralın dosya yolunu anar. Kural dosyası taşınınca mesaj aynı turda güncellenir.
- Araçla denetlenemeyen sınır kural metninde "elle denetlenir" diye işaretlenir.

Gerekçe: Mimari kural derleyici ve testle denetlenmezse teslim baskısı altında aşınır; kod incelemesi yalnız son savunma hattıdır (Grzybek, mimari denetimi).
