"""Hesap medyası (1107-A20, ACC-12): hesap başına en çok 3 dosya (PDF, resim, not).

Gövde ham bayttır (multipart yok). Dosya yalnız istek üzerine iner; listede bayt dönmez.
"""
import asyncio
import os
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from src.api.access import account_access
from src.api.helpers import _load_accounts
from src.utils import account_media as store
from src.utils.paths import safe_account_id

router = APIRouter(tags=["Media"])


def _call_error(exc: store.MediaError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=exc.detail)


def _numeric(account_id: str) -> str:
    # safe_account_id yalnız rakam bırakır: "12a" ile "12" aynı klasöre düşmesin
    if safe_account_id(account_id) != account_id:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")
    return account_id


def _account(account_id: str) -> dict:
    account = next((a for a in _load_accounts() if str(a.get("id")) == account_id), None)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")
    return account


@router.get("/accounts/{account_id}/media", dependencies=[Depends(account_access)])
async def list_media(account_id: str):
    _numeric(account_id)
    items = await asyncio.to_thread(store.list_items, account_id)
    return {"items": [store.public_item(i) for i in items], "limit": store.MAX_ITEMS, "max_bytes": store.MAX_BYTES}


@router.post("/accounts/{account_id}/media", status_code=201, dependencies=[Depends(account_access)])
async def upload_media(request: Request, account_id: str, name: str = Query(..., max_length=1000)):
    _numeric(account_id)
    owner = _account(account_id).get("owner")
    try:
        clean = store.clean_name(name)
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > store.MAX_UPLOAD_BYTES:
            raise store.MediaError(413, "File is too large")
        if await asyncio.to_thread(store.count_items, account_id) >= store.MAX_ITEMS:
            raise store.MediaError(409, f"At most {store.MAX_ITEMS} files per account")
        part = await asyncio.to_thread(store.new_part_path, account_id)
        try:
            kind, mime, ext, size = await _stream_to_part(request, part, clean)
            item = await asyncio.to_thread(store.commit, account_id, part, clean, kind, mime, ext, size, owner)
        finally:
            store._silent_remove(part)  # başarıda os.replace zaten taşıdı
    except store.MediaError as exc:
        raise _call_error(exc)
    return store.public_item(item)


async def _stream_to_part(request: Request, part: str, name: str) -> tuple[str, str, str, int]:
    """Akarak .part'a yaz. İlk 12 bayttan tür belli olunca kesin sınır, öncesinde üst sınır (10 MB) geçerli."""
    head = bytearray()
    size = 0
    classified: Optional[tuple[str, str, str]] = None
    limit = store.MAX_UPLOAD_BYTES
    with open(part, "wb") as f:
        async for chunk in request.stream():
            if not chunk:
                continue
            size += len(chunk)
            if classified is None:
                head += chunk[: store.SNIFF_BYTES]
                if len(head) >= store.SNIFF_BYTES or size > store.SNIFF_BYTES:
                    classified = store.classify(name, bytes(head))
                    limit = store.MAX_BYTES[classified[0]]
            if size > limit:
                raise store.MediaError(413, "File is too large")
            f.write(chunk)
    if size == 0:
        raise store.MediaError(422, "File is empty")
    if classified is None:
        classified = store.classify(name, bytes(head))
        if size > store.MAX_BYTES[classified[0]]:
            raise store.MediaError(413, "File is too large")
    kind, mime, ext = classified
    if kind == "note":
        await asyncio.to_thread(store.validate_note, part)
    return kind, mime, ext, size


@router.get("/accounts/{account_id}/media/{media_id}", dependencies=[Depends(account_access)])
async def download_media(account_id: str, media_id: str):
    _numeric(account_id)
    try:
        item, path = await asyncio.to_thread(store.get_item, account_id, media_id)
    except store.MediaError as exc:
        raise _call_error(exc)
    return FileResponse(
        path,
        media_type=item["mime"],
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(item['name'], safe='')}",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    )


@router.delete("/accounts/{account_id}/media/{media_id}", dependencies=[Depends(account_access)])
async def delete_media(account_id: str, media_id: str):
    _numeric(account_id)
    try:
        await asyncio.to_thread(store.delete_item, account_id, media_id)
    except store.MediaError as exc:
        raise _call_error(exc)
    return {"deleted": media_id}
