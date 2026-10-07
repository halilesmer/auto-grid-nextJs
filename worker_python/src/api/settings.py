from fastapi import APIRouter, Depends, HTTPException, Response
import asyncio
import copy
import json
import os
import shutil
from pydantic import TypeAdapter, ValidationError
from src.api.access import account_access
from src.api.models import SettingsPayload, SymbolSettings
from src.api.helpers import _find_settings_file, CONFIGS_DIR
from src.core.legacy_setup_orders import LEGACY_MODES, LEGACY_SETUP_ORDERS_KEY
from src.utils import symbol_setups
from src.utils.bot_manager import is_bot_running
from src.utils.bot_watchdog import account_lock
from src.utils.mt5_connection import safe_log
from src.utils.paths import get_ui_state_path
from src.utils.zone_magic import remap_ui_states, zone_magics

router = APIRouter(tags=["Settings"])

_SYMBOLS = TypeAdapter(list[SymbolSettings])


@router.get("/settings/{account_id}", dependencies=[Depends(account_access)])
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
            # Yalnız SYMBOLS; her kurulum motor sırasını (index) taşır
            "settings": symbol_setups.for_client(data),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _record_zone_registry(account_id: str, settings) -> None:
    """Bölge kaydı (docs/analyse-regeln.md §2): hata kaydı asla engellemez."""
    try:
        from src.utils import market_db

        market_db.record_zones(account_id, symbol_setups.settings_zones(settings))
    except Exception as exc:  # noqa: BLE001
        safe_log(f"⚠️ [MARKET-DB] Bölge kaydı yazılamadı: {exc}")


def _check_symbols(settings) -> None:
    """Gelen `SYMBOLS` yapısı sınırda denetlenir: bozuk yapı kayıtta bütün bölgeleri siler gibi görünürdü.

    `ZONES` da geldiyse `SYMBOLS` kullanılmaz (symbol_setups.to_flat), denetlenmez.
    """
    if not isinstance(settings, dict) or symbol_setups.SYMBOLS_KEY not in settings:
        return
    if symbol_setups.ZONES_KEY in settings:
        return
    try:
        _SYMBOLS.validate_python(settings[symbol_setups.SYMBOLS_KEY])
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"SYMBOLS: {exc}") from exc


def _check_legacy_mode(settings) -> None:
    """Kaldırılan ek kurgu emirleri için karar (ENG-29) yalnızca "delete" veya "keep" olabilir."""
    if not isinstance(settings, dict) or LEGACY_SETUP_ORDERS_KEY not in settings:
        return
    if settings[LEGACY_SETUP_ORDERS_KEY] not in LEGACY_MODES:
        raise HTTPException(status_code=422, detail=f"{LEGACY_SETUP_ORDERS_KEY}: {' | '.join(LEGACY_MODES)}")


def _drop_fractal_setup_fields(settings) -> None:
    """Kaldırılan fraktal ek kurgularının (eski ENG-28) alanları kayıtta bölgelerden silinir."""
    for zone in symbol_setups.settings_zones(settings):
        if isinstance(zone, dict):
            for key in ("fractal_setups", "fractal_setup_seq", "fractal_kept_sids"):
                zone.pop(key, None)


def _backup_before_symbols(path: str) -> None:
    """Eski biçimli (ZONES) dosyanın ilk gruplu kayıttan önceki kopyası (ZON-19).

    Alt klasörde durur: settings_<id>_*.json araması (helpers._find_settings_file) kopyayı bulmasın.
    """
    backup_dir = os.path.join(CONFIGS_DIR, "backup")
    os.makedirs(backup_dir, exist_ok=True)
    name = os.path.splitext(os.path.basename(path))[0] + ".before-symbols.json"
    shutil.copy2(path, os.path.join(backup_dir, name))


async def _remap_ui_state_of_stopped_bot(account_id: str, old_zones, new_zones) -> None:
    """Bölge sırası değiştiyse (gruplama, silme) sıra anahtarlı ui_state dosyasını taşır.

    Çalışan bot bunu ayarları yeniden okurken kendisi yapar (grid_zone_state.rekey_zone_state);
    API de taşırsa dosya iki kez taşınırdı. Durmuş bot ilk okumada eski sırayı bilmez: burada
    taşınır. Kilit: aynı anda /start botu başlatmasın.
    """
    if zone_magics(old_zones) == zone_magics(new_zones):
        return
    async with account_lock(account_id):
        if is_bot_running(account_id):
            return
        try:
            await asyncio.to_thread(remap_ui_states, get_ui_state_path(account_id), old_zones, new_zones)
        except OSError as exc:
            # Ayarlar kaydedildi; kayıt başarısız sayılmaz. Bot başlayınca bölge durumu eski sırayla okunur
            safe_log(f"⚠️ [SETTINGS] ui_state yeni bölge sırasına taşınamadı: {exc}")


@router.post("/settings/{account_id}", dependencies=[Depends(account_access)])
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
        _check_symbols(incoming_data)
        _check_legacy_mode(incoming_data)

        # Magic numaraları düz bölge listesinde verilir; kayıt sembol → kurulum biçimindedir
        # (ZON-19). Gelen ZONES ya da SYMBOLS kayıtlı bölgelerin yerine geçer.
        legacy_file = symbol_setups.is_legacy(existing_data)
        # Kayıttan önceki hâl: bölge magic'leri ve durum sıraları buna göre korunur
        previous = symbol_setups.to_flat(copy.deepcopy(existing_data)) if isinstance(existing_data, dict) else {}
        if isinstance(existing_data, dict) and isinstance(incoming_data, dict):
            data_to_save = symbol_setups.to_flat(existing_data)
            data_to_save.update(symbol_setups.to_flat(incoming_data))
        else:
            data_to_save = incoming_data

        from src.utils.config import sanitize_settings
        from src.utils.zone_magic import assign_zone_magics

        # Her bölgeye kalıcı magic (ENG-27); bölge silinince sıraya bağlı durumu bot taşır
        # (grid_zone_state.rekey_zone_state, ayarları yeniden okuduğu turda)
        data_to_save = assign_zone_magics(previous, sanitize_settings(data_to_save), log=safe_log)
        _drop_fractal_setup_fields(data_to_save)
        data_to_save = symbol_setups.to_grouped(data_to_save)
        if legacy_file:
            await asyncio.to_thread(_backup_before_symbols, path)

        # Atomik yaz: bot her turda okur, yarım dosya görmesin. Windows'ta bot dosyayı o an
        # okuyorsa os.replace reddedilir → kısa tekrar
        tmp_path = f"{path}.api.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data_to_save, f, indent=4, ensure_ascii=False)
            for attempt in range(5):
                try:
                    os.replace(tmp_path, path)
                    break
                except PermissionError:
                    if attempt == 4:
                        raise
                    await asyncio.sleep(0.05)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        await _remap_ui_state_of_stopped_bot(
            account_id, symbol_setups.settings_zones(previous), symbol_setups.settings_zones(data_to_save)
        )
        await asyncio.to_thread(_record_zone_registry, account_id, data_to_save)

        return {
            "status": "saved",
            "account_id": account_id,
            "file": os.path.basename(path),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))