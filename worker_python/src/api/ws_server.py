from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import asyncio
import json
import math
import os
import glob
import time
import pandas as pd
from src.api.auth import API_KEY_HEADER, API_KEY_QUERY_PARAM, is_valid_api_key
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


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


def fetch_mt5_data(symbol=""):
    """
    MT5'ten senkron olarak veri çeker. (Event loop'u bloklamamak için thread içinde çalışacak)
    """
    if not MT5_AVAILABLE or not symbol:
        return None

    term_info = mt5.terminal_info()
    if term_info is None or not getattr(term_info, "connected", False):
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

    price = metrics.get("current_price") or metrics.get("price")
    if not price:
        return None
    return {
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


def resolve_stream_target(base_dir: str) -> tuple[str, str]:
    """Akışın hesabı (accounts.json'daki ilk hesap) ve sembolü (o hesabın ilk bölgesi)."""
    acc_id, symbol = "default", ""
    try:
        with open(os.path.join(base_dir, "configs", "accounts.json"), "r") as f:
            acc_id = str(json.load(f)["accounts"][0]["id"])
        settings_files = glob.glob(
            os.path.join(base_dir, "configs", f"settings_{acc_id}*.json")
        )
        if settings_files:
            with open(settings_files[0], "r", encoding="utf-8") as f:
                settings_data = json.load(f)
            # Kayıtlı dosyalar düz ({"ZONES": [...]}); eski/iç içe biçim de desteklenir
            while isinstance(settings_data, dict) and isinstance(
                settings_data.get("settings"), dict
            ):
                settings_data = settings_data["settings"]
            zones = (
                settings_data.get("ZONES", [])
                if isinstance(settings_data, dict)
                else []
            )
            if zones and "symbol" in zones[0]:
                symbol = str(zones[0]["symbol"]).upper().strip()
    except Exception:
        pass
    return acc_id, symbol


async def fetch_mt5_data_with_timeout(symbol: str):
    """fetch_mt5_data'yı thread'de çalıştırır; takılırsa None döner.

    Takılan sorgu bitene kadar yenisi başlatılmaz (thread'ler birikmesin); o sırada
    çağıran bot metriklerine düşer.
    """
    global _fetch_task
    if _fetch_task is None or _fetch_task.done():
        _fetch_task = asyncio.ensure_future(asyncio.to_thread(fetch_mt5_data, symbol))
    task = _fetch_task
    try:
        return await asyncio.wait_for(asyncio.shield(task), timeout=MT5_FETCH_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        return None


async def build_stream_message(acc_id: str, symbol: str) -> tuple[dict, dict | None]:
    """Bir turun WS mesajı. İkinci değer: logs/met_<id>.json'a yazılacak payload (yalnızca MT5'ten)."""
    try:
        data = await fetch_mt5_data_with_timeout(symbol)
    except Exception as exc:
        report_stream_error(acc_id, exc)
        data = None

    if not data:
        # API süreci MT5'e bağlı değilse (ör. worker yeniden başladı, /start
        # çağrılmadı) bot sürecinin metrik dosyasına düş: grafik yine fiyat alır.
        fallback = await asyncio.to_thread(read_bot_metrics, acc_id, symbol)
        if fallback:
            return {"type": "METRICS", "payload": fallback}, None
        return {
            "type": "LIVE_DATA",
            "payload": {"mt5_connected": False, "market_open": False},
        }, None

    # İndikatör hatası (ör. uyumsuz pandas_ta) fiyat yayınını durdurmamalı
    try:
        indicators = get_latest_indicators(data["df"])
    except Exception as exc:
        report_stream_error(acc_id, exc)
        indicators = {"rsi": None, "macd": None}

    payload = {
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


async def real_bot_data_stream():
    """MT5'ten gerçek veriyi 1 saniyede bir çekip WS ile yayınlar."""
    base_dir = BASE_DIR
    while True:
        acc_id = "default"
        try:
            await asyncio.sleep(1.0)
            # Arayüzdeki aktif sembolü dinamik oku
            acc_id, symbol = resolve_stream_target(base_dir)
            message, to_file = await build_stream_message(acc_id, symbol)

            # Önce yayınla: dosya yazılamasa da (ör. Windows izinleri) akış devam eder
            await manager.broadcast(json.dumps(message))

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
    if not is_valid_api_key(provided):
        await websocket.close(code=1008)  # policy violation; accept öncesi → HTTP 403
        return
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from WS client: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
