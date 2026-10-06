# src/utils/mt5_terminal_guard.py
"""Bir hesabın login'i başka bir hesabın MT5 terminalinde yapılmasın (ACC-11).

mt5.login() bağlı terminalin oturumunu değiştirir. initialize() yol (path) olmadan
çağrılırsa MetaTrader5 kütüphanesi çalışan herhangi bir terminale bağlanır; 29.09'da
hesap B'nin girişi böylece hesap A'nın terminalinde (T34) yapıldı ve o hesabın botu
bağlantısını kaybetti. Bu modül iki kuralı uygular:
- Hesabın mt5_path'i girilmiş ama dosya yoksa yolsuz initialize yapılmaz.
- Bağlanılan terminal accounts.json'da başka bir hesabın terminaliyse login yapılmaz.
- Veri sorgusu (data_query), terminalde çalışan başka bir hesabın botu varsa oturumu değiştirmez.
"""
import json
import os

from src.utils import paths


def missing_path_error(mt5_path):
    """mt5_path girilmiş ama dosya yoksa hata metni, yoksa None."""
    if mt5_path and mt5_path.strip() and not os.path.exists(mt5_path.strip()):
        return (
            f"[CONFIG] MT5 terminal yolu bulunamadı: {mt5_path}. Hesap ayarlarında bu hesabın "
            "terminal64.exe yolunu düzeltin (başka bir terminale bağlanılmadı)."
        )
    return None


def _load_accounts():
    try:
        with open(os.path.join(paths.CONFIGS_DIR, "accounts.json"), "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    accounts = data if isinstance(data, list) else data.get("accounts", [])
    return [a for a in accounts if isinstance(a, dict)]


def _terminal_dir(exe_path):
    return os.path.normcase(os.path.normpath(os.path.dirname(exe_path)))


def foreign_terminal_owner(mt5, login_id, accounts=None):
    """Bağlı terminal başka bir hesaba aitse (o hesabın login'i, terminal yolu), değilse None.

    Terminal, accounts.json'da mt5_path'i o klasörü gösteren hesaba aittir. Aynı terminali
    paylaşan hesaplar (tek terminal, bilerek hesap değiştirme) engellenmez: terminal bu
    hesabın kendi yoluysa sorun yok. mt5_path'i boş bir hesap ise başka bir hesabın yolu
    girilmiş terminaline giriş yapamaz.
    """
    try:
        info = mt5.terminal_info()
    except Exception:
        return None
    term_path = getattr(info, "path", "") if info is not None else ""
    if not term_path:
        return None
    here = os.path.normcase(os.path.normpath(term_path))

    owner = None
    for acc in _load_accounts() if accounts is None else accounts:
        acc_path = (acc.get("mt5_path") or "").strip()
        if not acc_path or _terminal_dir(acc_path) != here:
            continue
        if str(acc.get("login")) == str(login_id):
            return None
        owner = owner or acc.get("login")
    return (owner, term_path) if owner is not None else None


def foreign_terminal_error(mt5, login_id, accounts=None):
    """Bağlı terminal başka bir hesabınsa hata metni, değilse None."""
    found = foreign_terminal_owner(mt5, login_id, accounts)
    if found is None:
        return None
    owner, term_path = found
    return (
        f"[TERMINAL] Bağlanılan MT5 terminali ({term_path}) {owner} hesabına ait; {login_id} için "
        "oturumu değiştirilmedi. Bu hesabın terminal yolunu (mt5_path) kontrol edin."
    )


def running_bot_session_error(mt5, login_id, accounts=None, is_running=None):
    """Terminal başka bir hesapta oturum açmış ve o hesabın botu çalışıyorsa hata metni, değilse None.

    Paylaşılan terminalde (bilerek hesap değiştirme, foreign_terminal_owner) login, orada çalışan
    botun bağlantısını keser. /start bunu bilerek yapabilir; veri sorgusu asla.
    """
    try:
        acc = mt5.account_info()
    except Exception:
        return None
    current = getattr(acc, "login", None) if acc is not None else None
    if not current or str(current) == str(login_id):
        return None
    if is_running is None:
        from src.utils.bot_manager import is_bot_running as is_running
    for acc_cfg in _load_accounts() if accounts is None else accounts:
        if str(acc_cfg.get("login")) == str(current) and is_running(str(acc_cfg.get("id"))):
            return (
                f"[TERMINAL] Bu MT5 terminalinde {current} hesabının botu çalışıyor; {login_id} için veri "
                "sorgusu oturumu değiştirmedi. Bu hesabın kendi terminal yolunu (mt5_path) girin."
            )
    return None
