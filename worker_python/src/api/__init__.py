from fastapi import APIRouter
from src.api.accounts import router as accounts_router
from src.api.settings import router as settings_router
from src.api.ui_state import router as ui_state_router
from src.api.logs import router as logs_router
from src.api.bot_control import router as bot_control_router
from src.api.symbols import router as symbols_router
from src.api.system import router as system_router

api_router = APIRouter()

api_router.include_router(accounts_router)
api_router.include_router(settings_router)
api_router.include_router(ui_state_router)
api_router.include_router(logs_router)
api_router.include_router(bot_control_router)
api_router.include_router(symbols_router)
api_router.include_router(system_router)

__all__ = ["api_router"]