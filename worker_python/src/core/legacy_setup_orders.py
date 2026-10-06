"""Kaldırılan fraktal ek kurgularından (eski ENG-28) MT5'te kalan bekleyen emirler (ENG-29).

Ek kurgular bölgenin magic'ini kullanıyordu; yalnızca emir yorumundaki kurgu numarası (≥ 2,
AutoGrid_Z{n}_F{kurgu}{U|D}{zaman}) onları ayırır. Özellik kaldırıldı: motor bu emirleri bölgenin
fraktal emri saymaz, kendiliğinden silmez. Bot onları metriklerde listeler; arayüz kullanıcıya
sorar ve kararı ayar dosyasına yazar (`LEGACY_SETUP_ORDERS`):
- "delete": bot bu emirleri her turda iptal eder (loglar);
- "keep":   emirler MT5'te kalır, bot dokunmaz;
- yok:      karar bekleniyor, bot dokunmaz.
Açık pozisyonlara hiçbir durumda dokunulmaz. Bölge pasifleşince, silinince, bölgeden çıkışta
temizlik açıksa ve bot durunca emirler eskisi gibi silinir (kullanıcının kendi işlemi).
"""
from src.core.grid_orders import cancel_order, get_all_robot_orders, parse_fractal_comment

LEGACY_SETUP_ORDERS_KEY = "LEGACY_SETUP_ORDERS"
LEGACY_MODES = ("delete", "keep")


def legacy_mode_of(settings) -> str:
    """Ayarlardaki karar: "delete", "keep" ya da "" (henüz karar yok / geçersiz değer)."""
    value = settings.get(LEGACY_SETUP_ORDERS_KEY) if isinstance(settings, dict) else None
    return value if value in LEGACY_MODES else ""


def is_legacy_setup_order(order) -> bool:
    parsed = parse_fractal_comment(getattr(order, "comment", ""))
    return parsed is not None and parsed[0] >= 2


def without_legacy_orders(orders):
    """Bölge yönetimine giden emirler: eski ek kurguların emirleri hariç (None aynen döner)."""
    if orders is None:
        return None
    return [o for o in orders if not is_legacy_setup_order(o)]


def cancel_legacy_orders(mt5, mode: str, log_message) -> None:
    """Karar "delete" ise eski ek kurgu emirlerini iptal eder."""
    if mode != "delete":
        return
    for order in get_all_robot_orders(mt5) or ():
        if is_legacy_setup_order(order) and cancel_order(mt5, order):
            log_message(
                f"🧹 Eski fraktal kurgusu emri siliniyor (kullanıcı onayı): Bilet {order.ticket}, "
                f"{order.symbol} {order.price_open}, magic {order.magic}."
            )
