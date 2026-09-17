from fastapi import APIRouter, HTTPException
import asyncio
import os
import json
from src.api.models import ActionRequest, SimPricePayload
from src.api.helpers import _load_accounts, BASE_DIR
from src.utils.mt5_connection import (
    connect_to_mt5_with_timeout,
    get_mt5_symbols,
    shutdown_mt5,
)
from src.utils.bot_manager import start_bot_process, stop_bot_process
from src.utils.paths import get_sim_price_path

router = APIRouter(tags=["Bot Control"])


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

    # 1. MT5'e Bağlan
    ok, _is_timeout, detail = await asyncio.to_thread(
        connect_to_mt5_with_timeout, account_config, 120
    )
    if not ok:
        raise HTTPException(status_code=500, detail=f"MT5 Connection Failed: {detail}")

    # 2. SUBPROCESS BAŞLAMADAN ÖNCE: Sembolleri çek ve broker_symbols.json dosyasını OLUŞTUR!
    try:
        symbols_temp = await asyncio.to_thread(get_mt5_symbols)
        if symbols_temp:
            detailed_symbols = []
            for s in symbols_temp:
                name = s.get("name") if isinstance(s, dict) else getattr(s, "name", "")
                if name and name.strip():
                    desc = (
                        s.get("description")
                        if isinstance(s, dict)
                        else getattr(s, "description", "")
                    )
                    digits = (
                        s.get("digits")
                        if isinstance(s, dict)
                        else getattr(s, "digits", 5)
                    )
                    point = (
                        s.get("point")
                        if isinstance(s, dict)
                        else getattr(s, "point", 0.00001)
                    )
                    vol_min = (
                        s.get("volume_min")
                        if isinstance(s, dict)
                        else getattr(s, "volume_min", 0.01)
                    )
                    vol_max = (
                        s.get("volume_max")
                        if isinstance(s, dict)
                        else getattr(s, "volume_max", 100.0)
                    )
                    vol_step = (
                        s.get("volume_step")
                        if isinstance(s, dict)
                        else getattr(s, "volume_step", 0.01)
                    )
                    detailed_symbols.append(
                        {
                            "name": name,
                            "description": desc or name,
                            "digits": digits,
                            "point": point,
                            "volume_min": vol_min,
                            "volume_max": vol_max,
                            "volume_step": vol_step,
                        }
                    )

            if detailed_symbols:
                cache_file = os.path.join(BASE_DIR, "broker_symbols.json")
                cache_data = {}
                if os.path.exists(cache_file):
                    try:
                        with open(cache_file, "r", encoding="utf-8") as f:
                            cache_data = json.load(f)
                    except Exception:
                        cache_data = {}
                cache_data[account_id] = {s["name"]: s for s in detailed_symbols}
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(cache_data, f, indent=4, ensure_ascii=False)
    except Exception:
        pass
    finally:
        # FastAPI bağlantısını kapat ki alt süreç MT5'i sorunsuz kilitleyebilsin
        await asyncio.to_thread(shutdown_mt5)

    # 3. Alt süreci başlat
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