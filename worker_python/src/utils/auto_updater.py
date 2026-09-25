# src/utils/auto_updater.py
"""Otomatik güncelleme: worker birkaç dakikada bir origin/main'i kontrol eder; yeni kod
varsa çeker (gerekirse pip install) ve kendini yeniden başlatır (run_uvicorn_watchdog.bat).

- Sadece watchdog .bat altında (WORKER_SUPERVISED=1) ve yerel branch 'main' iken çalışır;
  VPS'te elle başka bir branch denenirken dokunmaz.
- Sadece yerel HEAD origin/main'in GERİSİNDEYSE günceller. Yerelde fazladan commit varsa
  (ör. VPS'te elle commit) her turda pull + yeniden başlatma döngüsüne girmez.
- AUTO_UPDATE_MINUTES (varsayılan 5, 0 = kapalı).
- Git bu süreçte, yani yönetici OLMAYAN worker haklarıyla çalışır; dosya sahipliği bozulmaz.
  Worker yine de yönetici haklarıyla açıldıysa execute_git_pull hiç çekmez (elevation.py).
- Botlar ayrı süreçtir; yeni worker eski sürümle çalışan botları yeniden başlatır (BOT-03).
"""
import asyncio
import os

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


def interval_minutes() -> float:
    try:
        return float(os.environ.get("AUTO_UPDATE_MINUTES", DEFAULT_INTERVAL_MINUTES))
    except ValueError:
        return DEFAULT_INTERVAL_MINUTES


def is_enabled() -> bool:
    return os.environ.get(SUPERVISED_ENV) == "1" and interval_minutes() > 0


def _is_behind_origin() -> bool:
    """HEAD, origin/main'in atası mı (yani sadece geride mi)? fetch'ten sonra çağrılır."""
    res = _git(["merge-base", "--is-ancestor", "HEAD", f"origin/{BRANCH}"], get_project_root())
    return res.returncode == 0


async def tick() -> bool:
    """Tek kontrol turu. Güncelleyip yeniden başlatma planladıysa True döner."""
    if await asyncio.to_thread(current_branch) != BRANCH:
        return False
    ok, data = await asyncio.to_thread(check_for_updates, BRANCH)
    if not ok:
        print(f"⚠️ [AUTO-UPDATE] Kontrol başarısız: {data}")
        return False
    has_update, local_ver, remote_ver = data
    if not has_update or not await asyncio.to_thread(_is_behind_origin):
        return False

    print(f"🔄 [AUTO-UPDATE] Yeni sürüm bulundu ({local_ver} → {remote_ver}), güncelleniyor...")
    ok, message = await asyncio.to_thread(execute_git_pull, BRANCH)
    if not ok:
        print(f"⚠️ [AUTO-UPDATE] Güncelleme başarısız: {message}")
        return False
    print(f"✅ [AUTO-UPDATE] Güncellendi. {message}".strip())
    if schedule_restart():
        print("🔄 [AUTO-UPDATE] Worker yeni kodla yeniden başlatılıyor...")
        return True
    return False


async def run_auto_updater():
    """main.py açılışında başlatılan arka plan döngüsü."""
    if not is_enabled():
        return
    print(f"ℹ️ [AUTO-UPDATE] Açık: origin/{BRANCH} her {interval_minutes():g} dakikada kontrol ediliyor.")
    await asyncio.sleep(INITIAL_DELAY_SECONDS)
    while True:
        try:
            if await tick():
                return  # süreç birazdan kapanıyor
        except Exception as exc:
            print(f"⚠️ [AUTO-UPDATE] Beklenmeyen hata: {exc}")
        await asyncio.sleep(interval_minutes() * 60)
