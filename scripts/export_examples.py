"""Regenerate JSON integration examples and the API schema from the actual code."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from allur.engine import load_case
from allur.integration import build_state, calculate_stop_scenario
from allur.ml import predict_risk, model_status
from allur.api import app


def export():
    folder = ROOT / 'examples'
    folder.mkdir(exist_ok=True)
    case = load_case()
    scenario = {'id': 'painting', 'equipment_id': 'Камера-02', 'date': '2026-10-02',
                'scheduled_hours': 8, 'horizon_minutes': 480, 'stop_minutes': 60}
    values = {
        'state_2026-10-01.json': build_state(case, '2026-10-01'),
        'state_2026-10-02.json': build_state(case, '2026-10-02'),
        'stop_input.json': scenario,
        'stop_result.json': calculate_stop_scenario(case, scenario),
    }
    for name, content in values.items():
        (folder / name).write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    fields = {'date', 'line_id', 'planned_units', 'actual_units', 'runtime_hours', 'utilization_pct', 'defects'}
    records = [{k: v for k, v in row.items() if k in fields} for row in case['production']]
    values['prediction_input.json'] = {'records': records, 'scheduled_hours': 8, 'as_of': '2026-10-02'}
    values['prediction_result.json'] = {'prediction': predict_risk(records), 'model': model_status()}
    for name in ['prediction_input.json', 'prediction_result.json']:
        (folder / name).write_text(json.dumps(values[name], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'docs' / 'openapi.json').write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return values


if __name__ == '__main__':
    export()
    print('Exported exact state DTO, stop scenario and OpenAPI schema.')
