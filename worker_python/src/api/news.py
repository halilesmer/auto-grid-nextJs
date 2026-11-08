"""Haber kartı (NWS-01): yaklaşan ekonomik olaylar. Hesaba bağlı değil; giriş yapmış her rol erişir."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from src.utils import econ_calendar

router = APIRouter(tags=["News"])

LANGS = {"tr", "en", "de"}
IMPORTANCE = {"none", "low", "moderate", "high"}


def _parse_time(value: str | None, name: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid {name}")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/news/events")
def news_events(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    impact: str | None = None,
    currencies: str | None = None,
    lang: str | None = None,
):
    time_from = _parse_time(from_, "from")
    time_to = _parse_time(to, "to")
    levels = {p.strip().lower() for p in (impact or "").split(",") if p.strip()}
    if levels - IMPORTANCE:
        raise HTTPException(status_code=422, detail="invalid impact")
    codes = {c.strip().upper() for c in (currencies or "").split(",") if c.strip()}
    code = (lang or "").strip().lower()
    if code and code not in LANGS:
        raise HTTPException(status_code=422, detail="invalid lang")
    return econ_calendar.load_events(
        lang=code or None,
        time_from=time_from.astimezone(timezone.utc) if time_from else None,
        time_to=time_to.astimezone(timezone.utc) if time_to else None,
        importance=levels or None,
        currencies=codes or None,
    )
