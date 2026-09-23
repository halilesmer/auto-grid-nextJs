import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api import api_router
from src.api.ws_server import router as ws_router


class _NoisyEndpointFilter(logging.Filter):
    """Frontend pollt /api/logs mehrmals pro Sekunde - das erschlaegt die Konsole
    und versteckt echte Fehler. Andere Zugriffe bleiben sichtbar."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/logs" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_NoisyEndpointFilter())

app = FastAPI(title="Auto Grid Bot API")

@app.on_event("shutdown")
def force_shutdown():
    """Uvicorn kapandıktan sonra asılı kalan MT5/Bot thread'lerini zorla öldürür."""
    os._exit(0)

allowed_origins = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()
]

# KÖK NEDEN ÇÖZÜMÜ: allow_origins=["*"] iken allow_credentials=True OLAMAZ (Network Error verir!)
if "*" in allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix="/api")
app.include_router(ws_router, prefix="/ws")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=os.getenv("ENV") == "development")
