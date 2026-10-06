# Pyright için yer tutucu: MetaTrader5 paketi yalnızca Windows'ta kurulur (Mac'te yok).
# Her öznitelik Any olur; böylece import hatası ve sahte uyarılar çıkmaz. Bkz. pyrightconfig.json.
from typing import Any

def __getattr__(name: str) -> Any: ...
