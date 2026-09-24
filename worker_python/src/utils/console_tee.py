# src/utils/console_tee.py
"""Worker konsol çıktısını (print + uvicorn logları) ayrıca logs/worker_console.log'a yazar.

VPS'te konsol penceresine kimse bakmıyor; Mac'teki VPS sayfası bu dosyayı SSH ile okur
(ops/windows/vps.ps1 logs worker). Dosya MAX_BYTES'ı geçince .1'e döndürülür.
"""
import os
import sys
import threading

from src.utils.paths import get_worker_console_log_path

MAX_BYTES = 5 * 1024 * 1024


class _Tee:
    def __init__(self, original, sink):
        self._original = original
        self._sink = sink

    def write(self, text):
        self._sink.write(text)
        return self._original.write(text)

    def flush(self):
        self._original.flush()

    def __getattr__(self, name):
        # isatty, fileno, encoding ... orijinal akıştan
        return getattr(self._original, name)


class _RotatingSink:
    def __init__(self, path, max_bytes=MAX_BYTES):
        self._path = path
        self._max_bytes = max_bytes
        self._lock = threading.Lock()
        self._file = open(path, "a", encoding="utf-8", errors="replace")

    def write(self, text):
        with self._lock:
            try:
                self._file.write(text)
                self._file.flush()
                if self._file.tell() > self._max_bytes:
                    self._rotate()
            except (OSError, ValueError):
                pass  # loglama asla worker'ı bozmasın

    def _rotate(self):
        self._file.close()
        os.replace(self._path, f"{self._path}.1")
        self._file = open(self._path, "a", encoding="utf-8", errors="replace")


def install(path=None, max_bytes=MAX_BYTES):
    """sys.stdout/sys.stderr'i dosyaya kopyalar. uvicorn.run'dan ÖNCE çağrılmalı
    (uvicorn log handler'ları sys.stderr'i yapılandırma anında alır)."""
    sink = _RotatingSink(path or get_worker_console_log_path(), max_bytes)
    sys.stdout = _Tee(sys.stdout, sink)
    sys.stderr = _Tee(sys.stderr, sink)
    return sink
