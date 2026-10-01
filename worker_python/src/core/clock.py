# src/core/clock.py
"""Motorun saati: canlıda gerçek saat, testlerde (parite senaryoları) simüle saat.

Davranış değişikliği yok: varsayılan kaynaklar time.monotonic ve time.time'dır. Musterlösungen
(tests/parity) set_clock ile simüle zamanı verir; böylece 30 sn anlık giriş freni ve tick tazeliği
senaryo zamanıyla çalışır (docs/analyse-regeln.md §5).
"""
import time

_monotonic = time.monotonic
_wall = time.time


def monotonic() -> float:
    return _monotonic()


def wall() -> float:
    """Unix saniyesi (tick tazeliği gibi duvar saati karşılaştırmaları)."""
    return _wall()


def set_clock(fn=None):
    """Testler için: fn() hem monoton hem duvar saati olur; None gerçek saate döner."""
    global _monotonic, _wall
    _monotonic = fn or time.monotonic
    _wall = fn or time.time
