from fastapi import APIRouter, HTTPException, Query, Response, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import json
import os
import sys
import glob
import asyncio
import shutil
import tempfile
import zipfile
from src.utils.mt5_connection import (
    connect_to_mt5_with_timeout,
    get_mt5_symbols,
    shutdown_mt5,
)
from src.utils.self_updater import check_for_updates, execute_git_pull
from src.utils.paths import get_sim_price_path, get_ui_state_path
from src.utils.bot_manager import start_bot_process, stop_bot_process

router = APIRouter()

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIGS_DIR = os.path.join(BASE_DIR, "configs")
LOGS_DIR = os.path.join(BASE_DIR, "logs")
ACCOUNTS_FILE = os.path.join(CONFIGS_DIR, "accounts.json")


def _load_accounts() -> list:
    """accounts.json → list[dict]"""
    if not os.path.exists(ACCOUNTS_FILE):
        return []
    with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        return data.get("accounts", [])
    return data


def _save_accounts(accounts: list) -> None:
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump({"accounts": accounts}, f, indent=4, ensure_ascii=False)


def _find_settings_file(account_id: str) -> Optional[str]:
    """
    Gerçek dosya adı pattern'i: settings_{account_id}_{strategy}.json
    Önce tam eşleşme arar, sonra wildcard ile ilk bulunanı döner.
    """
    exact = os.path.join(CONFIGS_DIR, f"settings_{account_id}.json")
    if os.path.exists(exact):
        return exact
    pattern = os.path.join(CONFIGS_DIR, f"settings_{account_id}_*.json")
    matches = glob.glob(pattern)
    return matches[0] if matches else None


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class AccountModel(BaseModel):
    id: str
    account_name: str
    env_type: str = "DEMO"
    login: int | str
    password: str
    server: str
    mt5_path: Optional[str] = ""
    notes: Optional[str] = ""


class SettingsPayload(BaseModel):
    settings: dict


class ActionRequest(BaseModel):
    account_id: str
    action: str
    payload: dict = {}


# ---------------------------------------------------------------------------
# HESAP YÖNETİMİ  —  GET /accounts  |  POST /accounts  |  DELETE /accounts/{id}
# ---------------------------------------------------------------------------
@router.get("/accounts")
async def get_accounts():
    try:
        return {"accounts": _load_accounts()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/accounts", status_code=201)
async def create_account(account: AccountModel):
    try:
        accounts = _load_accounts()
        if any(str(a.get("id")) == str(account.id) for a in accounts):
            raise HTTPException(
                status_code=409, detail=f"Account '{account.id}' already exists"
            )
        accounts.append(account.model_dump())
        _save_accounts(accounts)
        return {"status": "created", "account": account.model_dump()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/accounts/{account_id}")
async def update_account(account_id: str, account: AccountModel):
    try:
        accounts = _load_accounts()
        idx = next(
            (i for i, a in enumerate(accounts) if str(a.get("id")) == str(account_id)),
            None,
        )
        if idx is None:
            raise HTTPException(
                status_code=404, detail=f"Account '{account_id}' not found"
            )
        if any(
            str(a.get("id")) == str(account.id)
            for i, a in enumerate(accounts)
            if i != idx
        ):
            raise HTTPException(
                status_code=409, detail=f"Account '{account.id}' already exists"
            )
        accounts[idx] = account.model_dump()
        _save_accounts(accounts)
        return {"status": "updated", "account": accounts[idx]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str):
    try:
        accounts = _load_accounts()
        filtered = [a for a in accounts if str(a.get("id")) != str(account_id)]
        if len(filtered) == len(accounts):
            raise HTTPException(
                status_code=404, detail=f"Account '{account_id}' not found"
            )
        _save_accounts(filtered)
        return {"status": "deleted", "account_id": account_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# AYARLAR YÖNETİMİ  —  GET /settings/{account_id}  |  POST /settings/{account_id}
# ---------------------------------------------------------------------------
@router.get("/settings/{account_id}")
async def get_settings(account_id: str, response: Response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    path = _find_settings_file(account_id)
    if path is None:
        return {"account_id": account_id, "settings": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # MATRUŞKA (NESTING) HATASI ÇÖZÜMÜ: Yanlışlıkla gömülmüş asıl ayarları çıkar
        while (
            isinstance(data, dict)
            and "settings" in data
            and isinstance(data["settings"], dict)
        ):
            data = data["settings"]

        return {
            "account_id": account_id,
            "file": os.path.basename(path),
            "settings": data,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/settings/{account_id}")
async def update_settings(account_id: str, payload: SettingsPayload):
    path = _find_settings_file(account_id) or os.path.join(
        CONFIGS_DIR, f"settings_{account_id}.json"
    )
    try:
        os.makedirs(CONFIGS_DIR, exist_ok=True)

        # Mevcut dosyayı oku (varsa) — parça parça güncelleme gelince korunacak
        existing_data = {}
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
            except Exception:
                existing_data = {}

        # Gelen veriyi normalize et (matruşka/nesting temizliği)
        incoming_data = payload.settings
        while (
            isinstance(incoming_data, dict)
            and "settings" in incoming_data
            and isinstance(incoming_data["settings"], dict)
        ):
            incoming_data = incoming_data["settings"]

        # MERGE SEMANTİĞİ: Mevcut verinin üzerine gelen key'leri yaz, diğerlerini koru
        # (örn: frontend sadece LOOP_INTERVAL_SECONDS gönderirse ZONES/SYMBOL silinmez)
        if isinstance(existing_data, dict) and isinstance(incoming_data, dict):
            existing_data.update(incoming_data)
            data_to_save = existing_data
        else:
            data_to_save = incoming_data

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, indent=4, ensure_ascii=False)

        return {
            "status": "saved",
            "account_id": account_id,
            "file": os.path.basename(path),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# UI STATE YÖNETİMİ  —  GET /ui-state/{account_id}  |  POST /ui-state/{account_id}
# ---------------------------------------------------------------------------
@router.get("/ui-state/{account_id}")
async def get_ui_state(account_id: str):
    """Frontend arayüz durumlarını (zone START/PAUSE/CLEAR) okur."""
    path = get_ui_state_path(account_id)
    if not os.path.exists(path):
        return {"account_id": account_id, "states": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            states = json.load(f)
        return {"account_id": account_id, "states": states}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/ui-state/{account_id}")
async def update_ui_state(account_id: str, payload: SettingsPayload):
    """Frontend arayüz durumlarını (zone START/PAUSE/CLEAR) yazar/günceller.
    Beklenen payload: { "settings": { "states": { "0": "START", "1": "PAUSE" } } }
    """
    path = get_ui_state_path(account_id)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)

        existing_states = {}
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    existing_states = json.load(f)
            except Exception:
                existing_states = {}

        incoming_data = payload.settings.get("states", {})
        if isinstance(incoming_data, dict):
            existing_states.update(incoming_data)

        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing_states, f, indent=4, ensure_ascii=False)

        return {"status": "saved", "account_id": account_id, "states": existing_states}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# LOG OKUMA  —  GET /logs/{account_id}
# ---------------------------------------------------------------------------
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
            # KRİTİK DÜZELTME: Sadece .log uzantılı dosyaları hedef al (JSON ve TXT'leri koru)
            if os.path.isfile(file_path) and file_name.endswith(".log"):
                try:
                    # Windows kilitlenmelerini önlemek için dosyayı silmek yerine içini boşaltıyoruz
                    with open(file_path, "w", encoding="utf-8") as f:
                        pass
                except Exception:
                    pass
    return {"status": "success", "message": f"Logs cleared for {account_id}"}


# ---------------------------------------------------------------------------
# BOT KONTROL  —  /start  |  /stop  |  /action
# ---------------------------------------------------------------------------


@router.post("/start")
async def start_bot(account_id: str):
    account_config: dict = {}
    try:
        accounts = _load_accounts()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error reading accounts: {exc}")

    for acc in accounts:
        if str(acc.get("id")) == account_id or str(acc.get("login")) == account_id:
            account_config = acc
            break

    if not account_config:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")

    ok, _is_timeout, detail = await asyncio.to_thread(
        connect_to_mt5_with_timeout, account_config, 45
    )
    if not ok:
        raise HTTPException(status_code=500, detail=f"MT5 Connection Failed: {detail}")

    success = start_bot_process(account_id, engine_name="Auto Grid")
    if not success:
        raise HTTPException(status_code=500, detail="Bot süreci başlatılamadı.")

    return {
        "status": "success",
        "message": f"MT5 Connected and Bot started for {account_id}",
    }


@router.post("/stop")
async def stop_bot(account_id: str):
    stop_bot_process(account_id)
    try:
        await asyncio.to_thread(shutdown_mt5)
    except Exception:
        pass
    return {"status": "success", "message": f"Bot stopped for {account_id}"}


@router.post("/action")
async def send_action(req: ActionRequest):
    return {
        "status": "success",
        "message": f"Action {req.action} received for {req.account_id}",
    }


@router.get("/symbols/{account_id}")
async def get_symbols(account_id: str):
    try:
        accounts = _load_accounts()
        account_config = next(
            (
                a
                for a in accounts
                if str(a.get("id")) == account_id or str(a.get("login")) == account_id
            ),
            None,
        )
        if not account_config:
            raise HTTPException(
                status_code=404, detail=f"Account '{account_id}' not found"
            )

        ok, _is_timeout, detail = await asyncio.to_thread(
            connect_to_mt5_with_timeout, account_config, 15
        )
        if not ok:
            raise HTTPException(
                status_code=500, detail=f"MT5 Bağlantı Hatası: {detail}"
            )

        symbols = await asyncio.to_thread(get_mt5_symbols)
        await asyncio.to_thread(shutdown_mt5)
        return {"status": "success", "account_id": account_id, "symbols": symbols}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# SİSTEM ARAÇLARI  —  /system/scan-mt5  |  /system/update  |  /system/platform
# ---------------------------------------------------------------------------


@router.get("/system/scan-mt5")
async def scan_mt5_paths():
    if sys.platform != "win32":
        return {"paths": [], "platform": sys.platform}

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
    return {"paths": found_paths, "platform": sys.platform}


@router.get("/system/platform")
async def get_platform_info():
    return {
        "platform": sys.platform,
        "is_windows": sys.platform == "win32",
    }


@router.get("/system/update/check")
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


@router.post("/system/update")
async def run_update(branch: str = Query("main", description="Git branch")):
    success, message = await asyncio.to_thread(execute_git_pull, branch=branch)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {"status": "success", "message": message}


# ---------------------------------------------------------------------------
# LOG İNDİRME  —  /logs/download/{account_id}
# ---------------------------------------------------------------------------


@router.get("/logs/download/{account_id}")
async def download_log(account_id: str, background_tasks: BackgroundTasks):
    account_dir = os.path.join(LOGS_DIR, account_id)
    data_dir = os.path.join(BASE_DIR, "data")

    # Geçici ZIP oluştur
    fd, temp_zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)

    with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        # 1. Hesap log klasöründeki tüm dosyaları ekle
        if os.path.exists(account_dir) and os.path.isdir(account_dir):
            for root, _, files in os.walk(account_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, account_dir)
                    zipf.write(file_path, arcname=f"logs/{arcname}")

        # 2. State (Hafıza) dosyasını ekle
        state_file = os.path.join(data_dir, f"state_{account_id}.json")
        if os.path.exists(state_file):
            zipf.write(state_file, arcname=f"state_{account_id}.json")

        # 3. Settings (Ayar) dosyasını ekle
        settings_file = _find_settings_file(account_id)
        if settings_file and os.path.exists(settings_file):
            zipf.write(settings_file, arcname=os.path.basename(settings_file))

    # İndirme bitince sunucudaki geçici dosyayı temizle
    def cleanup():
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)

    background_tasks.add_task(cleanup)

    return FileResponse(
        path=temp_zip_path,
        filename=f"MT5_Logs_and_Configs_{account_id}.zip",
        media_type="application/zip",
    )


# ---------------------------------------------------------------------------
# MAC SIMÜLATÖRÜ  —  /bot/simulate-price
# ---------------------------------------------------------------------------


class SimPricePayload(BaseModel):
    account_id: str
    price: float


@router.post("/bot/simulate-price")
async def set_simulated_price(payload: SimPricePayload):
    sim_file = get_sim_price_path(payload.account_id)
    try:
        tmp = sim_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"price": payload.price}, f)
        os.replace(tmp, sim_file)
        return {
            "status": "ok",
            "account_id": payload.account_id,
            "price": payload.price,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
