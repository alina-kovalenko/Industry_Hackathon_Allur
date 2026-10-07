"""Train/evaluate the experimental next-record downtime classifier."""
from __future__ import annotations

import csv
import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             f1_score, precision_score, recall_score, roc_auc_score)
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from allur.ml import FEATURES  # noqa: E402

RAW = ROOT / "data" / "external" / "raw" / "mfg005_synthetic_line_performance.csv"
MODEL = ROOT / "models" / "downtime_risk.json"
REPORT = ROOT / "models" / "training_report.json"
TARGET_DOWNTIME_MINUTES = 60.0


def _num(row: dict, key: str) -> float:
    try:
        value = float(row.get(key, ""))
        return value if math.isfinite(value) else 0.0
    except (TypeError, ValueError):
        return 0.0


def make_examples(path: Path = RAW) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Build one t->t+1 example per line; every feature is from time t only."""
    by_line: dict[str, list[dict]] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            by_line.setdefault(row["line_id"], []).append(row)
    examples = []
    for line_rows in by_line.values():
        line_rows.sort(key=lambda r: (r["shift_date"], int(r.get("shift_number") or 0), r.get("shift_id", "")))
        for current, following in zip(line_rows, line_rows[1:]):
            planned = _num(current, "planned_production_quantity")
            actual = _num(current, "actual_production_quantity")
            current_date = date.fromisoformat(current["shift_date"])
            next_date = date.fromisoformat(following["shift_date"])
            examples.append((
                following["shift_date"],
                [
                    100.0 * _num(current, "oee_availability"),
                    100.0 * actual / planned if planned else 0.0,
                    100.0 * max(0.0, actual - _num(current, "defective_units_produced")) / actual if actual else 0.0,
                ],
                int(_num(following, "downtime_unplanned_minutes") >= TARGET_DOWNTIME_MINUTES),
                max(0.0, _num(following, "downtime_unplanned_minutes")),
                current["shift_date"],
                (next_date - current_date).days,
            ))
    examples.sort(key=lambda x: x[0])
    X = np.asarray([item[1] for item in examples], dtype=float)
    y = np.asarray([item[2] for item in examples], dtype=int)
    return X, y, [item[0] for item in examples], [item[5] for item in examples]


def _metrics(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    predicted = (scores >= threshold).astype(int)
    tp = int(((predicted == 1) & (y_true == 1)).sum())
    tn = int(((predicted == 0) & (y_true == 0)).sum())
    fp = int(((predicted == 1) & (y_true == 0)).sum())
    fn = int(((predicted == 0) & (y_true == 1)).sum())
    result = {
        "prevalence": round(float(y_true.mean()), 4),
        "accuracy": round(float((predicted == y_true).mean()), 4),
        "precision": round(float(precision_score(y_true, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, predicted, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, predicted, zero_division=0)), 4),
        "false_positive_rate": round(fp / (fp + tn), 4) if fp + tn else None,
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        "brier": round(float(brier_score_loss(y_true, scores)), 4),
        "threshold": round(float(threshold), 4),
    }
    result["roc_auc"] = round(float(roc_auc_score(y_true, scores)), 4) if len(np.unique(y_true)) > 1 else None
    result["average_precision"] = round(float(average_precision_score(y_true, scores)), 4) if len(np.unique(y_true)) > 1 else None
    return result


def train() -> dict:
    if not RAW.exists():
        raise FileNotFoundError(f"{RAW} missing; run scripts/download_data.py first")
    X, y, dates, intervals = make_examples()
    unique_dates = sorted(set(dates))
    if len(unique_dates) < 10:
        raise ValueError(f"Need at least 10 distinct target dates; found {len(unique_dates)}")
    train_end = unique_dates[max(1, int(len(unique_dates) * 0.70)) - 1]
    val_end = unique_dates[max(2, int(len(unique_dates) * 0.85)) - 1]
    train_mask = np.asarray([d <= train_end for d in dates])
    val_mask = np.asarray([(d > train_end and d <= val_end) for d in dates])
    test_mask = np.asarray([d > val_end for d in dates])
    if min(int(train_mask.sum()), int(val_mask.sum()), int(test_mask.sum())) == 0:
        raise ValueError("Chronological split produced an empty partition")
    scaler = StandardScaler().fit(X[train_mask])
    model = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=17)
    model.fit(scaler.transform(X[train_mask]), y[train_mask])
    val_scores = model.predict_proba(scaler.transform(X[val_mask]))[:, 1]
    thresholds = np.linspace(0.05, 0.95, 91)
    # Select a cut point on validation only; tie-break toward 0.5.
    threshold = max(thresholds, key=lambda t: (f1_score(y[val_mask], val_scores >= t, zero_division=0), -abs(t - 0.5)))
    test_scores = model.predict_proba(scaler.transform(X[test_mask]))[:, 1]
    prevalence = float(y[train_mask].mean())
    baseline_scores = np.full(int(test_mask.sum()), prevalence)
    model_metrics = _metrics(y[test_mask], test_scores, threshold)
    baseline_metrics = _metrics(y[test_mask], baseline_scores, 0.5)
    always_positive_metrics = _metrics(y[test_mask], np.ones(int(test_mask.sum())), 0.5)
    test_intervals = [gap for gap, is_test in zip(intervals, test_mask) if is_test]
    # Classification is the supported output; no regression head is claimed.
    limitations = [
        "Обучение проведено на синтетических сменных данных MFG-005; это не данные Allur.",
        "Score модели не калиброван и не является вероятностью отказа.",
        "Горизонт — следующая имеющаяся запись той же линии; интервалы между сменами нерегулярны.",
        "Адаптер использует runtime_hours / scheduled_hours, выполнение плана и выход годной продукции из дневных строк Allur; соответствие сменным синтетическим признакам и переносимость не проверены.",
        "Порог события: не менее 60 минут незапланированного простоя в следующей записи.",
    ]
    artifact = {
        "model_version": 1,
        "mode": "experimental_external_benchmark",
        "algorithm": "standardized_logistic_regression",
        "features": FEATURES,
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "coefficients": model.coef_[0].tolist(),
        "intercept": float(model.intercept_[0]),
        "threshold": float(threshold),
        "target": f"next same-line record has >= {int(TARGET_DOWNTIME_MINUTES)} minutes unplanned downtime",
        "horizon": "следующая имеющаяся сменная запись той же линии (интервалы могут быть нерегулярны)",
        "training_rows": int(train_mask.sum()),
        "validation_rows": int(val_mask.sum()),
        "test_rows": int(test_mask.sum()),
        "date_boundaries": {"train_through": train_end, "validation_through": val_end,
                            "test_from": min(d for d, ok in zip(dates, test_mask) if ok)},
        "test_metrics": model_metrics,
        "baseline_metrics": always_positive_metrics,
        "constant_prevalence_baseline_metrics": baseline_metrics,
        "limitations": limitations,
    }
    report = {
        "source": "xpertsystems/mfg005-sample at 427854b6ec8cddc3f929685d9efd58bfdc2a8af3",
        "synthetic": True,
        "rows_after_pairing": len(y),
        "distinct_target_dates": len(unique_dates),
        "positive_rate_all": round(float(y.mean()), 4),
        "positive_rate_test": round(float(y[test_mask].mean()), 4),
        "model_test_metrics": model_metrics,
        "constant_prevalence_baseline_test_metrics": baseline_metrics,
        "always_positive_baseline_test_metrics": always_positive_metrics,
        "features": FEATURES,
        "feature_timing": "features at current record t only; outcome from next same-line record t+1",
        "split": "date-ordered 70/15/15 by unique target shift_date; no date is shared across partitions",
        "next_record_interval_days_test": {"median": float(np.median(test_intervals)), "max": int(max(test_intervals))},
        "limitations": limitations,
    }
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    MODEL.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(train(), indent=2, ensure_ascii=False))
