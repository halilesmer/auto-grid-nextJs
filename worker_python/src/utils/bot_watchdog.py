# src/utils/bot_watchdog.py
"""Bot Bekçisi (Watchdog): Kullanıcının Start ile başlattığı bot çökerse veya asılı
kalırsa worker onu otomatik olarak yeniden başlatır. Stop ile izleme biter.

- İzleme listesi ayrıca data/watched_bots.json'a yazılır: worker/VPS yeniden başlarsa
  Stop edilmemiş botları startup_maintenance (api/bot_control.py) yeniden başlatır.
  Bekçi pes ederse veya hesap silinirse kayıt da silinir, bozuk bot devam ettirilmez.
  Açılışta hâlâ çalışan botlar da izlemeye alınır (adopt).
- Asılı tespiti yalnızca metrik dosyasının yaşına bakar, mt5_connected'a değil:
  broker bakımındayken loop.py süreci bilerek canlı tutup 60 sn'de bir yeniden dener.
- Çökme döngüsü koruması: artan bekleme + 30 dk içinde en fazla 5 yeniden başlatma.
- Pozisyon ve emirlere DOKUNULMAZ; yeniden başlatma, arayüzden Start ile aynıdır.
"""
import asyncio
import json
import os
import time
from dataclasses import dataclass, field

from src.utils.bot_manager import (
    get_bot_process_age,
    get_last_start_error,
    get_last_stop_error,
    is_bot_running,
    log_step,
    start_bot_process,
    stop_bot_process,
)
# src.api'den import YOK: api.bot_control bu modülü import eder (döngüsel import olurdu)
from src.utils import paths
from src.utils.paths import get_metrics_path, get_watched_bots_path

CHECK_INTERVAL_SECONDS = 15

# Bot her time.sleep'te metrik yazar. Ama _reconnect_mt5 en fazla 3 kez
# mt5.initialize çağırır (her biri ~120 sn bloklar, sleep yok); 180 sn gibi kısa bir
# eşik sağlıklı botu yeniden bağlanırken öldürürdü.
HANG_SECONDS = 600

RESTART_BACKOFF_SECONDS = [15, 30, 60, 120, 240]
MAX_RESTARTS = 5
RESTART_WINDOW_SECONDS = 1800
# Yeniden başlatılan bot bu kadar süre ayakta kalırsa sayaç sıfırlanır
STABLE_SECONDS = 600


@dataclass
class _Entry:
    engine_name: str
    restarts: list = field(default_factory=list)  # yeniden başlatma zaman damgaları
    next_attempt_at: float = 0.0


_watched: dict = {}
_locks: dict = {}


def account_lock(account_id: str) -> asyncio.Lock:
    """/start, /stop ve bekçi aynı hesap üzerinde aynı anda işlem yapmasın."""
    key = str(account_id)
    lock = _locks.get(key)
    if lock is None:
        lock = _locks[key] = asyncio.Lock()
    return lock


def is_account_busy(account_id: str) -> bool:
    """/start, /stop veya bekçi şu an bu hesap üzerinde çalışıyor mu? (kilit oluşturmaz)"""
    lock = _locks.get(str(account_id))
    return lock is not None and lock.locked()


def _persist():
    """İzleme listesini diske yazar (atomik). Hata izlemeyi asla bozmaz."""
    path = get_watched_bots_path()
    data = {acc: entry.engine_name for acc, entry in _watched.items()}
    try:
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    except OSError as exc:
        print(f"⚠️ WARNING: watched_bots.json yazılamadı: {exc}")


def load_persisted() -> dict:
    """Son kaydedilen izleme listesi {account_id: engine_name} (dosya yoksa/bozuksa boş)."""
    try:
        with open(get_watched_bots_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}


def watch(account_id: str, engine_name: str = "Auto Grid"):
    """Hesabı izlemeye alır. Kullanıcının her Start'ı sayaçları sıfırlar."""
    _watched[str(account_id)] = _Entry(engine_name=engine_name)
    _persist()


def unwatch(account_id: str):
    if _watched.pop(str(account_id), None) is not None:
        _persist()


def is_watched(account_id: str) -> bool:
    return str(account_id) in _watched


def _is_hung(account_id: str) -> bool:
    """Süreç canlı ama HANG_SECONDS'tan uzun süredir metrik yazmıyor mu?"""
    process_age = get_bot_process_age(account_id)
    if process_age is None or process_age < HANG_SECONDS:
        return False  # yaşı okunamıyor veya hâlâ açılış/bağlanma aşamasında
    try:
        metrics_age = time.time() - os.path.getmtime(get_metrics_path(account_id))
    except OSError:
        return True  # 10 dakikadır ayakta ama hiç metrik yazmamış
    return metrics_age > HANG_SECONDS


def _account_exists(account_id: str) -> bool:
    """bot_runner hesabı login ile arar; hesap silinmiş/değişmişse bot hemen kapanır.
    Okuma hatasında True: geçici bir dosya sorunu izlemeyi bitirmesin."""
    try:
        # paths.CONFIGS_DIR çağrı anında okunur (testler klasörü değiştirir)
        with open(os.path.join(paths.CONFIGS_DIR, "accounts.json"), "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return True
    accounts = data if isinstance(data, list) else data.get("accounts", [])
    return any(str(acc.get("login")) == str(account_id) for acc in accounts)


def account_exists(account_id: str) -> bool:
    """Açılışta kayıtlı botları devam ettirmeden önce (api/bot_control.py) kullanılır."""
    return _account_exists(account_id)


def _restart(account_id: str, entry: _Entry, hung: bool) -> bool:
    """Bot sürecini (gerekirse durdurup) yeniden başlatır. Thread içinde çalışır."""
    if hung:
        log_step(
            account_id,
            f"[WATCHDOG] Bot süreci {HANG_SECONDS // 60} dakikadır yanıt vermiyor (metrik yok). "
            "Süreç yeniden başlatılıyor (pozisyon/emirlere dokunulmuyor)...",
            type="warning",
        )
        if not stop_bot_process(account_id):
            log_step(account_id, f"[WATCHDOG] {get_last_stop_error(account_id)}", type="error")
            return False
    else:
        log_step(
            account_id,
            "[WATCHDOG] Bot süreci beklenmedik şekilde kapandı. "
            "Yeniden başlatılıyor (pozisyon/emirlere dokunulmuyor)...",
            type="warning",
        )

    if not start_bot_process(account_id, engine_name=entry.engine_name):
        reason = get_last_start_error(account_id) or "bilinmeyen hata"
        log_step(account_id, f"[WATCHDOG] Bot yeniden başlatılamadı: {reason}", type="error")
        return False

    log_step(
        account_id,
        f"[WATCHDOG] Bot yeniden başlatıldı ({len(entry.restarts)}/{MAX_RESTARTS}). "
        "Bot kendi MT5 bağlantısını kuruyor...",
    )
    return True


async def _check_account(account_id: str, entry: _Entry):
    now = time.time()
    if await asyncio.to_thread(is_bot_running, account_id):
        age = await asyncio.to_thread(get_bot_process_age, account_id)
        if entry.restarts and age is not None and age > STABLE_SECONDS:
            entry.restarts.clear()
        if not await asyncio.to_thread(_is_hung, account_id):
            return
        hung = True
    else:
        hung = False

    if now < entry.next_attempt_at:
        return

    if not await asyncio.to_thread(_account_exists, account_id):
        unwatch(account_id)
        log_step(
            account_id,
            "[WATCHDOG] Hesap accounts.json'da yok (silinmiş veya login değişmiş). "
            "Otomatik yeniden başlatma durduruldu.",
            type="warning",
        )
        return

    entry.restarts = [t for t in entry.restarts if now - t < RESTART_WINDOW_SECONDS]
    if len(entry.restarts) >= MAX_RESTARTS:
        unwatch(account_id)
        log_step(
            account_id,
            f"[WATCHDOG] Bot {RESTART_WINDOW_SECONDS // 60} dakika içinde {MAX_RESTARTS} kez "
            "yeniden başlatıldı ama ayakta kalmıyor. Otomatik yeniden başlatma durduruldu; "
            "lütfen logu kontrol edip sorunu giderdikten sonra Start ile manuel başlatın.",
            type="error",
        )
        return

    entry.restarts.append(now)
    backoff = RESTART_BACKOFF_SECONDS[min(len(entry.restarts), len(RESTART_BACKOFF_SECONDS)) - 1]
    entry.next_attempt_at = now + backoff
    await asyncio.to_thread(_restart, account_id, entry, hung)


async def run_watchdog():
    """Worker açıkken arka planda çalışan bekçi döngüsü."""
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
        for account_id, entry in list(_watched.items()):
            lock = account_lock(account_id)
            if lock.locked():
                continue  # /start veya /stop şu an bu hesapla meşgul
            async with lock:
                # Liste kopyalandıktan sonra Stop/Start izlemeyi değiştirmiş olabilir
                if _watched.get(account_id) is not entry:
                    continue
                try:
                    await _check_account(account_id, entry)
                except Exception as exc:
                    log_step(account_id, f"[WATCHDOG] Kontrol başarısız: {exc}", type="error")
