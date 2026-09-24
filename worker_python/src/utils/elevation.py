# src/utils/elevation.py
"""Worker "Als Administrator" mı çalışıyor? (Windows UAC)

Sorun: Görev Zamanlayıcı'daki "en yüksek haklar" veya "Yönetici olarak çalıştır" ile açılan
worker/bot/izleme pencereleri, normal haklarla çalışan süreçler tarafından ne görülebilir
(komut satırı boş) ne de sonlandırılabilir. cleanup_old_instances.ps1 onları bulamaz, eski
izleme döngüleri yenileriyle yarışır ve admin worker `git pull` yaparsa depodaki dosyalar
yöneticiye ait olur (sonraki normal güncellemeler "Permission denied" ile düşer).

Ölçüt TokenElevationTypeFull: bu süreç yükseltilmiş, aynı kullanıcının normal süreçleri ise
kısıtlı çalışıyor (UAC split token). Yerleşik "Administrator" hesabı veya UAC kapalıysa her şey
aynı haklarla çalışır (TokenElevationTypeDefault) → sorun yok, False.
"""
import os

# TOKEN_ELEVATION_TYPE: 1 = Default (bölünmüş token yok), 2 = Full (yükseltilmiş), 3 = Limited
_TOKEN_QUERY = 0x0008
_TOKEN_ELEVATION_TYPE_CLASS = 18
_TOKEN_ELEVATION_TYPE_FULL = 2

ELEVATED_HINT = (
    "Worker yönetici (Administrator) haklarıyla çalışıyor. Normal haklı süreçler onu ve "
    "başlattığı botları durduramaz; güncellemeler depodaki dosyaları yöneticiye ait yapardı. "
    "Mac'te VPS sayfası → 'Admin-Prozesse beenden' ile düzeltin (start.bat'ı 'Yönetici olarak "
    "çalıştır' ile açmayın)."
)


def _elevation_type():
    """Bu sürecin TOKEN_ELEVATION_TYPE değeri; okunamazsa (veya Windows değilse) None."""
    if os.name != "nt":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        advapi32.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
        advapi32.OpenProcessToken.restype = wintypes.BOOL
        advapi32.GetTokenInformation.argtypes = [
            wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD),
        ]
        advapi32.GetTokenInformation.restype = wintypes.BOOL

        token = wintypes.HANDLE()
        if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), _TOKEN_QUERY, ctypes.byref(token)):
            return None
        try:
            value = ctypes.c_int(0)
            size = wintypes.DWORD(0)
            ok = advapi32.GetTokenInformation(
                token, _TOKEN_ELEVATION_TYPE_CLASS, ctypes.byref(value), ctypes.sizeof(value), ctypes.byref(size)
            )
            return value.value if ok else None
        finally:
            kernel32.CloseHandle(token)
    except Exception:
        return None


def is_elevated() -> bool:
    """True: bu süreç yükseltilmiş, aynı kullanıcının normal süreçleri kısıtlı (bkz. modül notu)."""
    return _elevation_type() == _TOKEN_ELEVATION_TYPE_FULL
