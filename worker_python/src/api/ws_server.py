from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import pandas as pd
from src.core.indicator_calc import get_latest_indicators

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

router = APIRouter()

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

def fetch_mt5_data(symbol="USOUSD"):
    """
    MT5'ten senkron olarak veri çeker. (Event loop'u bloklamamak için thread içinde çalışacak)
    """
    if not MT5_AVAILABLE:
        return None
    
    term_info = mt5.terminal_info()
    if term_info is None or not getattr(term_info, "connected", False):
        return None

    # Son 100 mumu çek
    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 100)
    if rates is None or len(rates) == 0:
        return None
        
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    
    # Pozisyonları ve P/L'yi al
    positions = mt5.positions_get(symbol=symbol)
    open_positions = len(positions) if positions else 0
    profit = sum(pos.profit for pos in positions) if positions else 0.0
    
    current_price = float(df.iloc[-1]['close'])
    
    return {
        "df": df,
        "price": current_price,
        "profit": round(profit, 2),
        "open_positions": open_positions
    }

async def real_bot_data_stream():
    """MT5'ten gerçek veriyi 1 saniyede bir çekip WS ile yayınlar."""
    symbol = "USOUSD"  # TODO: config'ten al
    while True:
        try:
            await asyncio.sleep(1.0)

            data = await asyncio.to_thread(fetch_mt5_data, symbol)

            if data:
                indicators = get_latest_indicators(data["df"])

                payload = {
                    "type": "METRICS",
                    "payload": {
                        "price": data["price"],
                        "profit": data["profit"],
                        "open_positions": data["open_positions"],
                        "rsi": indicators["rsi"],
                        "macd": indicators["macd"]
                    }
                }
                await manager.broadcast(json.dumps(payload))
        except asyncio.CancelledError:
            # Graceful shutdown
            raise
        except Exception as e:
            print(f"[WS Stream] Unexpected error: {e}")
            # Tekrar deneme için 5 sn bekle
            await asyncio.sleep(5.0)

# Module-level task reference for shutdown
_stream_task: asyncio.Task | None = None

@router.on_event("startup")
async def startup_event():
    global _stream_task
    _stream_task = asyncio.create_task(real_bot_data_stream())

@router.on_event("shutdown")
async def shutdown_event():
    global _stream_task
    if _stream_task and not _stream_task.done():
        _stream_task.cancel()
        try:
            await _stream_task
        except asyncio.CancelledError:
            pass

@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from WS client: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
