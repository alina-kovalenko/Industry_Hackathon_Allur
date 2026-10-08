"""Check the production frontend, API and ML artifact together after npm run build."""
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from allur.api import create_app
from allur.ml import predict_risk


def main():
    with TestClient(create_app()) as client:
        page = client.get('/app/')
        assert page.status_code == 200, 'Build frontend before running this check'
        assets = re.findall(r'(?:src|href)="(/app/[^"#]+)"', page.text)
        assert any(asset.endswith('.js') for asset in assets)
        for asset in assets:
            assert client.get(asset).status_code == 200, f'Missing asset: {asset}'
        for font in ('manrope', 'sora'):
            for weight in (400, 500, 600, 700):
                assert client.get(f'/app/fonts/{font}-{weight}.ttf').status_code == 200
        assert client.get('/app/assets/allur-logo.png').status_code == 200
        before = client.get('/api/session').json()
        prediction = before['observed_dashboard']['prediction']
        assert prediction['available'] and len(prediction['per_line']) == 3
        assert prediction == predict_risk(before['observed_dashboard']['history'])
        result = client.post('/api/scenarios/run', json={
            'id': 'painting', 'equipment_id': 'Камера-02',
            'stop_minutes': 60, 'horizon_minutes': 480,
        })
        assert result.status_code == 200
        after = client.get('/api/session').json()
        assert after['state'] == result.json()['after']['state']
        assert after['state'] == client.get('/state').json()
        assert after['state'] != before['state']
        # Scenarios change a projection, never the observed ML input.
        assert after['observed_dashboard']['prediction'] == prediction
        assert client.get('/api/history').json()['events'][-1]['kind'] == 'scenario'
        assert client.post('/api/reset').json()['state'] == before['state']
        fields = {'date', 'line_id', 'planned_units', 'actual_units', 'runtime_hours', 'utilization_pct', 'defects'}
        records = [
            {**{key: row[key] for key in fields}, 'date': '2026-10-03',
             'runtime_hours': 3, 'actual_units': 40, 'defects': 10}
            for row in before['observed_dashboard']['history'] if row['date'] == before['date']
        ]
        assert client.post('/api/ingest', json={'records': records}).status_code == 200
        imported = client.get('/api/session').json()
        assert imported['date'] == '2026-10-03'
        assert imported['observed_dashboard']['prediction']['score_pct'] != prediction['score_pct']
        assert imported['observed_dashboard']['prediction'] == predict_risk(imported['observed_dashboard']['history'])
        assert client.post('/api/reset').json()['state'] == before['state']
    print('PASS: production assets, API, trained-model inference, scenario, history, reset')


if __name__ == '__main__':
    main()
