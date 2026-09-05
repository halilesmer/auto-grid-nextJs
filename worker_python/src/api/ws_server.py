from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import asyncio
import json
import os
import glob
import pandas as pd
from src.core.indicator_calc import get_latest_indicators

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


async def real_bot_data_stream():
    """MT5'ten gerçek veriyi 1 saniyede bir çekip WS ile yayınlar."""
    while True:
        try:
            await asyncio.sleep(1.0)

            # Arayüzdeki aktif sembolü dinamik oku
            base_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..")
            )
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
                        zones = settings_data.get("settings", {}).get("ZONES", [])
                        if zones and "symbol" in zones[0]:
                            symbol = str(zones[0]["symbol"]).upper().strip()
            except Exception:
                pass

            data = await asyncio.to_thread(fetch_mt5_data, symbol)

            if data:
                indicators = get_latest_indicators(data["df"])
                combined_payload = {
                    "mt5_connected": data["mt5_connected"],
                    "market_open": data["market_open"],
                    "current_price": data["price"],
                    "price": data["price"],
                    "profit": data["profit"],
                    "open_positions": data["open_positions"],
                    "pending_orders": data["pending_orders"],
                    "rsi": indicators["rsi"],
                    "macd": indicators["macd"],
                }

                # Arayüz HTTP Polling için aktif hesabın JSON log dosyasına yaz
                os.makedirs(os.path.join(base_dir, "logs"), exist_ok=True)
                with open(
                    os.path.join(base_dir, "logs", f"met_{acc_id}.json"),
                    "w",
                    encoding="utf-8",
                ) as f:
                    json.dump(combined_payload, f)

                await manager.broadcast(
                    json.dumps({"type": "METRICS", "payload": combined_payload})
                )
            else:
                await manager.broadcast(
                    json.dumps(
                        {
                            "type": "LIVE_DATA",
                            "payload": {"mt5_connected": False, "market_open": False},
                        }
                    )
                )
        except asyncio.CancelledError:
            # Graceful shutdown
            raise
        except Exception as e:
            print(f"[WS Stream] Unexpected error: {e}")
            # Tekrar deneme için 5 sn bekle
            await asyncio.sleep(5.0)


# (Eski startup/shutdown eventleri lifespan yapısına taşındığı için buradan temizlendi)

@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from WS client: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
