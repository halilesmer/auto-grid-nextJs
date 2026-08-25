from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import json
import os
import asyncio
from src.utils.mt5_connection import connect_to_mt5_with_timeout

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

def run_auto_grid_engine(account_id: str):
    print(f"Background engine started for {account_id}")

@router.post("/start")
async def start_bot(account_id: str, background_tasks: BackgroundTasks):
    account_config = {}
    try:
        if os.path.exists(ACCOUNTS_FILE):
            with open(ACCOUNTS_FILE, 'r') as f:
                accounts = json.load(f)
                # Find the account config by account_id (or login if structured differently)
                if isinstance(accounts, dict):
                    account_config = accounts.get(account_id, {})
                elif isinstance(accounts, list):
                    account_config = next((acc for acc in accounts if str(acc.get("login")) == account_id), {})
    except Exception as e:
        print(f"Error reading accounts: {e}")

    # For safety in test environments, default some values if empty
    if not account_config:
        account_config = {"login": account_id, "password": "x", "server": "test"}

    # Threaded call to MT5 connection so FastAPI Event Loop is not blocked
    ok, is_timeout, detail = await asyncio.to_thread(connect_to_mt5_with_timeout, account_config, 15)
    
    if not ok:
        raise HTTPException(status_code=500, detail=f"MT5 Connection Failed: {detail}")

    background_tasks.add_task(run_auto_grid_engine, account_id)
    return {"status": "success", "message": f"MT5 Connected and Bot started for {account_id}"}

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
