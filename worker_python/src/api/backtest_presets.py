"""BKT-11: kullanıcıya ait backtest şablonları; gerçek hesap ayarlarına yazmaz."""
import json
import math
import time
from uuid import UUID
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.api.auth import Principal, get_principal
from src.utils import market_db

router = APIRouter(prefix="/backtest/presets", tags=["Backtest presets"])
MAX_PRESETS = 100

# Yalnız yapılandırma alanları: kimlik, hesap, sonuç ve eski fractal sid değerleri saklanmaz.
ZONE_NUMBERS = set("""min_price max_price grid_step lot_size take_profit stop_loss sell_grid_step
sell_lot_size sell_take_profit sell_stop_loss pullback_distance sell_pullback_distance levels_below
levels_above max_positions fractal_sl_buffer fractal_atr_period fractal_atr_multiplier fractal_sar_step
fractal_sar_max fractal_rr fractal_order_count sell_fractal_order_count fractal_tp_money fractal_next_loss""".split())
ZONE_BOOLS = set("""is_breakout step_by_loss instant_entry sync_buy_sell clear_on_exit fractal_use_sl
fractal_tp_by_money""".split())
ZONE_STRINGS = set("""symbol order_type clear_exit_side clear_scope clear_target_side exit_condition
exit_timeframe entry_mode fractal_timeframe fractal_order_mode fractal_sl_mode fractal_next_loss_mode""".split())


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class RunForm(StrictModel):
    csvImportId: None = None
    timeframe: Literal["M1", "M5", "M15", "H1"]
    spreadMode: Literal["candle", "fixed", "max"]
    spreadPoints: float = Field(ge=0)
    commission: float | None = Field(default=None, ge=0)
    swapEnabled: bool
    startCapital: float = Field(ge=0)
    fill: Literal["gap", "parity"]
    slFirst: bool
    path: Literal["auto", "lowFirst", "highFirst", "both"]
    closeAtEnd: bool
    approximate: bool


class PresetRange(StrictModel):
    preset: Literal["today", "thisWeek", "thisMonth", "lastMonth", "last7", "last30", "last90", "thisYear", "lastYear", "last12Months", "all"]


class CustomRange(StrictModel):
    custom: dict[str, str]

    @field_validator("custom")
    @classmethod
    def valid_days(cls, value: dict[str, str]) -> dict[str, str]:
        if set(value) != {"from", "to"}:
            raise ValueError("custom range requires from and to")
        start, end = date.fromisoformat(value["from"]), date.fromisoformat(value["to"])
        if start > end or start.isoformat() != value["from"] or end.isoformat() != value["to"]:
            raise ValueError("invalid date range")
        return value


class PresetName(StrictModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def nonempty_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()


class PresetCreate(PresetName):
    requestId: UUID
    version: Literal[1]
    zone: dict
    form: RunForm
    range: PresetRange | CustomRange
    appVersion: str = Field(min_length=1, max_length=40)

    @field_validator("zone")
    @classmethod
    def zone_fields(cls, value: dict) -> dict:
        if set(value) - (ZONE_NUMBERS | ZONE_BOOLS | ZONE_STRINGS):
            raise ValueError("unsupported zone field or identity")
        for key, item in value.items():
            if key in ZONE_NUMBERS and (type(item) not in (int, float) or abs(item) > 1e100 or not math.isfinite(item)):
                raise ValueError(f"{key} must be finite")
            if key in ZONE_BOOLS and type(item) is not bool:
                raise ValueError(f"{key} must be boolean")
            if key in ZONE_STRINGS and (not isinstance(item, str) or len(item) > 100):
                raise ValueError(f"{key} must be a short string")
        if not isinstance(value.get("symbol"), str) or not value["symbol"].strip():
            raise ValueError("symbol is required")
        return value


def public_preset(row) -> dict:
    return {**json.loads(row["payload"]), "id": row["id"], "name": row["name"], "createdAt": row["created_at"]}


# Senkron uçlar FastAPI thread pool'unda çalışır; SQLite event loop'u bloke etmez.
@router.get("")
def list_presets(principal: Principal = Depends(get_principal)):
    try:
        with market_db.reading() as db:
            rows = db.execute("SELECT * FROM backtest_presets WHERE owner=? ORDER BY created_at, id", (principal.user_id,)).fetchall()
        return {"presets": [public_preset(row) for row in rows]}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Preset storage unavailable") from exc


@router.post("", status_code=201)
def create_preset(payload: PresetCreate, principal: Principal = Depends(get_principal)):
    preset_id = str(payload.requestId)
    created_at = int(time.time())
    data = payload.model_dump(exclude={"name", "requestId"})
    try:
        with market_db.writing() as db:
            existing = db.execute("SELECT * FROM backtest_presets WHERE id=?", (preset_id,)).fetchone()
            if existing:
                if existing["owner"] != principal.user_id:
                    raise HTTPException(status_code=404, detail="Preset not found")
                if existing["name"] != payload.name or json.loads(existing["payload"]) != data:
                    raise HTTPException(status_code=409, detail="Preset request ID already used")
                return {"preset": public_preset(existing)}
            count = db.execute("SELECT COUNT(*) FROM backtest_presets WHERE owner=?", (principal.user_id,)).fetchone()[0]
            if count >= MAX_PRESETS:
                raise HTTPException(status_code=409, detail="Preset limit reached (100)")
            db.execute("INSERT INTO backtest_presets (id, owner, name, payload, created_at) VALUES (?, ?, ?, ?, ?)",
                       (preset_id, principal.user_id, payload.name, json.dumps(data, allow_nan=False), created_at))
        return {"preset": {**data, "id": preset_id, "name": payload.name, "createdAt": created_at}}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Preset storage unavailable") from exc


@router.put("/{preset_id}")
def rename_preset(preset_id: str, payload: PresetName, principal: Principal = Depends(get_principal)):
    try:
        with market_db.writing() as db:
            changed = db.execute("UPDATE backtest_presets SET name=? WHERE id=? AND owner=?", (payload.name, preset_id, principal.user_id))
            if changed.rowcount != 1:
                raise HTTPException(status_code=404, detail="Preset not found")
            row = db.execute("SELECT * FROM backtest_presets WHERE id=? AND owner=?", (preset_id, principal.user_id)).fetchone()
        return {"preset": public_preset(row)}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Preset storage unavailable") from exc


@router.delete("/{preset_id}")
def delete_preset(preset_id: str, principal: Principal = Depends(get_principal)):
    try:
        with market_db.writing() as db:
            changed = db.execute("DELETE FROM backtest_presets WHERE id=? AND owner=?", (preset_id, principal.user_id))
            if changed.rowcount != 1:
                raise HTTPException(status_code=404, detail="Preset not found")
        return {"deleted": preset_id}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Preset storage unavailable") from exc
