from fastapi import APIRouter, Depends, HTTPException, Query
from src.api.auth import require_admin
import sys
import os
import asyncio
from src.utils.self_updater import check_for_updates, execute_git_pull, schedule_restart

router = APIRouter(tags=["System"])


def find_mt5_terminals() -> list[str]:
    """Kurulu MT5 terminalleri (terminal64.exe yolları, "/" ayraçlı); Windows dışında boş."""
    if sys.platform != "win32":
        return []

    base_dirs = [
        os.environ.get("ProgramFiles", "C:\\Program Files"),
        os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)"),
        "C:\\",
    ]
    found_paths: list[str] = []
    for base in base_dirs:
        if not os.path.exists(base):
            continue
        try:
            for folder_name in os.listdir(base):
                if "metatrader" in folder_name.lower() or "mt5" in folder_name.lower():
                    exe_path = os.path.join(base, folder_name, "terminal64.exe")
                    normalized = exe_path.replace("\\", "/")
                    if os.path.exists(exe_path) and normalized not in found_paths:
                        found_paths.append(normalized)
        except PermissionError:
            pass
    return found_paths


@router.get("/system/scan-mt5")
async def scan_mt5_paths():
    return {"paths": find_mt5_terminals(), "platform": sys.platform}


@router.get("/system/platform")
async def get_platform_info():
    return {
        "platform": sys.platform,
        "is_windows": sys.platform == "win32",
    }


@router.get("/system/update/check", dependencies=[Depends(require_admin)])
async def check_update(branch: str = Query("main", description="Git branch")):
    try:
        success, data = check_for_updates(branch=branch)
        if not success:
            return {
                "has_update": False,
                "local_ver": "v1.0.0",
                "remote_ver": "v1.0.0",
                "error": str(data),
            }
        has_update, local_ver, remote_ver = data
        return {
            "has_update": has_update,
            "local_ver": local_ver,
            "remote_ver": remote_ver,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/system/update", dependencies=[Depends(require_admin)])
async def run_update(branch: str = Query("main", description="Git branch")):
    success, message = await asyncio.to_thread(execute_git_pull, branch=branch)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    # Yeni kod ancak yeniden başlatınca yüklenir (watchdog .bat altında otomatik)
    restarting = schedule_restart()
    return {"status": "success", "message": message, "restarting": restarting}