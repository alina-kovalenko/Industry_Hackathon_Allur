"""Safe JSON model loading and a deliberately cautious Allur history adapter."""
from __future__ import annotations

import json
import math
from pathlib import Path

DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_FILE = "downtime_risk.json"
FEATURES = ["availability_pct", "plan_attainment_pct", "quality_yield_pct"]


def _load_model(model_dir: Path | None = None) -> dict | None:
    path = (model_dir or DEFAULT_MODEL_DIR) / MODEL_FILE
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def model_status(model_dir: Path | None = None) -> dict:
    model = _load_model(model_dir)
    if not model:
        return {"available": False, "mode": "unavailable", "reason": "trained_model_missing"}
    return {
        "available": True,
        "mode": model.get("mode", "experimental_external_benchmark"),
        "target": model.get("target"),
        "horizon": model.get("horizon"),
        "training_rows": model.get("training_rows"),
        "validation_rows": model.get("validation_rows"),
        "test_rows": model.get("test_rows"),
        "date_boundaries": model.get("date_boundaries", {}),
        "test_metrics": model.get("test_metrics", {}),
        "baseline_metrics": model.get("baseline_metrics", {}),
        "constant_prevalence_baseline_metrics": model.get("constant_prevalence_baseline_metrics", {}),
        "limitations": model.get("limitations", []),
    }


def _features_from_row(row: dict, scheduled_hours: float) -> tuple[list[float] | None, list[str]]:
    try:
        planned = float(row["planned_units"])
        actual = float(row["actual_units"])
        defects = float(row["defects"])
        runtime = float(row["runtime_hours"])
        values = (planned, actual, defects, runtime, scheduled_hours)
        if not all(math.isfinite(v) for v in values):
            raise ValueError
        if planned <= 0 or actual < 0 or defects < 0 or defects > actual or runtime < 0 or scheduled_hours <= 0:
            raise ValueError
        attainment = 100.0 * actual / planned
        quality = 100.0 * (actual - defects) / actual if actual > 0 else 0.0
        # The case's runtime is the observed production proxy for availability.
        availability = min(100.0, 100.0 * runtime / scheduled_hours)
        return [availability, attainment, quality], []
    except (KeyError, TypeError, ValueError, OverflowError):
        return None, ["Нет корректных planned_units, actual_units, defects и runtime_hours для строки."]


def predict_risk(history: list[dict], model_dir: Path | None = None, *, scheduled_hours: float = 8.0) -> dict:
    model = _load_model(model_dir)
    if not model:
        return {"available": False, "mode": "unavailable", "score_pct": None,
                "label": "Модель не обучена", "predicted_downtime_minutes": None,
                "horizon": "следующая запись по линии", "drivers": [],
                "limitations": ["Сначала скачайте данные и запустите scripts/train.py."]}
    if not history:
        return {"available": False, "mode": model["mode"], "score_pct": None,
                "label": "Недостаточно данных", "predicted_downtime_minutes": None,
                "horizon": model["horizon"], "drivers": [],
                "limitations": model.get("limitations", []) + ["Для оценки нужна хотя бы одна производственная строка."]}
    try:
        scheduled = float(scheduled_hours)
    except (TypeError, ValueError):
        scheduled = float("nan")
    if not math.isfinite(scheduled) or scheduled <= 0:
        return {"available": False, "mode": model["mode"], "score_pct": None,
                "label": "Некорректный горизонт", "predicted_downtime_minutes": None,
                "horizon": model["horizon"], "drivers": [],
                "limitations": model.get("limitations", []) + ["scheduled_hours должен быть положительным числом."]}

    # Use the last date available for each line, independent of input row order.
    latest: dict[str, dict] = {}
    for row in history:
        line_id = row.get("line_id")
        row_date = str(row.get("date", ""))
        if not line_id or not row_date:
            continue
        if str(latest.get(str(line_id), {}).get("date", "")) <= row_date:
            latest[str(line_id)] = row
    mean, scale = model["mean"], model["scale"]
    threshold = float(model.get("threshold", 0.5))
    per_line = []
    skipped = 0
    for line_id, row in latest.items():
        values, errors = _features_from_row(row, scheduled)
        if values is None:
            skipped += 1
            continue
        z = sum(w * ((x - m) / s if s else 0.0) for x, m, s, w in zip(values, mean, scale, model["coefficients"])) + model["intercept"]
        score = 1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, z))))
        contributions = [w * ((x - m) / s if s else 0.0) for x, m, s, w in zip(values, mean, scale, model["coefficients"])]
        drivers = [label for label, impact in zip(
            ["доступность по runtime", "выполнение плана", "выход годной продукции"], contributions
        ) if abs(impact) > 0.15]
        per_line.append({"line_id": line_id, "name": row.get("name", line_id), "score_pct": round(score * 100, 1),
                         "label": "Повышенный экспериментальный риск" if score >= threshold else "Ниже порога экспериментальной модели",
                         "drivers": drivers or ["оценка основана на последней агрегированной записи"]})
    if not per_line:
        return {"available": False, "mode": model["mode"], "score_pct": None,
                "label": "Недостаточно данных", "predicted_downtime_minutes": None,
                "horizon": model["horizon"], "drivers": [], "per_line": [],
                "limitations": model.get("limitations", []) + ["Ни одну строку истории нельзя сопоставить с признаками модели."]}
    per_line.sort(key=lambda item: item["score_pct"], reverse=True)
    highest = per_line[0]
    limitations = model.get("limitations", [])[:]
    if skipped:
        limitations.append(f"Пропущено строк линий с некорректными признаками: {skipped}.")
    return {
        "available": True,
        "mode": model["mode"],
        "score_pct": highest["score_pct"],
        "line_id": highest["line_id"],
        "line_name": highest["name"],
        "label": highest["label"],
        "predicted_downtime_minutes": None,
        "horizon": model["horizon"],
        "drivers": highest["drivers"],
        "per_line": per_line,
        "limitations": limitations,
    }
