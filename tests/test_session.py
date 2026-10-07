from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from allur.api import create_app
from allur.engine import load_case
from allur.session import LineSession

STOP = {"id": "painting", "equipment_id": "Камера-02", "stop_minutes": 60, "horizon_minutes": 480}


def test_applied_stop_updates_polling_state_and_history_but_preserves_observed_case():
    with TestClient(create_app()) as client:
        before = client.get('/state').json()
        observed = client.get('/api/dashboard').json()['kpis']
        response = client.post('/scenario', json=STOP)
        assert response.status_code == 200
        result = response.json()
        assert result['before']['state'] == before
        assert result['after']['state'] == client.get('/state').json()
        assert result['after']['state'] != before
        assert result['lost_good_units'] == pytest.approx(6.060199942)
        assert result['bottleneck']['after']['id'] == 'painting'
        assert result['explanation']
        assert client.get('/api/dashboard').json()['kpis'] == observed
        events = client.get('/history').json()['events']
        assert len(events) == 1 and events[0]['result']['after'] == result['after']
        assert client.get('/api/session').json()['scenario']['mode'] == 'hypothetical_projection'
        assert client.get('/state').headers['cache-control'] == 'no-store'


def test_legacy_calculation_remains_read_only():
    with TestClient(create_app()) as client:
        before = client.get('/state').json()
        assert client.post('/api/scenarios/stop', json=STOP).status_code == 200
        assert client.get('/state').json() == before
        assert client.get('/history').json()['events'] == []


def test_zero_stop_identity_full_stop_and_replacement_policy():
    session = LineSession(load_case())
    initial = session.current_state()
    assert session.apply({**STOP, 'stop_minutes': 0})['after']['state'] == initial
    session.apply({**STOP, 'stop_minutes': 480})
    after = session.current_state()['sections']
    assert after[1]['status'] == 'stopped' and after[1]['throughput'] == 0
    assert after[2]['throughput'] == 0
    first = session.apply(STOP)
    second = session.apply(STOP)
    assert first['after'] == second['after']


@pytest.mark.parametrize('changes', [{'id': 'unknown'}, {'stop_minutes': -1}, {'stop_minutes': 481}, {'date': '2030-01-01'}, {'equipment_id': 'ABB-01'}])
def test_invalid_scenario_does_not_mutate_session(changes):
    with TestClient(create_app()) as client:
        client.post('/scenario', json=STOP)
        before = client.get('/api/session').json()
        assert client.post('/scenario', json={**STOP, **changes}).status_code == 422
        assert client.get('/api/session').json() == before


def test_reset_restores_imported_records_and_preserves_audit_history():
    with TestClient(create_app()) as client:
        initial = client.get('/state').json()
        rows = deepcopy(load_case()['production'][:3])
        fields = {'date', 'line_id', 'planned_units', 'actual_units', 'runtime_hours', 'utilization_pct', 'defects'}
        records = [{**{k: v for k, v in row.items() if k in fields}, 'date': '2026-10-03'} for row in rows]
        assert client.post('/api/ingest', json={'records': records}).status_code == 200
        client.post('/scenario', json=STOP)
        client.post('/api/replay/start', json={})
        result = client.post('/reset').json()
        assert result['state'] == initial and result['scenario'] is None
        assert not result['replay']['running']
        assert '2026-10-03' not in result['available_dates']
        assert client.get('/history').json()['events'][-1]['kind'] == 'reset'


def test_replay_clock_loop_pause_and_nonloop_end_without_sleep():
    now = [0.0]
    session = LineSession(load_case(), clock=lambda: now[0])
    assert session.start_replay(3)['date'] == '2026-10-01'
    first = session.current_state()
    now[0] = 3
    assert session.current_state() != first
    assert session.metadata()['date'] == '2026-10-02'
    now[0] = 6
    assert session.current_state() == first
    session.stop_replay()
    now[0] = 100
    assert session.current_state() == first
    session.start_replay(3, loop=False)
    now[0] = 103
    assert session.metadata()['date'] == '2026-10-02'
    assert not session.metadata()['replay']['running']


def test_scenario_pauses_replay_and_explicit_date_is_observed_view():
    with TestClient(create_app()) as client:
        client.post('/api/replay/start', json={})
        result = client.post('/scenario', json=STOP).json()
        assert result['date'] == '2026-10-01'
        assert not client.get('/api/session').json()['replay']['running']
        assert client.get('/state?date=2026-10-01').json() == result['before']['state']


@pytest.mark.parametrize('payload', [{'interval_seconds': 0}, {'interval_seconds': 61}, {'date': '2027-01-01'}])
def test_replay_validation(payload):
    with TestClient(create_app()) as client:
        assert client.post('/api/replay/start', json=payload).status_code == 422
        assert client.get('/api/health').json()['revision'] == 0


def test_history_is_bounded_and_sessions_are_isolated_under_concurrent_runs():
    session = LineSession(load_case())
    other = LineSession(load_case())
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: session.apply(STOP), range(12)))
    assert session.revision == 12
    assert [e['id'] for e in session.history()['events']] == list(range(1, 13))
    assert len(session.history(after_id=10)['events']) == 2
    assert other.revision == 0 and other.scenario is None
    for _ in range(500):
        session.stop_replay()
    assert len(session.events) == 500
