from pydantic import BaseModel
from typing import Optional


class AccountModel(BaseModel):
    id: str
    account_name: str
    env_type: str = "DEMO"
    login: int | str
    # Oluştururken zorunlu; güncellemede boş/eksik = kayıtlı şifre korunur (bkz. accounts.py)
    password: Optional[str] = ""
    server: str
    mt5_path: Optional[str] = ""
    notes: Optional[str] = ""


class SettingsPayload(BaseModel):
    settings: dict


class ActionRequest(BaseModel):
    account_id: str
    action: str
    payload: dict = {}


class SimPricePayload(BaseModel):
    account_id: str
    price: float