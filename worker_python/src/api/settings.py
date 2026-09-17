from fastapi import APIRouter, HTTPException, Response
import json
import os
from src.api.models import SettingsPayload
from src.api.helpers import _find_settings_file, CONFIGS_DIR

router = APIRouter(tags=["Settings"])


@router.get("/settings/{account_id}")
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


@router.post("/settings/{account_id}")
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

        if isinstance(existing_data, dict) and isinstance(incoming_data, dict):
            existing_data.update(incoming_data)
            data_to_save = existing_data
        else:
            data_to_save = incoming_data

        from src.utils.config import sanitize_settings

        data_to_save = sanitize_settings(data_to_save)

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, indent=4, ensure_ascii=False)

        return {
            "status": "saved",
            "account_id": account_id,
            "file": os.path.basename(path),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))