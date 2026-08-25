# src/utils/profiler.py
"""
🔍 DONMA (TAKILMA) TEŞHİS ARACI — Script çalıştırma profili

Streamlit script'i satır satır çalışır. "Takılma" yaşıyorsan sorun genelde şunlardan
biridir:
  1) Script'in bir aşaması çok UZUN sürüyor (veya sonsuza dek bloke olmuş).
  2) Bir aşama hata fırlatıyor ve arayüz "busy" kalıyor.

Bu araç, kodun kritik noktalarına yerleştirilen stage() çağrılarıyla her çalıştırmanın
zaman çizelgesini logs/run_profiler.log dosyasına yazar. Takılma anında dosyanın SON
satırı, donunun tam olarak HANGİ aşamada koptuğunu söyler.

Kullanım:
    from src.utils.profiler import run_start, stage
    run_start()          # script başında bir kez
    stage("aşama_adı")   # kritik noktalarda

Dosya: logs/run_profiler.log  (Silinmez, ekleyerek yazar; istediğinde elle temizlenir)
"""
import os
import time
import threading
import datetime

from src.utils.paths import LOGS_DIR

_log_path = os.path.join(LOGS_DIR, "run_profiler.log")

_counter = {"run": 0}
_last_ts = {}


def _append(line):
    try:
        with open(_log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def run_start(label=""):
    """Yeni bir script çalıştırmasını işaretler. (Her rerun'da streamlit script en baştan çalışır)"""
    _counter["run"] += 1
    tid = threading.get_ident()
    _last_ts[tid] = time.perf_counter()
    _append(
        f"── RUN #{_counter['run']} başladı {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}"
        + (f" | {label}" if label else "")
        + f" | thread={tid} ──"
    )


def stage(name):
    """Bir aşamanın geçişini kaydeder: bir önceki stage()'den ne kadar sürdüğünü yazar."""
    now = time.perf_counter()
    tid = threading.get_ident()
    last = _last_ts.get(tid)
    delta_ms = (now - last) * 1000.0 if last is not None else 0.0
    _last_ts[tid] = now
    _append(
        f"   [{datetime.datetime.now().strftime('%H:%M:%S.%f')[:-3]}] t{tid} {name:<40} {delta_ms:9.1f} ms"
    )