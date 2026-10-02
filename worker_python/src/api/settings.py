from fastapi import APIRouter, Depends, HTTPException, Response
import asyncio
import copy
import json
import os
from src.api.access import account_access
from src.api.models import SettingsPayload
from src.api.helpers import _find_settings_file, CONFIGS_DIR
from src.utils.mt5_connection import safe_log

router = APIRouter(tags=["Settings"])


@router.get("/settings/{account_id}", dependencies=[Depends(account_access)])
async def get_settings(account_id: str, response: Response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    path = _find_settings_file(account_id)
    if path is None:
        return {"account_id": account_id, "settings": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

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


def _record_zone_registry(account_id: str, settings) -> None:
    """Bölge kaydı (docs/analyse-regeln.md §2): hata kaydı asla engellemez."""
    try:
        from src.utils import market_db

        market_db.record_zones(account_id, settings.get("ZONES") if isinstance(settings, dict) else [])
    except Exception as exc:  # noqa: BLE001
        safe_log(f"⚠️ [MARKET-DB] Bölge kaydı yazılamadı: {exc}")


@router.post("/settings/{account_id}", dependencies=[Depends(account_access)])
async def update_settings(account_id: str, payload: SettingsPayload):
    path = _find_settings_file(account_id) or os.path.join(
        CONFIGS_DIR, f"settings_{account_id}.json"
    )
    try:
        os.makedirs(CONFIGS_DIR, exist_ok=True)

        existing_data = {}
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
            except Exception:
                existing_data = {}

        incoming_data = payload.settings
        while (
            isinstance(incoming_data, dict)
            and "settings" in incoming_data
            and isinstance(incoming_data["settings"], dict)
        ):
            incoming_data = incoming_data["settings"]

        # Kayıttan önceki hâl: bölge magic'leri ve durum sıraları buna göre korunur
        previous = copy.deepcopy(existing_data) if isinstance(existing_data, dict) else {}
        if isinstance(existing_data, dict) and isinstance(incoming_data, dict):
            existing_data.update(incoming_data)
            data_to_save = existing_data
        else:
            data_to_save = incoming_data

        from src.utils.config import sanitize_settings
        from src.utils.zone_magic import assign_fractal_setup_ids, assign_zone_magics

        # Her bölgeye kalıcı magic (ENG-27); bölge silinince sıraya bağlı durumu bot taşır
        # (grid_zone_state.rekey_zone_state, ayarları yeniden okuduğu turda)
        data_to_save = assign_zone_magics(previous, sanitize_settings(data_to_save), log=safe_log)
        # Ek fraktal kurgularına kalıcı numara (ENG-28); emir yorumu ve istatistik bu numarayı taşır
        data_to_save = assign_fractal_setup_ids(previous, data_to_save, log=safe_log)

        # Atomik yaz: bot her turda okur, yarım dosya görmesin. Windows'ta bot dosyayı o an
        # okuyorsa os.replace reddedilir → kısa tekrar
        tmp_path = f"{path}.api.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data_to_save, f, indent=4, ensure_ascii=False)
            for attempt in range(5):
                try:
                    os.replace(tmp_path, path)
                    break
                except PermissionError:
                    if attempt == 4:
                        raise
                    await asyncio.sleep(0.05)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        await asyncio.to_thread(_record_zone_registry, account_id, data_to_save)

        return {
            "status": "saved",
            "account_id": account_id,
            "file": os.path.basename(path),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))