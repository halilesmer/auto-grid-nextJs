"""Hilfsfunktionen für Worker-Tests."""

MAGIC_ZONE_1 = 200001  # BASE_MAGIC_NUMBER + zone_idx + 1


class EngineHarness:
    """Hält den Zustand, den bot_runner/loop zwischen den Ticks mitführt, und ruft
    grid_orchestrator.manage_dynamic_grid wie der echte Loop auf (ein Aufruf = ein Tick)."""

    def __init__(self, mt5, zones):
        self.mt5 = mt5
        self.zones = zones
        self.active_zones: dict = {}  # Sembol → aktif bölge indeksi
        self.remote_paused = False
        self.symbol_infos = dict(mt5.symbols)
        self.consecutive_errors: dict = {}
        self.active_zones_state: dict = {}
        self.filling_mode: dict = {}

    def tick(self) -> bool:
        from src.core.grid_orchestrator import manage_dynamic_grid

        ok, self.active_zones = manage_dynamic_grid(
            self.mt5,
            self.zones,
            self.active_zones,
            self.remote_paused,
            self.symbol_infos,
            self.consecutive_errors,
            self.active_zones_state,
            self.filling_mode,
        )
        return ok


def prices(items, digits: int = 3) -> list[float]:
    """Sortierte Preisliste von Orders/Positionen (gerundet, für stabile Vergleiche)."""
    return sorted(round(i.price_open, digits) for i in items)


def make_zone(**overrides) -> dict:
    """Zonen-Dict wie in configs/settings_*.json (Standardwerte = Frontend defaultZone)."""
    zone = {
        "id": "zone-test",
        "is_active": True,
        "symbol": "USOUSD",
        "order_type": "BUY",
        "min_price": 90.0,
        "max_price": 110.0,
        "grid_step": 0.1,
        "lot_size": 0.01,
        "take_profit": 0.1,
        "stop_loss": 0.0,
        "sell_grid_step": 0.1,
        "sell_lot_size": 0.01,
        "sell_take_profit": 0.1,
        "sell_stop_loss": 0.0,
        "is_breakout": False,
        "pullback_distance": 0.5,
        "sell_pullback_distance": 0.5,
        "sync_buy_sell": True,
        "levels_below": 3,
        "levels_above": 3,
        "max_positions": 10,
        "clear_on_exit": False,
        "clear_exit_side": "Farketmez",
        "clear_scope": "Sadece Bekleyen Emirler",
        "clear_target_side": "Farketmez (Hepsi)",
        "exit_condition": "Anlık Fiyat",
        "exit_timeframe": "M15",
    }
    zone.update(overrides)
    return zone
