import csv
import tempfile
import unittest
from pathlib import Path

from allur.ml import predict_risk, model_status
from scripts.train import make_examples


class TrainingDataTests(unittest.TestCase):
    def test_target_is_next_same_line_record_and_features_are_lag_only(self):
        fields = ["line_id", "shift_date", "shift_number", "shift_id", "planned_production_quantity",
                  "actual_production_quantity", "designed_cycle_time_seconds", "actual_cycle_time_avg_seconds",
                  "oee_availability", "defective_units_produced", "downtime_unplanned_minutes"]
        records = [
            ["L1", "2024-01-01", "1", "a", "100", "75", "10", "11", ".8", "5", "0"],
            ["L1", "2024-01-02", "1", "b", "100", "100", "10", "10", ".9", "0", "59"],
            ["L1", "2024-01-03", "1", "c", "100", "80", "10", "11", ".7", "8", "60"],
        ]
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "sample.csv"
            with path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(fields)
                writer.writerows(records)
            X, y, target_dates, gaps = make_examples(path)
        self.assertEqual(target_dates, ["2024-01-02", "2024-01-03"])
        self.assertEqual(X[0].tolist(), [80.0, 75.0, 100.0 * 70 / 75])
        self.assertEqual(y.tolist(), [0, 1])
        self.assertEqual(gaps, [1, 1])


class RiskAdapterTests(unittest.TestCase):
    def test_exported_safe_json_model_is_available_and_bounded(self):
        status = model_status()
        self.assertTrue(status["available"])
        result = predict_risk([{"line_id": "L1", "date": "2024-01-02", "planned_units": 100,
                                "actual_units": 80, "defects": 2, "runtime_hours": 7.0,
                                "utilization_pct": 1}])
        self.assertTrue(result["available"])
        self.assertEqual(result["mode"], "experimental_external_benchmark")
        self.assertGreaterEqual(result["score_pct"], 0)
        self.assertLessEqual(result["score_pct"], 100)
        self.assertIsNone(result["predicted_downtime_minutes"])
        self.assertTrue(result["limitations"])

    def test_adapter_uses_latest_record_per_line_and_runtime_for_availability(self):
        history = [
            {"line_id": "L1", "name": "Welding", "date": "2024-01-02", "planned_units": 100,
             "actual_units": 80, "defects": 2, "runtime_hours": 7.0, "utilization_pct": 5},
            {"line_id": "L2", "name": "Paint", "date": "2024-01-03", "planned_units": 100,
             "actual_units": 80, "defects": 2, "runtime_hours": 4.0, "utilization_pct": 99},
            {"line_id": "L1", "name": "Welding", "date": "2024-01-01", "planned_units": 100,
             "actual_units": 100, "defects": 0, "runtime_hours": 8.0, "utilization_pct": 0},
        ]
        forward = predict_risk(history)
        reverse = predict_risk(list(reversed(history)))
        self.assertEqual(forward["per_line"], reverse["per_line"])
        self.assertEqual({row["line_id"] for row in forward["per_line"]}, {"L1", "L2"})
        self.assertEqual(forward["line_id"], "L2")
        self.assertEqual(forward["per_line"][0]["score_pct"], reverse["per_line"][0]["score_pct"])

    def test_missing_history_is_not_scored(self):
        result = predict_risk([])
        self.assertFalse(result["available"])
        self.assertIsNone(result["score_pct"])


if __name__ == "__main__":
    unittest.main()
