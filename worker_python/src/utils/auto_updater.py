# src/utils/auto_updater.py
"""Otomatik güncelleme: worker birkaç dakikada bir origin/main'i kontrol eder; yeni kod
varsa çeker (gerekirse pip install) ve kendini yeniden başlatır (run_uvicorn_watchdog.bat).

- Sadece watchdog .bat altında (WORKER_SUPERVISED=1) ve yerel branch 'main' iken çalışır;
  VPS'te elle başka bir branch denenirken dokunmaz.
- Sadece yerel HEAD origin/main'in GERİSİNDEYSE günceller. Yerelde fazladan commit varsa
  (ör. VPS'te elle commit) her turda pull + yeniden başlatma döngüsüne girmez.
- AUTO_UPDATE_MINUTES (varsayılan 5, 0 = kapalı). Windows'ta her turda kayıt defterinden okunur,
  setx yeniden başlatma istemez. Döngü kapalıyken de çalışır.
- Her turun sonucu GET /system/worker/status içinde durur; logda yalnız değişince satır çıkar.
- Git bu süreçte, yani yönetici OLMAYAN worker haklarıyla çalışır; dosya sahipliği bozulmaz.
  Worker yine de yönetici haklarıyla açıldıysa execute_git_pull hiç çekmez (elevation.py).
- Botlar ayrı süreçtir; yeni worker eski sürümle çalışan botları yeniden başlatır (BOT-03).
"""
import asyncio
import math
import os
import time

from src.utils.self_updater import (
    SUPERVISED_ENV,
    _git,
    check_for_updates,
    current_branch,
    execute_git_pull,
    get_project_root,
    schedule_restart,
)

BRANCH = "main"
DEFAULT_INTERVAL_MINUTES = 5
# Açılıştan hemen sonra değil: önce startup_maintenance ve botlar otursun
INITIAL_DELAY_SECONDS = 60

INTERVAL_ENV = "AUTO_UPDATE_MINUTES"
# Yeni bir sürecin ortamı gibi: kullanıcı değeri sistem değerini ezer
_REGISTRY_KEYS = (
    ("HKEY_CURRENT_USER", r"Environment"),
    ("HKEY_LOCAL_MACHINE", r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
)

_RESULT_LOG = {
    "on": "ℹ️ [AUTO-UPDATE] Açık",
    "off": "ℹ️ [AUTO-UPDATE] Kapalı",
    "other_branch": "ℹ️ [AUTO-UPDATE] Güncellenmiyor, branch main değil",
    "up_to_date": "ℹ️ [AUTO-UPDATE] Güncel",
    "local_commits": "⚠️ [AUTO-UPDATE] Güncellenmiyor, yerelde origin/main'de olmayan commit var",
    "check_failed": "⚠️ [AUTO-UPDATE] Kontrol başarısız",
    "pull_failed": "⚠️ [AUTO-UPDATE] Güncelleme başarısız",
}

_last_run = {"result": None, "detail": "", "checked_at": None}


def _configured_minutes():
    """setx yalnız kayıt defterini değiştirir. run_uvicorn_watchdog.bat penceresi ortamını açılışta
    alır, /system/update ve /system/restart aynı pencerede yeniden başlatır: 2026-10-19'daki 0,
    5 yazıldıktan sonra da süreçte kaldı. Bu yüzden Windows'ta os.environ'a bakılmaz."""
    try:
        import winreg
    except ImportError:  # Windows dışı
        return os.environ.get(INTERVAL_ENV)
    for hive, subkey in _REGISTRY_KEYS:
        try:
            with winreg.OpenKey(getattr(winreg, hive), subkey) as key:
                return str(winreg.QueryValueEx(key, INTERVAL_ENV)[0])
        except OSError:  # bu kovanda değer yok
            continue
    return None


def interval_minutes() -> float:
    try:
        minutes = float(_configured_minutes() or DEFAULT_INTERVAL_MINUTES)
    except ValueError:
        return DEFAULT_INTERVAL_MINUTES
    # nan JSON'a yazılamaz (/system/worker/status), inf ile döngü bir daha uyanmaz
    return minutes if math.isfinite(minutes) else DEFAULT_INTERVAL_MINUTES


def is_enabled() -> bool:
    return os.environ.get(SUPERVISED_ENV) == "1" and interval_minutes() > 0


def status() -> dict:
    """Geçerli ayar ve son turun sonucu (GET /system/worker/status)."""
    return {"enabled": is_enabled(), "interval_minutes": interval_minutes(), **_last_run}


def _record(result: str, detail: str) -> None:
    """Sonucu saklar, yalnız değişince loglar: 5 dakikada bir satır 300 satırlık log penceresini
    doldururdu, hiç satır olmaması da 2026-10-31'de nedenin görünmesini engelledi."""
    is_new = (result, detail) != (_last_run["result"], _last_run["detail"])
    _last_run.update(result=result, detail=detail, checked_at=int(time.time()))
    if is_new:
        print(f"{_RESULT_LOG[result]}: {detail}")


def _is_switched_on() -> bool:
    if not is_enabled():
        _record("off", f"{INTERVAL_ENV}={interval_minutes():g}")
        return False
    if _last_run["result"] in (None, "off"):
        _record("on", f"origin/{BRANCH} her {interval_minutes():g} dakikada kontrol ediliyor")
    return True


def _is_behind_origin() -> bool:
    """HEAD, origin/main'in atası mı (yani sadece geride mi)? fetch'ten sonra çağrılır."""
    res = _git(["merge-base", "--is-ancestor", "HEAD", f"origin/{BRANCH}"], get_project_root())
    return res.returncode == 0


async def tick() -> bool:
    """Tek kontrol turu. Güncelleyip yeniden başlatma planladıysa True döner."""
    branch = await asyncio.to_thread(current_branch)
    if branch != BRANCH:
        _record("other_branch", branch)
        return False
    ok, data = await asyncio.to_thread(check_for_updates, BRANCH)
    if not ok:
        _record("check_failed", str(data))
        return False
    has_update, local_ver, remote_ver = data
    if not has_update:
        _record("up_to_date", local_ver)
        return False
    if not await asyncio.to_thread(_is_behind_origin):
        _record("local_commits", f"{local_ver} → {remote_ver}")
        return False
    # Kontrol saniyeler sürer: bu arada yazılan setx 0 çekmeyi ve yeniden başlatmayı durdurur
    if not _is_switched_on():
        return False

    print(f"🔄 [AUTO-UPDATE] Yeni sürüm bulundu ({local_ver} → {remote_ver}), güncelleniyor...")
    ok, message = await asyncio.to_thread(execute_git_pull, BRANCH)
    if not ok:
        _record("pull_failed", message)
        return False
    print(f"✅ [AUTO-UPDATE] Güncellendi. {message}".strip())
    if schedule_restart():
        print("🔄 [AUTO-UPDATE] Worker yeni kodla yeniden başlatılıyor...")
        return True
    return False


async def run_auto_updater():
    """main.py açılışında başlatılan arka plan döngüsü."""
    if os.environ.get(SUPERVISED_ENV) != "1":
        _record("off", f"{SUPERVISED_ENV} yok, yeniden başlatan watchdog yok")
        return
    _is_switched_on()  # durum logda ilk beklemeden önce görünsün
    await asyncio.sleep(INITIAL_DELAY_SECONDS)
    while True:
        try:
            if _is_switched_on() and await tick():
                return  # süreç birazdan kapanıyor
        except Exception as exc:
            _record("check_failed", f"{type(exc).__name__}: {exc}")
        # Kapalıyken 0 dakika beklenmez: ayar sonraki denemede yeniden okunur
        await asyncio.sleep((interval_minutes() if is_enabled() else DEFAULT_INTERVAL_MINUTES) * 60)
