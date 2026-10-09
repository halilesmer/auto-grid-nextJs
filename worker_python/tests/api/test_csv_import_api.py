"""BKT-05 CSV-Import (B9): /market/{id}/imports, …/chunk, …/commit, DELETE und /rates?source=csv:<id>.

Zeiten sind MT5-Zeit. Kein MT5 nötig: der Import berührt MT5 nie.
"""
import calendar
import os
import secrets
import threading
import time
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor

import pytest

from src.utils import csv_import, market_db
from tests.api.conftest import account
from tests.conftest import TEST_ACCOUNT_ID

SYMBOL = "XAUUSD"
MON = calendar.timegm((2026, 9, 28, 0, 0, 0))
BASE = f"/api/market/{TEST_ACCOUNT_ID}"


@pytest.fixture(autouse=True)
def accounts(seed_accounts):
    seed_accounts(account())


def _line(t, o=1.0, h=2.0, low=0.5, c=1.5):
    return f"{t},{o},{h},{low},{c},5"


def epoch_csv(times, header=True):
    rows = ["time,open,high,low,close,volume"] if header else []
    return "\n".join(rows + [_line(t) for t in times]) + "\n"


def upload(client, text, *, raw=None, symbol=SYMBOL, timeframe="M1", offset=0, offset_mode="fixed", chunk=None, commit=True, replace=False):
    data = raw if raw is not None else text.encode("utf-8")
    res = client.post(f"{BASE}/imports", json={"symbol": symbol, "timeframe": timeframe, "filename": "x.csv",
                                               "size": len(data), "time_offset_sec": offset, "time_offset_mode": offset_mode})
    assert res.status_code == 200, res.text
    import_id = res.json()["import_id"]
    step = chunk or len(data)
    for i, start in enumerate(range(0, len(data), step)):
        part = client.put(f"{BASE}/imports/{import_id}/chunk", params={"index": i}, content=data[start:start + step])
        assert part.status_code == 200, part.text
    if not commit:
        return import_id, None
    return import_id, client.post(f"{BASE}/imports/{import_id}/commit", json={"replace": replace})


def read(client, import_id, a, b, timeframe="M1"):
    return client.get(f"{BASE}/rates", params={"symbol": SYMBOL, "timeframe": timeframe, "from": a, "to": b,
                                               "source": f"csv:{import_id}"})


def rows_in_db():
    with market_db.reading() as conn:
        return conn.execute("SELECT COUNT(*) FROM rates").fetchone()[0]


@pytest.mark.feature("BKT-05")
def test_parsing_holds_no_market_database_write_lock(client, monkeypatch):
    import_id, _ = upload(client, epoch_csv([MON, MON + 60]), commit=False)
    real_rows = csv_import.iter_rows
    parsing, resume, written = threading.Event(), threading.Event(), threading.Event()
    passes = 0

    def paused_rows(*args, **kwargs):
        nonlocal passes
        passes += 1
        for index, row in enumerate(real_rows(*args, **kwargs)):
            if passes == 2 and index == 1:
                parsing.set()
                assert resume.wait(10), "test did not release CSV parsing"
            yield row

    def other_write():
        market_db.log_broker_offset("synthetic", MON, 7200)
        written.set()

    monkeypatch.setattr(csv_import, "iter_rows", paused_rows)
    monkeypatch.setattr(csv_import, "BATCH_ROWS", 1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        committing = pool.submit(client.post, f"{BASE}/imports/{import_id}/commit", json={})
        try:
            assert parsing.wait(5), "second CSV pass not reached"
            assert read(client, import_id, MON, MON + 120).status_code == 409
            writing = pool.submit(other_write)
            independent = written.wait(2)
        finally:
            resume.set()
        result = committing.result(timeout=10)
        writing.result(timeout=10)
    assert independent, "unrelated database writes wait for the CSV parser"
    assert result.status_code == 200 and result.json()["bars"] == 2
    assert read(client, import_id, MON, MON + 120).json()["t"] == [MON, MON + 60]


@pytest.mark.feature("BKT-05")
def test_failed_second_pass_removes_prepared_rows_and_preserves_old_import(client, monkeypatch):
    old_id, _ = upload(client, epoch_csv([MON, MON + 60]))
    new_id, _ = upload(client, epoch_csv([MON, MON + 60]), commit=False)
    real_rows = csv_import.iter_rows
    passes = 0

    def changed_rows(path, tf_sec, offset_sec, errors, **kwargs):
        nonlocal passes
        passes += 1
        for row in real_rows(path, tf_sec, offset_sec, errors, **kwargs):
            yield row
            if passes == 2:
                errors.append({"line": 3, "message": "file changed"})
                return

    monkeypatch.setattr(csv_import, "iter_rows", changed_rows)
    monkeypatch.setattr(csv_import, "BATCH_ROWS", 1)
    response = client.post(f"{BASE}/imports/{new_id}/commit", json={"replace": True})
    assert response.status_code == 409
    assert read(client, old_id, MON, MON + 120).json()["t"] == [MON, MON + 60]
    assert read(client, new_id, MON, MON + 120).status_code == 409
    assert rows_in_db() == 2


@pytest.mark.feature("BKT-05")
def test_account_removed_between_import_batches_leaves_no_orphan_candles(client, monkeypatch):
    import_id, _ = upload(client, epoch_csv([MON, MON + 60]), commit=False)
    real_rows = csv_import.iter_rows
    passes = 0

    def removed_account_rows(*args, **kwargs):
        nonlocal passes
        passes += 1
        for index, row in enumerate(real_rows(*args, **kwargs)):
            if passes == 2 and index == 1:
                market_db.delete_account(TEST_ACCOUNT_ID)
            yield row

    monkeypatch.setattr(csv_import, "iter_rows", removed_account_rows)
    monkeypatch.setattr(csv_import, "BATCH_ROWS", 1)
    response = client.post(f"{BASE}/imports/{import_id}/commit", json={})
    assert response.status_code == 404
    assert rows_in_db() == 0
    assert client.get(f"{BASE}/imports").json()["imports"] == []


@pytest.mark.feature("BKT-05")
def test_large_synthetic_import_publishes_complete_range(client, monkeypatch):
    import_id, _ = upload(client, epoch_csv(range(1735689600, 1741689660, 60)), commit=False)
    real_writing = market_db.writing
    durations = []

    @contextmanager
    def measured_writing():
        with real_writing() as conn:
            started = time.perf_counter()
            try:
                yield conn
            finally:
                durations.append(time.perf_counter() - started)

    monkeypatch.setattr(market_db, "writing", measured_writing)
    started = time.perf_counter()
    response = client.post(f"{BASE}/imports/{import_id}/commit", json={})
    elapsed = time.perf_counter() - started
    assert response.status_code == 200
    assert (response.json()["bars"], response.json()["first_t"], response.json()["last_t"]) == (
        100001, 1735689600, 1741689600)
    assert read(client, import_id, 1741689540, 1741689660).json()["t"] == [1741689540, 1741689600]
    print(f"Synthetic CSV: 100001 candles; commit={elapsed:.3f}s; longest write body={max(durations):.3f}s")


@pytest.mark.feature("BKT-05")
@pytest.mark.parametrize("rows,expected", [
    ([(1743296340, 7200), (1743296400, 10800)], [1743303540, 1743307200]),
    ([(1761343140, 10800), (1761516000, 7200)], [1761353940, 1761523200]),
])
def test_utc_rows_use_their_historical_broker_offset(client, rows, expected):
    text = "time,open,high,low,close,broker_offset_sec\n" + "".join(
        f"{t},1,2,0.5,1.5,{offset}\n" for t, offset in rows)
    import_id, response = upload(client, text, offset_mode="row")
    assert response.status_code == 200
    assert response.json()["offset_mode"] == "row"
    assert read(client, import_id, expected[0], expected[-1] + 60).json()["t"] == expected
    assert client.get(f"{BASE}/imports").json()["imports"][0]["offset_mode"] == "row"


@pytest.mark.feature("BKT-05")
@pytest.mark.parametrize("offset", ["", "3600.5", "NaN", "50401", "-50401"])
def test_bad_row_offset_is_rejected_without_a_selectable_import(client, offset):
    text = f"time,open,high,low,close,broker_offset_sec\n{MON},1,2,0.5,1.5,{offset}\n"
    _, response = upload(client, text, offset_mode="row")
    assert response.status_code == 422
    assert client.get(f"{BASE}/imports").json()["imports"] == []
    assert rows_in_db() == 0


@pytest.mark.feature("BKT-05")
def test_row_offset_cannot_be_combined_with_fixed_shift(client):
    text = f"time,open,high,low,close,broker_offset_sec\n{MON},1,2,0.5,1.5,7200\n"
    _, response = upload(client, text, offset=3600, offset_mode="row")
    assert response.status_code == 422
    assert rows_in_db() == 0


@pytest.mark.feature("BKT-05")
@pytest.mark.parametrize("mode,text", [
    ("fixed", f"time,open,high,low,close,broker_offset_sec\n{MON},1,2,0.5,1.5,0\n"),
    ("row", epoch_csv([MON])),
])
def test_selected_offset_mode_must_match_csv_columns(client, mode, text):
    _, response = upload(client, text, offset_mode=mode)
    assert response.status_code == 422
    assert client.get(f"{BASE}/imports").json()["imports"] == []
    assert rows_in_db() == 0


@pytest.mark.feature("BKT-05")
def test_unknown_offset_mode_is_rejected_at_request_boundary(client):
    response = client.post(f"{BASE}/imports", json={
        "symbol": SYMBOL, "timeframe": "M1", "filename": "x.csv", "size": 10,
        "time_offset_mode": "seasonal",
    })
    assert response.status_code == 422
    assert client.get(f"{BASE}/imports").json()["imports"] == []


@pytest.mark.feature("BKT-05")
def test_existing_csv_import_defaults_to_fixed_mode_after_migration(client):
    import_id, _ = upload(client, epoch_csv([MON]), commit=False)
    with market_db.writing() as conn:
        conn.execute("ALTER TABLE csv_imports DROP COLUMN offset_mode")
        conn.execute(f"PRAGMA user_version={market_db.SCHEMA_VERSION - 1}")
    market_db.reset_cache()

    listed = client.get(f"{BASE}/imports")
    assert listed.status_code == 200
    imported = next(item for item in listed.json()["imports"] if item["import_id"] == import_id)
    assert imported["offset_mode"] == "fixed"


@pytest.mark.feature("BKT-05")
def test_fall_back_with_duplicate_broker_time_is_rejected(client):
    text = "time,open,high,low,close,broker_offset_sec\n" \
           "1761436800,1,2,0.5,1.5,10800\n" \
           "1761440400,1,2,0.5,1.5,7200\n"
    _, response = upload(client, text, offset_mode="row")
    assert response.status_code == 422
    assert "increasing" in str(response.json()["detail"])
    assert rows_in_db() == 0


@pytest.mark.feature("BKT-05")
def test_import_in_mehreren_teilen_wird_gelesen(client):
    times = [MON + 60 * i for i in range(10)]
    import_id, res = upload(client, epoch_csv(times), chunk=50)

    assert res.status_code == 200
    body = res.json()
    assert (body["status"], body["bars"], body["first_t"], body["last_t"], body["timeframe"]) == (
        "committed", 10, MON, MON + 540, "M1")
    rates = read(client, import_id, MON, MON + 600).json()
    assert rates["t"] == times and rates["o"][0] == 1.0 and rates["c"][9] == 1.5 and rates["v"][0] == 5
    assert rates["source"] == f"csv:{import_id}" and rates["missing"] == []
    assert [i["import_id"] for i in client.get(f"{BASE}/imports").json()["imports"]] == [import_id]


@pytest.mark.feature("BKT-05")
def test_ausserhalb_des_imports_ist_luecke_und_nie_mt5(client):
    import_id, _ = upload(client, epoch_csv([MON, MON + 60]))
    rates = read(client, import_id, MON - 120, MON + 240).json()
    assert rates["t"] == [MON, MON + 60]
    assert rates["missing"] == [{"from": MON - 120, "to": MON, "reason": "csv_gap", "checked_at": None},
                                {"from": MON + 120, "to": MON + 240, "reason": "csv_gap", "checked_at": None}]


@pytest.mark.feature("BKT-05")
def test_mt5_export_mit_semikolon_und_getrenntem_datum_und_zeitversatz(client):
    text = "<DATE>;<TIME>;<OPEN>;<HIGH>;<LOW>;<CLOSE>;<TICKVOL>\n" \
           "2026.09.28;00:00;2650,10;2651,00;2649,50;2650,70;12\n" \
           "2026.09.28;00:01;2650,70;2651,20;2650,00;2650,90;7\n"
    import_id, res = upload(client, text, offset=3600)
    assert res.status_code == 200
    rates = read(client, import_id, MON, MON + 7200).json()
    assert rates["t"] == [MON + 3600, MON + 3660]
    assert rates["o"] == [2650.10, 2650.70] and rates["v"] == [12, 7]


@pytest.mark.feature("BKT-05")
@pytest.mark.parametrize("text,fragment", [
    (epoch_csv([MON, MON + 30]), "grid"),
    (epoch_csv([MON + 60, MON]), "increasing"),
    (epoch_csv([MON, MON]), "increasing"),
    (f"time,open,high,low,close\n{MON},1,2,0.5,3\n", "do not contain"),
    (f"time,open,high,low,close\n{MON},abc,2,0.5,1\n", "float"),
    ("time,open,high\n1,2,3\n", "lacks column"),
    (f"time,open,high,low,close\n{MON},-1,2,0.5,1\n", "positive"),
    (f"time,open,high,low,close\n{calendar.timegm((2999, 1, 1, 0, 0, 0))},1,2,0.5,1\n", "outside"),
    ("time,open,high,low,close\n", "no candles"),
])
def test_fehlerhafte_datei_wird_abgelehnt_und_ist_nicht_waehlbar(client, text, fragment):
    import_id, res = upload(client, text)
    assert res.status_code == 422
    assert fragment in str(res.json()["detail"])
    assert client.get(f"{BASE}/imports").json()["imports"] == []
    assert read(client, import_id, MON, MON + 60).status_code == 404
    assert rows_in_db() == 0 and not os.path.exists(market_db.staging_file(import_id))


@pytest.mark.feature("BKT-05")
def test_fehlerliste_nennt_zeilen_und_ist_begrenzt(client):
    text = "time,open,high,low,close\n" + "".join(f"{MON + 60 * i},1,2,0.5,9\n" for i in range(50))
    _, res = upload(client, text)
    errors = res.json()["detail"]["errors"]
    assert len(errors) == csv_import.MAX_ERRORS and errors[0]["line"] == 2


@pytest.mark.feature("BKT-05")
def test_ueberlappung_nur_mit_ersetzen(client):
    first, _ = upload(client, epoch_csv([MON + 60 * i for i in range(5)]))
    second, res = upload(client, epoch_csv([MON + 120 + 60 * i for i in range(5)]))

    assert res.status_code == 409 and res.json()["detail"]["errors"][0]["import_id"] == first
    assert [i["import_id"] for i in client.get(f"{BASE}/imports").json()["imports"]
            if i["status"] == "committed"] == [first]
    assert read(client, second, MON, MON + 600).status_code == 409  # noch nicht committed

    res = client.post(f"{BASE}/imports/{second}/commit", json={"replace": True})
    assert res.status_code == 200
    assert read(client, first, MON, MON + 600).status_code == 404
    assert read(client, second, MON, MON + 600).json()["t"][0] == MON + 120
    assert rows_in_db() == 5


@pytest.mark.feature("BKT-05")
def test_andere_zeitraeume_und_symbole_ueberlappen_nicht(client):
    upload(client, epoch_csv([MON, MON + 60]))
    _, later = upload(client, epoch_csv([MON + 3600]))
    _, other = upload(client, epoch_csv([MON]), symbol="EURUSD")
    assert later.status_code == 200 and other.status_code == 200


@pytest.mark.feature("BKT-05")
def test_abbrechen_entfernt_alles(client):
    import_id, _ = upload(client, epoch_csv([MON]), commit=False)
    assert os.path.exists(market_db.staging_file(import_id))
    assert client.delete(f"{BASE}/imports/{import_id}").status_code == 200
    assert not os.path.exists(market_db.staging_file(import_id))
    assert client.get(f"{BASE}/imports").json()["imports"] == []
    assert client.post(f"{BASE}/imports/{import_id}/commit", json={}).status_code == 404

    done, _ = upload(client, epoch_csv([MON]))
    assert client.delete(f"{BASE}/imports/{done}").status_code == 200
    assert rows_in_db() == 0 and read(client, done, MON, MON + 60).status_code == 404


@pytest.mark.feature("BKT-05")
def test_unfertiger_upload_ist_nicht_waehlbar_und_nicht_committable(client):
    data = epoch_csv([MON, MON + 60]).encode()
    import_id = client.post(f"{BASE}/imports", json={"symbol": SYMBOL, "timeframe": "M1", "size": len(data)}
                            ).json()["import_id"]
    client.put(f"{BASE}/imports/{import_id}/chunk", params={"index": 0}, content=data[:10])
    assert client.post(f"{BASE}/imports/{import_id}/commit", json={}).status_code == 409
    assert read(client, import_id, MON, MON + 60).status_code == 409
    assert client.get(f"{BASE}/imports").json()["imports"][0]["status"] == "staging"


@pytest.mark.feature("BKT-05")
def test_grenzen_am_systemrand(client, monkeypatch):
    def create(**over):
        body = {"symbol": SYMBOL, "timeframe": "M1", "size": 10, **over}
        return client.post(f"{BASE}/imports", json=body).status_code

    assert create(symbol="../x") == 400 and create(symbol="a b") == 400
    assert create(timeframe="M2") == 400
    assert create(size=0) == 413 and create(size=csv_import.MAX_FILE_BYTES + 1) == 413
    assert create(time_offset_sec=15 * 3600) == 400

    import_id = client.post(f"{BASE}/imports", json={"symbol": SYMBOL, "timeframe": "M1", "size": 10}
                            ).json()["import_id"]
    chunk = f"{BASE}/imports/{import_id}/chunk"
    assert client.put(chunk, params={"index": 1}, content=b"abc").status_code == 409  # falsche Reihenfolge
    assert client.put(chunk, params={"index": 0}, content=b"x" * 11).status_code == 413  # mehr als angekündigt
    monkeypatch.setattr(csv_import, "MAX_CHUNK_BYTES", 4)
    assert client.put(chunk, params={"index": 0}, content=b"x" * 5).status_code == 413
    assert client.put(chunk, params={"index": 0}, content=b"").status_code == 413
    assert client.get(f"{BASE}/imports/../../etc").status_code in (404, 405)
    assert client.delete(f"{BASE}/imports/nicht-hex").status_code == 404


@pytest.mark.feature("BKT-05")
def test_nur_drei_unfertige_importe_je_konto(client):
    for _ in range(csv_import.MAX_OPEN_STAGING):
        assert client.post(f"{BASE}/imports", json={"symbol": SYMBOL, "timeframe": "M1", "size": 1}).status_code == 200
    assert client.post(f"{BASE}/imports", json={"symbol": SYMBOL, "timeframe": "M1", "size": 1}).status_code == 409


@pytest.mark.feature("BKT-05")
def test_veraltete_vorbereitung_wird_beim_naechsten_anlegen_geraeumt(client):
    old, _ = upload(client, epoch_csv([MON]), commit=False)
    with market_db.writing() as conn:
        conn.execute("UPDATE csv_imports SET created_at=1 WHERE import_id=?", (old,))
    upload(client, epoch_csv([MON]), commit=False)
    assert old not in [i["import_id"] for i in client.get(f"{BASE}/imports").json()["imports"]]
    assert not os.path.exists(market_db.staging_file(old))


@pytest.mark.feature("BKT-05")
def test_grosse_luecke_bleibt_als_luecke_sichtbar(client):
    gap = 10 * 86400
    import_id, _ = upload(client, epoch_csv([MON, MON + 60, MON + gap, MON + gap + 60]))
    assert client.get(f"{BASE}/imports").json()["imports"][0]["gaps"] == 1
    rates = read(client, import_id, MON, MON + gap + 120).json()
    assert rates["missing"] == [{"from": MON + 120, "to": MON + gap, "reason": "csv_gap", "checked_at": None}]


@pytest.mark.feature("BKT-05")
def test_zeitrahmen_und_symbol_muessen_zum_import_passen(client):
    import_id, _ = upload(client, epoch_csv([MON]))
    assert read(client, import_id, MON, MON + 60, timeframe="M5").status_code == 400
    wrong = client.get(f"{BASE}/rates", params={"symbol": "EURUSD", "timeframe": "M1", "from": MON, "to": MON + 60,
                                                "source": f"csv:{import_id}"})
    assert wrong.status_code == 400
    bad = client.get(f"{BASE}/rates", params={"symbol": SYMBOL, "timeframe": "M1", "from": MON, "to": MON + 60,
                                              "source": "Fake-Demo"})
    assert bad.status_code == 400


@pytest.mark.feature("BKT-05")
def test_kontoloeschung_entfernt_importe(client):
    import_id, _ = upload(client, epoch_csv([MON]))
    pending, _ = upload(client, epoch_csv([MON]), commit=False)
    market_db.delete_account(TEST_ACCOUNT_ID)
    assert rows_in_db() == 0 and not os.path.exists(market_db.staging_file(pending))
    assert read(client, import_id, MON, MON + 60).status_code == 404


@pytest.mark.feature("BKT-05")
def test_fremde_konten_sehen_keine_importe(client, seed_accounts, monkeypatch):
    import src.api.auth as auth
    from src.api import users_store

    import_id, _ = upload(client, epoch_csv([MON]))
    admin_key = secrets.token_urlsafe(24)  # zur Laufzeit erzeugt (Secret-Scan der Hooks)
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin_key)
    anna, anna_key = users_store.create_user("Anna")
    ben, ben_key = users_store.create_user("Ben")
    seed_accounts(account(owner=anna["id"]), account("1002", owner=ben["id"]))

    ben_h, anna_h = {"X-API-Key": ben_key}, {"X-API-Key": anna_key}
    assert client.get(f"{BASE}/imports", headers=ben_h).status_code == 404
    assert client.post(f"{BASE}/imports", headers=ben_h,
                       json={"symbol": SYMBOL, "timeframe": "M1", "size": 1}).status_code == 404
    assert client.delete(f"{BASE}/imports/{import_id}", headers=ben_h).status_code == 404
    # Auch über das eigene Konto ist ein fremder Import nicht erreichbar
    ben_base = "/api/market/1002"
    assert client.delete(f"{ben_base}/imports/{import_id}", headers=ben_h).status_code == 404
    assert client.get(f"{ben_base}/rates", headers=ben_h, params={
        "symbol": SYMBOL, "timeframe": "M1", "from": MON, "to": MON + 60, "source": f"csv:{import_id}"
    }).status_code == 404
    own = client.get(f"{BASE}/rates", headers=anna_h, params={
        "symbol": SYMBOL, "timeframe": "M1", "from": MON, "to": MON + 60, "source": f"csv:{import_id}"})
    assert own.status_code == 200 and own.json()["t"] == [MON]


@pytest.mark.feature("BKT-05")
def test_utf16_export_von_mt5_und_andere_zeitformate(client):
    text = "time,open,high,low,close\n" \
           f"{MON * 1000},1,2,0.5,1.5\n" \
           "2026-09-28T00:01:00,1,2,0.5,1.5\n" \
           "2026.09.28 00:02,1,2,0.5,1.5\n"
    import_id, res = upload(client, "", raw=text.encode("utf-16"))
    assert res.status_code == 200
    assert read(client, import_id, MON, MON + 300).json()["t"] == [MON, MON + 60, MON + 120]


@pytest.mark.feature("BKT-05")
def test_semikolon_ohne_kopfzeile_mit_dezimalkomma(client):
    import_id, res = upload(client, "2026.09.28;00:00;2650,10;2651,00;2649,50;2650,70\n")
    assert res.status_code == 200
    assert read(client, import_id, MON, MON + 60).json()["o"] == [2650.10]


@pytest.mark.feature("BKT-05")
@pytest.mark.parametrize("raw", [
    b"time,open,high,low,close\n" + b"\xe4" * 20 + b"\n",       # kein UTF-8
    b"\x00\x01\x02" * 100,                                      # Binärdatei
    f"time,open,high,low,close,volume\n{MON},1,2,0.5,1.5,1e999\n".encode(),   # inf
    f"time,open,high,low,close,volume\n{MON},1,2,0.5,1.5,1e30\n".encode(),    # zu groß für SQLite
])
def test_unlesbare_datei_gibt_422_und_wird_verworfen(client, raw):
    import_id, res = upload(client, "", raw=raw)
    assert res.status_code == 422
    assert client.get(f"{BASE}/imports").json()["imports"] == []
    assert not os.path.exists(market_db.staging_file(import_id))


@pytest.mark.feature("BKT-05")
def test_wiederholter_chunk_nach_halb_geschriebenem_teil_wird_nicht_doppelt_angehaengt(client):
    data = epoch_csv([MON, MON + 60]).encode()
    import_id = client.post(f"{BASE}/imports", json={"symbol": SYMBOL, "timeframe": "M1", "size": len(data)}
                            ).json()["import_id"]
    with open(market_db.staging_file(import_id), "ab") as fh:
        fh.write(b"MUELL")  # Rest eines fehlgeschlagenen Schreibvorgangs
    assert client.put(f"{BASE}/imports/{import_id}/chunk", params={"index": 0}, content=data).status_code == 200
    res = client.post(f"{BASE}/imports/{import_id}/commit", json={})
    assert res.status_code == 200 and res.json()["bars"] == 2


@pytest.mark.feature("BKT-05")
def test_laufender_commit_sperrt_zweiten_commit_chunk_und_loeschen(client):
    data = epoch_csv([MON]).encode()
    import_id = client.post(f"{BASE}/imports", json={"symbol": SYMBOL, "timeframe": "M1", "size": len(data)}
                            ).json()["import_id"]
    client.put(f"{BASE}/imports/{import_id}/chunk", params={"index": 0}, content=data)
    csv_import._COMMITTING.add(import_id)
    try:
        assert client.post(f"{BASE}/imports/{import_id}/commit", json={}).status_code == 409
        assert client.delete(f"{BASE}/imports/{import_id}").status_code == 409
        assert client.put(f"{BASE}/imports/{import_id}/chunk", params={"index": 1}, content=b"x").status_code == 409
    finally:
        csv_import._COMMITTING.discard(import_id)
    assert client.post(f"{BASE}/imports/{import_id}/commit", json={}).status_code == 200


@pytest.mark.feature("BKT-05")
def test_nicht_loeschbare_rohdatei_nach_dem_commit_macht_den_import_nicht_ungueltig(client, monkeypatch):
    monkeypatch.setattr(os, "remove", lambda path: (_ for _ in ()).throw(PermissionError("gesperrt")))
    import_id, res = upload(client, epoch_csv([MON]))
    assert res.status_code == 200 and res.json()["status"] == "committed"
    assert read(client, import_id, MON, MON + 60).json()["t"] == [MON]
