"""Bölgelerin kalıcı magic numarası (ENG-27).

Eskiden magic bölgenin listedeki sırasından geliyordu (200000 + sıra + 1). Bir bölge silinince
arkadaki bölgelerin numarası kayıyordu: açık emir ve pozisyonları motor için başka bir bölgeye
(veya hiçbir bölgeye) ait oluyor, TP/SL'leri yanlış bölgenin ayarına çekiliyordu.

Artık her bölge ayar kaydında sabit bir `magic` alır; numarayı yalnızca worker verir (istemcinin
gönderdiği değer yok sayılır), bir kez verilen numara tekrar verilmez:
- mevcut bölge (aynı `id`) numarasını korur; alanı olmayan eski bölge bugünkü sıra numarasını
  alır, böylece açık emir/pozisyonları bölgesinde kalır;
- yeni bölge, şimdiye kadar verilen en büyük numaranın bir fazlasını alır (`ZONE_MAGIC_MAX`).

Motorun sıraya bağlı durumu (aktif bölge, PAUSE/AUTO_CLEAR, fraktal takibi...) bölge silinince
bot tarafından magic üzerinden yeni sıraya taşınır (grid_zone_state.rekey_zone_state,
`remap_ui_states`). Bu modül API ve motor tarafından ortak kullanılır; core'a bağımlı değildir.
"""
import json
import os

BASE_MAGIC_NUMBER = 200000
MAGIC_LIMIT = BASE_MAGIC_NUMBER + 1000  # robot aralığı: 200001..200999
MAGIC_MAX_KEY = "ZONE_MAGIC_MAX"


def zone_magic(zone, zone_idx):
    """Bölgenin kalıcı magic numarası (200001..200999).

    Alanı olmayan veya geçersiz olan (eski) bölgede numara eskisi gibi sıradan gelir.
    """
    raw = zone.get("magic") if isinstance(zone, dict) else None
    if raw is not None and not isinstance(raw, bool):
        try:
            magic = int(raw)
        except (TypeError, ValueError):
            magic = None
        if magic is not None and BASE_MAGIC_NUMBER < magic < MAGIC_LIMIT:
            return magic
    return BASE_MAGIC_NUMBER + zone_idx + 1


def zone_index_by_magic(zones):
    """magic → bölgenin listedeki sırası. Listede olmayan magic silinmiş bölgenindir."""
    index = {}
    for idx, zone in enumerate(zones or []):
        index.setdefault(zone_magic(zone, idx), idx)
    return index


def zone_magics(zones):
    """Bölgelerin sırayla magic listesi (sıra değişti mi karşılaştırması için)."""
    return [zone_magic(zone, idx) for idx, zone in enumerate(zones or [])]


def zone_number(magic):
    """Emir yorumundaki bölge numarası (AutoGrid_Z{n}); eski bölgelerde sıra + 1 ile aynı."""
    return int(magic) - BASE_MAGIC_NUMBER


def _zones(settings):
    zones = settings.get("ZONES") if isinstance(settings, dict) else None
    return zones if isinstance(zones, list) else []


def _zone_key(zone, idx):
    """Bölgeyi kayıtlar arasında eşleştiren anahtar: `id`, yoksa (çok eski dosya) sıra."""
    zid = zone.get("id") if isinstance(zone, dict) else None
    return f"id:{zid}" if zid else f"idx:{idx}"


def assign_zone_magics(previous, merged, log=None):
    """`merged` ayarlarındaki her bölgeye kalıcı magic yazar (yerinde) ve `merged`'i döner.

    previous: kayıttan önceki dosya içeriği (numaralar buradan gelir)
    merged:   kaydedilecek içerik (istemcinin gönderdiği `magic`/`ZONE_MAGIC_MAX` yok sayılır)
    """
    known = {}
    for idx, zone in enumerate(_zones(previous)):
        if isinstance(zone, dict):
            known.setdefault(_zone_key(zone, idx), zone_magic(zone, idx))

    try:
        highest = int((previous or {}).get(MAGIC_MAX_KEY) or BASE_MAGIC_NUMBER)
    except (TypeError, ValueError):
        highest = BASE_MAGIC_NUMBER
    if not BASE_MAGIC_NUMBER <= highest < MAGIC_LIMIT:
        highest = BASE_MAGIC_NUMBER  # bozuk değer: aşağıda bilinen numaralardan yeniden hesaplanır
    highest = max([highest, *known.values()])

    taken = set()
    pending = []  # yeni numara bekleyen bölgeler (sıra korunarak)
    for idx, zone in enumerate(_zones(merged)):
        if not isinstance(zone, dict):
            continue
        magic = known.get(_zone_key(zone, idx))
        if magic is not None and magic not in taken:
            zone["magic"] = magic
            taken.add(magic)
        else:
            pending.append(zone)

    for zone in pending:
        if highest + 1 < MAGIC_LIMIT:
            highest += 1
            magic = highest
        else:
            # 999 numaranın hepsi bir kez verildi: kullanılmayan en küçük numara; bu kayıtta
            # silinen bölgelerinkiler (açık emirleri henüz temizlenmemiş olabilir) en son
            free = [m for m in range(BASE_MAGIC_NUMBER + 1, MAGIC_LIMIT) if m not in taken]
            if not free:
                raise ValueError("Bölge magic aralığı (200001-200999) dolu")
            recent = set(known.values())
            magic = next((m for m in free if m not in recent), free[0])
            if log:
                log(f"Bölge magic aralığı doldu; kullanılmayan {magic} yeniden veriliyor.", type="warning")
        zone["magic"] = magic
        taken.add(magic)

    if isinstance(merged, dict):
        if highest > BASE_MAGIC_NUMBER:
            merged[MAGIC_MAX_KEY] = highest
        else:
            merged.pop(MAGIC_MAX_KEY, None)  # henüz hiç bölge yok
    return merged


def remap_ui_states(path, old_zones, new_zones):
    """ui_state dosyasındaki sıra anahtarlı bölge durumlarını magic üzerinden yeni sıraya taşır.

    Silinen bölgenin durumu düşer. Eski liste boşsa (sıra bilinmiyor) veya sıra değişmediyse
    dosyaya dokunulmaz. Dönüş: dosya değişti mi.
    """
    old_magics = zone_magics(old_zones)
    if not old_magics or old_magics == zone_magics(new_zones) or not os.path.exists(path):
        return False
    new_index = zone_index_by_magic(new_zones)
    try:
        with open(path, "r", encoding="utf-8") as f:
            states = json.load(f)
    except Exception:
        return False
    if not isinstance(states, dict):
        return False

    remapped = {}
    for key, value in states.items():
        if not str(key).isdigit():
            remapped[key] = value
            continue
        old_idx = int(key)
        if old_idx >= len(old_magics):
            continue  # zaten var olmayan bölge
        new_idx = new_index.get(old_magics[old_idx])
        if new_idx is not None:
            remapped[str(new_idx)] = value
    if remapped == states:
        return False

    tmp = f"{path}.remap.tmp"  # botun diğer yazıcılarının .tmp dosyasıyla çakışmasın
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(remapped, f, indent=4, ensure_ascii=False)
    os.replace(tmp, path)
    return True
