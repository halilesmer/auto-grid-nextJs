# Grid Robot — Kurallar (hook'ların denetlediği)

Etiketler: **[otomatik]** = hook engeller veya uyarır · **[elle]** = hook denetlemez, sorumluluk sende/Claude'da.
Kural eklemek için §6'daki prosedüre bak.

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
6. **[elle]** Yorum/log/doküman dili dosyanın diline uyar (çoğunlukla Türkçe). İstisna: proje günlüğü (`docs/journal/`) ve yeni kurallar İngilizce yazılır (§6.5, §7).
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
9. **[elle]** İşlem testleri (`frontend_nextjs/e2e/live/trading.spec.ts`) yalnızca `E2E_LIVE_DEMO=1` ile, bot durdur/başlat ayrıca `E2E_LIVE_BOT_RESTART=1` ile çalışır. Bu değişkenler sadece kullanıcı bu konuşmada açıkça işlem testi istediyse verilir. Test bölgesi yalnızca sona eklenir (ENG-27'den beri magic numaraları kaymaz, ama bölge durumları hâlâ sıraya bağlıdır), ayarlar sonunda aynen geri yüklenir; mevcut bir aktif bölge fiyatı kapsıyorsa test kendini atlar. Kullanıcının bölgeleri test için değiştirilmez.

## 4. Fonksiyon kataloğu ve otomatik testler

Katalog: `docs/features/features.yaml` (tek doğru kaynak) → `docs/features/FEATURES.md` (üretilir). Claude Code'da `/feature-test` skill'i (`.claude/skills/feature-test/SKILL.md`).

1. **[elle]** Yeni veya değişen her özellik: `features.yaml`'da kayıt (`id`, `tiers`, `erwartet` …) + ilgili katmanda ID etiketli test (`@pytest.mark.feature("ENG-05")` / Playwright `tag: '@ENG-05'`). İkisi yoksa iş bitmiş sayılmaz.
2. **[otomatik]** Her PR'da ve `main` push'unda `.github/workflows/tests.yml` çalışır: katalog kontrolü, worker testleri (unit + api), frontend lint + tsc + Playwright (mocked). PR yeşil olmadan merge edilmez.
3. **[elle]** PR'dan önce yerelde `scripts/features/run.sh` (veya etkilenen kategori, ör. `run.sh ZON`) çalıştırılır; güncellenen `docs/features/results.json` ve `FEATURES.md` aynı PR'da commit'lenir. Bu iki dosya elle düzenlenmez.
4. **[elle]** Henüz düzeltilmemiş bilinen hata: katalogda `bekannter_fehler` + test `xfail(strict=True)` / `test.fail()`. Hata düzelince ikisi de kaldırılır.
5. **[elle]** Worker endpoint'i (yol, yanıt biçimi, hata kodu) değişince gemockte worker da güncellenir: `frontend_nextjs/e2e/fixtures/mock-worker.ts`. Mock, bilinmeyen endpoint'te ve `X-API-Key` eksikse testi düşürür.
6. **[elle]** Manuel doğrulama `scripts/features/run.sh sign <ID> bestanden|fehlgeschlagen "not"` ile kaydedilir; notlara credential yazılmaz.
7. **[otomatik]** Bot mantığı değişince (`grid_execution/**`, `grid_orchestrator.py`, `grid_zone_selector.py`, `grid_order_manager.py`, `grid_orders.py`, `grid_helpers.py`, `grid_zone_state.py`) örnek çözümler (BKT-01, `worker_python/tests/parity/golden`) testi düşer. Değişiklik bilinçliyse `pytest tests/unit/test_parity_golden.py --update-golden` ile yeniden yazılır, fark PR'da gerekçelendirilir ve tarayıcıdaki bot kopyası (`frontend_nextjs/src/lib/backtest/engine/`, Schritt 7) aynı PR'da uyarlanır.

## 5. Arayüz: bilgi ipuçları (tooltip) zorunlu

Her ayar, alan, anahtar, buton, sekme ve menü öğesi ne işe yaradığını kendisi anlatır; kullanıcı belgeye bakmak zorunda kalmaz.

1. **[otomatik]** Kapsam: her ayar, alan, anahtar, buton, bağlantı, sekme, menü öğesi ve durum/metrik kutusu. Alan ve anahtarlarda etiketin yanında (i) ikonu, butonlarda ve bağlantılarda hover/klavye odağında tooltip çıkar. `hint` zorunlu prop'tur: `InputField`, `Switch`, `Button`, `AnimatedTabs` sekmeleri, `ConfirmModal` (`confirmHint`), `Metric`/`Tile`/`Field` kutuları. Eksikse `tsc` düşer (pre-push, CI). Ham `<button>/<input>/<select>/<textarea>/<a>` için Playwright kapsama testi `UI-07` (CI): `Tooltip`/`InputField`/`FieldLabel` dışında kalan her görünür kontrol testi düşürür. Bilinçli istisna (üçüncü taraf bileşen, ör. TradingView bağlantısı) `data-tooltip-exempt` ile işaretlenir ve PR açıklamasında gerekçelendirilir.
2. **[elle]** İçerik: ne işe yarar + birim/etki, kontrol devre dışıysa **neden** devre dışı. Etiketi tekrarlamak yetmez. 1–2 cümle (kabaca ≤ 250 karakter); çok satırlı olabilir (`\n`). Değere bağlı durumlar (ör. breakout'ta devre dışı kalan alan, kaydedilecek değişiklik yok) kendi metnini alır.
3. **[elle]** Metinler i18n anahtarıdır: `<etiket-anahtarı>.hint` → `frontend_nextjs/src/i18n/messages/hints.ts` (tr/en/de yan yana). Kodda sabit metin yok; açıklama için yerel `title=` kullanılmaz (`Button`/`Badge` `title` kabul etmez). Yalnızca ikonlu butonlar erişilebilir adı için `aria-label` taşımaya devam eder.
4. **[elle]** Yeni veya değişen ayar (UI↔backend senkronu, §2.1) hint metni yazılmadan tamamlanmış sayılmaz. Metni tahminle değil worker koduyla doğrula (`grid_execution/*`, `grid_order_manager.py`).
5. **[elle]** Tooltip'i `components/ui/tooltip.tsx` (`Tooltip`, `InfoHint`, `FieldLabel`) ile yap; kendi popover'ını yazma. O bileşen Popover API'sini (top-layer) kullanır, bu yüzden `overflow-hidden` kartlarda kesilmez ve `<dialog>` pencerelerinin üstünde görünür.

## 6. Kural ekleme prosedürü

1. Kuralı bu dosyaya `[otomatik]` veya `[elle]` etiketiyle yaz.
2. `[otomatik]` ise `hooks/lib/checks.sh` içine `check_*` fonksiyonu ekle (engelleyici → `err`, uyarı → `warn`). Sayaçlar için fonksiyonu boru (`|`) ile değil `< <(...)` / `<<<` ile çağır (boru alt-kabuk açar, sayaç kaybolur).
3. Fonksiyonu `pre-push` (ve gerekirse `pre-commit`, `claude/stop-check.sh`) içinden çağır.
4. Hata yolunu bilerek tetikleyip test et.
5. Yeni kurallar İngilizce ve ASD-STE100 yazım kurallarına göre yazılır (özet: `docs/journal/README.md`); düz metin yerine tablo/liste.
6. Kural dosyalarındaki değişiklikler (`CLAUDE.md`, `hooks/`, `.claude/` içindeki skill, agent ve ayarlar) yalnızca proje sahibinin PR'da açık onayıyla merge edilir.

## 7. Project journal

Purpose: a colleague, or Claude in a new session, can continue the work without the private notes of a different person.

1. **[elle]** Write a journal entry in `docs/journal/` for each change that adds knowledge. Examples: a change of behavior, a bug fix, an open defect, a diagnosis without a code change, a decision, an approved plan for more than one PR. Do not write an entry for a typo, formatting, a dependency update or a change to documents only. Template and details: `docs/journal/README.md`.
2. **[elle]** Put the entry in the same PR as the change. When an open point is done, the PR that does it sets `status: done`.
3. **[elle]** Write in English, with the ASD-STE100 rules and the template (front matter, fixed sections, tables). Use prose only in "Why" and "Lessons".
4. **[elle]** The repository is public. Do not write passwords, keys, MT5 account numbers, broker or server names, IP addresses (except `127.0.0.1` and `0.0.0.0`), host names or ngrok URLs. Write "DEMO account A".
5. **[elle]** An open defect in our code also gets `bekannter_fehler` in `features.yaml` and an `xfail` test (§4.4). The journal entry holds the diagnosis.
6. **[elle]** Before you change an area, read its entries: `grep -l '<feature ID or file name>' docs/journal/20*.md`.
7. **[otomatik-uyarı]** pre-push gives a warning when a branch changes code and has no new or changed file `docs/journal/YYYY-MM-DD-*.md`. Code means files in `worker_python/`, `frontend_nextjs/`, `hooks/`, `scripts/` and `.github/`, but not `*.md`, `package-lock.json` or `requirements*.txt`. The check compares the whole branch with `origin/main`. Thus, when the branch already has an entry, a second push gives no warning.

## 8. Debugging and verification

1. **[elle]** Find the root cause before you change code. Read the full error, make the error occur again, then repair the cause. Do not repair only the symptom. Write the cause in the journal entry.
2. **[elle]** Start a bug fix with a test that shows the bug and fails without the fix. If only the live system can show the bug (MT5 on the VPS), write the live check in the PR and in the journal entry.
3. **[elle]** After 3 hypotheses that failed, stop. Tell the user what you tested. Examine the assumptions before you try more fixes.
4. **[elle]** Do not report "done", "fixed" or "passes" without new evidence from the same work session: the command and its result. If you cannot verify a change (worker code runs only on the VPS), write "not verified" and the reason.
5. **[elle]** Before you write a name, a command or a log line in a document, find it in the code (`git grep`).

## 9. Reviews and safety checks

1. **[elle]** Review checklist. Use it for each change. The `reviewer` subagent uses it too.

   | Area | Check |
   |---|---|
   | FastAPI worker | No blocking call (MT5, file, subprocess, HTTP) directly in an `async def` endpoint. Use `await asyncio.to_thread(...)`, as the existing routers do. |
   | Status and enum values | When you add or change a value (for example `exit_condition`, `clear_*`, zone state, bot status), find each consumer: worker, frontend types and stores, `frontend_nextjs/e2e/fixtures/mock-worker.ts`. |
   | Bot state | Two parallel requests (start, stop, watchdog) must not change the same bot at the same time. Use the per-account `account_lock`. |
   | Time | Broker time, UTC and local time; day, week and year limits; summer time. |
   | API contract | Authentication and ownership (`account_access`, `require_admin`), a repeated request, the recovery after a partial failure. |

2. **[elle]** Run the built-in `/security-review` before a PR that changes authentication, access or remote control: `worker_python/src/api/auth.py`, `access.py`, `ws_server.py`, the middleware in `worker_python/main.py`, CORS (`ALLOWED_ORIGINS`), `frontend_nextjs/src/app/api/vps/`, `frontend_nextjs/src/lib/server/vpsSsh.ts`. Do not use attack tools (for example Strix) against the live worker or the VPS.
3. **[elle]** `localhost:3000` is connected to the live worker on the VPS (`frontend_nextjs/.env.local`). A click in the local frontend has an effect on the real worker and the real accounts. For tests that change data, use the mocked worker (e2e). For live tests, see §3.
4. **[elle]** After a change, find the documents that name the changed files: `git grep -l '<file name>' -- docs CLAUDE.md`. Correct wrong facts in the same PR.
5. **[elle]** External AI review (for important decisions):
   1. Make one review packet for all reviewers. The full repository has approx. 790,000 tokens, so always limit the packet with `--include`, for example: `npx repomix@1.18.1 --include "worker_python/src/core/grid_execution/**,docs/analyse-regeln.md"`. The command uses `repomix.config.json` and writes the gitignored file `repomix-review.xml` (with line numbers). Keep a packet below approx. 150,000 tokens; repomix shows the total.
   2. Read the security report of repomix ("No suspicious files detected"). Do not put files from `worker_python/configs/`, `data/`, `logs/` or `.env*` in a packet. The config and `.gitignore` keep them out (tested on 2026-10-06).
   3. Some tracked files still contain MT5 account numbers (open point in `docs/journal/2026-10-06-rules-journal-model-usage.md`). Until they are removed, search the packet before you send it: `grep -nE '[0-9]{7,}' repomix-review.xml`.
   4. Give each reviewer the same packet and the same question. Ask for findings in a fixed form: severity, `file:line`, reason.
   5. Merge the answers into one list. Mark the points where the reviewers do not agree.
   6. Check each finding against the code and the tests before you change code. A majority is not a proof.
   7. Write the result in a journal entry (`type: decision`).
