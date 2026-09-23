from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
import asyncio
import json
import os
import glob
import tempfile
import zipfile
from src.api.helpers import _find_settings_file, LOGS_DIR, BASE_DIR
from src.utils.bot_manager import is_bot_running
from src.utils.paths import get_mt5_backup_dir

router = APIRouter(tags=["Logs"])


def _decode_log_bytes(raw: bytes) -> str:
    """MT5 terminal logları genelde BOM'lu UTF-16 LE'dir; robot logları UTF-8."""
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="replace")
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig", errors="replace")
    return raw.decode("utf-8", errors="replace")


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
        with open(filepath, "rb") as fh:
            all_lines = _decode_log_bytes(fh.read()).splitlines()
        return [ln.rstrip() for ln in all_lines[-n:]]

    def _read_json(filepath: str):
        if not os.path.exists(filepath):
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            # Bot dosyayı o an os.replace ile değiştiriyor olabilir (Windows kilidi)
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
        # MT5 terminal logları bağlanırken logs/<id>/mt5_terminal/MT5_Terminal_<YYYYMMDD>.log
        # olarak kopyalanır (mt5_helpers.backup_mt5_logs_helper); en yenisinden başla.
        mt5_pattern = os.path.join(get_mt5_backup_dir(account_id), "MT5_Terminal_*.log")
        for lf in sorted(glob.glob(mt5_pattern), reverse=True):
            mt5_lines = _tail(lf, lines)
            if mt5_lines:
                break
        result["mt5_log"] = mt5_lines

    if log_type in ("metrics", "all"):
        # Önce bot sürecinin kendi metrik dosyası (logs/<id>/met_<id>.json) okunur;
        # startup_error ve gerçek bot durumu sadece orada. logs/met_<id>.json ise
        # API sürecinin WS yayını tarafından yazılır ve yalnızca yedek olarak kullanılır.
        bot_running = is_bot_running(account_id)
        metrics = _read_json(os.path.join(LOGS_DIR, account_id, f"met_{account_id}.json"))
        if metrics is None and not bot_running:
            metrics = _read_json(os.path.join(LOGS_DIR, f"met_{account_id}.json"))
        # Bot süreci çalışmıyorsa bayat mt5_connected=true "Running" göstermesin
        if isinstance(metrics, dict) and not bot_running:
            metrics["mt5_connected"] = False
        result["metrics"] = metrics
        # Arayüz, süreç çalışıp MT5'e bağlı değilken de Stop gösterebilsin
        result["bot_running"] = bot_running

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


def _build_log_zip(account_id: str) -> str:
    account_dir = os.path.join(LOGS_DIR, account_id)
    data_dir = os.path.join(BASE_DIR, "data")

    fd, temp_zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)

    def _safe_write(zipf: zipfile.ZipFile, file_path: str, arcname: str):
        # Bot aynı anda .tmp dosyası yazıp os.replace yapıyor; kaybolan veya
        # kilitli bir dosya tüm indirmeyi (500) bozmasın, sadece atlansın.
        try:
            zipf.write(file_path, arcname=arcname)
        except (OSError, ValueError):
            pass

    with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        if os.path.isdir(account_dir):
            for root, _, files in os.walk(account_dir):
                for file in files:
                    if file.endswith(".tmp"):
                        continue
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, account_dir)
                    _safe_write(zipf, file_path, f"logs/{arcname}")

        state_file = os.path.join(data_dir, f"state_{account_id}.json")
        if os.path.exists(state_file):
            _safe_write(zipf, state_file, f"state_{account_id}.json")

        settings_file = _find_settings_file(account_id)
        if settings_file and os.path.exists(settings_file):
            _safe_write(zipf, settings_file, os.path.basename(settings_file))

    return temp_zip_path


@router.get("/logs/download/{account_id}")
async def download_log(account_id: str, background_tasks: BackgroundTasks):
    try:
        temp_zip_path = await asyncio.to_thread(_build_log_zip, account_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Log arşivi oluşturulamadı: {exc}")

    def cleanup():
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)

    background_tasks.add_task(cleanup)

    return FileResponse(
        path=temp_zip_path,
        filename=f"MT5_Logs_and_Configs_{account_id}.zip",
        media_type="application/zip",
    )
