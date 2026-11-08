"""ACC-12: Hesap medyası (en çok 3 dosya): yükle/listele/indir/sil, sınırlar, tür denetimi, erişim, sahiplik."""
import os
import threading

import pytest

from tests.api.conftest import account

pytestmark = pytest.mark.feature("ACC-12")

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PDF = b"%PDF-1.7\n" + b"x" * 32
MB = 1024 * 1024


@pytest.fixture
def multi(client, seed_accounts, monkeypatch):
    from src.api import auth, users_store

    admin = "admin-" + "key-for-tests"
    monkeypatch.setattr(auth, "WORKER_API_KEY", admin)
    anna, anna_key = users_store.create_user("Anna")
    _, ben_key = users_store.create_user("Ben")
    seed_accounts(account("1001", owner=anna["id"], mt5_path=""), account("1002", mt5_path=""))
    return {"anna": {"X-API-Key": anna_key}, "ben": {"X-API-Key": ben_key}, "admin": {"X-API-Key": admin},
            "anna_id": anna["id"]}


def up(client, headers, name, data, account_id="1001"):
    return client.post(f"/api/accounts/{account_id}/media", params={"name": name}, content=data, headers=headers)


def test_upload_list_download_delete(client, multi):
    h = multi["anna"]
    res = up(client, h, "plan.png", PNG)
    assert res.status_code == 201
    item = res.json()
    assert set(item) == {"id", "name", "kind", "mime", "size", "created_at"}
    assert item["kind"] == "image" and item["mime"] == "image/png" and item["size"] == len(PNG)
    assert up(client, h, "Ünï code.pdf", PDF).json()["kind"] == "pdf"
    note = up(client, h, "n.md", "# merhaba ğ".encode()).json()
    assert note["kind"] == "note" and note["mime"] == "text/markdown; charset=utf-8"

    listing = client.get("/api/accounts/1001/media", headers=h).json()
    assert [i["id"] for i in listing["items"]] == [item["id"], listing["items"][1]["id"], note["id"]]
    assert listing["limit"] == 3
    assert listing["max_bytes"] == {"image": 10 * MB, "pdf": 10 * MB, "note": MB}

    got = client.get(f"/api/accounts/1001/media/{item['id']}", headers=h)
    assert got.status_code == 200 and got.content == PNG
    assert client.delete(f"/api/accounts/1001/media/{item['id']}", headers=h).json() == {"deleted": item["id"]}
    assert client.get(f"/api/accounts/1001/media/{item['id']}", headers=h).status_code == 404
    assert len(client.get("/api/accounts/1001/media", headers=h).json()["items"]) == 2


def test_download_headers(client, multi):
    h = multi["anna"]
    item = up(client, h, "Ünï code.png", PNG).json()
    res = client.get(f"/api/accounts/1001/media/{item['id']}", headers=h)
    assert res.headers["content-type"] == "image/png"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["content-security-policy"] == "sandbox"
    assert res.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert res.headers["content-disposition"] == "inline; filename*=UTF-8''%C3%9Cn%C3%AF%20code.png"


def test_fourth_file_is_409(client, multi):
    h = multi["anna"]
    for i in range(3):
        assert up(client, h, f"a{i}.png", PNG).status_code == 201
    assert up(client, h, "a3.png", PNG).status_code == 409
    assert len(client.get("/api/accounts/1001/media", headers=h).json()["items"]) == 3


def test_parallel_uploads_respect_limit(client, multi):
    h = multi["anna"]
    results = []

    def go(i):
        results.append(up(client, h, f"p{i}.png", PNG).status_code)

    threads = [threading.Thread(target=go, args=(i,)) for i in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [201, 201, 201, 409, 409, 409]


def test_size_limits(client, multi, worker_dir):
    h = multi["anna"]
    assert up(client, h, "big.png", PNG + b"\x00" * (10 * MB)).status_code == 413
    assert up(client, h, "big.pdf", PDF + b"\x00" * (10 * MB)).status_code == 413
    assert up(client, h, "big.txt", b"a" * (MB + 1)).status_code == 413
    assert up(client, h, "ok.txt", b"a" * MB).status_code == 201
    media = worker_dir / "data" / "media" / "1001"
    assert not [p for p in os.listdir(media) if p.endswith(".part")]


def test_content_length_over_limit_is_413(client, multi):
    res = client.post("/api/accounts/1001/media", params={"name": "x.png"}, content=b"x",
                      headers={**multi["anna"], "content-length": str(10 * MB + 5)})
    assert res.status_code in (413, 400)


@pytest.mark.parametrize("name,data", [
    ("fake.png", b"<html><script>alert(1)</script></html>"),
    ("v.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>"),
    ("a.gif", b"GIF89a" + b"\x00" * 20),
    ("a.heic", b"\x00\x00\x00\x18ftypheic" + b"\x00" * 20),
    ("evil.txt", b"abc\x00def"),
    ("latin.txt", b"\xe7\xf0\xff"),
    ("riff.webp", b"RIFF\x00\x00\x00\x00WAVE" + b"\x00" * 8),
])
def test_unsupported_content_is_415(client, multi, name, data):
    assert up(client, multi["anna"], name, data).status_code == 415


def test_type_comes_from_bytes_not_name(client, multi):
    item = up(client, multi["anna"], "innocent.txt", PDF).json()
    assert item["kind"] == "pdf" and item["mime"] == "application/pdf"
    webp = up(client, multi["anna"], "w.bin.webp", b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"\x00" * 8).json()
    assert webp["mime"] == "image/webp"


def test_empty_file_and_name_are_422(client, multi):
    assert up(client, multi["anna"], "a.png", b"").status_code == 422
    assert up(client, multi["anna"], "../..", PNG).status_code == 422


def test_name_is_sanitized(client, multi, worker_dir):
    item = up(client, multi["anna"], "../../etc/pass\\wd/x" + "y" * 200 + ".png", PNG).json()
    assert "/" not in item["name"] and "\\" not in item["name"] and len(item["name"]) <= 120
    files = os.listdir(worker_dir / "data" / "media" / "1001")
    assert sorted(files) == sorted(["index.json", f"{item['id']}.png"])


@pytest.mark.parametrize("media_id", ["abc", "../index", "A" * 12, "0" * 12, "zzzzzzzzzzzz", "index.json"])
def test_unknown_media_id_is_404(client, multi, media_id):
    h = multi["anna"]
    up(client, h, "a.png", PNG)
    assert client.get(f"/api/accounts/1001/media/{media_id}", headers=h).status_code == 404
    assert client.delete(f"/api/accounts/1001/media/{media_id}", headers=h).status_code == 404


def test_foreign_account_is_404_admin_allowed(client, multi):
    item = up(client, multi["anna"], "a.png", PNG).json()
    ben = multi["ben"]
    assert client.get("/api/accounts/1001/media", headers=ben).status_code == 404
    assert up(client, ben, "b.png", PNG).status_code == 404
    assert client.get(f"/api/accounts/1001/media/{item['id']}", headers=ben).status_code == 404
    assert client.delete(f"/api/accounts/1001/media/{item['id']}", headers=ben).status_code == 404
    assert client.get("/api/accounts/1001/media").status_code == 401
    assert client.get(f"/api/accounts/1001/media/{item['id']}", headers=multi["admin"]).content == PNG


def test_non_numeric_or_unknown_account(client, multi):
    admin = multi["admin"]
    assert client.get("/api/accounts/10a1/media", headers=admin).status_code == 404
    assert up(client, admin, "a.png", PNG, account_id="9999").status_code == 404


def test_delete_account_keeps_media_same_owner_recreate_keeps(client, multi, worker_dir):
    admin = multi["admin"]
    item = up(client, admin, "a.png", PNG, account_id="1002").json()
    assert client.delete("/api/accounts/1002", headers=admin).status_code == 200
    assert (worker_dir / "data" / "media" / "1002").exists()
    body = account("1002", mt5_path="", password="pw-" + "x")
    assert client.post("/api/accounts", json=body, headers=admin).status_code == 201
    assert client.get(f"/api/accounts/1002/media/{item['id']}", headers=admin).content == PNG


def test_recreate_with_other_owner_drops_media(client, multi, worker_dir):
    admin = multi["admin"]
    up(client, admin, "a.png", PNG, account_id="1002")
    assert client.delete("/api/accounts/1002", headers=admin).status_code == 200
    body = account("1002", mt5_path="", password="pw-" + "x")
    res = client.post("/api/accounts", json={**body, "owner": multi["anna_id"]}, headers=admin)
    assert res.status_code == 201
    assert not (worker_dir / "data" / "media" / "1002").exists()
    assert client.get("/api/accounts/1002/media", headers=multi["anna"]).json()["items"] == []


def test_rename_to_id_with_foreign_media_drops_it(client, multi, worker_dir):
    admin = multi["admin"]
    up(client, admin, "a.png", PNG, account_id="1002")
    assert client.delete("/api/accounts/1002", headers=admin).status_code == 200
    body = account("1001", mt5_path="", password="pw-" + "x", owner=multi["anna_id"])
    body["id"] = "1002"
    body["login"] = 1002
    res = client.put("/api/accounts/1001", json=body, headers=admin)
    assert res.status_code == 200, res.text
    assert not (worker_dir / "data" / "media" / "1002").exists()


def test_claim_failure_fails_closed(client, multi, monkeypatch):
    from src.utils import account_media

    admin = multi["admin"]
    up(client, admin, "a.png", PNG, account_id="1002")
    client.delete("/api/accounts/1002", headers=admin)

    def boom(*a, **k):
        raise OSError("disk")

    monkeypatch.setattr(account_media.shutil, "rmtree", boom)
    body = account("1002", mt5_path="", password="pw-" + "x")
    res = client.post("/api/accounts", json={**body, "owner": multi["anna_id"]}, headers=admin)
    assert res.status_code == 500
    assert all(a["id"] != "1002" for a in client.get("/api/accounts", headers=admin).json()["accounts"])
