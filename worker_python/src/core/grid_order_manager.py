from src.core.grid_helpers import (
    log_message,
    normalize_price,
    zone_log_id,
    zone_label,
)
from src.core.grid_execution.config import extract_zone_config, is_fractal_zone, max_positions_of
from src.core.grid_execution.exceptions import InvalidZoneConfigError
from src.core.grid_execution.levels import level_tolerance
from src.core.grid_orders import (
    MAX_DEVIATION,
    cancel_order,
    get_all_robot_orders,
    get_all_robot_positions,
    modify_position_tp_sl,
    remaining_lot_at_level,
    send_pending_order_helper,
    zone_index_by_magic,
    zone_magic,
)
from src.core import clock
from src.core.state import state
from src.utils.trade_utils import safe_send_order, TradeState

MARKET_CLOSED_RETCODE = 10018
# Reddedilen çıkış kapatması bu kadar saniye sonra yeniden denenir (10018'de piyasa kapalı aralığı)
EXIT_CLOSE_RETRY_SECONDS = 10


def clean_zombie_orders(mt5, robot_orders, zones, active_zones_state):
    # Emrin bölgesi magic'ten bulunur (sıra değil): listede olmayan magic silinmiş bölgenindir
    index_by_magic = zone_index_by_magic(zones)
    for order in robot_orders:
        order_zone_idx = index_by_magic.get(order.magic, -1)
        is_zone_active = False
        zone_sym = ""
        if 0 <= order_zone_idx < len(zones):
            is_zone_active = (
                str(zones[order_zone_idx].get("is_active", True)).lower() != "false"
            )
            zone_sym = str(zones[order_zone_idx].get("symbol", "")).upper().strip()

        if active_zones_state.get(order_zone_idx) in ["PAUSE", "AUTO_CLEAR", "CLEAR"]:
            is_zone_active = False

        if not is_zone_active or (zone_sym and order.symbol != zone_sym):
            dir_str = (
                "BUY"
                if order.type in [mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP]
                else "SELL"
            )
            zone_text = zone_label(order_zone_idx, zones) if order_zone_idx >= 0 else f"(silinmiş, magic {order.magic})"
            log_message(
                f"🧹 Mutlak Temizlik: {zone_text} pasif/uyumsuz olduğu için {dir_str} emri iptal ediliyor. (Bilet: {order.ticket}, Sembol: {order.symbol})",
                zone_id=zone_log_id(zones[order_zone_idx], order_zone_idx) if 0 <= order_zone_idx < len(zones) else None,
            )
            cancel_order(mt5, order)


def _tpsl_on_wrong_side(mt5, direction, tp, sl, symbol, symbol_infos):
    """Yeni TP/SL mevcut fiyata göre geçersiz mi? (MT5 10016 "Invalid stops" verirdi.)

    Örn. ayarlarda TP küçültüldü ve fiyat yeni TP'yi zaten geçti: BUY pozisyonun TP'si Bid'in
    altında kalır. Modify her döngüde reddedilip yeniden gönderiliyordu (24.09: 1.083 red).
    Kural (MT5): BUY → TP - Bid >= stops, Bid - SL >= stops; SELL → Ask - TP >= stops,
    SL - Ask >= stops. Fiyat okunamazsa False (karar MT5'e kalır).
    """
    tick = mt5.symbol_info_tick(symbol) if mt5 else None
    if tick is None:
        return False
    info = symbol_infos.get(symbol)
    stops = 0.0
    if info is not None and not isinstance(info, dict):
        stops = float(getattr(info, "trade_stops_level", 0) or 0) * float(getattr(info, "point", 0) or 0)
    eps = 1e-9
    if direction == "BUY":
        bid = float(tick.bid)
        return (tp > 0 and tp - bid < stops - eps) or (sl > 0 and bid - sl < stops - eps)
    ask = float(tick.ask)
    return (tp > 0 and ask - tp < stops - eps) or (sl > 0 and sl - ask < stops - eps)


def process_partial_fills_and_tpsl(
    mt5,
    robot_positions,
    robot_orders,
    zones,
    symbol_infos,
    active_zones_state,
    consecutive_errors,
):
    live_tickets = {p.ticket for p in robot_positions}
    live_ids = {getattr(p, "identifier", 0) or p.ticket for p in robot_positions}
    for ticket in [t for t in state.tpsl_blocked_logged if t not in live_tickets]:
        del state.tpsl_blocked_logged[ticket]
    for ident in [i for i in state.opening_volumes if i not in live_ids]:
        del state.opening_volumes[ident]

    processed_prices = set()
    index_by_magic = zone_index_by_magic(zones)
    for pos in robot_positions:
        # Silinmiş bölgenin pozisyonu (magic listede yok) başka bölgenin TP/SL'ini almaz
        pos_zone_idx = index_by_magic.get(pos.magic, -1)
        if not (0 <= pos_zone_idx < len(zones)):
            continue
        z_data = zones[pos_zone_idx]
        zone_sym = str(z_data.get("symbol", "")).upper().strip()
        if not zone_sym or pos.symbol != zone_sym:
            continue
        # Fraktal bölgesi: SL/TP emirle birlikte fraktaldan hesaplandı (elle değişiklik de korunur);
        # ızgara TP/SL senkronu ve kısmi dolum tamamlaması uygulanmaz
        if is_fractal_zone(z_data):
            continue

        direction = "BUY" if pos.type == mt5.POSITION_TYPE_BUY else "SELL"
        # TP/SL ve grid adımı ızgarayla aynı kaynaktan (step_by_loss: tutar → fiyat mesafesi)
        try:
            cfg = extract_zone_config(z_data, pos_zone_idx, symbol_infos=symbol_infos)
        except InvalidZoneConfigError:
            continue
        if direction == "BUY":
            tp_val, sl_val = cfg.take_profit, cfg.stop_loss
        else:
            tp_val, sl_val = cfg.sell_take_profit, cfg.sell_stop_loss

        expected_tp = (
            normalize_price(pos.price_open + tp_val, zone_sym, symbol_infos)
            if direction == "BUY"
            else normalize_price(pos.price_open - tp_val, zone_sym, symbol_infos)
        )
        expected_sl = 0.0
        if sl_val > 0:
            expected_sl = (
                normalize_price(pos.price_open - sl_val, zone_sym, symbol_infos)
                if direction == "BUY"
                else normalize_price(pos.price_open + sl_val, zone_sym, symbol_infos)
            )

        pos_tp = pos.tp if pos.tp else 0.0
        pos_sl = pos.sl if pos.sl else 0.0

        if (
            abs(float(pos_tp) - float(expected_tp)) > 0.00001
            or abs(float(pos_sl) - float(expected_sl)) > 0.00001
        ):
            if _tpsl_on_wrong_side(mt5, direction, expected_tp, expected_sl, zone_sym, symbol_infos):
                # Her döngü reddedilecek modify yerine bekle; fiyat uygun olunca ayarlanır
                key = (expected_tp, expected_sl)
                if state.tpsl_blocked_logged.get(pos.ticket) != key:
                    state.tpsl_blocked_logged[pos.ticket] = key
                    log_message(
                        f"⏸️ TP/SL Bekliyor: {zone_label(pos_zone_idx, zones)} | Bilet {pos.ticket} için yeni TP {expected_tp}"
                        f"{f' / SL {expected_sl}' if expected_sl else ''} fiyatın yanlış tarafında (MT5 reddederdi). "
                        "Fiyat uygun olunca ayarlanır.",
                        "WARN",
                        zone_id=zone_log_id(z_data, pos_zone_idx),
                    )
            else:
                state.tpsl_blocked_logged.pop(pos.ticket, None)
                log_message(
                    f"🔄 Açık Pozisyon Güncellemesi: {zone_label(pos_zone_idx, zones)} | Bilet {pos.ticket} için yeni TP/SL ayarlanıyor.",
                    zone_id=zone_log_id(z_data, pos_zone_idx),
                )
                modify_position_tp_sl(mt5, pos, expected_tp, expected_sl, symbol_infos)

        tolerance_step = level_tolerance(
            cfg, cfg.grid_step if direction == "BUY" else cfg.sell_grid_step, symbol_infos
        )

        is_processed = any(
            direction == p_dir
            and abs(round(pos.price_open, 5) - round(p_price, 5))
            <= round(tolerance_step, 5)
            for p_dir, p_price in processed_prices
        )
        if is_processed:
            continue
        processed_prices.add((direction, pos.price_open))

        # Max-pozisyon koruması (grid_execution/handler) bu bölgenin bekleyen emirlerini her
        # döngü siler; burada emir koymak sonsuz gönder/sil döngüsü olurdu
        zone_positions = sum(1 for p in robot_positions if p.magic == pos.magic)
        if zone_positions >= max_positions_of(z_data):
            continue

        positions_at_level = [
            p
            for p in robot_positions
            if p.magic == pos.magic
            and p.type == pos.type
            and abs(round(p.price_open, 5) - round(pos.price_open, 5))
            <= round(tolerance_step, 5)
        ]
        remaining_lot = remaining_lot_at_level(mt5, positions_at_level, zone_sym, symbol_infos)
        if remaining_lot <= 0:
            continue

        has_pending = any(
            o.magic == pos.magic
            and abs(round(o.price_open, 5) - round(pos.price_open, 5))
            <= round(tolerance_step, 5)
            for o in robot_orders
        )
        is_pos_zone_active = str(z_data.get("is_active", True)).lower() != "false"
        if active_zones_state.get(pos_zone_idx) in ["PAUSE", "AUTO_CLEAR", "CLEAR"]:
            is_pos_zone_active = False

        if not has_pending and is_pos_zone_active:
            log_message(
                f"🔄 Kısmi Dolum: {zone_label(pos_zone_idx, zones)} | Kalan {remaining_lot} lot ({direction}) emir gönderiliyor.",
                zone_id=zone_log_id(z_data, pos_zone_idx),
            )
            send_pending_order_helper(
                mt5,
                pos.price_open,
                remaining_lot,
                expected_tp,
                expected_sl if expected_sl > 0 else None,
                pos_zone_idx,
                direction,
                zone_sym,
                symbol_infos,
                consecutive_errors,
                active_zones_state,
                magic=pos.magic,
            )


def handle_zone_exit(
    mt5,
    active_zone: dict,
    active_zone_idx: int,
    robot_orders,
    robot_positions,
    filling_mode: dict,
    current_avg_price: float,
    close_price: float,
    exit_cond: str,
):
    """
    Bölge çıkışında temizlik yapar.
    Dönüş: True -> bölge 'clear_on_exit' ile pasife alınmalı (AUTO_CLEAR yazılmalı),
           False -> 'clear_on_exit' kapalı, bölgenin emirlerine dokunulmaz.
    """
    if not active_zone.get("clear_on_exit", True):
        return False

    z_min = float(active_zone.get("min_price", 0))
    z_max = float(active_zone.get("max_price", 0))
    ref_price = current_avg_price if exit_cond == "Anlık Fiyat" else close_price
    actual_exit_dir = "BUY (Yukarı)" if ref_price > z_max else "SELL (Aşağı)"
    trigger_side = active_zone.get("clear_exit_side", "Farketmez")

    if trigger_side != "Farketmez" and trigger_side != actual_exit_dir:
        log_message(
            f"ℹ️ Fiyat bölgeden çıktı ({actual_exit_dir}) ancak temizlik '{trigger_side}' ayarlandığı için işlemler pas geçildi. Bölge pasif duruma alınıyor."
        )
        return True

    scope = active_zone.get("clear_scope", "Sadece Bekleyen Emirler")
    target = active_zone.get("clear_target_side", "Farketmez (Hepsi)")
    target_magic = zone_magic(active_zone, active_zone_idx)

    log_message(
        f"🧹 {zone_label(active_zone_idx)} ({z_min}-{z_max}) DIŞINA ÇIKILDI! ({actual_exit_dir}). Kapsam: {scope} | Kapatılacak Yön: {target}"
    )

    silinen_emir_sayisi = 0
    for order in robot_orders:
        if order.magic == target_magic:
            if (
                target == "Farketmez (Hepsi)"
                or (
                    target == "Sadece BUY İşlemleri"
                    and order.type
                    in [
                        mt5.ORDER_TYPE_BUY_LIMIT,
                        mt5.ORDER_TYPE_BUY_STOP,
                    ]
                )
                or (
                    target == "Sadece SELL İşlemleri"
                    and order.type
                    in [
                        mt5.ORDER_TYPE_SELL_LIMIT,
                        mt5.ORDER_TYPE_SELL_STOP,
                    ]
                )
            ):
                cancel_order(mt5, order)
                silinen_emir_sayisi += 1

    log_message(f"🧹 Toplam {silinen_emir_sayisi} adet bekleyen {target} emri temizlendi.")

    # Arayüz "Tüm İşlemler" kaydeder; "Pozisyon"/"Tümü"/"Hepsi" eski (Streamlit) değerler.
    # "Tüm" kontrolü olmadan "Tüm İşlemler" seçiliyken pozisyonlar hiç kapatılmıyordu.
    if any(key in scope for key in ("Tüm", "Pozisyon", "Hepsi")):
        closed, failed = _close_zone_positions(mt5, robot_positions, target_magic, target, filling_mode)
        log_message(f"💥 Toplam {closed} adet {target} açık pozisyonu kapatıldı.")
        if failed:
            _schedule_exit_close_retry(target_magic, target)
            log_message(
                f"⚠️ {zone_label(active_zone_idx)}: {failed} pozisyon kapatılamadı (MT5 reddetti). "
                "Kapanana kadar yeniden denenecek.",
                "ERROR",
            )

    return True


def _targets_position(mt5, pos, target):
    return (
        target == "Farketmez (Hepsi)"
        or (target == "Sadece BUY İşlemleri" and pos.type == mt5.POSITION_TYPE_BUY)
        or (target == "Sadece SELL İşlemleri" and pos.type == mt5.POSITION_TYPE_SELL)
    )


def _close_zone_positions(mt5, robot_positions, target_magic, target, filling_mode):
    """Bölgenin (magic) hedef yöndeki pozisyonlarını piyasa emriyle kapatır.
    Dönüş: (kapatılan, kapatılamayan). Tick yoksa ya da MT5 reddederse kapatılamayan sayılır."""
    closed = failed = 0
    for pos in robot_positions:
        if pos.magic != target_magic or not _targets_position(mt5, pos, target):
            continue
        tick = mt5.symbol_info_tick(pos.symbol)
        if not tick:
            failed += 1
            continue
        is_buy = pos.type == mt5.POSITION_TYPE_BUY
        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "position": pos.ticket,
            "symbol": pos.symbol,
            "volume": pos.volume,
            "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
            "price": tick.bid if is_buy else tick.ask,
            "deviation": MAX_DEVIATION,
            "magic": pos.magic,
            "comment": "Zone_Exit_Close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling_mode.get(pos.symbol, mt5.ORDER_FILLING_IOC),
        }
        if safe_send_order(mt5, req, log_message):
            closed += 1
        else:
            failed += 1
    return closed, failed


def _schedule_exit_close_retry(target_magic, target):
    delay = (
        state.MARKET_CLOSED_CHECK_INTERVAL
        if TradeState.last_retcode == MARKET_CLOSED_RETCODE
        else EXIT_CLOSE_RETRY_SECONDS
    )
    state.exit_close_pending[target_magic] = (target, clock.monotonic() + delay)


def retry_exit_closes(mt5, zones, robot_positions, active_zones_state, filling_mode):
    """Bölge çıkışında (clear_scope "Tüm İşlemler") MT5'in reddettiği kapatmaları yeniden dener.

    Eskiden sonuç okunmuyordu: tek bir red (requote, piyasa kapalı) pozisyonu açık bırakıyor,
    log "kapatıldı" diyordu ve bölge AUTO_CLEAR olduğu için bir daha denenmiyordu. Bölge silinirse
    ya da kullanıcı onu yeniden başlatırsa (artık AUTO_CLEAR değil) bekleyen kapatma düşer.
    """
    if not state.exit_close_pending:
        return
    index_by_magic = zone_index_by_magic(zones)
    for magic, (target, retry_at) in list(state.exit_close_pending.items()):
        zone_idx = index_by_magic.get(magic)
        if zone_idx is None or active_zones_state.get(zone_idx) != "AUTO_CLEAR":
            del state.exit_close_pending[magic]
            continue
        if clock.monotonic() < retry_at:
            continue
        closed, failed = _close_zone_positions(mt5, robot_positions, magic, target, filling_mode)
        if failed:
            _schedule_exit_close_retry(magic, target)
            continue
        del state.exit_close_pending[magic]
        if closed:  # 0: pozisyon bu arada kendi TP/SL'iyle kapandı
            log_message(
                f"💥 {zone_label(zone_idx, zones)}: bölge çıkışında kapatılamayan {closed} pozisyon şimdi kapatıldı.",
                zone_id=zone_log_id(zones[zone_idx], zone_idx),
            )
