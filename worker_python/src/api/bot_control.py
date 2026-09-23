from fastapi import APIRouter, HTTPException
import asyncio
import os
import json
import time
from src.api.models import ActionRequest, SimPricePayload
from src.api.helpers import _load_accounts
from src.utils.mt5_connection import (
    connect_to_mt5_with_timeout,
    get_mt5_symbols,
    shutdown_mt5,
)
from src.utils.mt5_helpers import (
    build_detailed_symbols,
    _read_cache_file,
    _write_cache_file,
)
from src.utils.bot_manager import (
    get_bot_process_age,
    is_bot_running,
    start_bot_process,
    stop_bot_process,
)
from src.utils.paths import (
    get_err_log_path,
    get_metrics_path,
    get_pid_path,
    get_sim_price_path,
)

router = APIRouter(tags=["Bot Control"])


_LOG_PREFIX = {"error": "🔴 ERROR:", "warning": "⚠️ WARNING:", "info": "ℹ️ INFO:"}


# Bot her döngüde (piyasa kapalıyken 60 sn'de bir) metrik yazar; bundan eski
# metrik = süreç asılı. İlk bağlantı da en fazla ~120 sn sürer.
BOT_STALE_SECONDS = 180


def _running_bot_is_healthy(account_id: str) -> bool:
    """Çalışan bot süreci MT5'e bağlı ve güncel metrik yazıyor mu?"""
    metrics_path = get_metrics_path(account_id)
    try:
        age = time.time() - os.path.getmtime(metrics_path)
        with open(metrics_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        # Henüz metrik yok: süreç yeni başlamış ve hâlâ bağlanıyor olabilir
        process_age = get_bot_process_age(account_id)
        return process_age is not None and process_age < BOT_STALE_SECONDS
    return bool(data.get("mt5_connected")) and age < BOT_STALE_SECONDS


def _log_step(account_id: str, msg: str, type: str = "info"):
    """Start/Stop adımlarını hesabın robot loguna yazar; arayüz LogViewer'da canlı görür.
    (Aksi halde bu adımlar sadece VPS'teki uvicorn konsolunda kalıyordu.)
    safe_log ile aynı biçim; ama loglama hiçbir zaman isteği bozmasın diye
    önce dosyaya yazılır ve konsol çıktısı (Windows kod sayfası) korunur."""
    line = f"{_LOG_PREFIX.get(type, _LOG_PREFIX['info'])} {msg}"
    try:
        with open(get_err_log_path(account_id), "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {line}\n")
    except Exception:
        pass
    try:
        print(line)
    except Exception:
        pass


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

    already_running = is_bot_running(account_id)
    _log_step(
        account_id,
        "[START] Başlatma isteği alındı."
        + (" (Bot süreci zaten çalışıyor.)" if already_running else ""),
    )

    # Süreç canlı ama MT5'e bağlı değil / metrik yazmıyor → asılı kalmış; yeniden başlat.
    # Aksi halde Start hiçbir şey yapmıyor ve arayüz sonsuza kadar "bağlı değil" kalıyordu.
    if already_running and not _running_bot_is_healthy(account_id):
        _log_step(
            account_id,
            "[START] Bot süreci çalışıyor ama MT5'e bağlı değil veya yanıt vermiyor. "
            "Süreç yeniden başlatılıyor (pozisyon/emirlere dokunulmuyor)...",
            type="warning",
        )
        await asyncio.to_thread(stop_bot_process, account_id)
        already_running = False

    # 0. Önceki çalışmadan kalan metrikleri (eski startup_error / mt5_connected)
    #    sil; aksi halde arayüz bağlantı sürerken bayat hatayı gösterir.
    if not already_running:
        try:
            os.remove(get_metrics_path(account_id))
        except OSError:
            pass

    # 1. MT5'e Bağlan
    _log_step(
        account_id,
        f"[START] MT5'e bağlanılıyor (sunucu: {account_config.get('server')}, "
        f"login: {account_config.get('login')}, zaman aşımı 120 sn)...",
    )
    ok, is_timeout, detail = await asyncio.to_thread(
        connect_to_mt5_with_timeout, account_config, 120
    )
    if not ok:
        _log_step(
            account_id,
            f"[START] MT5 bağlantısı başarısız{' (zaman aşımı)' if is_timeout else ''}: {detail}",
            type="error",
        )
        raise HTTPException(status_code=500, detail=f"MT5 Connection Failed: {detail}")
    _log_step(account_id, "[START] MT5 bağlantısı BAŞARILI. Semboller alınıyor...")

    # 2. SUBPROCESS BAŞLAMADAN ÖNCE: Sembolleri çek ve broker_symbols.json dosyasını OLUŞTUR!
    try:
        symbols_temp = await asyncio.to_thread(get_mt5_symbols)
        detailed_symbols = build_detailed_symbols(symbols_temp)
        if detailed_symbols:
            cache_data = _read_cache_file()
            cache_data[account_id] = {s["name"]: s for s in detailed_symbols}
            _write_cache_file(cache_data)
            _log_step(account_id, f"[START] {len(detailed_symbols)} sembol önbelleğe alındı.")
        else:
            _log_step(account_id, "[START] MT5'ten sembol alınamadı (Market Watch boş?).", type="warning")
    except Exception as exc:
        _log_step(account_id, f"[START] Sembol önbelleği oluşturulamadı: {exc}", type="warning")
    finally:
        # FastAPI bağlantısını kapat ki alt süreç MT5'i sorunsuz kilitleyebilsin
        await asyncio.to_thread(shutdown_mt5)

    # 3. Alt süreci başlat
    if already_running:
        _log_step(account_id, "[START] Bot süreci zaten çalışıyor, yeni süreç açılmadı.")
        return {
            "status": "success",
            "message": f"MT5 Connected, bot already running for {account_id}",
        }

    _log_step(account_id, "[START] Bot süreci başlatılıyor...")
    success = start_bot_process(account_id, engine_name="Auto Grid")
    if not success:
        _log_step(account_id, "[START] Bot süreci başlatılamadı (ayrıntı: START_ERROR satırı).", type="error")
        raise HTTPException(status_code=500, detail="Bot süreci başlatılamadı.")

    pid = None
    try:
        with open(get_pid_path(account_id), "r") as f:
            pid = f.read().strip()
    except OSError:
        pass
    _log_step(
        account_id,
        f"[START] Bot süreci başlatıldı (PID {pid or '?'}). Bot kendi MT5 bağlantısını kuruyor...",
    )

    return {
        "status": "success",
        "message": f"MT5 Connected and Bot started for {account_id}",
    }


@router.post("/stop")
async def stop_bot(account_id: str):
    _log_step(account_id, "[STOP] Durdurma isteği alındı. Açık pozisyon/emirlere dokunulmuyor.")
    stop_bot_process(account_id)
    _log_step(account_id, "[STOP] Bot süreci durduruldu.")
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