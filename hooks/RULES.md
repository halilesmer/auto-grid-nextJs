# Grid Robot — Kurallar (hook'ların denetlediği)

Etiketler: **[otomatik]** = hook engeller veya uyarır · **[elle]** = hook denetlemez, sorumluluk sende/Claude'da.
Kural eklemek için en alttaki prosedüre bak.

## 1. GitHub'a yükleme

1. **[elle]** `main`'e doğrudan push yok: `feat/…`, `fix/…` branch → PR → merge.
2. **[otomatik]** `VERSION` ve `frontend_nextjs/src/app/version.ts` elle değiştirilmez. Her `main` push'unda GitHub Action bump eder (`chore: auto bump version`). Merge sonrası, tekrar push etmeden önce `git pull`.
3. **[otomatik]** Şunlar asla commit'lenmez (gitignore'a rağmen `git add -f` yapılsa bile engellenir):
   `worker_python/configs/*.json` (accounts, settings_*), `worker_python/data/`, `worker_python/logs/`, `.env*` (`.env.example` hariç), `broker_symbols.json`, `hooks/test-account.local.md`.
4. **[otomatik]** Kodda/diff'te gizli veri yok: özel anahtar, `NGROK_AUTHTOKEN`, `password = "…"`, `api_key/secret/token = "…"` (16+ karakter). Yanlış alarm olursa değeri koddan çıkarıp env'e taşı; gerçekten gerekliyse `SKIP_HOOKS=1` ve nedenini PR'a yaz.
5. **[otomatik]** Push öncesi frontend değiştiyse `tsc --noEmit` + `eslint .` temiz olmalı; worker `.py` dosyalarında sözdizimi hatası olmamalı.
6. **[elle]** Commit mesajı: `feat|fix|chore|docs|refactor(kapsam): kısa açıklama`.
7. **[elle]** `--no-verify` / `SKIP_HOOKS=1` yalnızca acil durumda; kullanıldıysa PR açıklamasına yaz.

## 2. Uyumluluk

1. **[otomatik-uyarı]** UI ↔ backend senkronu zorunlu (`.agents/rules/token-saver.md`): worker'da model / ayar / çekirdek (`src/api/models.py`, `src/api/settings.py`, `src/core/*.py`) değişince frontend (`types`, `store`, `components`, `services`, `hooks`) da güncellenmeden iş bitmiş sayılmaz. Hook, frontend hiç değişmediyse uyarır.
2. **[elle]** Paylaşılan veri çeken hook'lar sonucu global Zustand store'a da yazar; mutasyon sonrası refetch (bkz. `frontend_nextjs/AGENTS.md`). Aksi halde dropdown'lar bayatlar / 409 alınır.
3. **[elle]** Next.js kodu yazmadan önce `frontend_nextjs/node_modules/next/dist/docs/` oku (Next 16 breaking changes).
4. **[otomatik-uyarı]** `auto_grid_engine.py` legacy'dir; yeni mantık modüler dosyalara (`grid_*.py`, `grid_execution/`).
5. **[otomatik-uyarı]** Worker değişince Mac'te sadece statik kontrol yapılabilir. Worker Mac'te başlatılmaz (MT5 Windows'a özel); VPS'e pull + restart ile test edilir.
6. **[elle]** Yorum/log/doküman dili dosyanın diline uyar (çoğunlukla Türkçe).
7. **[elle]** Mimari değişince `docs/proje_dosya_krokisi.md` güncellenir.
8. **[elle]** Kullanıcıya görünen her metin i18n'den gelir (`frontend_nextjs/src/i18n/messages/<bölüm>.ts`, tr/en/de yan yana; bileşende `useT()`, bileşen dışında `t()`). Kodda sabit metin yok; worker'a giden değerler (`clear_*`, `exit_condition`) ve worker mesajları çevrilmez. e2e testlerinde metinler `msg('anahtar')` ile alınır.

## 3. Test protokolü ("test et" denince)

Claude her seferinde aynı demo hesabı kullanır; kullanıcıdan tekrar bilgi istenmez.

1. `hooks/test-account.local.md` dosyasını oku (gitignore'lu; şablon: `test-account.example.md`).
2. Frontend: `npm run dev:frontend` (`frontend_nextjs/`) → `http://localhost:3000`. Worker VPS'te ngrok üzerinden çalışır; `frontend_nextjs/.env.local` zaten ona bakar.
3. `AccountSelector`'da **worker'da zaten kayıtlı** hesabı seç (dosyadaki Hesap ID / login). Mevcut datayı kullan; yeni hesap oluşturma, hesap silme yok.
4. **Şifre / credential hiçbir forma yazılmaz ve hiçbir dosyaya kaydedilmez.** Hesap girişi gerekiyorsa kullanıcıya bırakılır.
5. Bot start/stop veya emir gerektiren testler yalnızca dosyada `Tür: DEMO` yazıyorsa ve kullanıcı açıkça istediyse yapılır. Şüphe varsa dur ve sor.
6. Worker'ı Mac'te başlatma. Worker tarafı değişikliği test edilecekse kullanıcıdan VPS'te pull + restart iste.
7. Sonuçları kısa raporla: neyi seçtin, neyi doğruladın, neyi doğrulayamadın.
8. **[otomatik]** Otomatik live testler (`npm run test:live` veya `scripts/features/run.sh live`) aynı dosyayı okur; `Tür: DEMO` değilse veya worker hesabı `env_type: DEMO` olarak bildirmiyorsa atlanır. Bu testler yalnızca okur.
9. **[elle]** İşlem testleri (`frontend_nextjs/e2e/live/trading.spec.ts`) yalnızca `E2E_LIVE_DEMO=1` ile, bot durdur/başlat ayrıca `E2E_LIVE_BOT_RESTART=1` ile çalışır. Bu değişkenler sadece kullanıcı bu konuşmada açıkça işlem testi istediyse verilir. Test bölgesi yalnızca sona eklenir (başa eklemek mevcut bölgelerin magic numaralarını kaydırır), ayarlar sonunda aynen geri yüklenir; mevcut bir aktif bölge fiyatı kapsıyorsa test kendini atlar. Kullanıcının bölgeleri test için değiştirilmez.

## 4. Fonksiyon kataloğu ve otomatik testler

Katalog: `docs/features/features.yaml` (tek doğru kaynak) → `docs/features/FEATURES.md` (üretilir). Claude Code'da `/feature-test` skill'i (`.claude/skills/feature-test/SKILL.md`).

1. **[elle]** Yeni veya değişen her özellik: `features.yaml`'da kayıt (`id`, `tiers`, `erwartet` …) + ilgili katmanda ID etiketli test (`@pytest.mark.feature("ENG-05")` / Playwright `tag: '@ENG-05'`). İkisi yoksa iş bitmiş sayılmaz.
2. **[otomatik]** Her PR'da ve `main` push'unda `.github/workflows/tests.yml` çalışır: katalog kontrolü, worker testleri (unit + api), frontend lint + tsc + Playwright (mocked). PR yeşil olmadan merge edilmez.
3. **[elle]** PR'dan önce yerelde `scripts/features/run.sh` (veya etkilenen kategori, ör. `run.sh ZON`) çalıştırılır; güncellenen `docs/features/results.json` ve `FEATURES.md` aynı PR'da commit'lenir. Bu iki dosya elle düzenlenmez.
4. **[elle]** Henüz düzeltilmemiş bilinen hata: katalogda `bekannter_fehler` + test `xfail(strict=True)` / `test.fail()`. Hata düzelince ikisi de kaldırılır.
5. **[elle]** Worker endpoint'i (yol, yanıt biçimi, hata kodu) değişince gemockte worker da güncellenir: `frontend_nextjs/e2e/fixtures/mock-worker.ts`. Mock, bilinmeyen endpoint'te ve `X-API-Key` eksikse testi düşürür.
6. **[elle]** Manuel doğrulama `scripts/features/run.sh sign <ID> bestanden|fehlgeschlagen "not"` ile kaydedilir; notlara credential yazılmaz.

## 5. Kural ekleme prosedürü

1. Kuralı bu dosyaya `[otomatik]` veya `[elle]` etiketiyle yaz.
2. `[otomatik]` ise `hooks/lib/checks.sh` içine `check_*` fonksiyonu ekle (engelleyici → `err`, uyarı → `warn`). Sayaçlar için fonksiyonu boru (`|`) ile değil `< <(...)` / `<<<` ile çağır (boru alt-kabuk açar, sayaç kaybolur).
3. Fonksiyonu `pre-push` (ve gerekirse `pre-commit`, `claude/stop-check.sh`) içinden çağır.
4. Hata yolunu bilerek tetikleyip test et.
