from fastapi import APIRouter, HTTPException
import json
import os
from src.api.models import SettingsPayload
from src.utils.paths import get_ui_state_path

router = APIRouter(tags=["UI State"])


@router.get("/ui-state/{account_id}")
async def get_ui_state(account_id: str):
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

        incoming_data = payload.settings.get("states")

        if not incoming_data and any(k.isdigit() for k in payload.settings.keys()):
            incoming_data = payload.settings

        if isinstance(incoming_data, dict):
            for k, v in incoming_data.items():
                if str(k).isdigit():
                    existing_states[str(k)] = str(v).upper()

        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing_states, f, indent=4, ensure_ascii=False)

        return {"status": "saved", "account_id": account_id, "states": existing_states}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))