"""Okuyucu süreç testleri için işler (1110-A2); alt süreçte MT5_READER_EXTRA_JOBS ile açılır."""
import os
import time

from src.utils import mt5_market as mm


def sleep_then(sec, value):
    time.sleep(sec)
    return {"value": value, "pid": os.getpid()}


def fail(detail, status):
    raise mm.MarketDataError(detail, status=status)


def boom():
    raise RuntimeError("kaputt")
