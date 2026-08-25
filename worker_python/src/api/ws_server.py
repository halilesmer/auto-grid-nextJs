from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import random

router = APIRouter()

# In a real setup, bot engines push to a queue, and we broadcast from it.
# This simulates pushing data to the frontend.
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

async def mock_bot_data_stream():
    """Generates mock stream data to simulate MT5 streaming"""
    price = 1.1000
    while True:
        await asyncio.sleep(1)
        price += random.uniform(-0.0005, 0.0005)
        data = {
            "type": "METRICS",
            "payload": {
                "price": round(price, 5),
                "profit": round(random.uniform(-50, 100), 2),
                "open_positions": random.randint(0, 5)
            }
        }
        await manager.broadcast(json.dumps(data))

@router.on_event("startup")
async def startup_event():
    asyncio.create_task(mock_bot_data_stream())

@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Client can send messages, though mostly it will just receive.
            data = await websocket.receive_text()
            print(f"Received from WS client: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
