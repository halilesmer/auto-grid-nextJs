from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
import json
import os
import glob
import tempfile
import zipfile
from src.api.helpers import _find_settings_file, LOGS_DIR, BASE_DIR

router = APIRouter(tags=["Logs"])


@router.get("/logs/{account_id}")
async def get_logs(
    account_id: str,
    log_type: str = Query("all", description="'robot' | 'mt5' | 'metrics' | 'all'"),
    lines: int = Query(200, ge=1, le=2000, description="Son kaç satır/kayıt döneceği"),
):
    result: dict = {"account_id": account_id, "log_type": log_type}

    def _tail(filepath: str, n: int) -> list[str]:
        if not os.path.exists(filepath):
            return []
        with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
            all_lines = fh.readlines()
        return [ln.rstrip() for ln in all_lines[-n:]]

    def _read_json(filepath: str):
        if not os.path.exists(filepath):
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except json.JSONDecodeError:
            return None

    if log_type in ("robot", "all"):
        candidates = [
            os.path.join(LOGS_DIR, f"err_{account_id}.log"),
            *glob.glob(os.path.join(LOGS_DIR, account_id, "err_*.log")),
        ]
        robot_lines: list[str] = []
        for c in candidates:
            robot_lines = _tail(c, lines)
            if robot_lines:
                break
        result["robot_log"] = robot_lines

    if log_type in ("mt5", "all"):
        mt5_lines: list[str] = []
        mt5_pattern = os.path.join(LOGS_DIR, account_id, "*.log")
        for lf in sorted(glob.glob(mt5_pattern)):
            if "err_" not in os.path.basename(lf):
                mt5_lines = _tail(lf, lines)
                if mt5_lines:
                    break
        result["mt5_log"] = mt5_lines

    if log_type in ("metrics", "all"):
        metrics_path = os.path.join(LOGS_DIR, f"met_{account_id}.json")
        if not os.path.exists(metrics_path):
            alt = glob.glob(os.path.join(LOGS_DIR, account_id, "met_*.json"))
            metrics_path = alt[0] if alt else metrics_path
        result["metrics"] = _read_json(metrics_path)

    return result


@router.delete("/logs/{account_id}")
async def clear_logs(account_id: str):
    account_dir = os.path.join(LOGS_DIR, account_id)
    if os.path.exists(account_dir) and os.path.isdir(account_dir):
        for file_name in os.listdir(account_dir):
            file_path = os.path.join(account_dir, file_name)
            if os.path.isfile(file_path) and file_name.endswith(".log"):
                try:
                    with open(file_path, "w", encoding="utf-8") as f:
                        pass
                except Exception:
                    pass
    return {"status": "success", "message": f"Logs cleared for {account_id}"}


@router.get("/logs/download/{account_id}")
async def download_log(account_id: str, background_tasks: BackgroundTasks):
    account_dir = os.path.join(LOGS_DIR, account_id)
    data_dir = os.path.join(BASE_DIR, "data")

    fd, temp_zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)

    with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        if os.path.exists(account_dir) and os.path.isdir(account_dir):
            for root, _, files in os.walk(account_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, account_dir)
                    zipf.write(file_path, arcname=f"logs/{arcname}")

        state_file = os.path.join(data_dir, f"state_{account_id}.json")
        if os.path.exists(state_file):
            zipf.write(state_file, arcname=f"state_{account_id}.json")

        settings_file = _find_settings_file(account_id)
        if settings_file and os.path.exists(settings_file):
            zipf.write(settings_file, arcname=os.path.basename(settings_file))

    def cleanup():
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)

    background_tasks.add_task(cleanup)

    return FileResponse(
        path=temp_zip_path,
        filename=f"MT5_Logs_and_Configs_{account_id}.zip",
        media_type="application/zip",
    )