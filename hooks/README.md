# hooks/

Push öncesi ve Claude oturumu içindeki otomatik kontroller. Kurallar: [RULES.md](RULES.md).

## Kurulum (klonlanan her makinede bir kez)

```bash
bash hooks/install.sh
```

Bu, `git config core.hooksPath hooks` ayarlar. Claude Code hook'ları `.claude/settings.json` ile zaten aktiftir.

## Ne çalışır, ne zaman

| Hook | Tetikleyici | Kontrol | Süre |
|---|---|---|---|
| `pre-commit` | `git commit` | yasaklı dosya + gizli veri (staged) | <1 sn |
| `pre-push` | `git push` | yasaklı dosya, gizli veri, sürüm dosyaları, `tsc` + `eslint`, worker `.py` sözdizimi, uyumluluk uyarıları | ~5 sn |
| `claude/post-edit.sh` | Claude her `Edit`/`Write` sonrası | düzenlenen dosya: `eslint` / Python sözdizimi / gizli veri | ~3 sn |
| `claude/stop-check.sh` | Claude her tur sonunda | tüm değişiklikler: `tsc` + `eslint` + worker + gizli veri. Hata varsa Claude durmaz, düzeltir. Aynı değişiklik seti temiz geçtiyse tekrar çalışmaz. | ~5 sn |

Ortak mantık: `lib/checks.sh`. Hepsi taşınabilir bash (Windows'ta Git Bash); `node_modules` veya Python yoksa ilgili kontrol uyarıyla atlanır.

## Acil durumda atlamak

```bash
SKIP_HOOKS=1 git push
```

Sadece gerçekten gerekirse; PR açıklamasına yaz.

## Test hesabı

`test-account.example.md` → `test-account.local.md` olarak kopyala ve doldur (gitignore'lu, şifre içermez). Protokol: RULES.md §3.
