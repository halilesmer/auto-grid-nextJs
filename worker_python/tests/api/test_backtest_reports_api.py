"""BKT-14: stored live-vs-backtest reports: SQLite persistence, ownership, validation, limits."""
import copy
import secrets
from uuid import uuid4

import pytest

URL = '/api/backtest/reports'
pytestmark = pytest.mark.feature('BKT-14')


@pytest.fixture
def identities(client, monkeypatch):
    from src.api import auth, users_store
    admin = secrets.token_urlsafe(24)
    monkeypatch.setattr(auth, 'WORKER_API_KEY', admin)
    _, first = users_store.create_user('First')
    _, second = users_store.create_user('Second')
    return [{'X-API-Key': key} for key in (first, second, admin)]


def trade(**change):
    base = {'side': 'buy', 'magic': 200001, 'volume': 0.01, 'entryTime': 1_760_000_000, 'entryPrice': 1.1,
            'exitTime': 1_760_000_600, 'exitPrice': 1.2, 'exitReason': 5, 'net': 9.5}
    return {**base, **change}


def payload(**change):
    live, test = trade(), trade(net=9.6)
    row = {
        'symbol': 'EURUSD', 'magics': [200001], 'spreadPrice': 0.00012,
        'live': {'trades': 1, 'net': 9.5, 'maxDrawdown': 0, 'openPositions': 0},
        'backtest': {'trades': 1, 'net': 9.6, 'maxDrawdown': 0, 'openPositions': 0},
        'pairs': [{'magic': 200001, 'live': live, 'backtest': test, 'entryDeltaSec': 0, 'entryPriceDelta': 0,
                   'profitDeltaPercent': 1.05, 'deviations': []}],
        'unmatchedLive': [], 'unmatchedBacktest': [], 'profitDeltaPercent': 1.05,
        'countOk': True, 'entryOk': True, 'priceOk': True, 'profitOk': True, 'passed': True,
    }
    body = {
        'requestId': str(uuid4()), 'name': 'Week 43', 'note': 'First live week', 'accountId': 'demo-a',
        'periodFrom': 1_760_000_000, 'periodTo': 1_760_600_000, 'appVersion': '0.7.246', 'currency': 'USD',
        'tolerance': {'sameTradeCount': True, 'entrySameCandle': True, 'priceSpreadFactor': 0.5, 'profitPercent': 5},
        'run': {'csvImportId': None, 'timeframe': 'M1', 'spreadMode': 'candle', 'spreadPoints': 0, 'commission': None,
                'swapEnabled': True, 'startCapital': 10000, 'fill': 'gap', 'slFirst': True, 'path': 'auto',
                'closeAtEnd': False, 'approximate': False},
        'zones': [{'id': 'z1', 'magic': 200001, 'symbol': 'EURUSD', 'lot_size': 0.01, 'is_active': True}],
        'symbols': [row],
    }
    body.update(change)
    return body


def test_create_read_list_delete(client, identities):
    owner = identities[0]
    created = client.post(URL, json=payload(), headers=owner)
    assert created.status_code == 201
    report = created.json()['report']
    assert report['name'] == 'Week 43' and report['symbolCount'] == 1 and report['passedCount'] == 1
    assert report['owner'] and report['workerVersion'] and report['createdAt'] > 0
    assert report['tolerance']['profitPercent'] == 5
    assert report['zones'][0]['magic'] == 200001
    listed = client.get(URL, headers=owner).json()['reports']
    assert [item['id'] for item in listed] == [report['id']]
    assert 'symbols' not in listed[0]  # the list carries summaries only
    full = client.get(f"{URL}/{report['id']}", headers=owner).json()['report']
    assert full['symbols'][0]['pairs'][0]['live']['net'] == 9.5
    assert client.delete(f"{URL}/{report['id']}", headers=owner).json() == {'deleted': report['id']}
    assert client.get(f"{URL}/{report['id']}", headers=owner).status_code == 404
    assert client.get(URL, headers=owner).json() == {'reports': []}


def test_foreign_owner_gets_404_and_admin_sees_all(client, identities):
    owner, other, admin = identities
    report = client.post(URL, json=payload(), headers=owner).json()['report']
    target = f"{URL}/{report['id']}"
    assert client.get(URL, headers=other).json() == {'reports': []}
    assert client.get(target, headers=other).status_code == 404
    assert client.delete(target, headers=other).status_code == 404
    assert client.post(URL, json=payload(requestId=report['id']), headers=other).status_code == 404
    assert [item['id'] for item in client.get(URL, headers=admin).json()['reports']] == [report['id']]
    assert client.get(target, headers=admin).status_code == 200
    assert client.get(URL).status_code == 401
    assert client.delete(target, headers=admin).status_code == 200
    assert client.get(target, headers=owner).status_code == 404


def test_creation_retry_is_idempotent_and_changed_payload_conflicts(client, identities):
    body = payload()
    first = client.post(URL, json=body, headers=identities[0])
    retry = client.post(URL, json=body, headers=identities[0])
    assert first.status_code == retry.status_code == 201
    assert first.json() == retry.json()
    changed = copy.deepcopy(body)
    changed['symbols'][0]['live']['net'] = 1
    assert client.post(URL, json=changed, headers=identities[0]).status_code == 409
    assert len(client.get(URL, headers=identities[0]).json()['reports']) == 1


def mutate(path, value):
    body = payload()
    node = body
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return body


@pytest.mark.parametrize('body', [
    mutate(['extra'], 1),
    mutate(['name'], '   '),
    mutate(['name'], 'x' * 81),
    mutate(['periodTo'], 0),
    mutate(['periodFrom'], 1_760_600_000),
    mutate(['periodTo'], 2**70),
    mutate(['symbols', 0, 'pairs', 0, 'deviations'], ['entryCandle'] * 5),
    mutate(['tolerance', 'profitPercent'], -1),
    mutate(['tolerance', 'unknown'], True),
    mutate(['run', 'csvImportId'], 'another-account-import'),
    mutate(['run', 'timeframe'], 'D1'),
    mutate(['zones'], [{'nested': {'a': 1}}]),
    mutate(['zones'], [{'k' * 65: 1}]),
    mutate(['symbols', 0, 'live', 'trades'], -1),
    mutate(['symbols', 0, 'pairs', 0, 'deviations'], ['made-up']),
    mutate(['symbols', 0, 'pairs', 0, 'live', 'side'], 'hold'),
    mutate(['symbols', 0, 'symbol'], ''),
    mutate(['requestId'], 'not-a-uuid'),
], ids=lambda body: str(len(str(body))))
def test_invalid_payload_is_rejected(client, identities, body):
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422
    assert client.get(URL, headers=identities[0]).json() == {'reports': []}


def test_not_a_number_is_rejected(client, identities):
    text = client.post(URL, content=str(payload()).replace("'", '"').replace('True', 'true').replace('None', 'null')
                       .replace('"net": 9.5', '"net": NaN', 1),
                       headers={**identities[0], 'Content-Type': 'application/json'})
    assert text.status_code == 422


def test_oversized_report_is_rejected_with_413(client, identities, monkeypatch):
    from src.api import backtest_reports
    monkeypatch.setattr(backtest_reports, 'MAX_PAYLOAD_BYTES', 500)
    assert client.post(URL, json=payload(), headers=identities[0]).status_code == 413
    assert client.get(URL, headers=identities[0]).json() == {'reports': []}


def test_limit_is_per_owner_and_retry_at_limit_still_succeeds(client, identities, monkeypatch):
    from src.api import backtest_reports
    monkeypatch.setattr(backtest_reports, 'MAX_REPORTS', 3)
    last = None
    for _ in range(3):
        last = payload()
        assert client.post(URL, json=last, headers=identities[0]).status_code == 201
    assert client.post(URL, json=last, headers=identities[0]).status_code == 201
    assert client.post(URL, json=payload(), headers=identities[0]).status_code == 409
    assert client.post(URL, json=payload(), headers=identities[1]).status_code == 201


def test_huge_body_is_stopped_before_parsing(client, identities, monkeypatch):
    from src.api import backtest_reports
    monkeypatch.setattr(backtest_reports, 'MAX_PAYLOAD_BYTES', 2000)
    response = client.post(URL, content=b'{"name":"' + b'x' * 50_000 + b'"}',
                           headers={**identities[0], 'Content-Type': 'application/json'})
    assert response.status_code == 413


def test_list_does_not_read_payloads_and_account_delete_removes_reports(client, identities):
    from src.utils import market_db
    owner = identities[0]
    client.post(URL, json=payload(), headers=owner)
    client.post(URL, json=payload(accountId='demo-b'), headers=owner)
    assert [item['symbolCount'] for item in client.get(URL, headers=owner).json()['reports']] == [1, 1]
    market_db.delete_account('demo-a')
    assert [item['accountId'] for item in client.get(URL, headers=owner).json()['reports']] == ['demo-b']


def test_commission_and_archive_gaps_are_stored(client, identities):
    owner = identities[0]
    body = payload(archiveGaps=[{'start': 1_760_100_000, 'end': 1_760_103_600, 'reason': 'error'}])
    body['symbols'][0]['commissionPerLot'] = 7.0
    report = client.post(URL, json=body, headers=owner).json()['report']
    full = client.get(f"{URL}/{report['id']}", headers=owner).json()['report']
    assert full['symbols'][0]['commissionPerLot'] == 7.0
    assert full['archiveGaps'] == [{'start': 1_760_100_000, 'end': 1_760_103_600, 'reason': 'error'}]


@pytest.mark.parametrize('gap', [
    {'start': 10, 'end': 5, 'reason': 'error'},
    {'start': 0, 'end': 5, 'reason': 'x' * 41},
    {'start': 0, 'end': 5, 'reason': 'error', 'detail': 'extra'},
])
def test_invalid_archive_gap_is_422(client, identities, gap):
    assert client.post(URL, json=payload(archiveGaps=[gap]), headers=identities[0]).status_code == 422


def test_negative_commission_is_422(client, identities):
    body = payload()
    body['symbols'][0]['commissionPerLot'] = -1
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422
