from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import json
import os
import sys
import glob
import asyncio
from src.utils.mt5_connection import connect_to_mt5_with_timeout
from src.utils.self_updater import check_for_updates, execute_git_pull
from src.utils.paths import get_sim_price_path
from src.utils.bot_manager import start_bot_process, stop_bot_process

router = APIRouter()

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------
BASE_DIR     = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CONFIGS_DIR  = os.path.join(BASE_DIR, 'configs')
LOGS_DIR     = os.path.join(BASE_DIR, 'logs')
ACCOUNTS_FILE = os.path.join(CONFIGS_DIR, 'accounts.json')


def _load_accounts() -> list:
    """accounts.json → list[dict]"""
    if not os.path.exists(ACCOUNTS_FILE):
        return []
    with open(ACCOUNTS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Dosya formatı: {"accounts": [...]}  ya da doğrudan liste
    if isinstance(data, dict):
        return data.get('accounts', [])
    return data


def _save_accounts(accounts: list) -> None:
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    with open(ACCOUNTS_FILE, 'w', encoding='utf-8') as f:
        json.dump({'accounts': accounts}, f, indent=4, ensure_ascii=False)


def _find_settings_file(account_id: str) -> Optional[str]:
    """
    Gerçek dosya adı pattern'i: settings_{account_id}_{strategy}.json
    Önce tam eşleşme arar, sonra wildcard ile ilk bulunanı döner.
    """
    # Tam eşleşme (eski format)
    exact = os.path.join(CONFIGS_DIR, f'settings_{account_id}.json')
    if os.path.exists(exact):
        return exact
    # Strateji suffix'li format: settings_234234_Auto_Grid.json
    pattern = os.path.join(CONFIGS_DIR, f'settings_{account_id}_*.json')
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
@router.get('/accounts')
async def get_accounts():
    """Tüm kayıtlı hesapları döner. Şifre alanı gizlenmez (lokal API)."""
    try:
        return {'accounts': _load_accounts()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/accounts', status_code=201)
async def create_account(account: AccountModel):
    """Yeni hesap ekler. id alanı zaten mevcutsa 409 döner."""
    try:
        accounts = _load_accounts()
        if any(str(a.get('id')) == str(account.id) for a in accounts):
            raise HTTPException(status_code=409, detail=f"Account '{account.id}' already exists")
        accounts.append(account.model_dump())
        _save_accounts(accounts)
        return {'status': 'created', 'account': account.model_dump()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete('/accounts/{account_id}')
async def delete_account(account_id: str):
    """Hesabı siler."""
    try:
        accounts = _load_accounts()
        filtered = [a for a in accounts if str(a.get('id')) != str(account_id)]
        if len(filtered) == len(accounts):
            raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")
        _save_accounts(filtered)
        return {'status': 'deleted', 'account_id': account_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# AYARLAR YÖNETİMİ  —  GET /settings/{account_id}  |  POST /settings/{account_id}
# ---------------------------------------------------------------------------
@router.get('/settings/{account_id}')
async def get_settings(account_id: str):
    """
    Hesaba ait ayar dosyasını döner.
    Dosya adı: settings_{account_id}_{strategy}.json  veya  settings_{account_id}.json
    """
    path = _find_settings_file(account_id)
    if path is None:
        # Henüz ayar yoksa boş obje döndür — 404 yerine boş response tercih edilir
        return {'account_id': account_id, 'settings': {}}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {'account_id': account_id, 'file': os.path.basename(path), 'settings': data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/settings/{account_id}')
async def update_settings(account_id: str, payload: SettingsPayload):
    """
    Hesap ayarlarını kaydeder/günceller.
    Mevcut dosya varsa üzerine yazar, yoksa settings_{account_id}.json olarak oluşturur.
    """
    path = _find_settings_file(account_id) or os.path.join(CONFIGS_DIR, f'settings_{account_id}.json')
    try:
        os.makedirs(CONFIGS_DIR, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(payload.settings, f, indent=4, ensure_ascii=False)
        return {'status': 'saved', 'account_id': account_id, 'file': os.path.basename(path)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# LOG OKUMA  —  GET /logs/{account_id}
# ---------------------------------------------------------------------------
@router.get('/logs/{account_id}')
async def get_logs(
    account_id: str,
    log_type: str = Query('all', description="'robot' | 'mt5' | 'metrics' | 'all'"),
    lines: int  = Query(200,  description='Son kaç satır/kayıt döneceği'),
):
    """
    Hesaba ait logları diskten okur.
    Dosya Haritası (logs/ dizini):
      - logs/{account_id}/          → hesaba özel alt dizin (varsa)
      - logs/err_{account_id}.log   → robot hata logu
      - logs/met_{account_id}.json  → canlı metrikler
      - logs/pid_{account_id}.txt   → PID bilgisi
    """
    result: dict = {'account_id': account_id, 'log_type': log_type}

    # --- Yardımcı: metin dosyasından son N satırı oku ---
    def _tail(filepath: str, n: int) -> list[str]:
        if not os.path.exists(filepath):
            return []
        with open(filepath, 'r', encoding='utf-8', errors='replace') as fh:
            all_lines = fh.readlines()
        return [ln.rstrip() for ln in all_lines[-n:]]

    # --- Yardımcı: JSON dosyasını güvenli oku ---
    def _read_json(filepath: str):
        if not os.path.exists(filepath):
            return None
        try:
            with open(filepath, 'r', encoding='utf-8') as fh:
                return json.load(fh)
        except json.JSONDecodeError:
            return None

    # Robot hata logu  →  logs/err_{account_id}.log
    #                 veya  logs/{account_id}/err_*.log  (alt dizin yapısı)
    if log_type in ('robot', 'all'):
        candidates = [
            os.path.join(LOGS_DIR, f'err_{account_id}.log'),
            *glob.glob(os.path.join(LOGS_DIR, account_id, 'err_*.log')),
        ]
        robot_lines: list[str] = []
        for c in candidates:
            robot_lines = _tail(c, lines)
            if robot_lines:
                break
        result['robot_log'] = robot_lines

    # MT5 / sistem logu  →  logs/{account_id}/ dizinindeki diğer .log dosyaları
    if log_type in ('mt5', 'all'):
        mt5_lines: list[str] = []
        mt5_pattern = os.path.join(LOGS_DIR, account_id, '*.log')
        for lf in sorted(glob.glob(mt5_pattern)):
            if 'err_' not in os.path.basename(lf):   # err_ zaten robot_log'da
                mt5_lines = _tail(lf, lines)
                if mt5_lines:
                    break
        result['mt5_log'] = mt5_lines

    # Canlı metrikler  →  logs/met_{account_id}.json
    if log_type in ('metrics', 'all'):
        metrics_path = os.path.join(LOGS_DIR, f'met_{account_id}.json')
        # Alt dizin alternatifi
        if not os.path.exists(metrics_path):
            alt = glob.glob(os.path.join(LOGS_DIR, account_id, 'met_*.json'))
            metrics_path = alt[0] if alt else metrics_path
        result['metrics'] = _read_json(metrics_path)

    return result


# ---------------------------------------------------------------------------
# BOT KONTROL  —  /start  |  /stop  |  /action
# ---------------------------------------------------------------------------


@router.post("/start")
async def start_bot(account_id: str):
    account_config: dict = {}
    try:
        for acc in _load_accounts():
            if str(acc.get("id")) == account_id or str(acc.get("login")) == account_id:
                account_config = acc
                break
    except Exception as exc:
        print(f"Error reading accounts: {exc}")

    if not account_config:
        account_config = {"login": account_id, "password": "x", "server": "test"}

    ok, _is_timeout, detail = await asyncio.to_thread(
        connect_to_mt5_with_timeout, account_config, 15
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
    return {"status": "success", "message": f"Bot stopped for {account_id}"}


@router.post('/action')
async def send_action(req: ActionRequest):
    # ui_*.json köprüsünün HTTP karşılığı — bot engine asyncio.Queue'dan okur
    return {'status': 'success', 'message': f'Action {req.action} received for {req.account_id}'}


# ---------------------------------------------------------------------------
# SİSTEM ARAÇLARI  —  /system/scan-mt5  |  /system/update  |  /system/platform
# ---------------------------------------------------------------------------

@router.get('/system/scan-mt5')
async def scan_mt5_paths():
    """Windows Program Files dizinlerinde MT5 terminal yollarını tarar."""
    if sys.platform != 'win32':
        return {'paths': [], 'platform': sys.platform}

    base_dirs = [
        os.environ.get('ProgramFiles', 'C:\\Program Files'),
        os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)'),
        'C:\\',
    ]
    found_paths: list[str] = []
    for base in base_dirs:
        if not os.path.exists(base):
            continue
        try:
            for folder_name in os.listdir(base):
                if 'metatrader' in folder_name.lower() or 'mt5' in folder_name.lower():
                    exe_path = os.path.join(base, folder_name, 'terminal64.exe')
                    normalized = exe_path.replace('\\', '/')
                    if os.path.exists(exe_path) and normalized not in found_paths:
                        found_paths.append(normalized)
        except PermissionError:
            pass
    return {'paths': found_paths, 'platform': sys.platform}


@router.get('/system/platform')
async def get_platform_info():
    """Sunucunun işletim sistemi bilgisini döner."""
    return {
        'platform': sys.platform,
        'is_windows': sys.platform == 'win32',
    }


@router.get('/system/update/check')
async def check_update(branch: str = Query('test', description='Git branch')):
    """GitHub üzerinden güncelleme kontrolü yapar."""
    success, data = check_for_updates(branch=branch)
    if not success:
        raise HTTPException(status_code=500, detail=data)
    has_update, local_ver, remote_ver = data
    return {'has_update': has_update, 'local_ver': local_ver, 'remote_ver': remote_ver}


@router.post('/system/update')
async def run_update(branch: str = Query('test', description='Git branch')):
    """Git pull ile güncellemeyi uygular."""
    success, message = await asyncio.to_thread(execute_git_pull, branch=branch)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {'status': 'success', 'message': message}


# ---------------------------------------------------------------------------
# LOG İNDİRME  —  /logs/download/{account_id}
# ---------------------------------------------------------------------------

@router.get('/logs/download/{account_id}')
async def download_log(account_id: str):
    """Hesaba ait robot log dosyasını indirir."""
    candidates = [
        os.path.join(LOGS_DIR, f'err_{account_id}.log'),
        *glob.glob(os.path.join(LOGS_DIR, account_id, 'err_*.log')),
    ]
    for c in candidates:
        if os.path.exists(c):
            return FileResponse(
                path=c,
                filename=f'MT5_{account_id}_bot.log',
                media_type='text/plain',
            )
    raise HTTPException(status_code=404, detail=f'No log file found for account {account_id}')


# ---------------------------------------------------------------------------
# MAC SIMÜLATÖRÜ  —  /bot/simulate-price
# ---------------------------------------------------------------------------

class SimPricePayload(BaseModel):
    account_id: str
    price: float


@router.post('/bot/simulate-price')
async def set_simulated_price(payload: SimPricePayload):
    """Mac simülasyon modunda canlı fiyatı backend'e iletir."""
    sim_file = get_sim_price_path(payload.account_id)
    try:
        tmp = sim_file + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'price': payload.price}, f)
        os.replace(tmp, sim_file)
        return {'status': 'ok', 'account_id': payload.account_id, 'price': payload.price}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
