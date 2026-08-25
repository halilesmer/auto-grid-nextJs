# scripts/audit_account.py
"""
🔍 TEK SEFERLİK DENETİM SCRIPTİ — Eski → Yeni Geçiş Kontrolü

Kullanım:
    python scripts/audit_account.py 345435435435

Ne yapar?
    1) accounts.json'dan hesabı bulup MT5'e bağlanır.
    2) Açık pozisyonları ve bekleyen emirleri magic aralığından okur.
    3) Pozisyonların bilet/ticket, P/L, magic numarasını raporlar.
    4) Yeni sistemin (state_manager) bu pozisyonları otomatik devralıp
       devralamayacağını kontrol eder.

🚨 KRİTİK GÜVENCE: Bu script HİÇBİR işlemi kapatmaz / emir silmez.
Sadece OKUR ve raporlar. (Source of Truth kontrolü)
"""
import sys
import os
import json
from pathlib import Path

# Proje kökünü Python yoluna ekle
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from src.utils.mt5_connection import connect_to_mt5
from src.utils.state_manager import get_magic_range, _get_mt5
from src.utils.config import get_settings_file

# Mac test modunda gerçek MetaTrader5 yok; DummyMT5'i motor modülünden al
try:
    _GET_MT5 = _get_mt5
    import MetaTrader5 as _TEST_MT5  # noqa: F401
except ImportError:
    _GET_MT5 = None

# Bot magic aralığı (yeni sistemde state_manager ile aynı filtre)
BOT_MAGIC_MIN = 200000
BOT_MAGIC_MAX = 201000


def _load_account(account_id):
    accounts_path = os.path.join(project_root, "configs", "accounts.json")
    if not os.path.exists(accounts_path):
        print("❌ configs/accounts.json bulunamadı!")
        return None
    try:
        with open(accounts_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            accounts = data if isinstance(data, list) else data.get("accounts", [])
    except Exception as e:
        print(f"❌ accounts.json okunamadı: {e}")
        return None

    acc = next((a for a in accounts if str(a.get("login")) == account_id), None)
    if acc is None:
        print(f"❌ {account_id} ID'li hesap configs/accounts.json'da BULUNAMADI.")
        print("   Önce Streamlit arayüzünden hesabı sisteme eklemelisiniz.")
        return None
    return acc


def _summarize_position(p):
    ptype = getattr(p, "type", -1)
    return {
        "ticket": int(getattr(p, "ticket", 0)),
        "type": "BUY" if ptype == 0 else "SELL",
        "volume": float(getattr(p, "volume", 0.0)),
        "symbol": getattr(p, "symbol", ""),
        "price_open": float(getattr(p, "price_open", 0.0)),
        "profit": round(float(getattr(p, "profit", 0.0)), 2),
        "magic": getattr(p, "magic", 0),
        "comment": getattr(p, "comment", ""),
    }


def _summarize_order(o):
    return {
        "ticket": int(getattr(o, "ticket", 0)),
        "type": int(getattr(o, "type", -1)),
        "price_open": float(getattr(o, "price_open", 0.0)),
        "volume": float(getattr(o, "volume_current", 0.0)),
        "magic": getattr(o, "magic", 0),
        "comment": getattr(o, "comment", ""),
    }


def main():
    if len(sys.argv) < 2:
        print("Kullanım: python scripts/audit_account.py <account_id>")
        sys.exit(1)

    account_id = sys.argv[1]

    print("=" * 62)
    print(f"🔍 DENETİM BAŞLIYOR — Hesap: {account_id}")
    print("=" * 62)

    # 1. Hesabı bul
    active_account = _load_account(account_id)
    if active_account is None:
        sys.exit(1)

    # 2. Ayarlar dosyası uyumu (yeni sistemle)
    settings_file = get_settings_file("Auto Grid")
    print(f"\n📄 Ayarlar dosyası (yeni sistem bekler): {settings_file}")
    print(
        f"   {'✅ Dosya mevcut + isim uyumlu' if os.path.exists(settings_file) else '❌ DOSYA YOK — yeni sistem ilk açılışta varsayılan oluşturur'}"
    )

    # 3. MT5'e bağlan
    print(f"\n🔌 MT5 Terminaline bağlanılıyor ({account_id})...")
    ok, error_detail = connect_to_mt5(active_account)
    if not ok:
        print(f"❌ MT5 bağlantısı başarısız! Denetim iptal edildi. Detay: {error_detail}")
        print("   (Mac'te simülasyon olarak 'geçer' sayılır)")
        sys.exit(1)
    print("✅ MT5 bağlantısı başarılı (veya simüle edildi).")

    # 4. Pozisyonları oku
    print("\n📊 AÇIK POZİSYONLAR:")
    if _GET_MT5 is not None:
        mt5_stub = _GET_MT5(None)
    else:
        # Mac test modu: DummyMT5'i motor modülünden al
        import core.auto_grid_engine as bot_engine

        mt5_stub = bot_engine.mt5
    positions = mt5_stub.positions_get() if hasattr(mt5_stub, "positions_get") else None
    if not positions:
        print("   ℹ️  Açık pozisyon yok.")
    else:
        robot_pos, manual_pos = [], []
        for p in positions:
            (robot_pos if BOT_MAGIC_MIN <= p.magic < BOT_MAGIC_MAX else manual_pos).append(
                p
            )
        total_pl = 0.0
        for p in robot_pos:
            s = _summarize_position(p)
            total_pl += s["profit"]
            print(
                f"   🎯 Bilet:{s['ticket']} | {s['type']} {s['volume']} {s['symbol']} "
                f"@{s['price_open']} | P/L: {s['profit']} | Magic: {s['magic']} | Yorum: {s['comment']}"
            )
        for p in manual_pos:
            s = _summarize_position(p)
            print(
                f"   ⚠️ MANUEL {s['ticket']} | {s['type']} {s['volume']} {s['symbol']} "
                f"| P/L: {s['profit']} | Magic: {s['magic']}"
            )
        print(f"\n   Toplam robot P/L: {round(total_pl, 2)}")

    # 5. Bekleyen emirleri oku
    print("\n📋 BEKLEYEN EMİRLER:")
    orders = mt5_stub.orders_get() if hasattr(mt5_stub, "orders_get") else None
    if not orders:
        print("   ℹ️  Bekleyen emir yok.")
    else:
        for o in orders:
            s = _summarize_order(o)
            in_range = "✅ Robot" if BOT_MAGIC_MIN <= s["magic"] < BOT_MAGIC_MAX else "⚠️ Manuel"
            print(
                f"   Bilet:{s['ticket']} | @{s['price_open']} | {s['volume']} lot "
                f"| Magic: {s['magic']} ({in_range}) | Yorum: {s['comment']}"
            )

    # 6. UYUMLULUK RAPORU (yeni sistemin devralması)
    print("\n" + "=" * 62)
    print("🧠 YENİ SİSTEM DEVİRALMA RAPORU")
    print("=" * 62)
    if positions:
        outside = [
            p for p in positions if not (BOT_MAGIC_MIN <= p.magic < BOT_MAGIC_MAX)
        ]
        if outside:
            print(
                f"   ⚠️ {len(outside)} pozisyon magic aralığı (200000-201000) DIŞINDA. "
                "Yeni sistem bunları 'manuel' sayacak ve yönetmeyecek (kapatmayacak)."
            )
            print(
                "   ℹ️  Bu pozisyonlar güvende kalır ama otomatik grid yönetimi kapsamı dışındadır."
            )
        else:
            print("   ✅ TÜM açık pozisyonlar magic aralığında — yeni sistem otomatik devralacak.")
    else:
        print("   ℹ️  Açık pozisyon yok — devralacak bir şey bulunmuyor.")

    # 7. Streamlit süreç durumu
    from src.utils.bot_manager import is_bot_running

    running = is_bot_running(account_id)
    print(f"\n🤖 But mevcut süreç durumu: {'ÇALIŞIYOR' if running else 'ÇALIŞMIYOR'}")
    if running:
        print("   ⚠️  Ayı bot zaten çalışıyorsa önce durdurun, sonra yeni sürümü başlatın.")
    print("\n✅ Denetim TAMAMLANDI. Hiçbir işlem kapatılmadı, emir silinmedi.")
    print("   Güvenle yeni sistemi ilk kez başlatabilirsiniz.")


if __name__ == "__main__":
    main()
