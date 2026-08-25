# src/components/account_selector.py
import streamlit as st
import json
import os
from src.components.dialogs import confirm_delete_account_dialog

ACCOUNTS_FILE = "configs/accounts.json"


@st.cache_data(ttl=3600)
def auto_detect_mt5_paths():
    """Sistemi dondurmadan C diskindeki olası MT5 yollarını bulur."""
    base_dirs = [
        os.environ.get("ProgramFiles", "C:\\Program Files"),
        os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)"),
        "C:\\",
    ]
    found_paths = []
    for base in base_dirs:
        if not os.path.exists(base):
            continue
        try:
            for folder_name in os.listdir(base):
                if "metatrader" in folder_name.lower() or "mt5" in folder_name.lower():
                    exe_path = os.path.join(base, folder_name, "terminal64.exe")
                    normalized_path = exe_path.replace("\\", "/")
                    if os.path.exists(exe_path) and normalized_path not in found_paths:
                        found_paths.append(normalized_path)
        except PermissionError:
            pass
    return found_paths


def load_accounts():
    """configs/accounts.json dosyasından hesap listesini okur ve formatı güvenceye alır."""
    if not os.path.exists(ACCOUNTS_FILE):
        return []
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                return data.get("accounts", [])
            return []
    except Exception as e:
        st.error(f"Hesap dosyası okunamadı: {e}")
        return []


@st.dialog("⚙️ Hesap Yönetimi", width="large")
def account_management_dialog(edit_acc=None):
    accounts = load_accounts()
    login_ids = [str(acc.get("login")) for acc in accounts if acc.get("login")]

    edit_acc = edit_acc or {}
    is_edit = bool(edit_acc)
    old_login = str(edit_acc.get("login", ""))
    k_suf = f"_{old_login}" if is_edit else "_new"

    used_terminals = {
        os.path.normpath(a.get("mt5_path", "")).lower(): a.get(
            "account_name", "Bilinmeyen"
        )
        for a in accounts
        if a.get("mt5_path") and str(a.get("login")) != old_login
    }

    found_terminals = auto_detect_mt5_paths()
    terminal_options = ["Farklı Bir Yol (Manuel Gireceğim)"]
    old_mt5_path = edit_acc.get("mt5_path", "") if is_edit else ""

    for t_path in found_terminals:
        norm_path = os.path.normpath(t_path).lower()
        if norm_path in used_terminals:
            terminal_options.append(f"🔴 Dolu ({used_terminals[norm_path]}) - {t_path}")
        else:
            terminal_options.append(f"🟢 Boşta - {t_path}")

    if (
        is_edit
        and old_mt5_path
        and not any(old_mt5_path in opt for opt in terminal_options)
    ):
        terminal_options.append(f"🟢 Mevcut Adres - {old_mt5_path}")

    st.markdown(f"#### {'✏️ Hesabı Düzenle' if is_edit else '➕ Yeni MT5 Hesabı Ekle'}")

    col1, col2 = st.columns(2)
    with col1:
        new_acc_name = st.text_input(
            "Hesap Adı *",
            value=edit_acc.get("account_name", "") if is_edit else "",
            placeholder="Örn: Canlı Hesap - 1",
            key=f"name{k_suf}",
        ).strip()
        new_login = st.text_input(
            "Hesap No (Login) *",
            value=old_login if is_edit else "",
            placeholder="Örn: 12345678",
            help="Girdiğiniz bu numara aynı zamanda sistemde Hesap ID'si olarak kullanılacaktır.",
            key=f"login{k_suf}",
        ).strip()
        env_opts = ["DEMO", "LIVE"]
        def_env_idx = (
            env_opts.index(edit_acc.get("env_type", "DEMO"))
            if is_edit and edit_acc.get("env_type") in env_opts
            else 0
        )
        new_env = st.selectbox(
            "Çevre (Ortam) *", env_opts, index=def_env_idx, key=f"env{k_suf}"
        )

    with col2:
        new_password = st.text_input(
            "Şifre *",
            value=edit_acc.get("password", "") if is_edit else "",
            type="password",
            placeholder="MT5 Şifresi",
            key=f"pwd{k_suf}",
        ).strip()
        new_server = st.text_input(
            "Sunucu *",
            value=edit_acc.get("server", "") if is_edit else "",
            placeholder="Örn: Eightcap-Demo",
            key=f"srv{k_suf}",
        ).strip()

        def_term_idx = 0
        if is_edit and old_mt5_path:
            # Liste sonuna eklenen elemanın indeksini doğrudan bul
            try:
                def_term_idx = next(
                    i for i, opt in enumerate(terminal_options) if old_mt5_path in opt
                )
            except StopIteration:
                pass

        t_col1, t_col2 = st.columns([0.85, 0.15], vertical_alignment="bottom")
        with t_col1:
            selected_terminal = st.selectbox(
                "MT5 Yolu Seçimi *",
                terminal_options,
                index=def_term_idx,
                help="Listeden kurulu bir MT5 seçebilir veya özel bir adres girebilirsiniz.",
                key=f"term_sel{k_suf}",
            )
        with t_col2:
            if st.button(
                "🔄",
                key=f"rescan_{k_suf}",
                help="Listeyi Yenile (Kurulu terminalleri tekrar tarar)",
            ):
                auto_detect_mt5_paths.clear()
                st.rerun()

        if "Farklı Bir Yol" in selected_terminal:
            new_mt5_path = st.text_input(
                "Özel MT5 Yolu *",
                value=old_mt5_path if is_edit else "",
                placeholder="C:/Program Files/MetaTrader 5/terminal64.exe",
                key=f"term_path{k_suf}",
            ).strip()
        else:
            parsed_path = selected_terminal.split(" - ")[-1].strip()
            new_mt5_path = parsed_path
            if selected_terminal.startswith("🔴 Dolu"):
                st.error(
                    "⚠️ Seçtiğiniz bu MT5 klasörü başka bir hesap tarafından kullanılıyor!"
                )
            st.text_input(
                "Seçilen MT5 Yolu (Otomatik)",
                value=parsed_path,
                disabled=True,
                help="Listeden seçim yaptığınız için otomatik doldurulmuştur.",
                key=f"term_auto{k_suf}",
            ).strip()

    new_notes = st.text_area(
        "📝 Hesap Notu (İsteğe Bağlı)",
        value=edit_acc.get("notes", "") if is_edit else "",
        max_chars=1000,
        placeholder="Bu hesapla ilgili özel notlar... (Maks. 1000 karakter)",
        height=100,
        key=f"notes{k_suf}",
    ).strip()

    btn_col1, btn_col2 = st.columns(2)
    with btn_col1:
        if st.button(
            "💾 Değişiklikleri Kaydet" if is_edit else "💾 Hesabı Ekle",
            width="stretch",
            type="primary",
        ):
            if (
                not new_login
                or not new_acc_name
                or not new_password
                or not new_server
                or not new_mt5_path
            ):
                st.error("🚨 Lütfen yıldızlı tüm zorunlu alanları eksiksiz doldurun!")
            else:
                other_logins = [x for x in login_ids if x != old_login]
                if str(new_login) in other_logins:
                    st.error(
                        f"🚫 Hata: '{new_login}' numaralı hesap zaten sisteme kayıtlı!"
                    )
                else:
                    norm_new_path = os.path.normpath(new_mt5_path).lower()
                    if norm_new_path in used_terminals:
                        st.error(
                            f"🚨 HATA: Bu MT5 terminali halihazırda '{used_terminals[norm_new_path]}' hesabı tarafından kullanılıyor!"
                        )
                    else:
                        try:
                            login_val = int(new_login.strip())
                        except ValueError:
                            login_val = new_login.strip()

                        new_account_data = {
                            "id": str(new_login).strip(),
                            "account_name": new_acc_name.strip(),
                            "env_type": new_env.strip(),
                            "login": login_val,
                            "password": new_password.strip(),
                            "server": new_server.strip(),
                            "mt5_path": new_mt5_path.strip().replace("\\", "/"),
                            "notes": new_notes.strip(),
                        }

                        if is_edit:
                            for idx, a in enumerate(accounts):
                                if str(a.get("login")) == old_login:
                                    accounts[idx] = new_account_data
                                    break
                        else:
                            accounts.append(new_account_data)

                        try:
                            os.makedirs(os.path.dirname(ACCOUNTS_FILE), exist_ok=True)
                            with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
                                json.dump(
                                    {"accounts": accounts},
                                    f,
                                    indent=4,
                                    ensure_ascii=False,
                                )

                            st.session_state.selected_account = new_account_data
                            st.session_state.close_popover = True
                            st.rerun()
                        except Exception as e:
                            st.error(f"Kayıt sırasında hata oluştu: {e}")

    with btn_col2:
        if st.button("❌ İptal", width="stretch"):
            st.session_state.close_popover = True
            st.rerun()


def render_account_selector():
    """Ana ekran için hibrit (Button + Selectbox) hesap seçim menüsünü oluşturur."""

    # 🌟 Popover'ı (Açılır Menü) Kapatma Hilesi (Modern Versiyon)
    if st.session_state.get("close_popover"):
        st.session_state.close_popover = False
        st.html("<script>window.parent.document.body.click();</script>")

    accounts = load_accounts()

    if not accounts:
        st.warning(
            "Hiç hesap bulunamadı! Lütfen aşağıdaki butona tıklayarak ilk hesabınızı sisteme kaydedin."
        )
        st.session_state.selected_account = None
        if st.button("➕ İlk Hesabını Ekle", type="primary"):
            account_management_dialog(None)

    # ==========================================
    # ÇİFT LOGİN (DUPLICATE) KONTROLÜ
    # ==========================================
    login_ids = [
        str(acc.get("login")) for acc in accounts if acc.get("login") is not None
    ]
    duplicate_logins = set([x for x in login_ids if login_ids.count(x) > 1])

    if duplicate_logins:
        dup_str = ", ".join(duplicate_logins)
        st.error(
            f"🚨 **DİKKAT - AYNI HESAP ID'Sİ TEKRARLIYOR:** `accounts.json` dosyasında şu Login ID'leri birden fazla kez kullanılmış: **{dup_str}**.\n\n"
            "Lütfen dosyayı kontrol edip mükerrer (çift) kayıtları silin veya ID'leri düzeltin!"
        )

    if accounts:
        if (
            "selected_account" not in st.session_state
            or st.session_state.selected_account is None
        ):
            st.session_state.selected_account = accounts[0]

        active_account = st.session_state.selected_account
        active_login = active_account.get(
            "login", active_account.get("id", "Bilinmeyen")
        )
        active_name = active_account.get(
            "account_name", active_account.get("name", "Bilinmeyen Hesap")
        )
        active_type = active_account.get("env_type", active_account.get("type", "DEMO"))
    else:
        active_account = {}
        active_login = "Bilinmeyen"
        active_name = "Hesap Yok"
        active_type = "DEMO"

    is_running = st.session_state.get("robot_running", False)

    # 1. Buton Renk Stili ve Üst Boşluk Temizliği
    st.markdown(
        "<style>"
        ".block-container { padding-top: 2rem !important; } "
        "button[kind='primary'] { background-color: #198754 !important; border-color: #198754 !important; color: white !important; } "
        "button[kind='primary']:hover { background-color: #157347 !important; border-color: #146c43 !important; }"
        "</style>",
        unsafe_allow_html=True,
    )

    # 2. Temiz ve Şık Buton Menüsü
    MAX_BUTTONS = 4
    num_accounts = len(accounts)
    has_extra = 1 if num_accounts > MAX_BUTTONS else 0

    col_ratios = [1] * (min(num_accounts, MAX_BUTTONS) + has_extra) + [0.15]
    cols = st.columns(col_ratios)

    for i, acc in enumerate(accounts[:MAX_BUTTONS]):
        acc_type = acc.get("env_type", acc.get("type", "DEMO"))
        acc_name = acc.get("account_name", acc.get("name", "Bilinmeyen Hesap"))
        acc_login = acc.get("login", acc.get("id", "Bilinmeyen ID"))

        btn_icon = "🔴" if acc_type == "LIVE" else "🧪"
        btn_label = f"{btn_icon} {acc_login} - {acc_name}"
        is_active = str(acc.get("login", acc.get("id"))) == str(active_login)

        # 🌟 TOOLTIP HAZIRLIĞI (Null Koruması + Markdown Alt Satır + Uzunluk Sınırı)
        raw_note = str(acc.get("note", acc.get("notes", "")))
        if raw_note and raw_note.strip() != "None":
            # Ekranı kaplamasını önlemek için ilk 500 karakteri al
            if len(raw_note) > 500:
                raw_note = raw_note[:497] + "..."

            # Windows ve Unix satır sonlarını Markdown alt satırına (iki boşluk + \n) çevir
            formatted_tooltip = raw_note.replace("\r\n", "\n").replace("\n", "  \n")
        else:
            formatted_tooltip = "📌 Bu hesap için henüz bir not eklenmemiş."

        if cols[i].button(
            btn_label,
            key=f"btn_{i}_{acc_login}",
            type="primary" if is_active else "secondary",
            use_container_width=True,
            help=formatted_tooltip,  # 👈 Tooltip entegrasyonu
        ):
            st.session_state.selected_account = acc
            st.rerun()

    # Eğer 4'ten fazla hesap varsa, geri kalanı açılır menüye koy
    if num_accounts > MAX_BUTTONS:
        extra_accounts = accounts[MAX_BUTTONS:]
        extra_options = {}
        for a in extra_accounts:
            a_type = a.get("env_type", a.get("type", "DEMO"))
            a_name = a.get("account_name", a.get("name", "Bilinmeyen Hesap"))
            a_login = a.get("login", a.get("id", "Bilinmeyen ID"))

            extra_options[
                f"{'🔴' if a_type=='LIVE' else '🧪'} {a_login} - {a_name}"
            ] = a

        selected_extra_name = cols[MAX_BUTTONS].selectbox(
            "Diğer:",
            options=["Diğer Hesaplar..."] + list(extra_options.keys()),
            label_visibility="collapsed",
        )

        if selected_extra_name != "Diğer Hesaplar...":
            selected_acc = extra_options[selected_extra_name]
            selected_acc_login = selected_acc.get("login", selected_acc.get("id"))
            if str(selected_acc_login) != str(active_login):
                st.session_state.selected_account = selected_acc
                st.rerun()

    # --- EN SAĞDAKİ ÜÇ NOKTA (POPOVER) MENÜSÜ ---
    with cols[-1].popover("⋮", width="stretch"):

        # 🌟 YENİ: En Güncel Log Dosyasını Klasör Tarayarak Bulma (Gelişmiş)
        try:
            log_data = None
            active_login = active_account.get("login", "hesap")
            log_filename = f"MT5_{active_login}_latest.log"

            target_log_dirs = []

            # 1. MT5 Çalışıyorsa Anlık Data Path Klasörünü Al
            try:
                import MetaTrader5 as mt5
                term_info = mt5.terminal_info()
                if term_info and hasattr(term_info, "data_path"):
                    target_log_dirs.append(os.path.join(term_info.data_path, "Logs"))
            except Exception:
                pass

            # 2. Hesabın mt5_path Bilgisinden AppData İçindeki Logs Klasörünü Bul
            active_mt5_path = active_account.get("mt5_path", "")
            if active_mt5_path:
                appdata_base = os.path.expandvars(r"%APPDATA%\MetaQuotes\Terminal")
                if os.path.exists(appdata_base):
                    target_dir = os.path.dirname(active_mt5_path)
                    norm_target_dir = os.path.normpath(target_dir).lower()

                    for terminal_hash in os.listdir(appdata_base):
                        hash_dir = os.path.join(appdata_base, terminal_hash)
                        origin_txt = os.path.join(hash_dir, "origin.txt")

                        if os.path.exists(origin_txt):
                            try:
                                with open(origin_txt, "r", encoding="utf-16-le", errors="ignore") as f:
                                    orig_path = f.read().strip().replace("\x00", "").lower()
                                if os.path.normpath(orig_path) == norm_target_dir:
                                    target_log_dirs.append(os.path.join(hash_dir, "Logs"))
                                    break
                            except Exception:
                                pass

                # Yedek Yol: Kurulum Dizinindeki Log Klasörleri (Tekrarsız Ekleme)
                term_dir = os.path.dirname(active_mt5_path)
                for backup_dir in [
                    os.path.join(term_dir, "MQL5", "Logs"),
                    os.path.join(term_dir, "logs"),
                ]:
                    if backup_dir not in target_log_dirs:
                        target_log_dirs.append(backup_dir)

            # Bulunan Klasörlerdeki En Son Güncellenmiş (.log) Dosyasını Seç
            for log_dir in target_log_dirs:
                if os.path.exists(log_dir):
                    try:
                        log_files = [f for f in os.listdir(log_dir) if f.endswith(".log")]
                        if log_files:
                            # Tarihe/isme göre sondan başa sırala (Örn: 20260810.log en başa gelir)
                            log_files.sort(reverse=True) 
                            latest_log_path = os.path.join(log_dir, log_files[0])

                            with open(latest_log_path, "rb") as f:
                                log_data = f.read()

                            log_filename = f"MT5_{active_login}_{log_files[0]}"
                            break
                    except Exception:
                        pass

            if log_data:
                st.download_button(
                    label="📥 MT5 Logunu İndir",
                    data=log_data,
                    file_name=log_filename,
                    mime="text/plain",
                    use_container_width=True,
                )
            else:
                st.button("📥 MT5 Logu Bulunamadı", disabled=True, use_container_width=True)
        except Exception:
            st.button("📥 MT5 Logu Okunamadı", disabled=True, use_container_width=True)

        if st.button(
            "✏️ Seçili Hesabı Düzenle",
            width="stretch",
            disabled=not accounts or is_running,
            key="popover_edit_btn",
        ):
            account_management_dialog(active_account)

        if st.button(
            "🗑️ Seçili Hesabı Sil",
            width="stretch",
            disabled=not accounts or is_running,
            key="popover_delete_btn",
        ):

            def delete_current_account():
                new_accounts = [
                    a
                    for a in accounts
                    if str(a.get("login")) != str(active_account.get("login"))
                ]
                try:
                    os.makedirs(os.path.dirname(ACCOUNTS_FILE), exist_ok=True)
                    with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
                        json.dump(
                            {"accounts": new_accounts}, f, indent=4, ensure_ascii=False
                        )
                    st.session_state.selected_account = (
                        new_accounts[0] if new_accounts else None
                    )
                except Exception as e:
                    st.error(f"Silme sırasında hata: {e}")

            confirm_delete_account_dialog(active_name, delete_current_account)

        if st.button(
            "➕ Yeni Hesap Ekle",
            width="stretch",
            type="primary",
            key="popover_add_btn",
        ):
            account_management_dialog(None)

    return st.session_state.selected_account
