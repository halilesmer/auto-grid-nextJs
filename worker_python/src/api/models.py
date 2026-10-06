from pydantic import BaseModel, Field, field_validator
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
    # Hesabın sahibi (kullanıcı kimliği); boş = yöneticiye ait. Kullanıcı olarak oluştururken
    # sunucu kendi kimliğini yazar, yalnızca yönetici değiştirebilir (bkz. accounts.py)
    owner: Optional[str] = None

    @field_validator("id")
    @classmethod
    def _id_digits_only(cls, value: str) -> str:
        # Kimlik dosya adlarında/yollarında kullanılır (settings_<id>, logs/<id>): yalnızca
        # rakam (MT5 login'i); ".." veya "*" gibi değerler yol gezinme/glob açığı olurdu
        if not (value.isascii() and value.isdigit()):
            raise ValueError("id must be digits only (MT5 login)")
        return value


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be empty")
        return value


class SettingsPayload(BaseModel):
    settings: dict


class SymbolSettings(BaseModel):
    """Ayar kaydındaki sembol (ZON-19): kurulumlarını (eski bölgeler) gruplar.

    Yalnızca yapı denetlenir; kurulum alanları serbesttir (motor varsayılanları kendisi tamamlar).
    """
    symbol: str
    setups: list[dict]


class ActionRequest(BaseModel):
    account_id: str
    action: str
    payload: dict = {}
