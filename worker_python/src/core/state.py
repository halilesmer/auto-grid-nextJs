# src/core/state.py
from dataclasses import dataclass, field
from typing import Dict, Set, Any


@dataclass
class GridState:
    zones: list = field(default_factory=list)
    loop_interval_seconds: float = 3.0
    active_symbols: Set[str] = field(default_factory=set)
    symbol_infos: Dict[str, Any] = field(default_factory=dict)

    filling_mode: Dict[str, Any] = field(default_factory=dict)
    # Sembol → o sembolün aktif bölge indeksi (farklı sembollü bölgeler aynı anda çalışır)
    active_zones: Dict[str, int] = field(default_factory=dict)
    active_zones_state: Dict[int, str] = field(default_factory=dict)
    consecutive_errors: Dict[str, int] = field(default_factory=dict)
    # Pozisyon ID → açan emrin ilk hacmi (history_orders_get önbelleği, bkz. grid_orders)
    opening_volumes: Dict[int, float] = field(default_factory=dict)
    # Bölge → uyarı verildiğindeki pozisyon sayısı (max pozisyon uyarısı her döngü tekrarlanmasın)
    limit_warned_zones: Dict[int, int] = field(default_factory=dict)
    # Bilet → (TP, SL): fiyatın yanlış tarafında kalan TP/SL için bir kez yazılan uyarı
    tpsl_blocked_logged: Dict[int, tuple] = field(default_factory=dict)

    is_running: bool = False
    initial_cleanup_done: bool = False
    connection_lost: bool = False
    remote_paused: bool = False

    remote_command_prefix: str = "GRID:"
    remote_signal_stop_price: float = 1.0
    remote_signal_start_price: float = 2.0
    remote_signal_volume: float = 0.01

    BASE_MAGIC_NUMBER: int = 200000
    MARKET_CLOSED_CHECK_INTERVAL: int = 60

    def reset(self):
        self.active_zones_state.clear()
        self.consecutive_errors.clear()
        self.opening_volumes.clear()
        self.limit_warned_zones.clear()
        self.tpsl_blocked_logged.clear()
        self.is_running = False
        self.initial_cleanup_done = False
        self.connection_lost = False
        self.active_zones.clear()


state = GridState()