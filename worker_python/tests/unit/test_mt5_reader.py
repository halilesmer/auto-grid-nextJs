"""1110-A2: MT5-Lesezugriffe in eigenen Prozessen. Echte Kindprozesse, Jobs aus tests/fakes/reader_jobs.py."""
import os
import threading
import time

import pytest

from src.utils import mt5_market as mm
from src.utils import mt5_reader

JOBS = "sleep=tests.fakes.reader_jobs:sleep_then,fail=tests.fakes.reader_jobs:fail,boom=tests.fakes.reader_jobs:boom"


@pytest.fixture
def pool():
    env = dict(os.environ, MT5_READER_EXTRA_JOBS=JOBS)
    p = mt5_reader.ReaderPool(count=2, env=env)
    yield p
    p.close()


@pytest.mark.feature("ANA-04")
def test_ergebnis_und_fehler_kommen_aus_dem_kindprozess(pool):
    out = pool.call("sleep", (0, "x"), 20)
    assert out["value"] == "x" and out["pid"] != os.getpid()
    with pytest.raises(mm.MarketDataError) as err:
        pool.call("fail", ("[SYMBOL] nein", 404), 20)
    assert err.value.detail == "[SYMBOL] nein" and err.value.status == 404
    with pytest.raises(mm.MarketDataError) as err:
        pool.call("boom", (), 20)
    assert err.value.detail.startswith("[READER] RuntimeError")
    assert pool.call("sleep", (0, "y"), 20)["pid"] in {r.proc.pid for r in pool.readers if r.proc}


@pytest.mark.feature("ANA-04")
def test_zeitlimit_gibt_den_prozess_frei_und_der_job_laeuft_weiter(pool):
    pool.call("sleep", (0, "warm"), 20)  # Start nicht mitmessen
    ticks = []
    stop = threading.Event()

    def counter():  # laeuft nur, wenn der GIL frei ist
        while not stop.is_set():
            ticks.append(1)
            stop.wait(0.01)

    t = threading.Thread(target=counter)
    t.start()
    t0 = time.monotonic()
    with pytest.raises(mt5_reader.ReaderTimeout):
        pool.readers[0].call("sleep", (2, "lang"), 0.5)
    waited = time.monotonic() - t0
    stop.set()
    t.join()
    assert waited < 1.5 and len(ticks) >= 20
    busy = pool.readers[0]
    assert busy.pending_since is not None
    # Der naechste Aufruf nimmt den freien zweiten Leser und wartet nicht auf den langen Job
    out = pool.call("sleep", (0, "frei"), 20)
    assert out["value"] == "frei" and out["pid"] == pool.readers[1].proc.pid
    assert busy.pending_since is not None
    # Derselbe Leser wartet den alten Job ab, verwirft sein Ergebnis und liefert das neue
    assert busy.call("sleep", (0, "danach"), 10)["value"] == "danach" and busy.pending_since is None


@pytest.mark.feature("ANA-04")
def test_haengender_job_wird_nach_harter_grenze_beendet(pool, monkeypatch):
    reader = pool.readers[0]
    first = reader.call("sleep", (0, "a"), 20)["pid"]
    with pytest.raises(mt5_reader.ReaderTimeout):
        reader.call("sleep", (30, "haengt"), 0.3)
    monkeypatch.setattr(mt5_reader, "READER_HARD_SEC", 0.2)
    threading.Event().wait(0.3)
    out = reader.call("sleep", (0, "neu"), 20)
    assert out["value"] == "neu" and out["pid"] != first


@pytest.mark.feature("ANA-04")
def test_unbekannter_job_wird_abgelehnt():
    with pytest.raises(ValueError):
        mt5_reader.run("sleep", (0, 1), 1)


@pytest.mark.feature("ANA-04")
def test_ohne_metatrader5_laeuft_der_job_im_prozess(monkeypatch):
    import src.utils.mt5_connection as mc

    monkeypatch.delenv("MT5_READER", raising=False)
    monkeypatch.setattr(mc, "MT5_AVAILABLE", False)
    assert mt5_reader.mode() == "inline"
    monkeypatch.setattr(mc, "MT5_AVAILABLE", True)
    assert mt5_reader.mode() == "process"
    monkeypatch.setenv("MT5_READER", "inline")
    assert mt5_reader.mode() == "inline"


@pytest.mark.feature("ANA-04")
def test_spaetes_ergebnis_desselben_jobs_wird_geliefert(pool):
    # Review 1110-A2: ein Stueck, das laenger als das Budget braucht, darf nicht bei jeder Anfrage neu starten
    reader = pool.readers[0]
    reader.call("sleep", (0, "warm"), 20)
    with pytest.raises(mt5_reader.ReaderTimeout):
        pool.call("sleep", (1, "lang"), 0.2)
    assert reader.pending_key == ("sleep", (1, "lang"))
    out = pool.call("sleep", (1, "lang"), 5)  # der Pool waehlt den Leser mit genau diesem Job
    assert out["value"] == "lang" and out["pid"] == reader.proc.pid and reader.pending_key is None


@pytest.mark.feature("ANA-04")
def test_fertige_antwort_wird_nach_harter_grenze_nicht_weggeworfen(pool, monkeypatch):
    reader = pool.readers[0]
    first = reader.call("sleep", (0, "a"), 20)["pid"]
    with pytest.raises(mt5_reader.ReaderTimeout):
        reader.call("sleep", (1.5, "b"), 0.1)  # gewartet wird mindestens MIN_WAIT_SEC (0.5 s): Job deutlich laenger
    threading.Event().wait(2.0)  # Antwort liegt bereit (time.sleep ist in den Tests abgeschaltet)
    monkeypatch.setattr(mt5_reader, "READER_HARD_SEC", 0.2)
    out = reader.call("sleep", (0, "c"), 20)
    assert out["value"] == "c" and out["pid"] == first  # kein Neustart


@pytest.mark.feature("ANA-04")
def test_kindausgabe_landet_in_eigener_logdatei(pool):
    import src.utils.paths as paths

    pool.call("sleep", (0, "x"), 20)
    assert os.path.exists(os.path.join(paths.LOGS_DIR, "mt5-reader-1.log"))


@pytest.mark.feature("ANA-04")
def test_unbekannte_spur_wird_abgelehnt():
    with pytest.raises(ValueError):
        mt5_reader.run("rates_chunk", (), 1, lane="egal")
