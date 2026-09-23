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
    find_bot_processes,
    get_bot_process_age,
    get_last_start_error,
    get_last_stop_error,
    is_bot_outdated,
    is_bot_running,
    log_step as _log_step,
    start_bot_process,
    stop_bot_process,
)
from src.utils.bot_watchdog import account_lock, unwatch, watch
from src.utils.paths import (
    get_metrics_path,
    get_pid_path,
    get_sim_price_path,
)

router = APIRouter(tags=["Bot Control"])


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


def _is_elevated() -> bool:
    try:
        import ctypes

        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def startup_maintenance():
    """Worker açılışında (ör. güncelleme sonrası) çalışır; kullanıcı müdahalesi gerektirmez.

    - Eski kod sürümüyle çalışan bot süreçlerini yeni kodla yeniden başlatır
      (pozisyon/emirlere dokunmaz). Yoksa güncelleme bot'a hiç ulaşmıyordu.
    - Yönetici hakları uyarısı: worker ile MT5/bot farklı haklarla çalışırsa dosya ve
      IPC erişimi bozulur.
    - Hâlâ çalışan botları bekçi (watchdog) izlemesine alır; ölmüş botları başlatmaz.
    """
    if _is_elevated():
        print(
            "⚠️ WARNING: Worker yönetici (admin) haklarıyla çalışıyor. MT5 terminali ve worker "
            "aynı haklarla çalışmalı; start.bat'ı normal (yönetici olmadan) başlatın."
        )
    try:
        accounts = _load_accounts()
    except Exception as exc:
        print(f"⚠️ WARNING: Başlangıç bakımı: accounts.json okunamadı: {exc}")
        return

    for acc in accounts:
        account_id = str(acc.get("id") or acc.get("login") or "")
        if not account_id:
            continue
        try:
            if is_bot_running(account_id) and is_bot_outdated(account_id):
                _log_step(
                    account_id,
                    "[AUTO] Bot eski bir kod sürümüyle çalışıyor; yeni sürümle yeniden başlatılıyor "
                    "(pozisyon/emirlere dokunulmuyor)...",
                    type="warning",
                )
                if not stop_bot_process(account_id):
                    _log_step(account_id, f"[AUTO] {get_last_stop_error(account_id)}", type="error")
                elif start_bot_process(account_id, engine_name="Auto Grid"):
                    _log_step(account_id, "[AUTO] Bot yeni sürümle yeniden başlatıldı.")
                else:
                    _log_step(
                        account_id,
                        f"[AUTO] Bot yeniden başlatılamadı: {get_last_start_error(account_id)}",
                        type="error",
                    )
            elif not is_bot_running(account_id) and find_bot_processes(account_id):
                # PID dosyası olmayan bot süreci: kullanıcının çalışan botu olabilir, öldürme.
                _log_step(
                    account_id,
                    "[AUTO] Kayıtsız bir bot süreci bulundu (PID dosyası yok). "
                    "Start/Restart ile temiz şekilde yeniden başlatılabilir.",
                    type="warning",
                )
        except Exception as exc:
            print(f"⚠️ WARNING: Başlangıç bakımı ({account_id}) başarısız: {exc}")

        # Bekçi bakım bittikten sonra devralır; aksi halde yukarıdaki stop/start arasına girebilirdi
        try:
            if is_bot_running(account_id):
                watch(account_id, "Auto Grid")
                _log_step(account_id, "[WATCHDOG] Çalışan bot izlemeye alındı (çökerse otomatik yeniden başlatılır).")
        except Exception:
            pass


@router.post("/start")
async def start_bot(account_id: str):
    # Bekçi, Start sürerken (MT5 bağlantısı 120 sn'ye kadar) bu hesaba dokunmaz.
    # watch() kilidin İÇİNDE: kilidi bekleyen bir Stop, izlemeyi her zaman en son kaldırır.
    async with account_lock(account_id):
        result = await _start_bot(account_id)
        watch(account_id, "Auto Grid")
    return result


async def _start_bot(account_id: str):
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

    # Süreç canlı ama MT5'e bağlı değil / metrik yazmıyor (asılı) ya da eski kodla
    # çalışıyor (güncellemeden önce başlatılmış) → yeniden başlat.
    # Aksi halde Start hiçbir şey yapmıyor ve arayüz sonsuza kadar "bağlı değil" kalıyordu.
    restart_reason = None
    if already_running:
        if is_bot_outdated(account_id):
            restart_reason = "eski bir kod sürümüyle çalışıyor"
        elif not _running_bot_is_healthy(account_id):
            restart_reason = "MT5'e bağlı değil veya yanıt vermiyor"
    if restart_reason:
        _log_step(
            account_id,
            f"[START] Bot süreci {restart_reason}. "
            "Süreç yeniden başlatılıyor (pozisyon/emirlere dokunulmuyor)...",
            type="warning",
        )
        if not await asyncio.to_thread(stop_bot_process, account_id):
            reason = get_last_stop_error(account_id)
            _log_step(account_id, f"[START] {reason}", type="error")
            raise HTTPException(status_code=500, detail=reason)
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
    # Thread'de: artık süreçleri kapatırken 5 sn'ye kadar bekleyebilir (WS/bekçi donmasın)
    success = await asyncio.to_thread(start_bot_process, account_id, "Auto Grid")
    if not success:
        reason = get_last_start_error(account_id) or "bilinmeyen hata"
        _log_step(account_id, f"[START] Bot süreci başlatılamadı: {reason}", type="error")
        raise HTTPException(status_code=500, detail=f"Bot süreci başlatılamadı: {reason}")

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
    # İzlemeyi kilidin İÇİNDE bırak: kilidi tutan bir Start bittikten sonra watch()
    # çağırır; dışarıda unwatch edilseydi bekçi durdurulan botu yeniden başlatırdı.
    async with account_lock(account_id):
        unwatch(account_id)
        stopped = await asyncio.to_thread(stop_bot_process, account_id)
    if not stopped:
        reason = get_last_stop_error(account_id)
        _log_step(account_id, f"[STOP] {reason}", type="error")
        raise HTTPException(status_code=500, detail=reason)
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