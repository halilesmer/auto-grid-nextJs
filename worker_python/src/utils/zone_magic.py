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


# Fraktal kurgu numaraları (ENG-28): kurgu 1 bölgenin düz alanlarıdır, ek kurgular 2..99
# (emir yorumunda en çok iki hane, AutoGrid_Z{n}_F{kurgu}{U|D}{zaman} ≤ 31 karakter)
FRACTAL_SETUP_ID_MAX = 99
FRACTAL_SETUP_SEQ_KEY = "fractal_setup_seq"


def _setup_ids(zone):
    setups = zone.get("fractal_setups") if isinstance(zone, dict) else None
    ids = set()
    for setup in setups if isinstance(setups, list) else []:
        sid = setup.get("sid") if isinstance(setup, dict) else None
        if isinstance(sid, int) and not isinstance(sid, bool) and 2 <= sid <= FRACTAL_SETUP_ID_MAX:
            ids.add(sid)
    return ids


def _clean_kept_sids(zone, active, highest):
    """`fractal_kept_sids` (kaldırılıp emirleri MT5'te bırakılan kurgular): yalnızca verilmiş
    (≤ highest) ve artık listede olmayan numaralar; boşsa alan kalkar."""
    raw = zone.get("fractal_kept_sids")
    kept = sorted({
        n for n in (raw if isinstance(raw, list) else [])
        if isinstance(n, int) and not isinstance(n, bool) and 2 <= n <= highest and n not in active
    })
    if kept:
        zone["fractal_kept_sids"] = kept
    else:
        zone.pop("fractal_kept_sids", None)


def assign_fractal_setup_ids(previous, merged, log=None):
    """`merged` bölgelerindeki ek fraktal kurgularına kalıcı numara (`sid`) yazar (yerinde).

    Bölge magic'i gibi (ENG-27): istemcinin gönderdiği numara yalnızca aynı bölgenin önceki
    kaydında varsa geçerli (numarasız gelen kurgu, önceki kayıttaki aynı `id`'nin numarasını alır); yeni kurgu, bölgede şimdiye kadar verilen en büyük numaranın bir
    fazlasını alır (`fractal_setup_seq`). Silinen kurgunun numarası tekrar verilmez: istatistik
    iki farklı kurgunun işlemlerini karıştırmaz.
    """
    before = {}
    for idx, zone in enumerate(_zones(previous)):
        if isinstance(zone, dict):
            before.setdefault(_zone_key(zone, idx), zone)

    for idx, zone in enumerate(_zones(merged)):
        if not isinstance(zone, dict):
            continue
        prev = before.get(_zone_key(zone, idx)) or {}
        known = _setup_ids(prev)
        try:
            highest = int(prev.get(FRACTAL_SETUP_SEQ_KEY) or 1)
        except (TypeError, ValueError):
            highest = 1
        highest = max([min(max(highest, 1), FRACTAL_SETUP_ID_MAX), *known])

        setups = zone.get("fractal_setups")
        if not isinstance(setups, list):
            zone.pop("fractal_setups", None)
            _clean_kept_sids(zone, set(), highest)
            if highest > 1:
                zone[FRACTAL_SETUP_SEQ_KEY] = highest
            else:
                zone.pop(FRACTAL_SETUP_SEQ_KEY, None)
            continue
        setups = [s for s in setups if isinstance(s, dict)]
        # Kurgunun istemci kimliği (`id`) → önceki kayıttaki numarası: arayüz numarayı henüz
        # görmeden (kaydet → hemen tekrar kaydet) gönderse de kurgu numarasını korur
        by_id = {}
        prev_setups = prev.get("fractal_setups")
        for old in prev_setups if isinstance(prev_setups, list) else []:
            if isinstance(old, dict) and old.get("id") and old.get("sid") in known:
                by_id.setdefault(str(old["id"]), old["sid"])
        taken, pending = set(), []
        for setup in setups:
            sid = setup.get("sid")
            if isinstance(sid, int) and not isinstance(sid, bool) and sid in known and sid not in taken:
                taken.add(sid)
            else:
                pending.append(setup)
        rest = []
        for setup in pending:
            sid = by_id.get(str(setup.get("id"))) if setup.get("id") else None
            if sid is not None and sid not in taken:
                setup["sid"] = sid
                taken.add(sid)
            else:
                rest.append(setup)
        for setup in rest:
            if highest < FRACTAL_SETUP_ID_MAX:
                highest += 1
                sid = highest
            else:
                # 98 numaranın hepsi bir kez verildi: kullanılmayan en küçük numara
                free = [n for n in range(2, FRACTAL_SETUP_ID_MAX + 1) if n not in taken]
                if not free:
                    raise ValueError("Fraktal kurgu numaraları (2-99) dolu")
                sid = next((n for n in free if n not in known), free[0])
                if log:
                    log(f"Fraktal kurgu numaraları doldu; kullanılmayan {sid} yeniden veriliyor.", type="warning")
            setup["sid"] = sid
            taken.add(sid)
        zone["fractal_setups"] = setups
        _clean_kept_sids(zone, taken, highest)
        if highest > 1:
            zone[FRACTAL_SETUP_SEQ_KEY] = highest
        else:
            zone.pop(FRACTAL_SETUP_SEQ_KEY, None)
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
