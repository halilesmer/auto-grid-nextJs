"""BKT-11: real SQLite persistence, ownership, validation and safe retries."""
import secrets
from uuid import uuid4

import pytest

URL = '/api/backtest/presets'
pytestmark = pytest.mark.feature('BKT-11')


@pytest.fixture
def identities(client, monkeypatch):
    from src.api import auth, users_store
    admin = secrets.token_urlsafe(24)
    monkeypatch.setattr(auth, 'WORKER_API_KEY', admin)
    _, first = users_store.create_user('First')
    _, second = users_store.create_user('Second')
    return [{'X-API-Key': key} for key in (first, second, admin)]


def payload():
    return {'requestId': str(uuid4()), 'name': 'Baseline', 'version': 1,
            'zone': {'symbol': 'USOUSD', 'lot_size': 0.01},
            'form': {'csvImportId': None, 'timeframe': 'M1', 'spreadMode': 'candle',
                     'spreadPoints': 0, 'commission': None, 'swapEnabled': True,
                     'startCapital': 10000, 'fill': 'gap', 'slFirst': True,
                     'path': 'auto', 'closeAtEnd': False, 'approximate': False},
            'range': {'custom': {'from': '2026-10-01', 'to': '2026-10-07'}},
            'appVersion': 'test'}


def test_owner_crud_and_other_users_including_admin_get_404(client, identities):
    owner, other, admin = identities
    body = payload()
    created = client.post(URL, json=body, headers=owner)
    assert created.status_code == 201
    preset = created.json()['preset']
    assert 'owner' not in preset
    assert preset['zone'] == {'symbol': 'USOUSD', 'lot_size': 0.01}
    target = f"{URL}/{preset['id']}"
    for foreign in (other, admin):
        assert client.get(URL, headers=foreign).json() == {'presets': []}
        assert client.put(target, json={'name': 'Stolen'}, headers=foreign).status_code == 404
        assert client.delete(target, headers=foreign).status_code == 404
        assert client.post(URL, json=body, headers=foreign).status_code == 404
    assert client.get(URL).status_code == 401
    assert client.put(target, json={'name': 'Renamed'}, headers=owner).status_code == 200
    assert client.get(URL, headers=owner).json()['presets'][0]['name'] == 'Renamed'
    assert client.delete(target, headers=owner).status_code == 200
    assert client.get(URL, headers=owner).json() == {'presets': []}


def test_creation_retry_is_idempotent_and_changed_payload_conflicts(client, identities):
    body = payload()
    first = client.post(URL, json=body, headers=identities[0])
    retry = client.post(URL, json=body, headers=identities[0])
    assert first.status_code == retry.status_code == 201
    assert first.json() == retry.json()
    body['name'] = 'Changed'
    assert client.post(URL, json=body, headers=identities[0]).status_code == 409
    assert len(client.get(URL, headers=identities[0]).json()['presets']) == 1


@pytest.mark.parametrize('field', ['id', 'magic', 'sid', 'is_active', 'results'])
def test_zone_identity_and_results_are_rejected(client, identities, field):
    body = payload()
    body['zone'][field] = 1
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422
    assert client.get(URL, headers=identities[0]).json() == {'presets': []}


def test_invalid_range_and_csv_reference_are_rejected(client, identities):
    body = payload()
    body['range']['custom']['to'] = '2026-09-01'
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422
    body = payload()
    body['form']['csvImportId'] = 'another-account-import'
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422


def test_limit_is_per_owner_and_retry_at_limit_still_succeeds(client, identities):
    last = None
    for _ in range(100):
        last = payload()
        assert client.post(URL, json=last, headers=identities[0]).status_code == 201
    assert client.post(URL, json=last, headers=identities[0]).status_code == 201
    assert client.post(URL, json=payload(), headers=identities[0]).status_code == 409
    assert client.post(URL, json=payload(), headers=identities[1]).status_code == 201
