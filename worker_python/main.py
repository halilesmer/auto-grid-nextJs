from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router as api_router
from src.api.ws_server import router as ws_router

app = FastAPI(title="Auto Grid Bot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(ws_router, prefix="/ws")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
