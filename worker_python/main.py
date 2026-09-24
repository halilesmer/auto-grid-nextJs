import logging
import os
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from src.api import api_router
from src.api.auth import API_KEY_HEADER, api_key_required, is_valid_api_key, redact_api_key
from src.api.ws_server import router as ws_router


class _NoisyEndpointFilter(logging.Filter):
    """Frontend pollt /api/logs mehrmals pro Sekunde - das erschlaegt die Konsole
    und versteckt echte Fehler. Andere Zugriffe bleiben sichtbar."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/logs" not in record.getMessage()


class _RedactApiKeyFilter(logging.Filter):
    """WebSocket anahtarı sorgu parametresiyle gelir (?api_key=...); uvicorn bunu
    istek yoluyla birlikte loglar. Anahtar konsola/log dosyasına düşmesin."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "api_key=" in message:
            record.msg = redact_api_key(message)
            record.args = None
        return True


logging.getLogger("uvicorn.access").addFilter(_NoisyEndpointFilter())
for _logger_name in ("uvicorn.access", "uvicorn.error"):
    logging.getLogger(_logger_name).addFilter(_RedactApiKeyFilter())

app = FastAPI(title="Auto Grid Bot API")


@app.on_event("startup")
async def _startup_maintenance():
    """Eski sürümle çalışan botları arka planda yeni kodla yeniden başlatır (API'yi bekletmez),
    Stop edilmemiş botları (ör. VPS reboot sonrası) devam ettirir, çöken/asılı botları yeniden
    başlatan bekçiyi (watchdog) ve otomatik güncellemeyi çalıştırır."""
    import asyncio
    from src.api.bot_control import startup_maintenance
    from src.utils.auto_updater import run_auto_updater
    from src.utils.bot_watchdog import load_persisted, run_watchdog

    if not api_key_required():
        print(
            "⚠️ WARNING: WORKER_API_KEY ayarlı değil - /api/* ve /ws/stream kimlik doğrulamasız, "
            "ngrok URL'sini bilen herkes erişebilir. Bkz. docs/windows_start_guide.md"
        )

    # Liste burada (senkron) okunur: bakım thread'i başlamadan gelen bir /start dosyayı
    # sadece kendi hesabıyla ezmesin
    persisted = load_persisted()
    loop = asyncio.get_running_loop()
    loop.create_task(asyncio.to_thread(startup_maintenance, persisted))
    app.state.watchdog_task = loop.create_task(run_watchdog())
    app.state.auto_update_task = loop.create_task(run_auto_updater())

@app.on_event("shutdown")
def force_shutdown():
    """Uvicorn kapandıktan sonra asılı kalan MT5/Bot thread'lerini zorla öldürür."""
    os._exit(0)

@app.middleware("http")
async def _unhandled_error_as_json(request: Request, call_next):
    """Beklenmeyen hataları JSON olarak döndürür.

    CORS middleware'inden ÖNCE eklenir (yani onun içinde çalışır); böylece 500
    yanıtı da CORS başlıklarını alır. Aksi halde tarayıcı yanıtı engelliyor ve
    arayüz gerçek hata yerine "worker not reachable" gösteriyordu.
    """
    try:
        return await call_next(request)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Worker error in {request.url.path}: {type(exc).__name__}: {exc}"},
        )


@app.middleware("http")
async def _require_api_key(request: Request, call_next):
    """WORKER_API_KEY ayarlıysa /api/* isteklerinde `X-API-Key` başlığını zorunlu kılar.

    CORS middleware'inden ÖNCE eklenir (onun içinde çalışır): 401 yanıtı da CORS
    başlıklarını alır ve preflight (OPTIONS) istekleri başlık taşımadığı için serbesttir.
    WebSocket'ler buradan geçmez; onlar ws_server.py içinde kontrol edilir.
    """
    if (
        request.method != "OPTIONS"
        and (request.url.path == "/api" or request.url.path.startswith("/api/"))
        and not is_valid_api_key(request.headers.get(API_KEY_HEADER))
    ):
        return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


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
    from src.utils.self_updater import SUPERVISED_ENV

    if os.getenv(SUPERVISED_ENV) == "1":
        # VPS: konsol çıktısı ayrıca logs/worker_console.log'a (Mac'teki VPS sayfası okur)
        from src.utils.console_tee import install as install_console_tee

        install_console_tee()
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=os.getenv("ENV") == "development")
