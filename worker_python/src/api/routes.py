from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import os
import asyncio

router = APIRouter()

CONFIGS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'configs')
ACCOUNTS_FILE = os.path.join(CONFIGS_DIR, 'accounts.json')

class ActionRequest(BaseModel):
    account_id: str
    action: str
    payload: dict = {}

class SettingsRequest(BaseModel):
    account_id: str
    settings: dict

@router.post("/start")
async def start_bot(account_id: str):
    # In a real setup, you'd spawn a subprocess or asyncio.to_thread here
    # For now, we simulate starting
    return {"status": "success", "message": f"Bot started for {account_id}"}

@router.post("/stop")
async def stop_bot(account_id: str):
    # Simulate stopping the bot
    return {"status": "success", "message": f"Bot stopped for {account_id}"}

@router.get("/accounts")
async def get_accounts():
    try:
        with open(ACCOUNTS_FILE, 'r') as f:
            data = json.load(f)
            return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/settings/{account_id}")
async def get_settings(account_id: str):
    settings_file = os.path.join(CONFIGS_DIR, f"settings_{account_id}.json")
    if os.path.exists(settings_file):
        with open(settings_file, 'r') as f:
            return json.load(f)
    return {"settings": {}}

@router.post("/settings")
async def update_settings(req: SettingsRequest):
    settings_file = os.path.join(CONFIGS_DIR, f"settings_{req.account_id}.json")
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    with open(settings_file, 'w') as f:
        json.dump(req.settings, f, indent=4)
    return {"status": "success"}

@router.post("/action")
async def send_action(req: ActionRequest):
    # This replaces ui_*.json. We would put this action in an asyncio.Queue
    # that the bot engine is listening to.
    return {"status": "success", "message": f"Action {req.action} received"}
