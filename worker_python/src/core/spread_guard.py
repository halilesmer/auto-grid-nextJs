"""ENG-31: kurulum bazlı spread kararı; MT5 yan etkileri aşağıdaki adaptörde."""
import json
import math
import os
from statistics import median

from src.core import clock
from src.utils.zone_magic import zone_magic

WINDOW = 86400
MIN_SAMPLES = 60
RECOVERY_SECONDS = 30


def validate_spread_guard(zone):
    """API / dosya sınırı: açık koruma için gerekli değerler pozitif olmalı."""
    cfg = zone.get("spread_guard")
    if cfg is None:
        return
    if not isinstance(cfg, dict) or not isinstance(cfg.get("enabled", False), bool):
        raise ValueError("spread_guard: enabled must be boolean")
    if not cfg.get("enabled", False):
        return
    mode = cfg.get("mode")
    if mode not in ("fixed", "relative", "grid"):
        raise ValueError("spread_guard: invalid mode")
    if mode == "grid" and zone.get("entry_mode") == "fractal":
        raise ValueError("spread_guard: grid mode requires grid entry")
    required = [dict(fixed="max_spread", relative="multiplier", grid="grid_percent")[mode]]
    if mode == "relative":
        if cfg.get("bootstrap") not in ("wait", "manual"):
            raise ValueError("spread_guard: invalid bootstrap")
        if cfg["bootstrap"] == "manual":
            required.append("initial_spread")
    for name in required:
        value = cfg.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"spread_guard: {name} must be positive and finite")


def tick_spread(tick, wall, digits):
    if tick is None:
        return None
    bid, ask = getattr(tick, "bid", None), getattr(tick, "ask", None)
    stamp = (getattr(tick, "time_msc", 0) or 0) / 1000 or getattr(tick, "time", 0)
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (bid, ask, stamp)):
        return None
    if bid <= 0 or ask < bid or stamp <= 0 or not (0 <= wall - stamp <= 60):
        return None
    return round(ask - bid, digits)


class SpreadGuard:
    def __init__(self):
        self.histories = {}
        self.status = {}
        self.zones = {}
        self.infos = {}
        self.latches = {}
        self.recovery = {}
        self.loaded = False
        self.path = None
        self.dirty = False
        self.logged = {}
        # Broker saat kanıtı bot oturumunda kalır; öğrenme dosyasına yazılmaz.
        self.tick_account = None
        self.tick_offset = None
        self.tick_candidates = {}

    def configure(self, zones, infos):
        self.zones = {zone_magic(z, i): (i, z) for i, z in enumerate(zones)}
        self.infos = infos
        for magic in set(self.status) | set(self.latches):
            if magic not in self.zones:
                self.status.pop(magic, None)
                self.latches.pop(magic, None)
                self.recovery.pop(magic, None)
                self.dirty = True

    def threshold(self, magic):
        i, z = self.zones[magic]
        cfg = z["spread_guard"]
        if cfg["mode"] == "fixed":
            return cfg["max_spread"]
        if cfg["mode"] == "relative":
            h = self.histories.get(z["symbol"], {})
            ref = h.get("reference") if len(h.get("samples", [])) >= MIN_SAMPLES else None
            if ref is None and cfg["bootstrap"] == "manual":
                ref = cfg["initial_spread"]
            return ref * cfg["multiplier"] if ref is not None else None
        from src.core.grid_execution.config import extract_zone_config

        c = extract_zone_config(z, i, symbol_infos=self.infos)
        steps = []
        if c.order_type in ("BUY", "BOTH"):
            steps.append(c.grid_step)
        if c.order_type in ("SELL", "BOTH"):
            steps.append(c.sell_grid_step)
        if not steps or any(not math.isfinite(step) or step <= 0 for step in steps):
            raise ValueError("spread_guard: invalid grid distance")
        return min(steps) * cfg["grid_percent"] / 100

    def observe(self, spreads, wall):
        learned_symbols = {z["symbol"] for _, z in self.zones.values()
                           if (z.get("spread_guard") or {}).get("enabled") and z["spread_guard"].get("mode") == "relative"}
        for symbol in learned_symbols:
            h = self.histories.setdefault(symbol, {"samples": [], "reference": None})
            samples = [s for s in h["samples"] if wall - WINDOW < s[0] <= wall]
            if samples != h["samples"]:
                self.dirty = True
            h["samples"] = samples
            if len(samples) < MIN_SAMPLES:
                h["reference"] = None
            spread = spreads.get(symbol)
            if spread is None or (samples and int(samples[-1][0] // 60) == int(wall // 60)):
                continue
            # Eşiği eski referansla kontrol et: bu tick'in geniş spread'i önce sınırı yükseltmesin.
            frozen = False
            for magic, (_, z) in self.zones.items():
                if z["symbol"] != symbol or not (z.get("spread_guard") or {}).get("enabled") or z["spread_guard"].get("mode") != "relative":
                    continue
                latch = self.latches.get(magic)
                try:
                    validate_spread_guard(z)
                    live_limit = self.threshold(magic)
                except (ValueError, TypeError, KeyError):
                    continue
                # Süresi dolan öğrenme verisi yeniden toplanmalı; eski kilit öğrenmeyi durdurmasın.
                old_limit = latch["limit"] if latch and live_limit is not None else live_limit
                if old_limit is not None and (spread > old_limit or latch is not None):
                    frozen = True
            # Yüksek spread örnekleri normal referansa katılmaz; ilk öğrenme her durumda sürer.
            if len(samples) < MIN_SAMPLES or not frozen:
                samples.append([wall, spread])
                if len(samples) >= MIN_SAMPLES:
                    h["reference"] = median(s[1] for s in samples)
                self.dirty = True

    def evaluate(self, magic, spread, monotonic):
        from src.core.grid_execution.exceptions import InvalidZoneConfigError
        _, z = self.zones[magic]
        cfg = (z.get("spread_guard") or {})
        if not cfg.get("enabled", False):
            if magic in self.latches:
                self.dirty = True
            self.latches.pop(magic, None)
            self.recovery.pop(magic, None)
            self.status.pop(magic, None)
            return True
        try:
            validate_spread_guard(z)
            limit = self.threshold(magic)
            if limit is not None and not math.isfinite(limit):
                raise ValueError("spread_guard: non-finite threshold")
            reason = "learning" if limit is None else "ready"
        except (ValueError, TypeError, KeyError, InvalidZoneConfigError):
            limit, reason = None, "invalid_settings"
        signature = json.dumps([z["symbol"], cfg], sort_keys=True)
        latch = self.latches.get(magic)
        if latch and latch["signature"] != signature:
            self.latches.pop(magic, None)
            self.recovery.pop(magic, None)
            self.dirty = True
            latch = None
        if latch and latch["limit"] is not None:
            limit = latch["limit"]
        if spread is None:
            reason = "invalid_tick"
        elif limit is not None and spread > limit:
            reason = "high"
        if reason != "ready":
            if not latch:
                self.latches[magic] = {"signature": signature, "limit": limit}
                self.dirty = True
            elif latch["limit"] is None and limit is not None:
                latch["limit"] = limit
                self.dirty = True
            self.recovery.pop(magic, None)
            blocked = True
        elif latch:
            # Yeni öğrenilen sınır da 30 sn toparlanma koşulundan geçer.
            if latch["limit"] is None:
                latch["limit"] = limit
                self.dirty = True
            if spread < limit * 0.8:
                start = self.recovery.setdefault(magic, monotonic)
                if monotonic - start >= RECOVERY_SECONDS:
                    self.latches.pop(magic)
                    self.recovery.pop(magic, None)
                    self.dirty = True
                    blocked = False
                else:
                    blocked, reason = True, "recovering"
            else:
                self.recovery.pop(magic, None)
                blocked, reason = True, "recovering"
        else:
            blocked = False
        h = self.histories.get(z["symbol"], {})
        self.status[magic] = {"blocked": blocked, "reason": reason, "spread": spread, "limit": limit,
                              "samples": len(h.get("samples", [])), "reference": h.get("reference"),
                              "recovery_seconds": max(0, RECOVERY_SECONDS - (monotonic - self.recovery[magic]))
                              if magic in self.recovery else RECOVERY_SECONDS if blocked else 0,
                              "updated_at": clock.wall()}
        return not blocked

    def load(self):
        if self.loaded:
            return
        from src.utils.paths import get_spread_state_path
        from src.core.grid_helpers import log_message

        self.path = get_spread_state_path(os.environ.get("ACTIVE_ACCOUNT_ID", "default"))
        self.loaded = True
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
            for symbol, h in data["histories"].items():
                if not isinstance(symbol, str) or not isinstance(h, dict):
                    raise ValueError("invalid spread history")
                samples = h["samples"]
                if not isinstance(samples, list) or any(not isinstance(s, list) or len(s) != 2 or
                    not all(isinstance(v, (int, float)) and math.isfinite(v) for v in s) or s[1] < 0 for s in samples):
                    raise ValueError("invalid spread samples")
                ref = h.get("reference")
                if ref is not None and (not isinstance(ref, (int, float)) or not math.isfinite(ref) or ref < 0):
                    raise ValueError("invalid spread reference")
            latches = data.get("latches", {})
            for key, latch in latches.items():
                int(key)
                if not isinstance(latch.get("signature"), str) or (latch.get("limit") is not None and
                    (not isinstance(latch["limit"], (int, float)) or not math.isfinite(latch["limit"]) or latch["limit"] < 0)):
                    raise ValueError("invalid spread latch")
            self.histories = data["histories"]
            self.latches = {int(k): v for k, v in latches.items()}
        except FileNotFoundError:
            pass  # İlk çalıştırma: referans henüz yok, yapılandırılmış başlangıç kuralı uygulanır.
        except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
            log_message(f"Spread öğrenme kaydı okunamadı, yeniden öğrenilecek: {exc}", "WARN")

    def save(self):
        if not self.dirty or not self.path:
            return
        from src.core.grid_helpers import log_message

        try:
            with open(self.path + ".tmp", "w", encoding="utf-8") as f:
                json.dump({"histories": self.histories, "latches": self.latches}, f, allow_nan=False)
            os.replace(self.path + ".tmp", self.path)
            self.dirty = False
        except OSError as exc:
            # Karar hafızada korunur; kayıt sonraki turda tekrar denenir.
            if self.logged.get("save") != str(exc):
                log_message(f"Spread öğrenme kaydı yazılamadı: {exc}", "WARN")
                self.logged["save"] = str(exc)


def _broker_tick_wall(guard, account, symbol, tick, wall):
    """İlerleyen tick ile broker farkını doğrula; eski tick için farkı değiştirme."""
    identity = (account.login, getattr(account, "server", None))
    if guard.tick_account != identity:
        guard.tick_account = identity
        guard.tick_offset = None
        guard.tick_candidates.clear()
    if guard.tick_offset is not None:
        return wall + guard.tick_offset

    # UTC tick ve parite girdileri zaten doğru zaman tabanını kullanır.
    if tick_spread(tick, wall, 8) is not None:
        guard.tick_offset = 0
        return wall
    stamp = (getattr(tick, "time_msc", 0) or 0) / 1000 or getattr(tick, "time", 0)
    if not isinstance(stamp, (int, float)) or not math.isfinite(stamp) or stamp <= 0:
        guard.tick_candidates.pop(symbol, None)
        return None
    offset = round((stamp - wall) / 1800) * 1800
    age = wall + offset - stamp
    # Fark ölçümü 60 saniyelik giriş sınırından daha taze tick ister.
    if not -12 * 3600 <= offset <= 14 * 3600 or not 0 <= age <= 2 or tick_spread(tick, wall + offset, 8) is None:
        guard.tick_candidates.pop(symbol, None)
        return None
    previous = guard.tick_candidates.get(symbol)
    if previous is not None:
        old_stamp, old_wall, old_offset = previous
        elapsed = wall - old_wall
        progress = stamp - old_stamp
        if old_offset == offset and 1 <= elapsed <= 60 and progress >= 1 and abs(progress - elapsed) <= 2:
            guard.tick_offset = offset
            guard.tick_candidates.clear()
            return wall + offset
        if stamp == old_stamp:
            return None  # Aynı tick tekrar okununca broker saatinin ilerlediği kanıtlanmaz.
    guard.tick_candidates[symbol] = (stamp, wall, offset)
    return None


def _read_spread(mt5, symbol, infos):
    info = infos.get(symbol)
    digits = info.get("digits", 8) if isinstance(info, dict) else getattr(info, "digits", 8)
    from src.core.state import state

    if mt5 is None:
        return None
    account = mt5.account_info()
    tick = mt5.symbol_info_tick(symbol)
    if account is None or tick is None:
        state.spread_guard.tick_candidates.pop(symbol, None)
        return None
    broker_wall = _broker_tick_wall(state.spread_guard, account, symbol, tick, clock.wall())
    return tick_spread(tick, broker_wall, digits) if broker_wall is not None else None


def _clear_blocked(mt5, guard):
    from src.core.grid_orders import get_all_robot_orders, cancel_order

    orders = get_all_robot_orders(mt5)
    if orders is None:
        return
    for order in orders:
        if guard.status.get(order.magic, {}).get("blocked") and order.symbol == guard.zones[order.magic][1]["symbol"]:
            cancel_order(mt5, order)


def refresh_spread_guard(mt5, zones, infos):
    from src.core.state import state
    from src.core.grid_helpers import log_message

    guard = state.spread_guard
    if not any((z.get("spread_guard") or {}).get("enabled") for z in zones) and not guard.loaded:
        return
    guard.load()
    guard.configure(zones, infos)
    symbols = {z["symbol"] for z in zones if (z.get("spread_guard") or {}).get("enabled")}
    spreads = {s: _read_spread(mt5, s, infos) for s in symbols}
    guard.observe(spreads, clock.wall())
    for magic, (_, zone) in guard.zones.items():
        guard.evaluate(magic, spreads.get(zone.get("symbol")), clock.monotonic())
        current = guard.status.get(magic)
        if current and guard.logged.get(magic) != current["reason"]:
            log_message(f"Spread koruması: {zone['symbol']} | magic {magic} | {current['reason']} | "
                        f"spread {current['spread']} | sınır {current['limit']}", "WARN" if current["blocked"] else "INFO")
            guard.logged[magic] = current["reason"]
    _clear_blocked(mt5, guard)
    guard.save()


def entry_allowed(mt5, magic):
    """Gönderimden hemen önce yeniden oku; yeni yüksek spread'de emirleri de temizle."""
    from src.core.state import state

    guard = state.spread_guard
    if magic not in guard.zones:
        return True
    zone = guard.zones[magic][1]
    allowed = guard.evaluate(magic, _read_spread(mt5, zone["symbol"], guard.infos), clock.monotonic())
    if not allowed:
        _clear_blocked(mt5, guard)
    guard.save()
    return allowed
