from fastapi import APIRouter, HTTPException, Query
import asyncio
import os
import json
from src.api.helpers import _load_accounts, BASE_DIR
from src.utils.mt5_connection import (
    connect_to_mt5_with_timeout,
    get_mt5_symbols,
    shutdown_mt5,
)

router = APIRouter(tags=["Symbols"])


@router.get("/symbols/{account_id}")
async def get_symbols(account_id: str):
    try:
        cache_file = os.path.join(BASE_DIR, "broker_symbols.json")

        # 1. Önce Önbellek (broker_symbols.json) Var mı?
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cache_data = json.load(f)
                    symbol_dict = cache_data.get(account_id) or cache_data.get(
                        "broker_or_account_1"
                    )
                    if symbol_dict and len(symbol_dict) > 0:
                        return {
                            "status": "success",
                            "account_id": account_id,
                            "symbols": list(symbol_dict.values()),
                        }
            except Exception:
                pass

        # 2. Önbellekte Yoksa MT5'e Bağlanıp Çek
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

        if ok:
            try:
                symbols = await asyncio.to_thread(get_mt5_symbols)
                detailed_symbols = []
                if symbols:
                    for s in symbols:
                        name = (
                            s.get("name")
                            if isinstance(s, dict)
                            else getattr(s, "name", "")
                        )
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

                    return {
                        "status": "success",
                        "account_id": account_id,
                        "symbols": detailed_symbols,
                    }
            finally:
                await asyncio.to_thread(shutdown_mt5)

        # 3. MT5 Bağlantısı Kurulamadıysa (Bot Çalıştığı İçin Meşgulse)
        # Standart Sembol Listesiyle broker_symbols.json Dosyasını ANINDA Oluştur!
        default_syms = []

        try:
            cache_data = {}
            if os.path.exists(cache_file):
                try:
                    with open(cache_file, "r", encoding="utf-8") as f:
                        cache_data = json.load(f)
                except Exception:
                    cache_data = {}
            cache_data[account_id] = {s["name"]: s for s in default_syms}
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(cache_data, f, indent=4, ensure_ascii=False)
        except Exception:
            pass

        return {"status": "warning", "account_id": account_id, "symbols": default_syms}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))