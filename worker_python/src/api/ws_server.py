from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import asyncio
import json
import math
import os
import glob
import time
import pandas as pd
from src.api.access import can_access_account
from src.api.auth import API_KEY_HEADER, API_KEY_QUERY_PARAM, authenticate
from src.core.indicator_calc import get_latest_indicators
from src.utils.bot_manager import is_bot_running, log_step
from src.utils.paths import get_metrics_path

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

_stream_task: asyncio.Task | None = None


@asynccontextmanager
async def router_lifespan(app):
    global _stream_task
    _stream_task = asyncio.create_task(real_bot_data_stream())
    yield
    if _stream_task and not _stream_task.done():
        _stream_task.cancel()
        try:
            await _stream_task
        except asyncio.CancelledError:
            pass


router = APIRouter(lifespan=router_lifespan)

# Wie oft eine offene Verbindung ihre Berechtigung neu prüft (Schlüssel erneuert/Benutzer gelöscht,
# Konto umgezogen oder gelöscht): der Stream läuft sonst bis zum Trennen weiter
WS_REVALIDATE_SECONDS = 5.0


async def _revalidate(websocket: WebSocket, provided: str | None, account_id: str | None):
    """Schließt die Verbindung, sobald Schlüssel oder Konto-Zugriff nicht mehr gelten."""
    while True:
        await asyncio.sleep(WS_REVALIDATE_SECONDS)
        principal = authenticate(provided)
        if principal is None or (
            not principal.is_admin and (account_id is None or not can_access_account(principal, account_id))
        ):
            await websocket.close(code=1008)
            return


class ConnectionManager:
    """Açık WS bağlantıları ve her birinin izlediği hesap.

    Hesap, tarayıcıda seçili olandır (?account_id=); None: parametre göndermeyen eski
    istemci veya hesap seçmeden açılan grafik sayfası → accounts.json'daki ilk hesap.
    """

    def __init__(self):
        self.active_connections: dict[WebSocket, str | None] = {}

    async def connect(self, websocket: WebSocket, account_id: str | None = None):
        await websocket.accept()
        self.active_connections[websocket] = account_id

    def disconnect(self, websocket: WebSocket):
        # pop: gönderim hatası bağlantıyı zaten çıkarmış olabilir (remove ValueError atıyordu)
        self.active_connections.pop(websocket, None)

    def requested_accounts(self) -> set[str | None]:
        return set(self.active_connections.values())

    async def send_to(self, requested: set[str | None], message: str):
        """Mesajı yalnızca bu hesaplardan birini isteyen bağlantılara gönderir."""
        await self._send(
            [ws for ws, acc in list(self.active_connections.items()) if acc in requested],
            message,
        )

    async def broadcast(self, message: str):
        await self._send(list(self.active_connections), message)

    async def _send(self, connections: list[WebSocket], message: str):
        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


def fetch_mt5_data(symbols_by_login: dict[int, str]):
    """
    MT5'ten senkron olarak veri çeker. (Event loop'u bloklamamak için thread içinde çalışacak)

    API sürecinin MT5 bağlantısı aynı anda tek bir terminale bağlıdır: veri yalnızca o
    terminalde açık olan hesap için (login → sembol eşlemesinden) çekilir. Dönen sözlükteki
    login/symbol, verinin hangi hesaba ait olduğunu söyler; diğer hesaplar bot metriklerine düşer.
    """
    if not MT5_AVAILABLE or not symbols_by_login:
        return None

    term_info = mt5.terminal_info()
    if term_info is None or not getattr(term_info, "connected", False):
        return None

    acc_info = mt5.account_info()
    login = int(acc_info.login) if acc_info is not None else None
    symbol = symbols_by_login.get(login)
    if not symbol:
        return None

    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 100)
    if rates is None or len(rates) == 0:
        return None

    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s")

    # Pozisyonları ve P/L'yi al (Tüm robot emirleri üzerinden)
    positions = mt5.positions_get()
    if positions:
        r_pos = [p for p in positions if 200000 <= p.magic < 201000]
        open_positions = len(r_pos)
        profit = sum(pos.profit for pos in r_pos)
    else:
        open_positions = 0
        profit = 0.0

    orders = mt5.orders_get()
    if orders:
        r_ord = [o for o in orders if 200000 <= o.magic < 201000]
        pending_orders = len(r_ord)
    else:
        pending_orders = 0

    symbol_info = mt5.symbol_info(symbol)
    trade_mode = getattr(symbol_info, "trade_mode", 0) if symbol_info else 0
    disabled_mode = getattr(mt5, "SYMBOL_TRADE_MODE_DISABLED", 0)

    market_open = (trade_mode != disabled_mode) and (
        mt5.symbol_info_tick(symbol) is not None
    )

    current_price = float(df.iloc[-1]["close"])

    return {
        "login": login,
        "symbol": symbol,
        "df": df,
        "price": current_price,
        "profit": round(profit, 2),
        "open_positions": open_positions,
        "pending_orders": pending_orders,
        "market_open": market_open,
        "mt5_connected": True,
    }


BOT_METRICS_MAX_AGE_SEC = 30


def read_bot_metrics(acc_id: str, symbol: str = ""):
    """Bot sürecinin yazdığı logs/<id>/met_<id>.json'dan METRICS payload'ı üretir.

    RSI/MACD için mum verisi gerektiğinden bu anahtarlar gönderilmez (grafik '--' gösterir).
    Bot çalışmıyorsa veya dosya bayatsa None döner.
    """
    if acc_id == "default" or not is_bot_running(acc_id):
        return None
    path = get_metrics_path(acc_id)
    try:
        if time.time() - os.path.getmtime(path) > BOT_METRICS_MAX_AGE_SEC:
            return None
        with open(path, "r", encoding="utf-8") as f:
            metrics = json.load(f)
    except (OSError, json.JSONDecodeError):
        # Bot dosyayı o an os.replace ile değiştiriyor olabilir (Windows kilidi)
        return None

    # current_price botun alfabetik ilk sembolüdür; akışın sembolü başka olabilir. Fiyat ile sembol
    # her zaman aynı sembole ait olsun (grafik canlı mumu başka sembolün fiyatıyla güncellemesin)
    prices = metrics.get("symbol_prices") if isinstance(metrics.get("symbol_prices"), dict) else {}
    if symbol and prices.get(symbol):
        price = prices[symbol]
    elif prices:
        symbol = sorted(prices)[0]
        price = prices[symbol]
    else:
        price = metrics.get("current_price") or metrics.get("price")
    if not price:
        return None
    return {
        "account_id": acc_id,
        "symbol": symbol,
        "mt5_connected": bool(metrics.get("mt5_connected", True)),
        "market_open": bool(metrics.get("market_open", False)),
        "current_price": price,
        "price": price,
        "profit": metrics.get("profit", 0.0),
        "open_positions": metrics.get("open_positions", 0),
        "pending_orders": metrics.get("pending_orders", 0),
    }


# MT5 sorgusu bu süreden uzun sürerse beklenmez: o tur bot metrikleri gönderilir.
# (Takılan bir MT5 çağrısı akışı tamamen susturuyordu.)
MT5_FETCH_TIMEOUT_SEC = 5.0
# Aynı akış hatası robot loguna en fazla bu aralıkla yazılır
STREAM_ERROR_LOG_INTERVAL_SEC = 60.0

# worker_python/ (configs/, logs/ buradan okunur/yazılır; testler bu sabiti değiştirir)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

_fetch_task: asyncio.Future | None = None
_last_stream_error = {"msg": None, "at": 0.0}


def report_stream_error(acc_id: str, exc: BaseException) -> None:
    """Akış hatasını hesabın robot loguna yazar (arayüz LogViewer'da görünür).

    Eskiden sadece print ediliyordu: VPS'teki uvicorn konsolunu kimse görmediği için akış
    sessizce susuyordu. Aynı hata dakikada bir kez yazılır.
    """
    msg = f"[WS Stream] {type(exc).__name__}: {exc}"
    now = time.time()
    if msg == _last_stream_error["msg"] and now - _last_stream_error["at"] < STREAM_ERROR_LOG_INTERVAL_SEC:
        return
    _last_stream_error.update(msg=msg, at=now)
    if acc_id and acc_id != "default":
        log_step(acc_id, msg, type="error")
    else:
        print(msg)


def load_stream_accounts(base_dir: str) -> list[dict]:
    """accounts.json'daki hesaplar (turda bir kez okunur); okunamazsa boş liste."""
    try:
        with open(os.path.join(base_dir, "configs", "accounts.json"), "r") as f:
            accounts = json.load(f)["accounts"]
        return accounts if isinstance(accounts, list) else []
    except Exception:
        return []


def first_zone_symbol(base_dir: str, acc_id: str) -> str:
    """Hesabın ilk bölgesinin sembolü; yoksa boş.

    Dosya sırası API'deki gibi (helpers._find_settings_file): önce settings_<id>.json, sonra
    Auto Grid ayar dosyası, sonra diğerleri. Önceden yalnızca settings_<id>_*.json aranıyordu;
    motor adı olmayan dosyada akışın sembolü boş kalıyordu.
    """
    exact = os.path.join(base_dir, "configs", f"settings_{acc_id}.json")
    # "_" şart: settings_1001* aksi halde settings_10011_... dosyasını da yakalar
    settings_files = ([exact] if os.path.exists(exact) else []) + sorted(
        glob.glob(os.path.join(base_dir, "configs", f"settings_{acc_id}_*.json")),
        key=lambda path: (not path.endswith("_Auto_Grid.json"), path),
    )
    if not settings_files:
        return ""
    try:
        with open(settings_files[0], "r", encoding="utf-8") as f:
            settings_data = json.load(f)
    except Exception:
        return ""
    # Kayıtlı dosyalar düz ({"ZONES": [...]}); eski/iç içe biçim de desteklenir
    while isinstance(settings_data, dict) and isinstance(settings_data.get("settings"), dict):
        settings_data = settings_data["settings"]
    zones = settings_data.get("ZONES", []) if isinstance(settings_data, dict) else []
    if zones and isinstance(zones[0], dict) and "symbol" in zones[0]:
        return str(zones[0]["symbol"]).upper().strip()
    return ""


def resolve_stream_target(
    base_dir: str, accounts: list[dict], requested: str | None = None
) -> tuple[str, str, int | None]:
    """Akışın hesabı, sembolü (o hesabın ilk bölgesi) ve MT5 login'i.

    `requested`: tarayıcıda seçili hesap; None ise accounts.json'daki ilk hesap.
    accounts.json'da olmayan hesap için sembol ve login boş döner (yalnızca durum gönderilir).
    """
    if requested is None:
        account = accounts[0] if accounts else None
    else:
        account = next((a for a in accounts if str(a.get("id")) == requested), None)
    if not isinstance(account, dict) or "id" not in account:
        return requested or "default", "", None
    acc_id = str(account["id"])
    try:
        login = int(account.get("login") or 0) or None
    except (TypeError, ValueError):
        login = None
    return acc_id, first_zone_symbol(base_dir, acc_id), login


async def fetch_mt5_data_with_timeout(symbols_by_login: dict[int, str]):
    """fetch_mt5_data'yı thread'de çalıştırır; takılırsa None döner.

    Turda tek sorgu vardır (hangi hesaba ait olduğu sonuçta yazar); takılan sorgu bitene
    kadar yenisi başlatılmaz (thread'ler birikmesin), o sırada tüm hesaplar bot
    metriklerine düşer. Böylece takılma turu en fazla bir kez geciktirir, hesap başına değil.
    """
    global _fetch_task
    if _fetch_task is None or _fetch_task.done():
        _fetch_task = asyncio.ensure_future(asyncio.to_thread(fetch_mt5_data, symbols_by_login))
    task = _fetch_task
    try:
        return await asyncio.wait_for(asyncio.shield(task), timeout=MT5_FETCH_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        return None


async def build_stream_message(
    acc_id: str, symbol: str, data: dict | None, known: bool = True
) -> tuple[dict, dict | None]:
    """Bir hesabın bu turdaki WS mesajı. `data`: bu hesaba ait MT5 verisi (yoksa None).

    İkinci değer: logs/met_<id>.json'a yazılacak payload (yalnızca MT5'ten).
    `known=False`: accounts.json'da olmayan hesap → dosyalara dokunmadan yalnızca durum.
    """
    if not data:
        # API süreci bu hesabın terminaline bağlı değilse (başka hesap, worker yeniden
        # başladı, /start çağrılmadı) bot sürecinin metrik dosyasına düş: grafik yine fiyat alır.
        fallback = await asyncio.to_thread(read_bot_metrics, acc_id, symbol) if known else None
        if fallback:
            return {"type": "METRICS", "payload": fallback}, None
        return {
            "type": "LIVE_DATA",
            "payload": {"account_id": acc_id, "mt5_connected": False, "market_open": False},
        }, None

    # İndikatör hatası (ör. uyumsuz pandas_ta) fiyat yayınını durdurmamalı
    try:
        indicators = get_latest_indicators(data["df"])
    except Exception as exc:
        report_stream_error(acc_id, exc)
        indicators = {"rsi": None, "macd": None}

    payload = {
        # Her bağlantı kendi hesabını alır; arayüz yine de account_id'ye bakar (eski worker
        # hep ilk hesabı yayınlıyordu)
        "account_id": acc_id,
        # Grafik sayfası (/chart?zone=) akışın hangi sembolü gösterdiğini bilmeli
        "symbol": symbol,
        "mt5_connected": data["mt5_connected"],
        "market_open": data["market_open"],
        "current_price": data["price"],
        "price": data["price"],
        "profit": data["profit"],
        "open_positions": data["open_positions"],
        "pending_orders": data["pending_orders"],
        "rsi": _finite(indicators.get("rsi")),
        "macd": _finite(indicators.get("macd")),
    }
    return {"type": "METRICS", "payload": payload}, payload


def _finite(value):
    """NaN/inf → None: json.dumps yazar 'NaN', tarayıcının JSON.parse'ı tüm mesajı reddeder."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def write_stream_metrics(base_dir: str, acc_id: str, payload: dict) -> None:
    """Arayüz HTTP polling'inin yedeği: logs/met_<id>.json (logs.py bot dosyası yoksa okur)."""
    os.makedirs(os.path.join(base_dir, "logs"), exist_ok=True)
    with open(
        os.path.join(base_dir, "logs", f"met_{acc_id}.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(payload, f)


def group_stream_targets(
    base_dir: str, requested: set[str | None]
) -> dict[str, tuple[str, int | None, set[str | None]]]:
    """Bağlantıların istediği hesapları çözer: hesap → (sembol, login, bu hesabı isteyen anahtarlar).

    Parametresiz bağlantı (None) ile ilk hesabı açıkça isteyen bağlantı aynı hesaptır: bir kez işlenir.
    """
    accounts = load_stream_accounts(base_dir)
    targets: dict[str, tuple[str, int | None, set[str | None]]] = {}
    for req in requested:
        acc_id, symbol, login = resolve_stream_target(base_dir, accounts, req)
        if acc_id in targets:
            targets[acc_id][2].add(req)
        else:
            targets[acc_id] = (symbol, login, {req})
    return targets


async def fetch_attached_account_data(
    targets: dict[str, tuple[str, int | None, set[str | None]]],
) -> dict | None:
    """Turun tek MT5 sorgusu: API sürecinin terminalindeki hesap istenenlerden biriyse onun verisi."""
    symbols_by_login = {login: symbol for symbol, login, _ in targets.values() if login and symbol}
    if not symbols_by_login:
        return None
    try:
        return await fetch_mt5_data_with_timeout(symbols_by_login)
    except Exception as exc:
        report_stream_error(next(iter(targets)), exc)
        return None


async def real_bot_data_stream():
    """Her bağlantının hesabı için veriyi 1 saniyede bir toplayıp yalnızca o bağlantılara gönderir."""
    base_dir = BASE_DIR
    while True:
        acc_id = "default"
        try:
            await asyncio.sleep(1.0)
            # Bağlantı yoksa da ilk hesap işlenir: logs/met_<id>.json yedeği güncel kalır
            requested = manager.requested_accounts() or {None}
            # Arayüzdeki aktif hesap/sembol her turda dinamik okunur
            targets = group_stream_targets(base_dir, requested)
            mt5_data = await fetch_attached_account_data(targets)

            for acc_id, (symbol, login, receivers) in targets.items():
                # Bir hesabın hatası (ör. bozuk metrik dosyası) diğer hesapların turunu düşürmesin
                try:
                    own = (
                        mt5_data
                        if mt5_data and login and mt5_data.get("login") == login and mt5_data.get("symbol") == symbol
                        else None
                    )
                    message, to_file = await build_stream_message(acc_id, symbol, own, known=login is not None)

                    # Önce gönder: dosya yazılamasa da (ör. Windows izinleri) akış devam eder
                    await manager.send_to(receivers, json.dumps(message))
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    report_stream_error(acc_id, exc)
                    continue

                if to_file is not None:
                    try:
                        write_stream_metrics(base_dir, acc_id, to_file)
                    except Exception as exc:
                        report_stream_error(acc_id, exc)
        except asyncio.CancelledError:
            # Graceful shutdown
            raise
        except Exception as e:
            report_stream_error(acc_id, e)
            # Tekrar deneme için 5 sn bekle
            await asyncio.sleep(5.0)


# (Eski startup/shutdown eventleri lifespan yapısına taşındığı için buradan temizlendi)

@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    # Tarayıcılar WS isteğine başlık ekleyemez → anahtar sorgu parametresiyle gelir
    # (diğer istemciler için X-API-Key başlığı da kabul edilir)
    provided = websocket.query_params.get(API_KEY_QUERY_PARAM) or websocket.headers.get(API_KEY_HEADER)
    principal = authenticate(provided)
    if principal is None:
        await websocket.close(code=1008)  # policy violation; accept öncesi → HTTP 403
        return
    # Tarayıcıda seçili hesap; yoksa ilk hesap. Yalnızca rakam (MT5 login'i, dosya adlarında
    # kullanılır): geçersiz değer başka bir hesaba yorumlanmaz, reddedilir.
    account_id = websocket.query_params.get("account_id")
    if account_id is not None and not (account_id.isascii() and account_id.isdigit()):
        await websocket.close(code=1008)
        return
    # Kullanıcı yalnızca kendi hesabını izler; "ilk hesap" yedeği yalnızca yöneticiye açık
    if not principal.is_admin and (account_id is None or not can_access_account(principal, account_id)):
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, account_id)
    guard = asyncio.create_task(_revalidate(websocket, provided, account_id))
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from WS client: {data}")
    except WebSocketDisconnect:
        pass
    finally:
        guard.cancel()
        manager.disconnect(websocket)
