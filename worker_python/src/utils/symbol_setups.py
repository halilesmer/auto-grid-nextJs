"""Sembol → kurulum (setup) modeli (ZON-19).

Ayar dosyası bölgeleri sembole göre gruplu tutar:

    "SYMBOLS": [{"symbol": "XAUUSD", "setups": [{...bölge alanları (symbol hariç)..., "magic": 200001}]}]

Her kurulum eski bir bölgedir: kimliği (`id`), kalıcı magic'i (ENG-27) ve fraktal kurguları
(`fractal_setups`, ENG-28) aynen kalır. Motor ve diğer okuyucular düz bölge listesiyle çalışır:
`settings_zones` her kurulum için bir bölge üretir (sembol sırası, sembol içinde kurulum sırası).

Eski dosyalar (`ZONES` düz listesi) okunurken olduğu gibi kullanılır; ilk kayıtta gruplu biçime
geçer (api/settings.py, öncesinde yedek). `ZONES` varsa her yerde o geçerlidir: eski arayüz onu
gönderir, eski bir worker sürümüne dönülürse dosyaya onu yazar ve `SYMBOLS` eskimiş kalır.
Bu modül API ve motor tarafından ortak kullanılır; core'a bağımlı değildir.
"""
SYMBOLS_KEY = "SYMBOLS"
ZONES_KEY = "ZONES"


def flatten_symbols(symbols):
    """Sembol grupları → düz bölge listesi; her bölge sembolünü gruptan alır."""
    zones = []
    for entry in symbols if isinstance(symbols, list) else []:
        if not isinstance(entry, dict):
            continue
        setups = entry.get("setups")
        for setup in setups if isinstance(setups, list) else []:
            if isinstance(setup, dict):
                zones.append({**setup, "symbol": entry.get("symbol", "")})
    return zones


def group_zones(zones):
    """Düz bölge listesi → sembol grupları.

    Aynı sembolün bölgeleri, sembolün ilk görüldüğü grupta sırasıyla toplanır. Sembol değeri
    değiştirilmez (büyük/küçük harf, boşluk): motorun gördüğü değer aynı kalır.
    """
    groups = {}
    symbols = []
    for zone in zones if isinstance(zones, list) else []:
        if not isinstance(zone, dict):
            continue
        symbol = str(zone.get("symbol") or "")
        if symbol not in groups:
            groups[symbol] = {"symbol": symbol, "setups": []}
            symbols.append(groups[symbol])
        groups[symbol]["setups"].append({k: v for k, v in zone.items() if k != "symbol"})
    return symbols


def settings_zones(settings):
    """Ayarlardaki bölgeler, düz liste: `ZONES` varsa ondan, yoksa `SYMBOLS`'tan."""
    if not isinstance(settings, dict):
        return []
    if ZONES_KEY in settings:
        zones = settings[ZONES_KEY]
        return zones if isinstance(zones, list) else []
    return flatten_symbols(settings.get(SYMBOLS_KEY))


def to_flat(settings):
    """Kopya: bölgeler `ZONES` düz listesinde, `SYMBOLS` yok (magic/kurgu numarası verme biçimi).

    İkisi birden varsa `ZONES` geçerlidir: eski arayüz GET'ten aldığı bütün nesneyi, yalnız
    `ZONES`'u değiştirerek geri gönderir; içindeki `SYMBOLS` o zaman eskidir. İkisi de yoksa
    `ZONES` eklenmez (yalnız başka ayar gönderen kayıt bölgeleri silmesin).
    """
    if not isinstance(settings, dict):
        return settings
    flat = {k: v for k, v in settings.items() if k != SYMBOLS_KEY}
    if ZONES_KEY not in settings and SYMBOLS_KEY in settings:
        flat[ZONES_KEY] = flatten_symbols(settings[SYMBOLS_KEY])
    return flat


def to_grouped(settings):
    """Kopya, kayıt biçimi: `ZONES` → `SYMBOLS`. `ZONES` yoksa ayarlar olduğu gibi döner."""
    if not isinstance(settings, dict) or ZONES_KEY not in settings:
        return settings
    grouped = {k: v for k, v in settings.items() if k != ZONES_KEY}
    grouped[SYMBOLS_KEY] = group_zones(settings[ZONES_KEY])
    return grouped


def for_client(settings):
    """GET yanıtı: `SYMBOLS` ve aynı bölgelerin motor sırasıyla düz listesi `ZONES`.

    `ZONES` sırası motorunkiyle aynıdır (ui-state bölge sırası buna göre gönderilir); `SYMBOLS`
    bu listeden üretilir, ikisi hep tutarlıdır. Bölgesi olmayan dosya olduğu gibi döner.
    """
    has_zones = isinstance(settings, dict) and (ZONES_KEY in settings or SYMBOLS_KEY in settings)
    if not has_zones:
        return settings
    zones = settings_zones(settings)
    return {**settings, ZONES_KEY: zones, SYMBOLS_KEY: group_zones(zones)}


def is_legacy(settings):
    """Eski biçimde (`ZONES`) bölgesi olan dosya mı (gruplu kayıttan önce yedeği alınır)."""
    zones = settings.get(ZONES_KEY) if isinstance(settings, dict) else None
    return isinstance(zones, list) and len(zones) > 0
