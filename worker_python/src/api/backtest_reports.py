"""BKT-14: gespeicherte Live-Backtest-Vergleiche (Berichte) je Benutzer.

Wie die Presets (BKT-11) gehört ein Bericht dem Benutzer, der ihn angelegt hat; fremde Berichte liefern 404.
Anders als bei Presets sieht der Admin alle Berichte (lesen, löschen). Der Worker rechnet nichts nach: der Browser
liefert das Ergebnis, der Worker prüft Form, Größe und Anzahl und speichert es unverändert.
"""
import json
import math
import os
import time
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.api.auth import Principal, get_principal
from src.api.backtest_presets import RunForm
from src.utils import market_db, paths

router = APIRouter(prefix="/backtest/reports", tags=["Backtest reports"])
MAX_REPORTS = 50
# Ein Bericht mit sehr vielen Trades bleibt klein genug für eine Antwort im Browser (JSON in Bytes)
MAX_PAYLOAD_BYTES = 4_000_000
MAX_SYMBOLS = 50
MAX_TRADES_PER_LIST = 5000
MAX_ZONES = 100


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class TradeLite(StrictModel):
    side: Literal["buy", "sell"]
    magic: int | None = None
    volume: float = Field(ge=0)
    entryTime: int | None = None
    entryPrice: float | None = None
    exitTime: int
    exitPrice: float
    exitReason: int | None = None
    net: float


class Metrics(StrictModel):
    trades: int = Field(ge=0)
    net: float
    maxDrawdown: float = Field(ge=0)
    openPositions: int = Field(ge=0)


class Tolerance(StrictModel):
    sameTradeCount: bool
    entrySameCandle: bool
    priceSpreadFactor: float = Field(ge=0, le=100)
    profitPercent: float = Field(ge=0, le=1000)


class Pair(StrictModel):
    magic: int | None = None
    live: TradeLite
    backtest: TradeLite
    entryDeltaSec: int | None = None
    entryPriceDelta: float | None = None
    profitDeltaPercent: float | None = None
    # Abweichungsgründe: entryCandle, entryPrice, exitPrice, profit
    deviations: list[Literal["entryCandle", "entryPrice", "exitPrice", "profit"]]


class SymbolRow(StrictModel):
    symbol: str = Field(min_length=1, max_length=40)
    magics: list[int] = Field(max_length=MAX_ZONES)
    spreadPrice: float = Field(ge=0)
    live: Metrics
    backtest: Metrics
    pairs: list[Pair] = Field(max_length=MAX_TRADES_PER_LIST)
    unmatchedLive: list[TradeLite] = Field(max_length=MAX_TRADES_PER_LIST)
    unmatchedBacktest: list[TradeLite] = Field(max_length=MAX_TRADES_PER_LIST)
    profitDeltaPercent: float | None = None
    countOk: bool
    entryOk: bool
    priceOk: bool
    profitOk: bool
    passed: bool


Scalar = str | int | float | bool | None


class ReportCreate(StrictModel):
    requestId: UUID
    name: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=1000)
    accountId: str = Field(min_length=1, max_length=64)
    periodFrom: int = Field(ge=0)
    periodTo: int = Field(gt=0)
    appVersion: str = Field(min_length=1, max_length=40)
    tolerance: Tolerance
    run: RunForm
    # Zonen wie im Dashboard gespeichert (mit id und magic); nur flache Werte
    zones: list[dict[str, Scalar]] = Field(max_length=MAX_ZONES)
    symbols: list[SymbolRow] = Field(max_length=MAX_SYMBOLS)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()

    @field_validator("zones")
    @classmethod
    def flat_zones(cls, value: list[dict[str, Scalar]]) -> list[dict[str, Scalar]]:
        for zone in value:
            for key, item in zone.items():
                if len(key) > 64 or (isinstance(item, str) and len(item) > 200):
                    raise ValueError("zone field too long")
                if isinstance(item, float) and not math.isfinite(item):
                    raise ValueError("zone value must be finite")
        return value


def _worker_version() -> str:
    path = os.path.join(os.path.dirname(paths.BASE_DIR), "VERSION")
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip()[:40] or "unknown"
    except OSError:
        return "unknown"  # Bericht bleibt speicherbar, die Version ist nur Zusatzinformation


def _summary(row) -> dict:
    payload = json.loads(row["payload"])
    symbols = payload["symbols"]
    return {
        "id": row["id"], "name": row["name"], "note": row["note"], "accountId": row["account_id"],
        "periodFrom": row["period_from"], "periodTo": row["period_to"], "workerVersion": row["worker_version"],
        "createdAt": row["created_at"], "owner": row["owner"],
        "symbolCount": len(symbols), "passedCount": sum(1 for item in symbols if item["passed"]),
    }


def _full(row) -> dict:
    return {**_summary(row), **json.loads(row["payload"])}


def _visible(principal: Principal, row) -> bool:
    return row is not None and (principal.is_admin or row["owner"] == principal.user_id)


# Senkrone Endpunkte laufen im FastAPI-Thread-Pool; SQLite blockiert die Event-Loop nicht.
@router.get("")
def list_reports(principal: Principal = Depends(get_principal)):
    try:
        with market_db.reading() as db:
            if principal.is_admin:
                rows = db.execute("SELECT * FROM backtest_reports ORDER BY created_at DESC, id").fetchall()
            else:
                rows = db.execute("SELECT * FROM backtest_reports WHERE owner=? ORDER BY created_at DESC, id",
                                  (principal.user_id,)).fetchall()
        return {"reports": [_summary(row) for row in rows]}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Report storage unavailable") from exc


@router.post("", status_code=201)
def create_report(payload: ReportCreate, principal: Principal = Depends(get_principal)):
    report_id = str(payload.requestId)
    data = payload.model_dump(exclude={"requestId", "name", "note", "accountId", "periodFrom", "periodTo"})
    text = json.dumps(data, allow_nan=False, separators=(",", ":"))
    if len(text.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Report too large")
    version = _worker_version()
    try:
        with market_db.writing() as db:
            existing = db.execute("SELECT * FROM backtest_reports WHERE id=?", (report_id,)).fetchone()
            if existing:
                if existing["owner"] != principal.user_id:
                    raise HTTPException(status_code=404, detail="Report not found")
                same = (existing["name"], existing["note"], existing["account_id"], existing["period_from"],
                        existing["period_to"], existing["payload"]) == (payload.name, payload.note, payload.accountId,
                                                                       payload.periodFrom, payload.periodTo, text)
                if not same:
                    raise HTTPException(status_code=409, detail="Report request ID already used")
                return {"report": _full(existing)}
            count = db.execute("SELECT COUNT(*) FROM backtest_reports WHERE owner=?", (principal.user_id,)).fetchone()[0]
            if count >= MAX_REPORTS:
                raise HTTPException(status_code=409, detail=f"Report limit reached ({MAX_REPORTS})")
            db.execute(
                "INSERT INTO backtest_reports (id, owner, name, note, account_id, period_from, period_to,"
                " worker_version, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (report_id, principal.user_id, payload.name, payload.note, payload.accountId, payload.periodFrom,
                 payload.periodTo, version, text, int(time.time())))
            row = db.execute("SELECT * FROM backtest_reports WHERE id=?", (report_id,)).fetchone()
        return {"report": _full(row)}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Report storage unavailable") from exc


@router.get("/{report_id}")
def get_report(report_id: str, principal: Principal = Depends(get_principal)):
    try:
        with market_db.reading() as db:
            row = db.execute("SELECT * FROM backtest_reports WHERE id=?", (report_id,)).fetchone()
        if not _visible(principal, row):
            raise HTTPException(status_code=404, detail="Report not found")
        return {"report": _full(row)}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Report storage unavailable") from exc


@router.delete("/{report_id}")
def delete_report(report_id: str, principal: Principal = Depends(get_principal)):
    try:
        with market_db.writing() as db:
            row = db.execute("SELECT owner FROM backtest_reports WHERE id=?", (report_id,)).fetchone()
            if not _visible(principal, row):
                raise HTTPException(status_code=404, detail="Report not found")
            db.execute("DELETE FROM backtest_reports WHERE id=?", (report_id,))
        return {"deleted": report_id}
    except market_db.MarketDbUnavailable as exc:
        raise HTTPException(status_code=503, detail="Report storage unavailable") from exc
