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


GUARD = {'enabled': True, 'mode': 'relative', 'multiplier': 3, 'bootstrap': 'manual', 'initial_spread': 0.01}


def test_spread_guard_is_saved_and_loaded_unchanged(client, identities):
    body = payload()
    body['zone']['spread_guard'] = GUARD
    created = client.post(URL, json=body, headers=identities[0])
    assert created.status_code == 201
    assert client.get(URL, headers=identities[0]).json()['presets'][0]['zone']['spread_guard'] == {
        'enabled': True, 'mode': 'relative', 'multiplier': 3, 'bootstrap': 'manual', 'initial_spread': 0.01}


@pytest.mark.parametrize('guard', [
    {'enabled': True, 'mode': 'fixed'},
    {'enabled': True, 'mode': 'fixed', 'max_spread': -1},
    {'enabled': True, 'mode': 'weird', 'max_spread': 1},
    {'enabled': True, 'mode': 'relative', 'multiplier': 3},
    {'enabled': 'yes'},
    'on',
    None,
    {'enabled': False, 'foo': 1},
    {'enabled': True, 'mode': 'fixed', 'max_spread': 10 ** 400},
])
def test_invalid_spread_guard_is_rejected(client, identities, guard):
    body = payload()
    body['zone']['spread_guard'] = guard
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422


def test_grid_spread_guard_with_fractal_entry_is_rejected(client, identities):
    body = payload()
    body['zone'].update({'entry_mode': 'fractal', 'spread_guard': {'enabled': True, 'mode': 'grid', 'grid_percent': 10}})
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422


def test_disabled_spread_guard_and_missing_field_are_accepted(client, identities):
    body = payload()
    body['zone']['spread_guard'] = {'enabled': False}
    assert client.post(URL, json=body, headers=identities[0]).status_code == 201
    assert client.post(URL, json=payload(), headers=identities[0]).status_code == 201


@pytest.mark.feature('BKT-15')
def test_custom_range_with_times_is_saved(client, identities):
    body = payload()
    body['range'] = {'custom': {'from': '2026-10-01', 'to': '2026-10-07', 'fromTime': '08:30:00', 'toTime': '17:00:15'}}
    created = client.post(URL, json=body, headers=identities[0])
    assert created.status_code == 201
    assert created.json()['preset']['range']['custom'] == {
        'from': '2026-10-01', 'to': '2026-10-07', 'fromTime': '08:30:00', 'toTime': '17:00:15'}


@pytest.mark.feature('BKT-15')
@pytest.mark.parametrize('custom', [
    {'from': '2026-10-01', 'to': '2026-10-07', 'fromTime': '8:30'},
    {'from': '2026-10-01', 'to': '2026-10-07', 'toTime': '25:00:00'},
    {'from': '2026-10-01', 'to': '2026-10-07', 'fromTime': '08:30:60'},
    {'from': '2026-10-01', 'to': '2026-10-07', 'toTime': '08:30:00\n'},
    {'from': '2026-10-01', 'to': '2026-10-07', 'toTime': '08:30:0\u0660'},
    {'from': '2026-10-01', 'to': '2026-10-07', 'extra': '08:30:00'},
])
def test_custom_range_with_bad_time_or_unknown_key_is_rejected(client, identities, custom):
    body = payload()
    body['range'] = {'custom': custom}
    assert client.post(URL, json=body, headers=identities[0]).status_code == 422

